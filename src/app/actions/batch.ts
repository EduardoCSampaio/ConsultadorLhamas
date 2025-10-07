
'use server';

import { z } from 'zod';
import { consultarSaldoFgts, getAuthToken } from './fgts';
import * as XLSX from 'xlsx';
import { initializeFirebaseAdmin } from '@/firebase/server-init';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { ApiCredentials } from './users';

const processActionSchema = z.object({
  cpfs: z.array(z.string()),
  provider: z.enum(["cartos", "bms", "qi"]),
  userId: z.string(),
  userEmail: z.string(),
  fileName: z.string(),
});

const reportActionSchema = z.object({
  cpfs: z.array(z.string()),
  fileName: z.string(),
  createdAt: z.string(),
});

const getBatchStatusSchema = z.object({
    batchId: z.string(),
});

export type BatchJob = {
    id: string;
    fileName: string;
    provider: string;
    status: 'processing' | 'completed' | 'error';
    totalCpfs: number;
    processedCpfs: number;
    cpfs: string[];
    createdAt: string;
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
        const createdAt = data.createdAt;
        let serializableCreatedAt = new Date().toISOString();
        if (createdAt && typeof createdAt.toDate === 'function') {
            serializableCreatedAt = createdAt.toDate().toISOString();
        } else if (typeof createdAt === 'string') {
            serializableCreatedAt = createdAt;
        }

        const batch: BatchJob = {
            id: batchDoc.id,
            fileName: data.fileName,
            provider: data.provider,
            status: data.status,
            totalCpfs: data.totalCpfs,
            processedCpfs: data.processedCpfs,
            cpfs: data.cpfs,
            createdAt: serializableCreatedAt,
            message: data.message,
        };

        return { status: 'success', batch };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao buscar status do lote.";
        console.error("getBatchStatus error:", message);
        return { status: 'error', message };
    }
}


/**
 * Action to initiate batch processing. It authenticates once, then loops 
 * through CPFs and starts the balance query for each one using the same token.
 */
export async function processarLoteFgts(input: z.infer<typeof processActionSchema>): Promise<ProcessActionResult> {
  const validation = processActionSchema.safeParse(input);

  if (!validation.success) {
    return { 
        status: 'error', 
        message: 'Dados de entrada inválidos.' 
    };
  }

  const { cpfs, provider, userId, userEmail, fileName } = validation.data;
  
  initializeFirebaseAdmin();
  const firestore = getFirestore();
  
  const batchId = `batch-${Date.now()}-${userId.substring(0, 5)}`;
  const batchRef = firestore.collection('batches').doc(batchId);

  const batchData: Omit<BatchJob, 'createdAt'> & { createdAt: FieldValue } = {
      id: batchId,
      fileName: fileName,
      provider: provider,
      status: 'processing',
      totalCpfs: cpfs.length,
      processedCpfs: 0,
      cpfs: cpfs,
      createdAt: FieldValue.serverTimestamp(),
  };

  try {
      await batchRef.set(batchData);
  } catch(error) {
    const message = error instanceof Error ? error.message : "Erro ao iniciar o lote no Firestore.";
    console.error("Batch init error:", message);
    return { status: 'error', message };
  }

  // Do not await the rest of the processing. It will run in the background.
  processBatchInBackground(batchId, cpfs, provider, userId, userEmail);
  
  const serializableBatch: BatchJob = {
    ...batchData,
    createdAt: new Date().toISOString(), // Return current time as a serializable placeholder
  }

  return {
    status: 'success',
    message: `Lote enviado para processamento em segundo plano.`,
    batch: serializableBatch
  };
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function processBatchInBackground(batchId: string, cpfs: string[], provider: "cartos" | "bms" | "qi", userId: string, userEmail: string) {
    console.log(`[Batch ${batchId}] Starting background processing for ${cpfs.length} CPFs.`);
    const firestore = getFirestore();
    const batchRef = firestore.collection('batches').doc(batchId);

    let userCredentials: ApiCredentials;
    try {
        const userDoc = await firestore.collection('users').doc(userId).get();
        if (!userDoc.exists) throw new Error('Usuário não encontrado.');
        const userData = userDoc.data()!;
        userCredentials = {
            v8_username: userData.v8_username,
            v8_password: userData.v8_password,
            v8_audience: userData.v8_audience,
            v8_client_id: userData.v8_client_id,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao buscar credenciais.";
        console.error(`[Batch ${batchId}] Failed to get credentials: ${message}`);
        await batchRef.update({ status: 'error', message: `Não foi possível carregar as credenciais: ${message}` });
        return;
    }

    const { token, error: tokenError } = await getAuthToken(userCredentials);
    if (tokenError) {
        console.error(`[Batch ${batchId}] Failed to authenticate: ${tokenError}`);
        await batchRef.update({ status: 'error', message: `Falha na autenticação do lote: ${tokenError}` });
        return;
    }
    
    console.log(`[Batch ${batchId}] Authentication successful. Starting CPF loop.`);

    let processedCount = 0;
    for (const cpf of cpfs) {
        console.log(`[Batch ${batchId}] Processing CPF: ${cpf}`);
        await consultarSaldoFgts({ 
            documentNumber: cpf, 
            provider, 
            token, // Pass the token here
            userId,
            userEmail,
        });
        
        processedCount++;
        await batchRef.update({ processedCpfs: processedCount });
        console.log(`[Batch ${batchId}] Progress: ${processedCount}/${cpfs.length}`);
        
        // Introduce a small delay to avoid overwhelming the target API
        await delay(300);
    }
    
    console.log(`[Batch ${batchId}] Processing complete.`);
    await batchRef.update({ status: 'completed' });
}


/**
 * Action to generate the final report. It fetches the results for each CPF
 * from Firestore, where the webhook has saved them.
 */
export async function gerarRelatorioLote(input: z.infer<typeof reportActionSchema>): Promise<ReportActionResult> {
    const validation = reportActionSchema.safeParse(input);

    if (!validation.success) {
        return { 
            status: 'error', 
            fileName: '', 
            fileContent: '', 
            message: 'Dados de entrada para o relatório são inválidos.' 
        };
    }

    const { cpfs, fileName: originalFileName, createdAt } = validation.data;
    initializeFirebaseAdmin();
    const firestore = getFirestore();
    
    const results: { CPF: string; Saldo: string | number; Mensagem: string }[] = [];

    for (const cpf of cpfs) {
        try {
            const docRef = firestore.collection('webhookResponses').doc(cpf);
            const docSnap = await docRef.get();

            if (docSnap.exists) {
                const data = docSnap.data();
                const responseBody = data?.responseBody;
                
                // Check for explicit error messages within the payload
                const providerError = responseBody?.errorMessage || responseBody?.error;
                const isSuccess = data?.status === 'success' && responseBody && typeof responseBody.balance !== 'undefined' && responseBody.balance !== null && !providerError;

                if (isSuccess) {
                    const balanceValue = parseFloat(responseBody.balance);
                    results.push({
                        CPF: cpf,
                        Saldo: isNaN(balanceValue) ? '0.00' : balanceValue, 
                        Mensagem: 'Sucesso',
                    });
                } 
                else {
                    // Use the most specific error message available
                    const errorMessage = providerError || data?.message || "Erro no processamento do webhook.";
                    results.push({
                        CPF: cpf,
                        Saldo: 'N/A',
                        Mensagem: errorMessage,
                    });
                }
            } else {
                results.push({
                    CPF: cpf,
                    Saldo: 'N/A',
                    Mensagem: 'Nenhum resultado recebido via webhook.',
                });
            }
        } catch (error) {
             results.push({
                CPF: cpf,
                Saldo: 'N/A',
                Mensagem: 'Erro interno ao consultar resultado no Firestore.',
            });
        }
    }

    const worksheet = XLSX.utils.json_to_sheet(results);
    worksheet['!cols'] = [
        { wch: 15 }, // CPF
        { wch: 15 }, // Saldo
        { wch: 70 }, // Mensagem
    ];
    results.forEach((_, index) => {
        const cellRef = XLSX.utils.encode_cell({c: 1, r: index + 1});
        if (worksheet[cellRef] && typeof worksheet[cellRef].v === 'number') {
            worksheet[cellRef].z = '"R$"#,##0.00';
        }
    });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Resultados FGTS');

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    const base64String = buffer.toString('base64');
    
    const date = new Date(createdAt);
    const formattedDate = date.toLocaleDateString('pt-BR').replace(/\//g, '-');
    const formattedTime = date.toTimeString().split(' ')[0].replace(/:/g, '-');
    const fileName = `HIGIENIZACAO_${originalFileName.replace(/\.xlsx?$/i, '')}_${formattedDate}_${formattedTime}.xlsx`;

    const fileContent = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64String}`;

    return {
        status: 'success',
        fileName,
        fileContent,
        message: 'Relatório gerado com sucesso.',
    };
}
