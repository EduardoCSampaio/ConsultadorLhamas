
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
  
  const batchId = `batch-${Date.now()}-${userId}`;
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


async function processBatchInBackground(batchId: string, cpfs: string[], provider: "cartos" | "bms" | "qi", userId: string, userEmail: string) {
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
        await batchRef.update({ status: 'error', message: `Não foi possível carregar as credenciais: ${message}` });
        return;
    }

    const { token, error: tokenError } = await getAuthToken(userCredentials);
    if (tokenError) {
        await batchRef.update({ status: 'error', message: `Falha na autenticação do lote: ${tokenError}` });
        return;
    }

    let processedCount = 0;
    for (const cpf of cpfs) {
        await consultarSaldoFgts({ 
            documentNumber: cpf, 
            provider, 
            token: token!,
            userId: userId,
            userEmail: userEmail,
        });
        
        processedCount++;
        await batchRef.update({ processedCpfs: processedCount });
        
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
  
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
                
                const isSuccess = data?.status === 'success' && responseBody && typeof responseBody.balance !== 'undefined' && responseBody.balance !== null;

                if (isSuccess) {
                    const balanceValue = parseFloat(responseBody.balance);
                    results.push({
                        CPF: cpf,
                        Saldo: isNaN(balanceValue) ? '0.00' : balanceValue, 
                        Mensagem: 'Sucesso',
                    });
                } 
                else {
                    const errorMessage = responseBody?.errorMessage || responseBody?.error || data?.message || "Erro no processamento do webhook.";
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
                    Mensagem: 'Aguardando resposta do webhook...',
                });
            }
        } catch (error) {
             results.push({
                CPF: cpf,
                Saldo: 'N/A',
                Mensagem: 'Erro ao consultar resultado no Firestore.',
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
