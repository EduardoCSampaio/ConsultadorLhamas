
'use server';

import { z } from 'zod';
import { consultarSaldoFgts as consultarSaldoV8, getAuthToken as getV8AuthToken } from './fgts';
import { consultarSaldoFgtsFacta, getFactaAuthToken } from './facta';
import * as XLSX from 'xlsx';
import { initializeFirebaseAdmin } from '@/firebase/server-init';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { ApiCredentials } from './users';

type Provider = "v8" | "facta";
type V8Provider = 'qi' | 'bms';

const processActionSchema = z.object({
  cpfs: z.array(z.string()),
  provider: z.enum(["v8", "facta"]),
  userId: z.string(),
  userEmail: z.string(),
  fileName: z.string(),
  v8Provider: z.enum(['qi', 'bms']).optional(),
});

const reportActionSchema = z.object({
  cpfs: z.array(z.string()),
  fileName: z.string(),
  createdAt: z.string(),
  provider: z.string(), // Can be v8-qi, v8-bms, facta
});

const getBatchStatusSchema = z.object({
    batchId: z.string(),
});

const deleteBatchSchema = z.object({
    batchId: z.string(),
});

export type BatchJob = {
    id: string;
    fileName: string;
    provider: string, // Now can be 'v8-qi', 'v8-bms', 'facta'
    status: 'processing' | 'completed' | 'error';
    totalCpfs: number;
    processedCpfs: number;
    cpfs: string[];
    createdAt: string; // ISO String
    message?: string;
};


type ProcessActionResult = {
  status: 'success' | 'error';
  message?: string;
  batch?: BatchJob;
};

type ReportActionResult = {
  status: 'success' | 'error';
  fileName: string;
  fileContent: string;
  message?: string;
};


function toISODate(timestamp: Timestamp | string | Date): string {
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


export async function getBatches(): Promise<{ status: 'success' | 'error'; batches?: BatchJob[]; message?: string }> {
    try {
        initializeFirebaseAdmin();
        const firestore = getFirestore();
        const batchesSnapshot = await firestore.collection('batches').orderBy('createdAt', 'desc').get();

        if (batchesSnapshot.empty) {
            return { status: 'success', batches: [] };
        }

        const batches = batchesSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                fileName: data.fileName,
                provider: data.provider,
                status: data.status,
                totalCpfs: data.totalCpfs,
                processedCpfs: data.processedCpfs,
                cpfs: data.cpfs,
                createdAt: toISODate(data.createdAt),
                message: data.message,
            } as BatchJob;
        });

        return { status: 'success', batches };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao buscar lotes.";
        console.error("getBatches error:", message);
        return { status: 'error', message };
    }
}


export async function getBatchStatus(input: z.infer<typeof getBatchStatusSchema>): Promise<{ status: 'success' | 'error'; batch?: BatchJob; message?: string }> {
    const validation = getBatchStatusSchema.safeParse(input);
    if (!validation.success) {
        return { status: 'error', message: 'ID do lote inválido.' };
    }
    
    try {
        initializeFirebaseAdmin();
        const firestore = getFirestore();
        const batchDoc = await firestore.collection('batches').doc(validation.data.batchId).get();

        if (!batchDoc.exists) {
            return { status: 'error', message: 'Lote não encontrado.' };
        }
        
        const data = batchDoc.data()!;
        
        const batch: BatchJob = {
            id: batchDoc.id,
            fileName: data.fileName,
            provider: data.provider,
            status: data.status,
            totalCpfs: data.totalCpfs,
            processedCpfs: data.processedCpfs,
            cpfs: data.cpfs,
            createdAt: toISODate(data.createdAt),
            message: data.message,
        };

        return { status: 'success', batch };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao buscar status do lote.";
        console.error("getBatchStatus error:", message);
        return { status: 'error', message };
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
  
  const finalProvider = provider === 'v8' && v8Provider ? `${provider}-${v8Provider}` : provider;
  const batchId = `batch-${finalProvider}-${Date.now()}-${userId.substring(0, 5)}`;
  const batchRef = firestore.collection('batches').doc(batchId);

  const batchData: Omit<BatchJob, 'createdAt' | 'id'> & { createdAt: FieldValue; userId: string; } = {
      fileName: fileName,
      provider: finalProvider,
      status: 'processing',
      totalCpfs: cpfs.length,
      processedCpfs: 0,
      cpfs: cpfs,
      createdAt: FieldValue.serverTimestamp(),
      userId: userId,
  };

  try {
      await batchRef.set(batchData);
  } catch(error) {
    const message = error instanceof Error ? error.message : "Erro ao iniciar o lote no Firestore.";
    console.error("Batch init error:", message);
    return { status: 'error', message };
  }

  // Do not await this, let it run in the background
  processBatchInBackground(batchId);
  
  const serializableBatch: BatchJob = {
    ...batchData,
    id: batchId,
    createdAt: new Date().toISOString(),
  }

  return {
    status: 'success',
    message: `Lote para ${finalProvider.toUpperCase()} enviado para processamento.`,
    batch: serializableBatch
  };
}

async function processBatchInBackground(batchId: string) {
    initializeFirebaseAdmin();
    const firestore = getFirestore();
    const batchRef = firestore.collection('batches').doc(batchId);
    
    try {
        const batchDoc = await batchRef.get();
        if (!batchDoc.exists) {
            console.error(`[Batch ${batchId}] Batch document not found.`);
            return;
        }

        const batchData = batchDoc.data() as Omit<BatchJob, 'createdAt' | 'id'> & { userId: string, userEmail: string };
        const { cpfs, provider: finalProvider, userId, userEmail } = batchData;
        
        console.log(`[Batch ${batchId}] Starting background processing for ${cpfs.length} CPFs via ${finalProvider}.`);

        const userDoc = await firestore.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            throw new Error(`User with ID ${userId} not found.`);
        }
        const userCredentials = userDoc.data() as ApiCredentials;
        
        let authToken: string | undefined;
        let authError: string | null = null;

        const mainProvider = finalProvider.split('-')[0];
        const subProvider = finalProvider.split('-')[1] as V8Provider | undefined;
        
        if (mainProvider === 'v8') {
             const v8Creds: ApiCredentials = {
                v8_username: userCredentials.v8_username,
                v8_password: userCredentials.v8_password,
                v8_audience: userCredentials.v8_audience,
                v8_client_id: userCredentials.v8_client_id,
             };
             ({ token: authToken, error: authError } = await getV8AuthToken(v8Creds));
        } else if (mainProvider === 'facta') {
            const factaCreds: ApiCredentials = {
                facta_username: userCredentials.facta_username,
                facta_password: userCredentials.facta_password
            };
            ({ token: authToken, error: authError } = await getFactaAuthToken(factaCreds));
        }

        if (authError || !authToken) {
            throw new Error(authError || "Failed to get auth token.");
        }
        
        let processedCount = 0;
        for (const cpf of cpfs) {
            console.log(`[Batch ${batchId}] Processing CPF: ${cpf}`);
            
            if (mainProvider === 'v8' && subProvider) {
                await consultarSaldoV8({ documentNumber: cpf, userId, userEmail, token: authToken, provider: subProvider });
            } else if (mainProvider === 'facta') {
                const result = await consultarSaldoFgtsFacta({ cpf, userId, token: authToken });
                
                const docId = `facta-${cpf}`;
                const docRef = firestore.collection('webhookResponses').doc(docId);
                
                if (result.success && result.data) {
                     await docRef.set({
                        responseBody: result.data,
                        createdAt: FieldValue.serverTimestamp(),
                        status: 'success',
                        message: result.message,
                        id: docId,
                        provider: 'facta',
                     }, { merge: true });
                } else {
                     await docRef.set({
                        responseBody: { error: result.message },
                        createdAt: FieldValue.serverTimestamp(),
                        status: 'error',
                        message: result.message,
                        id: docId,
                        provider: 'facta',
                     }, { merge: true });
                }
            }
            
            processedCount++;
            await batchRef.update({ processedCpfs: processedCount });
            console.log(`[Batch ${batchId}] Progress: ${processedCount}/${cpfs.length}`);
        }
        
        console.log(`[Batch ${batchId}] Processing complete.`);
        await batchRef.update({ status: 'completed' });

    } catch (error) {
        const message = error instanceof Error ? error.message : "An unknown error occurred.";
        console.error(`[Batch ${batchId}] FATAL ERROR:`, error);
        await batchRef.update({ status: 'error', message: message });
    }
}


export async function gerarRelatorioLote(input: z.infer<typeof reportActionSchema>): Promise<ReportActionResult> {
    const validation = reportActionSchema.safeParse(input);

    if (!validation.success) {
        return { status: 'error', fileName: '', fileContent: '', message: 'Dados de entrada para o relatório são inválidos.' };
    }

    const { cpfs, fileName: originalFileName, createdAt, provider: finalProvider } = validation.data;
    const mainProvider = finalProvider.split('-')[0];

    initializeFirebaseAdmin();
    const firestore = getFirestore();
    
    const results: any[] = [];

    for (const cpf of cpfs) {
        try {
            const docId = mainProvider === 'v8' ? cpf : `facta-${cpf}`;
            const docRef = firestore.collection('webhookResponses').doc(docId);
            const docSnap = await docRef.get();

            if (docSnap.exists) {
                const data = docSnap.data();
                const responseBody = data?.responseBody;
                
                const providerError = responseBody?.errorMessage || responseBody?.error || data?.message;
                const isSuccess = data?.status === 'success' && responseBody;

                if (isSuccess) {
                    if (mainProvider === 'v8') {
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
                            Mensagem: 'Sucesso',
                            'Data Saldo': responseBody.data_saldo,
                        };
                        // Flatten the response
                        for(let i=1; i<=12; i++){
                            if(responseBody[`dataRepasse_${i}`]){
                                row[`Data Repasse ${i}`] = responseBody[`dataRepasse_${i}`];
                                row[`Valor ${i}`] = parseFloat(responseBody[`valor_${i}`]);
                            }
                        }
                        results.push(row);
                    }
                } else {
                    results.push({ CPF: cpf, Mensagem: providerError || "Erro no processamento." });
                }
            } else {
                results.push({ CPF: cpf, Mensagem: 'Nenhum resultado encontrado.' });
            }
        } catch (error) {
             results.push({ CPF: cpf, Mensagem: 'Erro interno ao consultar resultado.' });
        }
    }

    if (results.length === 0) {
        return { status: 'error', fileName: '', fileContent: '', message: 'Nenhum dado para gerar relatório.' };
    }

    const worksheet = XLSX.utils.json_to_sheet(results);
    
    if (results.length > 0) {
        const firstRow = results[0];
        const header = Object.keys(firstRow);
        worksheet['!cols'] = header.map(key => ({
            wch: Math.max(15, key.length + 2) 
        }));
        
        // Formatting currency
        const formatCurrencyCells = (colName: string) => {
            const colIndex = header.indexOf(colName);
            if (colIndex !== -1) {
                results.forEach((_, index) => {
                    const cellRef = XLSX.utils.encode_cell({c: colIndex, r: index + 1});
                     if (worksheet[cellRef] && typeof worksheet[cellRef].v === 'number') {
                        worksheet[cellRef].z = '"R$"#,##0.00';
                    }
                });
            }
        };
        
        if (mainProvider === 'facta') {
            formatCurrencyCells('Saldo Total');
            for (let i = 1; i <= 12; i++) {
                formatCurrencyCells(`Valor ${i}`);
            }
        } else { // v8
            formatCurrencyCells('Saldo');
        }
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Resultados FGTS');

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    const base64String = buffer.toString('base64');
    
    const date = new Date(createdAt);
    const formattedDate = date.toLocaleDateString('pt-BR').replace(/\//g, '-');
    const formattedTime = date.toTimeString().split(' ')[0].replace(/:/g, '-');
    const fileName = `HIGIENIZACAO_FGTS${finalProvider.toUpperCase()}_${originalFileName.replace(/\.xlsx?$/i, '')}_${formattedDate}_${formattedTime}.xlsx`;

    const fileContent = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64String}`;

    return {
        status: 'success',
        fileName,
        fileContent,
        message: 'Relatório gerado com sucesso.',
    };
}
