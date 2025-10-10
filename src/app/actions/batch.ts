'use server';

import { z } from 'zod';
import { consultarSaldoFgts as consultarSaldoV8, getAuthToken as getV8AuthToken } from './fgts';
import { consultarSaldoFgtsFacta, getFactaAuthToken } from './facta';
import * as XLSX from 'xlsx';
import { initializeFirebaseAdmin } from '@/firebase/server-init';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { type ApiCredentials, logActivity } from './users';
import { createNotification } from './notifications';

type Provider = "v8" | "facta";
type V8Provider = 'qi' | 'cartos' | 'bms';

const processActionSchema = z.object({
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
    provider: string; // 'V8DIGITAL' or 'facta'
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
        initializeFirebaseAdmin();
        const firestore = getFirestore();
        await firestore.collection('batches').doc(validation.data.batchId).delete();
        return { status: 'success', message: 'Lote excluído com sucesso.' };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao excluir o lote.";
        console.error("deleteBatch error:", message);
        return { status: 'error', message };
    }
}


export async function getBatches(input?: { userId: string }): Promise<{ status: 'success' | 'error'; batches?: BatchJob[]; message?: string, error?: string }> {
    try {
        initializeFirebaseAdmin();
        const firestore = getFirestore();
        
        let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = firestore.collection('batches');

        // Apply filter if a specific user's batches are requested
        if (input?.userId) {
            query = query.where('userId', '==', input.userId);
        }
        
        const batchesSnapshot = await query.get();

        if (batchesSnapshot.empty) {
            return { status: 'success', batches: [] };
        }
        
        let batches = batchesSnapshot.docs.map((doc): BatchJob => {
            const data = doc.data()!;
            return {
                id: doc.id,
                fileName: data.fileName,
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
            };
        });

        // Sort in memory to avoid needing a composite index in Firestore
        batches.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        return { status: 'success', batches };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao buscar lotes.";
        console.error("getBatches error:", error);
        return { status: 'error', error: message };
    }
}

async function processFactaBatchInBackground(batchId: string) {
    console.log(`[Batch ${batchId}] Starting/Continuing FACTA background processing...`);
    initializeFirebaseAdmin();
    const firestore = getFirestore();
    const batchRef = firestore.collection('batches').doc(batchId);
    const CHUNK_SIZE = 25; 

    let batchData: BatchJob;

    try {
        const batchDoc = await batchRef.get();
        if (!batchDoc.exists) throw new Error(`Lote ${batchId} não encontrado.`);
        
        batchData = batchDoc.data() as BatchJob;
        
        if (batchData.status === 'completed' || (batchData.status === 'error' && batchData.processedCpfs === batchData.totalCpfs)) {
            console.log(`[Batch ${batchId}] Batch already finished with status: ${batchData.status}.`);
            return;
        }

        await batchRef.update({ status: 'processing', message: 'Iniciando processamento...' });
        
        const userDoc = await firestore.collection('users').doc(batchData.userId).get();
        if (!userDoc.exists) throw new Error("Usuário do lote não encontrado.");
        const userCredentials = userDoc.data() as ApiCredentials;
        const { token, error: tokenError } = await getFactaAuthToken(userCredentials.facta_username, userCredentials.facta_password);
        if (tokenError || !token) throw new Error(tokenError || "Falha ao obter token da Facta.");

        const processedCpfsSnapshot = await firestore.collection('webhookResponses')
            .where('batchId', '==', batchId)
            .get();
        const processedCpfIds = new Set(processedCpfsSnapshot.docs.map(doc => doc.id.replace('facta-', '')));
        
        const cpfsToProcess = batchData.cpfs.filter(cpf => !processedCpfIds.has(cpf)).slice(0, CHUNK_SIZE);

        if (cpfsToProcess.length === 0) {
            const finalStatus = batchData.status === 'error' ? 'error' : 'completed';
            const finalMessage = finalStatus === 'completed' 
                ? "Todos os CPFs foram processados." 
                : batchData.message || 'Lote processado com alguns erros.';

            await batchRef.update({ status: finalStatus, processedCpfs: batchData.totalCpfs, message: finalMessage, completedAt: FieldValue.serverTimestamp() });
            
            await createNotification({
                userId: batchData.userId,
                title: `Lote "${batchData.fileName}" finalizado`,
                message: `O processamento do seu lote foi concluído com status: ${finalStatus}.`,
                link: '/esteira'
            });
            console.log(`[Batch ${batchId}] All CPFs processed. Batch completed.`);
            return;
        }

        console.log(`[Batch ${batchId}] Processing ${cpfsToProcess.length} CPFs in parallel.`);

        const processingPromises = cpfsToProcess.map(async (cpf) => {
            const docRef = firestore.collection('webhookResponses').doc(`facta-${cpf}`);
            try {
                const result = await consultarSaldoFgtsFacta({ cpf: cpf, userId: batchData.userId, token });
                const responseData = {
                    responseBody: result.data || { error: result.message },
                    createdAt: FieldValue.serverTimestamp(),
                    status: result.success ? 'success' : 'error',
                    message: result.message || (result.success ? 'Sucesso' : 'Erro desconhecido'),
                    id: `facta-${cpf}`,
                    provider: 'facta',
                    batchId: batchId,
                };
                await docRef.set(responseData, { merge: true });
            } catch (cpfError) {
                const message = cpfError instanceof Error ? cpfError.message : "Erro desconhecido ao processar CPF.";
                await docRef.set({ status: 'error', message, batchId: batchId, provider: 'facta' }, { merge: true });
            }
        });

        await Promise.all(processingPromises);
        
        const currentProcessedCount = batchData.processedCpfs + cpfsToProcess.length;
        await batchRef.update({ processedCpfs: currentProcessedCount });

        if (currentProcessedCount < batchData.totalCpfs) {
            console.log(`[Batch ${batchId}] Chunk processed. Triggering next one.`);
            await processFactaBatchInBackground(batchId); // Recursive call
        } else {
             const finalStatus = batchData.status === 'error' ? 'error' : 'completed';
             await batchRef.update({ status: finalStatus, message: "Todos os CPFs foram processados.", completedAt: FieldValue.serverTimestamp() });
             await createNotification({
                userId: batchData.userId,
                title: `Lote "${batchData.fileName}" concluído`,
                message: `O processamento foi finalizado.`,
                link: '/esteira'
             });
            console.log(`[Batch ${batchId}] Final chunk processed. Batch completed.`);
        }

    } catch (error) {
        const message = error instanceof Error ? error.message : "An unknown error occurred.";
        console.error(`[Batch ${batchId}] FACTA BATCH FATAL ERROR:`, error);
        await batchRef.update({ status: 'error', message: message, completedAt: FieldValue.serverTimestamp() });
         if (batchData!) {
            await createNotification({
                userId: batchData.userId,
                title: `Erro no lote "${batchData.fileName}"`,
                message: `Ocorreu um erro fatal durante o processamento.`,
                link: '/esteira'
            });
        }
    }
}

export async function processarLoteFgts(input: z.infer<typeof processActionSchema>): Promise<ProcessActionResult> {
  const validation = processActionSchema.safeParse(input);

  if (!validation.success) {
    return { 
        status: 'error', 
        message: 'Dados de entrada inválidos.' 
    };
  }

  const { cpfs, provider, userId, userEmail, fileName, v8Provider } = validation.data;
  
  initializeFirebaseAdmin();
  const firestore = getFirestore();
  
  const displayProvider = provider === 'v8' ? 'V8DIGITAL' : 'facta';
  
  const batchId = `batch-${displayProvider}-${v8Provider || ''}-${Date.now()}-${userId.substring(0, 5)}`;
  const batchRef = firestore.collection('batches').doc(batchId);
  
  const baseBatchData: Omit<BatchJob, 'id' | 'createdAt' | 'v8Provider'> & { createdAt: FieldValue } = {
      fileName: fileName,
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
  
  // Do not await this, let it run in the background
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
    let batchData: BatchJob;
    const firestore = getFirestore();
    const batchRef = firestore.collection('batches').doc(batchId);

    try {
        initializeFirebaseAdmin();
        const batchDoc = await batchRef.get();
        if (!batchDoc.exists) throw new Error(`Lote ${batchId} não encontrado.`);

        batchData = batchDoc.data() as BatchJob;
        await batchRef.update({ status: 'processing', message: 'Enviando solicitações para a V8...' });
        
        const { cpfs, userId, userEmail, v8Provider } = batchData;
        
        if (!v8Provider) {
            throw new Error("V8 sub-provider (qi, cartos, bms) is missing.");
        }

        const userDoc = await firestore.collection('users').doc(userId).get();
        if (!userDoc.exists) throw new Error(`User with ID ${userId} not found.`);
        const userCredentials = userDoc.data() as ApiCredentials;
        
        const { token: authToken, error: authError } = await getV8AuthToken(userCredentials);
        if (authError || !authToken) throw new Error(authError || "Failed to get V8 auth token.");
        
        for (const cpf of cpfs) {
             consultarSaldoV8({ 
                documentNumber: cpf, 
                userId, 
                userEmail,
                token: authToken, 
                provider: v8Provider,
                batchId: batchId
            });
            // We don't log individual CPFs for batch jobs anymore to reduce noise
        }
        
        await batchRef.update({ 
            message: 'Solicitações enviadas. Aguardando respostas do webhook.',
        });

    } catch (error) {
        const message = error instanceof Error ? error.message : "An unknown error occurred.";
        console.error(`[Batch ${batchId}] V8 BATCH FATAL ERROR:`, error);
        await batchRef.update({ status: 'error', message: message, completedAt: FieldValue.serverTimestamp() });
        if (batchData!) {
            await createNotification({
                userId: batchData.userId,
                title: `Erro no lote "${batchData.fileName}"`,
                message: `Ocorreu um erro fatal durante o processamento.`,
                link: '/esteira'
            });
        }
    }
}

export async function reprocessarLoteComErro(input: z.infer<typeof reprocessBatchSchema>): Promise<ReprocessActionResult> {
    const validation = reprocessBatchSchema.safeParse(input);
    if (!validation.success) {
        return { status: 'error', message: 'ID do lote inválido.' };
    }

    const { batchId } = validation.data;
    initializeFirebaseAdmin();
    const firestore = getFirestore();

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

        // Find which CPFs were NOT processed successfully
        const webhookResponsesSnapshot = await firestore.collection('webhookResponses')
            .where('batchId', '==', batchId)
            .where('status', '==', 'success') 
            .get();
        
        const successfullyProcessedCpfs = new Set(webhookResponsesSnapshot.docs.map(doc => {
             const docId = doc.id;
             if (originalBatchData.provider.toLowerCase() === 'facta') {
                 return docId.replace('facta-', '');
             }
             return docId;
        }));

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

        // Create a NEW batch with only the remaining CPFs
        const newBatchAction: z.infer<typeof processActionSchema> = {
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

    const { cpfs, fileName: originalFileName, createdAt, provider: displayProvider, userId } = validation.data;
    const mainProvider = displayProvider.toLowerCase();
    
    const formattedDate = new Date(createdAt).toLocaleDateString('pt-BR').replace(/\//g, '-');
    const formattedTime = new Date(createdAt).toTimeString().split(' ')[0].replace(/:/g, '-');
    const fileName = `WORKBANK${displayProvider.toUpperCase()}_${formattedDate}_${formattedTime}.xlsx`;


    await logActivity({
        userId: userId,
        action: 'Download de Relatório de Lote',
        provider: displayProvider,
        details: `Arquivo: ${fileName}`
    });


    initializeFirebaseAdmin();
    const firestore = getFirestore();
    
    const results: any[] = [];

    for (const cpf of cpfs) {
        try {
            const docId = mainProvider === 'v8digital' ? cpf : `facta-${cpf}`;
            const docRef = firestore.collection('webhookResponses').doc(docId);
            const docSnap = await docRef.get();

            if (docSnap.exists) {
                const data = docSnap.data();
                const responseBody = data?.responseBody;
                
                const providerError = responseBody?.errorMessage || responseBody?.error || data?.message;
                const isSuccess = data?.status === 'success' && responseBody;

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
        } catch (error) {
             const message = error instanceof Error ? error.message : 'Erro interno ao consultar resultado.';
             results.push({ CPF: cpf, Saldo: '0.00', 'Saldo Total': '0.00', Mensagem: message });
        }
    }

    if (results.length === 0) {
        return { status: 'error', fileName: '', fileContent: '', message: 'Nenhum dado para gerar relatório.' };
    }
    
    const finalResults = results.map(r => ({
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

    const worksheet = XLSX.utils.json_to_sheet(finalResults);
    
    if (finalResults.length > 0) {
        const header = Object.keys(finalResults[0]);
        worksheet['!cols'] = header.map(key => ({
            wch: Math.max(15, key.length + 2) 
        }));
        
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
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Resultados FGTS');

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
