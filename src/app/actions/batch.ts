
'use server';

import { z } from 'zod';
import { consultarSaldoManual, consultarSaldoFgts } from './fgts';
import { consultarOfertasFacta, getFactaAuthToken, consultarSaldoFgtsFacta } from './facta';
import { consultarLinkAutorizacaoC6, consultarOfertasCLTC6, verificarStatusAutorizacaoC6, type C6Offer } from './c6';
import * as XLSX from 'xlsx';
import { firestore } from '@/firebase/server-init';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { type ApiCredentials, logActivity } from './users';
import { getAuthToken, getUserCredentials } from './clt';
import { randomUUID } from 'crypto';


type Provider = "v8" | "facta" | "c6";
type V8Provider = 'qi' | 'cartos' | 'bms';

const cpfDataSchema = z.object({
    cpf: z.string(),
    nome: z.string().optional(),
    data_nascimento: z.string().optional(),
    telefone_ddd: z.string().optional(),
    telefone_numero: z.string().optional(),
});
export type CpfData = z.infer<typeof cpfDataSchema>;


const processCltActionSchema = z.object({
  cpfsData: z.array(cpfDataSchema),
  provider: z.enum(["v8", "facta", "c6"]),
  userId: z.string(),
  userEmail: z.string(),
  fileName: z.string(),
});

const processFgtsActionSchema = z.object({
    cpfs: z.array(z.string()),
    provider: z.enum(["v8", "facta"]),
    userId: z.string(),
    userEmail: z.string(),
    fileName: z.string(),
    v8Provider: z.enum(['qi', 'cartos', 'bms']).optional(),
});


const reportActionSchema = z.object({
  cpfs: z.array(z.string()),
  fileName: z.string(),
  createdAt: z.string(),
  provider: z.string(),
  userId: z.string(),
  batchId: z.string(),
});

const getBatchStatusSchema = z.object({
    batchId: z.string(),
});

const deleteBatchSchema = z.object({
    batchId: z.string(),
});

const reprocessBatchSchema = z.object({
    batchId: z.string(),
});


export type BatchJob = {
    id: string;
    fileName: string;
    type: 'fgts' | 'clt';
    provider: string; // 'V8DIGITAL' or 'facta' or 'C6'
    v8Provider?: V8Provider; // 'qi', 'cartos', 'bms' if provider is 'V8DIGITAL'
    status: 'processing' | 'completed' | 'error' | 'pending';
    totalCpfs: number;
    processedCpfs: number;
    cpfs: string[];
    createdAt: string; // ISO String
    completedAt?: string; // ISO String for when the job finishes
    message?: string;
    userId: string;
    userEmail: string;
    results?: Record<string, { status: string; link?: string; message: string; offers?: C6Offer[] }>;
    cpfsData?: CpfData[];
};


type ProcessActionResult = {
  status: 'success' | 'error';
  message?: string;
  batch?: BatchJob;
};

type ReprocessActionResult = {
  status: 'success' | 'error';
  message?: string;
  newBatch?: BatchJob;
};

type ReportActionResult = {
  status: 'success' | 'error';
  fileName: string;
  fileContent: string;
  message?: string;
};


function toISODate(timestamp: Timestamp | string | Date | undefined): string | undefined {
    if (!timestamp) return undefined;
    if (timestamp instanceof Timestamp) {
        return timestamp.toDate().toISOString();
    }
    if (typeof timestamp === 'string') {
        return timestamp;
    }
    return timestamp.toISOString();
}

export async function deleteBatch(input: z.infer<typeof deleteBatchSchema>): Promise<{ status: 'success' | 'error'; message: string }> {
    const validation = deleteBatchSchema.safeParse(input);
    if (!validation.success) {
        return { status: 'error', message: 'ID do lote inválido.' };
    }
    try {
        await firestore.collection('batches').doc(validation.data.batchId).delete();
        return { status: 'success', message: 'Lote excluído com sucesso.' };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao excluir o lote.";
        console.error("deleteBatch error:", message);
        return { status: 'error', message };
    }
}


export async function getBatches(input: { userId: string }): Promise<{ status: 'success' | 'error'; batches?: BatchJob[]; error?: string }> {
    try {
        let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = firestore.collection('batches').orderBy('createdAt', 'desc');

        const userDoc = await firestore.collection('users').doc(input.userId).get();
        if (!userDoc.exists) {
            return { status: 'error', error: 'Usuário não encontrado.' };
        }
        const userRole = userDoc.data()?.role;
        const teamId = userDoc.data()?.teamId;

        if (userRole === 'user') {
            query = query.where('userId', '==', input.userId);
        } else if (userRole === 'manager' && teamId) {
            const teamMembersSnapshot = await firestore.collection('users').where('teamId', '==', teamId).get();
            const memberIds = teamMembersSnapshot.docs.map(doc => doc.id);
            if (memberIds.length > 0) {
                 query = query.where('userId', 'in', memberIds);
            } else {
                 return { status: 'success', batches: [] };
            }
        }
        // super_admin sees all, so no filter is applied to the base query

        const batchesSnapshot = await query.get();

        if (batchesSnapshot.empty) {
            return { status: 'success', batches: [] };
        }
        
        const batches = batchesSnapshot.docs.map((doc): BatchJob => {
            const data = doc.data()!;
            return {
                id: doc.id,
                fileName: data.fileName,
                type: data.type,
                provider: data.provider,
                v8Provider: data.v8Provider,
                status: data.status,
                totalCpfs: data.totalCpfs,
                processedCpfs: data.processedCpfs,
                cpfs: data.cpfs,
                createdAt: toISODate(data.createdAt)!,
                completedAt: toISODate(data.completedAt),
                message: data.message,
                userId: data.userId,
                userEmail: data.userEmail,
                results: data.results,
            };
        });

        return { status: 'success', batches };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao buscar lotes.";
        console.error("getBatches error:", error);
        if (message.includes('requires an index')) {
            return { status: 'error', error: 'A consulta de lotes requer um índice do Firestore que não foi criado. Contacte o suporte.' };
        }
        return { status: 'error', error: message };
    }
}

async function processFactaBatchInBackground(batchId: string) {
    console.log(`[Batch ${batchId}] Starting/Continuing FACTA background processing...`);
    const batchRef = firestore.collection('batches').doc(batchId);

    try {
        const batchDoc = await batchRef.get();
        if (!batchDoc.exists) throw new Error(`Lote ${batchId} não encontrado.`);
        
        const batchData = batchDoc.data() as BatchJob;
        
        if (batchData.status === 'completed' || (batchData.status === 'error' && batchData.processedCpfs === batchData.totalCpfs)) {
             console.log(`[Batch ${batchId}] Batch already finished with status: ${batchData.status}.`);
             return;
        }

        const processedCpfsSnapshot = await firestore.collection('webhookResponses')
            .where('batchId', '==', batchId)
            .get();
        const processedCpfIds = new Set(processedCpfsSnapshot.docs.map(doc => doc.id.replace('facta-', '')));
        
        const currentProcessedCount = processedCpfsSnapshot.docs.length;
        
        if (batchData.status === 'pending') {
            await batchRef.update({ status: 'processing', message: 'Iniciando processamento...', processedCpfs: currentProcessedCount });
        }
        
        const { credentials, error: credError } = await getUserCredentials(batchData.userId);
        if (credError || !credentials) {
            throw new Error(credError || `Credenciais Facta não encontradas para o usuário ${batchData.userId}`);
        }
        
        const { token, error: tokenError } = await getFactaAuthToken(credentials.facta_username, credentials.facta_password);
        if (tokenError || !token) throw new Error(tokenError || "Falha ao obter token da Facta.");
        
        const cpfsToProcess = batchData.cpfs.filter(cpf => !processedCpfIds.has(cpf));

        if (cpfsToProcess.length === 0 && currentProcessedCount >= batchData.totalCpfs) {
            await batchRef.update({ status: 'completed', processedCpfs: batchData.totalCpfs, message: "Todos os CPFs foram processados.", completedAt: FieldValue.serverTimestamp() });
            console.log(`[Batch ${batchId}] All CPFs processed. Batch completed.`);
            return;
        }

        console.log(`[Batch ${batchId}] Processing ${cpfsToProcess.length} CPFs in parallel.`);

        const processingPromises = cpfsToProcess.map(async (cpf) => {
            const docId = `facta-${cpf}`;
            const docRef = firestore.collection('webhookResponses').doc(docId);
            try {
                const result = await consultarSaldoFgtsFacta({ cpf: cpf, userId: batchData.userId, token });
                const responseData = {
                    responseBody: result.data || { error: result.message },
                    createdAt: FieldValue.serverTimestamp(),
                    status: result.success ? 'success' : 'error',
                    message: result.message || (result.success ? 'Sucesso' : 'Erro desconhecido'),
                    id: docId,
                    provider: 'facta',
                    batchId: batchId,
                };
                await docRef.set(responseData, { merge: true });
                 await batchRef.update({ processedCpfs: FieldValue.increment(1) });
            } catch (cpfError) {
                const message = cpfError instanceof Error ? cpfError.message : "Erro desconhecido ao processar CPF.";
                await docRef.set({ status: 'error', message, batchId: batchId, provider: 'facta' }, { merge: true });
                await batchRef.update({ processedCpfs: FieldValue.increment(1) });
            }
        });

        await Promise.all(processingPromises);
        
        const finalBatchDoc = await batchRef.get();
        if(finalBatchDoc.data()?.processedCpfs >= finalBatchDoc.data()?.totalCpfs) {
             await batchRef.update({ status: 'completed', message: "Todos os CPFs foram processados.", completedAt: FieldValue.serverTimestamp() });
            console.log(`[Batch ${batchId}] Final chunk processed. Batch completed.`);
        }

    } catch (error) {
        const message = error instanceof Error ? error.message : "An unknown error occurred.";
        console.error(`[Batch ${batchId}] FACTA BATCH FATAL ERROR:`, error);
        await batchRef.update({ status: 'error', message: message, completedAt: FieldValue.serverTimestamp() });
    }
}

export async function processarLoteFgts(input: z.infer<typeof processFgtsActionSchema>): Promise<ProcessActionResult> {
  const validation = processFgtsActionSchema.safeParse(input);

  if (!validation.success) {
    return { 
        status: 'error', 
        message: 'Dados de entrada inválidos.' 
    };
  }

  const { cpfs, provider, userId, userEmail, fileName, v8Provider } = validation.data;
  
  const displayProvider = provider === 'v8' ? 'V8DIGITAL' : 'facta';
  
  const batchId = `batch-fgts-${displayProvider}-${v8Provider || ''}-${Date.now()}-${userId.substring(0, 5)}`;
  const batchRef = firestore.collection('batches').doc(batchId);
  
  const baseBatchData: Omit<BatchJob, 'id' | 'createdAt' | 'v8Provider'> & { createdAt: FieldValue } = {
      fileName: fileName,
      type: 'fgts',
      provider: displayProvider,
      status: 'pending',
      totalCpfs: cpfs.length,
      processedCpfs: 0,
      cpfs: cpfs,
      createdAt: FieldValue.serverTimestamp(),
      userId: userId,
      userEmail: userEmail,
  };
  
  const batchData = provider === 'v8' && v8Provider 
    ? { ...baseBatchData, v8Provider: v8Provider }
    : baseBatchData;


  try {
      await batchRef.set(batchData);

      await logActivity({
          userId: userId,
          action: `Consulta FGTS em Lote (Excel)`,
          provider: displayProvider,
          details: `Arquivo: ${fileName} (${cpfs.length} CPFs)`
      });

  } catch(error) {
    const message = error instanceof Error ? error.message : "Erro ao iniciar o lote no Firestore.";
    console.error("Batch init error:", message);
    return { status: 'error', message };
  }
  
  // Fire and forget - the function will run in the background
    if (provider === 'v8') {
        processV8BatchInBackground(batchId);
    } else if (provider === 'facta') {
        processFactaBatchInBackground(batchId);
    }
  
  const serializableBatch: BatchJob = {
    ...(batchData as any),
    id: batchId,
    createdAt: new Date().toISOString(),
  }

  return {
    status: 'success',
    message: `Lote para ${displayProvider.toUpperCase()} criado e em processamento.`,
    batch: serializableBatch
  };
}

async function processV8BatchInBackground(batchId: string) {
    console.log(`[Batch ${batchId}] Starting V8 background processing...`);
    const batchRef = firestore.collection('batches').doc(batchId);
    let batchData: BatchJob | null = null;
    try {
        const batchDoc = await batchRef.get();
        if (!batchDoc.exists) throw new Error(`Lote ${batchId} não encontrado.`);
        batchData = batchDoc.data() as BatchJob;
        if (!batchData.v8Provider) throw new Error("Parceiro V8 não especificado no lote.");

        await batchRef.update({ status: 'processing', message: 'Iniciando processamento...' });

        const { credentials, error: credError } = await getUserCredentials(batchData.userId);
        if (credError || !credentials) {
            throw new Error(credError || `Credenciais V8 não encontradas para o usuário ${batchData.userId}`);
        }

        const { token, error: tokenError } = await getAuthToken(credentials);
        if (tokenError || !token) {
            throw new Error(tokenError || "Falha ao obter token da V8.");
        }

        for (const cpf of batchData.cpfs) {
            const balanceId = randomUUID();
            await consultarSaldoFgts({
                borrowerDocumentNumber: cpf,
                token: token,
                provider: batchData.v8Provider,
                userId: batchData.userId,
                userEmail: batchData.userEmail,
                balanceId: balanceId,
                batchId: batchId,
            });
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro desconhecido no processamento do lote V8.";
        console.error(`[Batch ${batchId}] V8 BATCH FATAL ERROR:`, error);
        await batchRef.update({ status: 'error', message: message, completedAt: FieldValue.serverTimestamp() });
    }
}


async function processC6BatchInBackground(batchId: string) {
    console.log(`[Batch C6 ${batchId}] Starting C6 background processing...`);
    const batchRef = firestore.collection('batches').doc(batchId);
    let batchData: BatchJob | null = null;

    try {
        const batchDoc = await batchRef.get();
        if (!batchDoc.exists) throw new Error(`Lote ${batchId} não encontrado.`);
        
        batchData = batchDoc.data() as BatchJob;
        if (!batchData.cpfsData) {
            throw new Error(`Dados de CPFs não encontrados para o lote ${batchId}`);
        }
        
        await batchRef.update({ status: 'processing', message: 'Iniciando processamento...' });

        const results: Record<string, any> = {};
        let processedCount = 0;

        for (const cpfData of batchData.cpfsData) {
            let status = 'error';
            let message = '';
            let link: string | undefined = undefined;
            let offers: C6Offer[] | undefined = undefined;

            try {
                // 1. Gerar Link
                const linkResponse = await consultarLinkAutorizacaoC6({
                    cpf: cpfData.cpf,
                    nome: cpfData.nome || 'N/A',
                    data_nascimento: cpfData.data_nascimento || 'N/A',
                    telefone: {
                        codigo_area: cpfData.telefone_ddd || '00',
                        numero: cpfData.telefone_numero || '000000000',
                    },
                    userId: batchData.userId,
                });

                if (linkResponse.success && linkResponse.data) {
                    link = linkResponse.data.link;
                    // 2. Verificar status (com alguma espera)
                    await new Promise(resolve => setTimeout(resolve, 5000)); // Espera 5s
                    const statusResponse = await verificarStatusAutorizacaoC6({ cpf: cpfData.cpf, userId: batchData.userId });

                    if (statusResponse.success && statusResponse.data?.status === 'AUTORIZADO') {
                        // 3. Buscar ofertas
                        const offersResponse = await consultarOfertasCLTC6({ cpf: cpfData.cpf, userId: batchData.userId });
                        if (offersResponse.success) {
                            status = 'success';
                            message = offersResponse.message || 'Ofertas consultadas.';
                            offers = offersResponse.data;
                        } else {
                            message = `Autorizado, mas falhou ao buscar ofertas: ${offersResponse.message}`;
                        }
                    } else {
                        message = `Status de autorização: ${statusResponse.data?.status || 'desconhecido'}. ${statusResponse.message}`;
                    }
                } else {
                    message = `Falha ao gerar link: ${linkResponse.message}`;
                }
            } catch (e: any) {
                message = `Erro inesperado no processamento do CPF: ${e.message}`;
            }

            results[cpfData.cpf] = { status, link, message, offers };
            processedCount++;
            await batchRef.update({
                processedCpfs: processedCount,
                results: results
            });
        }

        await batchRef.update({
            status: 'completed',
            completedAt: FieldValue.serverTimestamp(),
            message: 'Processamento do lote C6 concluído.',
        });

    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro fatal no processamento do lote C6.";
        console.error(`[Batch C6 ${batchId}] FATAL ERROR:`, error);
        await batchRef.update({ status: 'error', message, completedAt: FieldValue.serverTimestamp() });
    }
}


export async function processarLoteClt(input: z.infer<typeof processCltActionSchema>): Promise<ProcessActionResult> {
  const validation = processCltActionSchema.safeParse(input);

  if (!validation.success) {
    return { 
        status: 'error', 
        message: 'Dados de entrada inválidos para lote CLT.' 
    };
  }
  const { cpfsData, provider, userId, userEmail, fileName } = validation.data;
  
  const batchId = `batch-clt-${provider}-${Date.now()}-${userId.substring(0, 5)}`;
  const batchRef = firestore.collection('batches').doc(batchId);
  
  const batchJob: Omit<BatchJob, 'id'|'createdAt'> & { createdAt: FieldValue } = {
      fileName: fileName,
      type: 'clt',
      provider: provider,
      status: 'pending',
      totalCpfs: cpfsData.length,
      processedCpfs: 0,
      cpfs: cpfsData.map(d => d.cpf),
      cpfsData: cpfsData,
      createdAt: FieldValue.serverTimestamp(),
      userId: userId,
      userEmail: userEmail,
  };

  try {
      await batchRef.set(batchJob);
      await logActivity({
          userId,
          action: `Consulta CLT em Lote`,
          provider,
          details: `Arquivo: ${fileName} (${cpfsData.length} CPFs)`
      });

      if (provider === 'c6') {
          processC6BatchInBackground(batchId);
      }
      
      const serializableBatch: BatchJob = {
        ...batchJob,
        id: batchId,
        createdAt: new Date().toISOString(),
      };
      return {
        status: 'success',
        message: `Lote CLT para ${provider.toUpperCase()} iniciado.`,
        batch: serializableBatch,
      };

  } catch(error) {
    const message = error instanceof Error ? error.message : "Erro ao criar o lote no Firestore.";
    console.error("Batch CLT init error:", message);
    return { status: 'error', message };
  }
}

export async function gerarRelatorioLote(input: z.infer<typeof reportActionSchema>): Promise<ReportActionResult> {
    const validation = reportActionSchema.safeParse(input);
    if (!validation.success) {
        return { status: 'error', fileName: '', fileContent: '', message: 'Dados de entrada para o relatório são inválidos.' };
    }
    const { createdAt, provider, userId, batchId } = validation.data;
    
    await logActivity({ userId, action: 'Download de Relatório', provider, details: `Batch ID: ${batchId}` });

    try {
        const batchDoc = await firestore.collection('batches').doc(batchId).get();
        if (!batchDoc.exists) {
            return { status: 'error', fileName: '', fileContent: '', message: 'Lote não encontrado.' };
        }
        const batchData = batchDoc.data() as BatchJob;

        const webhookResponses = await firestore.collection('webhookResponses').where('batchId', '==', batchId).get();
        const responsesByCpf: Record<string, any> = {};

        webhookResponses.forEach(doc => {
            const data = doc.data();
            const cpf = data.documentNumber;
            if (cpf) {
                responsesByCpf[cpf] = data.responseBody || { error: data.message };
            }
        });

        const dataToExport = batchData.cpfs.map(cpf => {
            const response = responsesByCpf[cpf];
            if (response && response.balance !== undefined) {
                return { CPF: cpf, SALDO: response.balance, MENSAGEM: 'Sucesso' };
            }
            return { CPF: cpf, SALDO: 0, MENSAGEM: response?.errorMessage || 'Sem resposta ou erro' };
        });

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        worksheet['!cols'] = [{ wch: 15 }, { wch: 15 }, { wch: 50 }];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Resultados');

        const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
        const base64String = buffer.toString('base64');
        const fileContent = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64String}`;
        
        const formattedDate = new Date(createdAt).toLocaleDateString('pt-BR').replace(/\//g, '-');
        const fileName = `Relatorio_${provider}_${formattedDate}.xlsx`;

        return { status: 'success', fileName, fileContent, message: 'Relatório gerado.' };

    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao gerar relatório.";
        console.error("gerarRelatorioLote error:", error);
        return { status: 'error', fileName: '', fileContent: '', message };
    }
}


export async function reprocessarLoteComErro(input: z.infer<typeof reprocessBatchSchema>): Promise<ReprocessActionResult> {
    const validation = reprocessBatchSchema.safeParse(input);
    if (!validation.success) {
        return { status: 'error', message: 'ID do lote inválido.' };
    }
    const { batchId } = validation.data;

    try {
        const originalBatchRef = firestore.collection('batches').doc(batchId);
        const originalBatchDoc = await originalBatchRef.get();

        if (!originalBatchDoc.exists) {
            return { status: 'error', message: 'Lote original não encontrado.' };
        }
        const originalBatchData = originalBatchDoc.data() as BatchJob;

        const webhookResponses = await firestore.collection('webhookResponses').where('batchId', '==', batchId).get();
        const successfulCpfs = new Set(
            webhookResponses.docs
                .filter(doc => doc.data().status === 'success' && (doc.data().responseBody?.balance > 0 || doc.data().responseBody?.offers?.length > 0))
                .map(doc => doc.data().documentNumber)
        );
        
        const cpfsToReprocess = originalBatchData.cpfs.filter(cpf => !successfulCpfs.has(cpf));

        if (cpfsToReprocess.length === 0) {
            return { status: 'success', message: 'Nenhum CPF para reprocessar. Todos tiveram sucesso ou falharam sem saldo.' };
        }
        
        if (originalBatchData.type === 'fgts') {
            const result = await processarLoteFgts({
                cpfs: cpfsToReprocess,
                provider: originalBatchData.provider.toLowerCase() as 'v8' | 'facta',
                userId: originalBatchData.userId,
                userEmail: originalBatchData.userEmail,
                fileName: `${originalBatchData.fileName} (Reprocessamento)`,
                v8Provider: originalBatchData.v8Provider,
            });
            return {
                status: result.status,
                message: result.message,
                newBatch: result.batch,
            };

        } else if (originalBatchData.type === 'clt' && originalBatchData.cpfsData) {
            const cpfsDataToReprocess = originalBatchData.cpfsData.filter(cpfData => cpfsToReprocess.includes(cpfData.cpf));
            const result = await processarLoteClt({
                 cpfsData: cpfsDataToReprocess,
                 provider: originalBatchData.provider.toLowerCase() as 'v8' | 'facta' | 'c6',
                 userId: originalBatchData.userId,
                 userEmail: originalBatchData.userEmail,
                 fileName: `${originalBatchData.fileName} (Reprocessamento)`,
            });
            return {
                status: result.status,
                message: result.message,
                newBatch: result.batch,
            };
        }
        
        return { status: 'error', message: 'Tipo de lote não suportado para reprocessamento.' };

    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro desconhecido ao tentar reprocessar o lote.";
        console.error("reprocessarLoteComErro error:", error);
        return { status: 'error', message };
    }
}
