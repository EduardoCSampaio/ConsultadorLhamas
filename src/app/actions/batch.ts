
'use server';

import { z } from 'zod';
import { consultarSaldoFgts } from './fgts';
import { consultarSaldoFgtsFacta, getFactaAuthToken } from './facta';
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
  message: string;
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


export async function getBatches(input: { userId: string }): Promise<{ status: 'success' | 'error'; batches?: BatchJob[]; message?: string, error?: string }> {
    try {
        let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = firestore.collection('batches');
        const userDoc = await firestore.collection('users').doc(input.userId).get();
        const userRole = userDoc.data()?.role;

        if (userRole === 'user') {
            query = query.where('userId', '==', input.userId);
        } else if (userRole === 'manager') {
            const teamId = userDoc.data()?.teamId;
            if (!teamId) return { status: 'success', batches: [] };
            const teamMembersSnapshot = await firestore.collection('users').where('teamId', '==', teamId).get();
            const memberIds = teamMembersSnapshot.docs.map(doc => doc.id);
            if (memberIds.length > 0) {
                 query = query.where('userId', 'in', memberIds);
            } else {
                 return { status: 'success', batches: [] };
            }
        }
        // Super admin sees all batches, so no filter is applied
        
        const batchesSnapshot = await query.get();

        if (batchesSnapshot.empty) {
            return { status: 'success', batches: [] };
        }
        
        let batches = batchesSnapshot.docs.map((doc): BatchJob => {
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

        // Sorting is done on the client-side in esteira/page.tsx
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
        
        const { credentials, error: credError } = await getFactaUserCredentials(batchData.userId);
        if (credError || !credentials) {
             throw new Error(credError || `Credenciais da Facta não encontradas para o usuário ${batchData.userId}`);
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


async function processC6BatchInBackground(batchId: string) {
    console.log(`[Batch C6 ${batchId}] Starting C6 background processing...`);
    const batchRef = firestore.collection('batches').doc(batchId);
    let batchData: BatchJob | null = null;

    try {
        const batchDoc = await batchRef.get();
        if (!batchDoc.exists) throw new Error(`Lote ${batchId} não encontrado.`);
        
        batchData = batchDoc.data() as BatchJob;
        if (!batchData.cpfsData) {
            throw new Error(`Dados de CPFs não encontrados no lote ${batchId}.`);
        }
        await batchRef.update({ status: 'processing', message: 'Verificando status e buscando ofertas...' });
        
        const { credentials, error: credError } = await getC6UserCredentials(batchData.userId);
        if (credError || !credentials) {
            throw new Error(credError || `Credenciais do C6 não encontradas para o usuário ${batchData.userId}`);
        }

        const processCpf = async (cpfData: CpfData): Promise<[string, { status: string; link?: string; message: string; offers?: C6Offer[] }]> => {
            try {
                const statusResult = await verificarStatusAutorizacaoC6({ cpf: cpfData.cpf, userId: batchData!.userId });
                
                if (statusResult.success && statusResult.data?.status === 'AUTORIZADO') {
                    const offersResult = await consultarOfertasCLTC6({ cpf: cpfData.cpf, userId: batchData!.userId });
                    if (offersResult.success && offersResult.data) {
                        return [cpfData.cpf, {
                            status: 'AUTORIZADO',
                            message: offersResult.data.length > 0 ? `${offersResult.data.length} oferta(s) encontrada(s).` : 'Nenhuma oferta encontrada.',
                            offers: offersResult.data
                        }];
                    } else {
                        return [cpfData.cpf, { status: 'AUTORIZADO', message: `Autorizado, mas falhou ao buscar ofertas: ${offersResult.message}`, offers: [] }];
                    }
                } else if (statusResult.success && statusResult.data?.status === 'NAO_AUTORIZADO') {
                     if (!cpfData.nome || !cpfData.data_nascimento || !cpfData.telefone_ddd || !cpfData.telefone_numero) {
                         return [cpfData.cpf, { status: 'ERRO_DADOS', message: 'Dados insuficientes para gerar link.' }];
                    }
                    const linkResult = await consultarLinkAutorizacaoC6({
                        cpf: cpfData.cpf,
                        nome: cpfData.nome,
                        data_nascimento: cpfData.data_nascimento,
                        telefone: {
                            codigo_area: cpfData.telefone_ddd,
                            numero: cpfData.telefone_numero
                        },
                        userId: batchData!.userId,
                    });
                    if (linkResult.success && linkResult.data) {
                        return [cpfData.cpf, { status: 'NAO_AUTORIZADO', link: linkResult.data.link, message: 'Link de autorização gerado.' }];
                    } else {
                        return [cpfData.cpf, { status: 'ERRO_LINK', message: linkResult.message }];
                    }
                } else if (statusResult.success) { // Other statuses like AGUARDANDO_AUTORIZACAO
                     return [cpfData.cpf, { status: statusResult.data!.status, message: statusResult.data!.observacao || '' }];
                } else { // Status check failed
                     return [cpfData.cpf, { status: 'ERRO_STATUS', message: statusResult.message }];
                }
            } catch (e) {
                const message = e instanceof Error ? e.message : "Erro desconhecido ao processar CPF.";
                 return [cpfData.cpf, { status: 'ERRO_FATAL', message }];
            }
        };

        const resultsArray = await Promise.all(batchData.cpfsData.map(processCpf));
        const batchResults = Object.fromEntries(resultsArray);
        
        await batchRef.update({
            status: 'completed',
            message: 'Processamento de verificação e ofertas concluído.',
            completedAt: FieldValue.serverTimestamp(),
            results: batchResults,
            processedCpfs: batchData.totalCpfs,
        });

    } catch (error) {
        const message = error instanceof Error ? error.message : "An unknown error occurred.";
        console.error(`[Batch C6 ${batchId}] FATAL ERROR:`, error);
        await batchRef.update({ status: 'error', message: message, completedAt: FieldValue.serverTimestamp() });
    }
}


export async function processarLoteClt(input: z.infer<typeof processCltActionSchema>): Promise<ProcessActionResult> {
  const validation = processCltActionSchema.safeParse(input);

  if (!validation.success) {
    return { 
        status: 'error', 
        message: 'Dados de entrada inválidos.' 
    };
  }

  const { cpfsData, provider, userId, userEmail, fileName } = validation.data;
  const cpfs = cpfsData.map(d => d.cpf);
  
  const displayProvider = provider.toUpperCase();
  
  const batchId = `batch-clt-${displayProvider}-${Date.now()}-${userId.substring(0, 5)}`;
  const batchRef = firestore.collection('batches').doc(batchId);
  
  const batchData: Omit<BatchJob, 'id' | 'createdAt'> & { createdAt: FieldValue; cpfsData?: any[] } = {
      fileName: fileName,
      type: 'clt',
      provider: displayProvider,
      status: 'pending',
      totalCpfs: cpfs.length,
      processedCpfs: 0,
      cpfs: cpfs,
      createdAt: FieldValue.serverTimestamp(),
      userId: userId,
      userEmail: userEmail,
  };

  if (provider === 'c6') {
    batchData.cpfsData = cpfsData;
    batchData.status = 'pending';
  } else {
     batchData.status = 'error';
     batchData.message = 'Processamento de lote CLT ainda não implementado para este provedor.';
  }
  
  try {
      await batchRef.set(batchData);

      await logActivity({
          userId: userId,
          action: `Consulta CLT em Lote (Excel)`,
          provider: displayProvider,
          details: `Arquivo: ${fileName} (${cpfs.length} CPFs)`
      });

      if (provider === 'c6') {
          processC6BatchInBackground(batchId); // Fire and forget
      } else {
         await batchRef.update({
            completedAt: FieldValue.serverTimestamp(),
        });
      }


  } catch(error) {
    const message = error instanceof Error ? error.message : "Erro ao iniciar o lote CLT no Firestore.";
    console.error("Batch CLT init error:", message);
    return { status: 'error', message };
  }
  
  const serializableBatch: BatchJob = {
    ...(batchData as any),
    id: batchId,
    createdAt: new Date().toISOString(),
  }

  return {
    status: 'success',
    message: `Lote para ${displayProvider.toUpperCase()} criado.`,
    batch: serializableBatch
  };
}


async function processV8BatchInBackground(batchId: string) {
    console.log(`[Batch ${batchId}] Starting V8 background processing...`);
    const batchRef = firestore.collection('batches').doc(batchId);

    try {
        // Immediately update the status to 'processing'
        await batchRef.update({ status: 'processing', message: 'Enviando requisições para a API V8...' });

        const batchDoc = await batchRef.get();
        if (!batchDoc.exists) throw new Error(`Lote ${batchId} não encontrado.`);

        const batchData = batchDoc.data() as BatchJob;
        
        const { cpfs, userId, userEmail, v8Provider } = batchData;
        
        if (!v8Provider) {
            throw new Error("V8 sub-provider (qi, cartos, bms) is missing.");
        }

        const { credentials, error: credError } = await getUserCredentials(userId);
        if (credError || !credentials) {
            throw new Error(credError || `Credenciais da V8 não encontradas para o usuário ${userId}`);
        }
        
        const { token: authToken, error: authError } = await getAuthToken(credentials);
        if (authError || !authToken) throw new Error(authError || "Failed to get V8 auth token.");
        
        for (const cpf of cpfs) {
            // The balanceId must be consistent for each CPF request within this batch run.
            const balanceId = randomUUID();
             consultarSaldoFgts({ 
                documentNumber: cpf, 
                userId, 
                userEmail,
                token: authToken, 
                provider: v8Provider,
                balanceId: balanceId,
                batchId
            });
        }
        
        console.log(`[Batch ${batchId}] All ${cpfs.length} requests sent. Waiting for webhooks.`);

    } catch (error) {
        const message = error instanceof Error ? error.message : "An unknown error occurred.";
        console.error(`[Batch ${batchId}] V8 BATCH FATAL ERROR:`, error);
        await batchRef.update({ status: 'error', message: message, completedAt: FieldValue.serverTimestamp() });
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

        await logActivity({
            userId: originalBatchData.userId,
            action: 'Reprocessamento de Lote',
            provider: originalBatchData.provider,
            details: `Reprocessando lote: ${originalBatchData.fileName} (ID: ${batchId})`
        });

        const webhookResponsesSnapshot = await firestore.collection('webhookResponses')
            .where('batchId', '==', batchId)
            .where('status', '==', 'success') 
            .get();
        
        const successfullyProcessedCpfs = new Set(webhookResponsesSnapshot.docs.map(doc => doc.data().documentNumber));

        const cpfsToReprocess = originalBatchData.cpfs.filter(cpf => !successfullyProcessedCpfs.has(cpf));

        if (cpfsToReprocess.length === 0) {
            await originalBatchRef.update({
                status: 'completed',
                message: 'Finalizado após verificação de reprocessamento. Nenhum CPF pendente.',
                processedCpfs: originalBatchData.totalCpfs,
                completedAt: FieldValue.serverTimestamp()
            });
            return { status: 'success', message: 'Todos os CPFs já haviam sido processados com sucesso. Lote finalizado.' };
        }

        const newBatchAction: z.infer<typeof processFgtsActionSchema> = {
            cpfs: cpfsToReprocess,
            provider: originalBatchData.provider === 'V8DIGITAL' ? 'v8' : 'facta',
            userId: originalBatchData.userId,
            userEmail: originalBatchData.userEmail,
            fileName: `${originalBatchData.fileName.replace(/\.xlsx$/i, '')} (Reprocessado).xlsx`,
            v8Provider: originalBatchData.v8Provider,
        };

        const result = await processarLoteFgts(newBatchAction);

        if (result.status === 'success') {
            await originalBatchRef.update({ 
                message: `Lote substituído por um novo lote de reprocessamento: ${result.batch?.id}`
            });
            return { status: 'success', message: `Novo lote de reprocessamento criado com ${cpfsToReprocess.length} CPFs.`, newBatch: result.batch };
        } else {
            return { status: 'error', message: result.message || "Falha ao criar o novo lote para reprocessamento." };
        }

    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro desconhecido ao tentar reprocessar o lote.";
        console.error(`[Reprocess Batch] Error:`, error);
        return { status: 'error', message };
    }
}


export async function gerarRelatorioLote(input: z.infer<typeof reportActionSchema>): Promise<ReportActionResult> {
    const validation = reportActionSchema.safeParse(input);

    if (!validation.success) {
        return { status: 'error', fileName: '', fileContent: '', message: 'Dados de entrada para o relatório são inválidos.' };
    }

    const { cpfs, createdAt, provider: displayProvider, userId, batchId } = validation.data;
    const mainProvider = displayProvider.toLowerCase();
    
    const formattedDate = new Date(createdAt).toLocaleDateString('pt-BR').replace(/\//g, '-');
    const formattedTime = new Date(createdAt).toTimeString().split(' ')[0].replace(/:/g, '-');
    const fileName = `${displayProvider.toUpperCase()}_${formattedDate}_${formattedTime}.xlsx`;


    await logActivity({
        userId: userId,
        action: 'Download de Relatório de Lote',
        provider: displayProvider,
        details: `Arquivo: ${fileName}`
    });

    let results: any[] = [];
    
    if (mainProvider === 'c6') {
        const batchDoc = await firestore.collection('batches').doc(batchId).get();
        if (batchDoc.exists) {
            const batchData = batchDoc.data() as BatchJob;
            if (batchData.results) {
                for (const [cpf, result] of Object.entries(batchData.results)) {
                    if (result.offers && result.offers.length > 0) {
                        result.offers.forEach(offer => {
                            results.push({
                                'CPF': cpf,
                                'STATUS': result.status,
                                'MENSAGEM': result.message,
                                'LINK_AUTORIZACAO': result.link || '',
                                'ID_OFERTA': offer.id_oferta,
                                'PRODUTO_OFERTA': offer.nome_produto,
                                'VALOR_FINANCIADO': offer.valor_financiado,
                                'VALOR_PARCELA': offer.valor_parcela,
                                'QTD_PARCELAS': offer.qtd_parcelas,
                                'TAXA_MES': offer.taxa_mes,
                                'STATUS_OFERTA': offer.status
                            });
                        });
                    } else {
                        results.push({
                            'CPF': cpf,
                            'STATUS': result.status,
                            'MENSAGEM': result.message,
                            'LINK_AUTORIZACAO': result.link || '',
                        });
                    }
                }
            }
        }
    } else {
        const webhookDocs = await firestore.collection('webhookResponses').where('batchId', '==', batchId).get();
        const responsesByCpf: Record<string, any> = {};

        webhookDocs.forEach(doc => {
            const data = doc.data();
            const cpf = data.documentNumber; // Use documentNumber as the key
            if (cpf) {
                // If a CPF has multiple entries, this will only keep the last one.
                // You might need more sophisticated logic if multiple results per CPF are expected.
                responsesByCpf[cpf] = data;
            }
        });

        for (const cpf of cpfs) {
            const docData = responsesByCpf[cpf];
            if (docData) {
                 const responseBody = docData?.responseBody;
                    
                    const providerError = responseBody?.errorMessage || responseBody?.error || docData?.message;
                    const isSuccess = docData?.status === 'success' && responseBody;

                    if (isSuccess) {
                        if (mainProvider === 'v8digital') {
                            const balanceValue = parseFloat(responseBody.balance);
                             results.push({
                                CPF: cpf,
                                Saldo: isNaN(balanceValue) ? '0.00' : balanceValue, 
                                Mensagem: 'Sucesso',
                            });
                        } else if (mainProvider === 'facta') {
                            const saldoTotal = parseFloat(responseBody.saldo_total);
                            let row: any = {
                                CPF: cpf,
                                'Saldo Total': isNaN(saldoTotal) ? '0.00' : saldoTotal,
                                Mensagem: responseBody.msg || 'Sucesso',
                                'Data Saldo': responseBody.data_saldo,
                            };
                            for(let i=1; i<=12; i++){
                                if(responseBody[`dataRepasse_${i}`]){
                                    row[`Data Repasse ${i}`] = responseBody[`dataRepasse_${i}`];
                                    row[`Valor ${i}`] = parseFloat(responseBody[`valor_${i}`]);
                                }
                            }
                            results.push(row);
                        }
                    } else {
                        results.push({ CPF: cpf, Saldo: '0.00', 'Saldo Total': '0.00', Mensagem: providerError || "Erro no processamento." });
                    }
            } else {
                results.push({ CPF: cpf, Saldo: '0.00', 'Saldo Total': '0.00', Mensagem: 'Nenhum resultado encontrado.' });
            }
        }
    }


    if (results.length === 0) {
        return { status: 'error', fileName: '', fileContent: '', message: 'Nenhum dado para gerar relatório.' };
    }
    
    let finalResults = results;
    if (mainProvider !== 'c6') {
        finalResults = results.map(r => ({
            CPF: r.CPF,
            SALDO: r.Saldo || r['Saldo Total'] || '0.00',
            MENSAGEM: r.Mensagem,
            ...(mainProvider === 'facta' && {
                'DATA_SALDO': r['Data Saldo'],
                'DATA_REPASSE_1': r['Data Repasse 1'], 'VALOR_1': r['Valor 1'],
                'DATA_REPASSE_2': r['Data Repasse 2'], 'VALOR_2': r['Valor 2'],
                'DATA_REPASSE_3': r['Data Repasse 3'], 'VALOR_3': r['Valor 3'],
                'DATA_REpasse_4': r['Data Repasse 4'], 'VALOR_4': r['Valor 4'],
                'DATA_REPASSE_5': r['Data Repasse 5'], 'VALOR_5': r['Valor 5'],
                'DATA_REPASSE_6': r['Data Repasse 6'], 'VALOR_6': r['Valor 6'],
                'DATA_REPASSE_7': r['Data Repasse 7'], 'VALOR_7': r['Valor 7'],
                'DATA_REPASSE_8': r['Data Repasse 8'], 'VALOR_8': r['Valor 8'],
                'DATA_REPASSE_9': r['Data Repasse 9'], 'VALOR_9': r['Valor 9'],
                'DATA_REPASSE_10': r['Data Repasse 10'], 'VALOR_10': r['Valor 10'],
                'DATA_REPASSE_11': r['Data Repasse 11'], 'VALOR_11': r['Valor 11'],
                'DATA_REPASSE_12': r['Data Repasse 12'], 'VALOR_12': r['Valor 12'],
            })
        }));
    }


    const worksheet = XLSX.utils.json_to_sheet(finalResults);
    
    if (finalResults.length > 0) {
        const header = Object.keys(finalResults[0]);
        worksheet['!cols'] = header.map(key => ({
            wch: Math.max(15, key.length + 2) 
        }));
        
        if (mainProvider !== 'c6') {
            const formatCurrencyCells = (colName: string) => {
                const colIndex = header.indexOf(colName);
                if (colIndex !== -1) {
                    finalResults.forEach((_, index) => {
                        const cellRef = XLSX.utils.encode_cell({c: colIndex, r: index + 1});
                         if (worksheet[cellRef] && typeof worksheet[cellRef].v === 'number') {
                            worksheet[cellRef].z = '"R$"#,##0.00';
                        }
                    });
                }
            };
            
            formatCurrencyCells('SALDO');
            for (let i = 1; i <= 12; i++) {
                formatCurrencyCells(`VALOR_${i}`);
            }
        } else {
             const formatCurrencyCellsC6 = (colName: string) => {
                const colIndex = header.indexOf(colName);
                if (colIndex !== -1) {
                    finalResults.forEach((_, index) => {
                        const cellRef = XLSX.utils.encode_cell({c: colIndex, r: index + 1});
                         if (worksheet[cellRef] && typeof worksheet[cellRef].v === 'number') {
                            worksheet[cellRef].z = '"R$"#,##0.00';
                        }
                    });
                }
            };
            formatCurrencyCellsC6('VALOR_FINANCIADO');
            formatCurrencyCellsC6('VALOR_PARCELA');
        }
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Resultados');

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    const base64String = buffer.toString('base64');

    const fileContent = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64String}`;

    return {
        status: 'success',
        fileName,
        fileContent,
        message: 'Relatório gerado com sucesso.',
    };
}
      

async function getFactaUserCredentials(userId: string): Promise<{ credentials: ApiCredentials | null; error: string | null }> {
    if (!userId) {
        return { credentials: null, error: 'ID do usuário não fornecido.' };
    }
    try {
        const userDoc = await firestore.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return { credentials: null, error: 'Usuário não encontrado.' };
        }
        const userData = userDoc.data()!;
        const credentials = {
            facta_username: userData.facta_username,
            facta_password: userData.facta_password,
        };

        if (!credentials.facta_username || !credentials.facta_password) {
            const missing = [
                !credentials.facta_username && "Username",
                !credentials.facta_password && "Password",
            ].filter(Boolean).join(', ');
            return { credentials: null, error: `Credenciais da Facta incompletas. Faltando: ${missing}. Por favor, configure-as na página de Configurações.` };
        }

        return { credentials, error: null };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao carregar credenciais da API Facta.";
        console.error(`[getFactaUserCredentials] Error fetching credentials for user ${userId}:`, error);
        return { credentials: null, error: message };
    }
}


async function getC6UserCredentials(userId: string): Promise<{ credentials: ApiCredentials | null; error: string | null }> {
    if (!userId) {
        return { credentials: null, error: 'ID do usuário não fornecido.' };
    }
    try {
        const userDoc = await firestore.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return { credentials: null, error: 'Usuário não encontrado.' };
        }
        const userData = userDoc.data()!;
        const credentials = {
            c6_username: userData.c6_username,
            c6_password: userData.c6_password,
        };

        if (!credentials.c6_username || !credentials.c6_password) {
            const missing = [
                !credentials.c6_username && "Username",
                !credentials.c6_password && "Password",
            ].filter(Boolean).join(', ');
            return { credentials: null, error: `Credenciais do C6 incompletas. Faltando: ${missing}. Por favor, configure-as na página de Configurações.` };
        }

        return { credentials, error: null };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao carregar credenciais da API C6.";
        console.error(`[getC6UserCredentials] Error fetching credentials for user ${userId}:`, error);
        return { credentials: null, error: message };
    }
}
