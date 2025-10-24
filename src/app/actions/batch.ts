
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


async function processC6BatchInBackground(batchId: string) {
    console.log(`[Batch C6 ${batchId}] Starting C6 background processing...`);
    const batchRef = firestore.collection('batches').doc(batchId);
    let batchData: BatchJob | null = null;

    try {
        const batchDoc = await batchRef.get();
        if (!batchDoc.exists) throw new Error(`Lote ${batchId} não encontrado.`);
        
        batchData = batchDoc.data() as BatchJob;
        if (!batchData.cpfsData) {
            throw new Error(`Dados de CPFs não encontrad