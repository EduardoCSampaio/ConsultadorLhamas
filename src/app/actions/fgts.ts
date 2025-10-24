
'use server';

import { z } from 'zod';
import { firestore } from '@/firebase/server-init';
import { FieldValue } from 'firebase-admin/firestore';
import type { ApiCredentials } from './users';
import { getFactaAuthToken, consultarSaldoFgtsFacta } from './facta';
import { logActivity } from './users';
import { getAuthToken, getUserCredentials } from './clt';
import { randomUUID } from 'crypto';


const actionSchema = z.object({
  documentNumber: z.string(),
  token: z.string(),
  provider: z.enum(['qi', 'cartos', 'bms']),
  userId: z.string(), 
  userEmail: z.string(),
  balanceId: z.string().uuid(),
  batchId: z.string(),
});

const manualActionSchema = z.object({
  cpf: z.string(),
  userId: z.string(),
  providers: z.array(z.enum(['v8', 'facta'])),
  v8Provider: z.enum(['qi', 'cartos', 'bms']).optional(),
});


type ActionResult = {
  status: 'success' | 'error';
  stepIndex: number;
  message: string;
};

export type FgtsBalance = {
    provider: 'V8DIGITAL' | 'facta';
    v8Provider?: 'qi' | 'cartos' | 'bms';
    balance: number;
};

// Helper function to construct the webhook URL
function getWebhookUrl(): string {
    const vercelEnv = process.env.VERCEL_ENV;
    // Use VERCEL_URL which is set by Vercel for both production and preview deployments
    const vercelUrl = process.env.VERCEL_URL;

    if (vercelEnv === 'production' || vercelEnv === 'preview') {
        return `https://${vercelUrl}/api/webhook/balance`;
    }
    
    // For local development, fallback to a local URL
    return process.env.LOCAL_WEBHOOK_URL || 'http://localhost:9002/api/webhook/balance';
}


export async function consultarSaldoFgts(input: z.infer<typeof actionSchema>): Promise<ActionResult> {
  const validation = actionSchema.safeParse(input);

  if (!validation.success) {
    return { status: 'error', stepIndex: 0, message: 'Dados de entrada inválidos.' };
  }
  
  const { documentNumber, token: authToken, userId, userEmail, provider, balanceId, batchId } = validation.data;
  
  // Use the unique balanceId as the document ID
  const webhookResponseRef = firestore.collection('webhookResponses').doc(balanceId);
  
  const initialWebhookData = {
      userId: userId,
      status: 'pending_webhook',
      provider: 'V8DIGITAL',
      v8Provider: provider,
      documentNumber: documentNumber,
      createdAt: FieldValue.serverTimestamp(),
      batchId: batchId, 
  };
  
  await webhookResponseRef.set(initialWebhookData, { merge: true });


  const API_URL_CONSULTA = 'https://bff.v8sistema.com/fgts/balance';
  
  const requestBody = { 
      documentNumber, 
      provider,
      webhookUrl: getWebhookUrl(),
      balanceId
  };

  try {
    // Log manual queries, but not every single request from a batch
    if (batchId && batchId.startsWith('manual-')) {
        await logActivity({
            userId: userId,
            action: `Consulta FGTS - V8`,
            documentNumber: documentNumber,
            provider: 'V8DIGITAL',
            details: `Parceiro: ${provider}`
        });
    }

    // Fire-and-forget the fetch request. Do not await it.
    fetch(API_URL_CONSULTA, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify(requestBody),
    }).catch(fetchError => {
        // This catch block handles network errors when trying to SEND the request.
        console.error(`[V8 BATCH] Failed to send request for balanceId ${balanceId}:`, fetchError);
        // We update the doc to reflect the failure to send.
        webhookResponseRef.set({
            status: 'error',
            message: `Falha ao enviar a requisição para a API V8: ${fetchError.message}`,
            responseBody: { error: fetchError.message }
        }, { merge: true });
    });
    
    // Immediately return success, as the request has been dispatched.
    return { 
        status: 'success', 
        stepIndex: 1, 
        message: 'Consulta de saldo (V8) iniciada com sucesso. Aguardando o resultado via webhook.' 
    };

  } catch (error) {
    // This block catches synchronous errors before the fetch call.
    console.error("[V8 API] Erro de comunicação na consulta de saldo:", error);
    const message = error instanceof Error ? error.message : 'Ocorreu um erro de comunicação com a API.';
    // Update the doc to reflect this synchronous error.
    await webhookResponseRef.set({
        responseBody: { error: message },
        updatedAt: FieldValue.serverTimestamp(),
        status: 'error',
        message: message,
    }, { merge: true });
    return { status: 'error', stepIndex: 1, message };
  }
}

async function waitForV8Response(balanceId: string, timeout = 7000): Promise<{ balance: number, v8Provider?: 'qi' | 'cartos' | 'bms' } | null> {
    const docRef = firestore.collection('webhookResponses').doc(balanceId);

    return new Promise((resolve) => {
        const unsubscribe = docRef.onSnapshot((doc) => {
            if (doc.exists) {
                const data = doc.data();
                // Check for a definitive success or error status from the webhook
                if (data?.status === 'success' && data.responseBody?.balance > 0) {
                    unsubscribe();
                    resolve({ 
                        balance: data.responseBody.balance,
                        v8Provider: data.v8Provider
                    });
                } else if (data?.status === 'error' || (data?.status === 'success' && data.responseBody?.balance === 0)) {
                    unsubscribe();
                    resolve(null);
                }
            }
        });
        
        // Timeout to prevent hanging indefinitely
        setTimeout(() => {
            unsubscribe();
            resolve(null); 
        }, timeout);
    });
}

export async function consultarSaldoManual(input: z.infer<typeof manualActionSchema>): Promise<{balances: FgtsBalance[], error?: string}> {
    const validation = manualActionSchema.safeParse(input);
    if (!validation.success) {
        return { balances: [], error: 'Dados de entrada inválidos.' };
    }

    const { cpf, userId, providers, v8Provider } = validation.data;

    const userDoc = await firestore.collection('users').doc(userId).get();
    if (!userDoc.exists) {
        return { balances: [], error: 'Usuário não encontrado.' };
    }
    const user = userDoc.data() as ApiCredentials;
    const userEmail = userDoc.data()?.email || 'unknown';

    const finalBalances: FgtsBalance[] = [];
    const promises: Promise<any>[] = [];

    // --- Facta Provider Logic ---
    if (providers.includes('facta')) {
        const factaPromise = new Promise(async (resolve) => {
            const { token, error: tokenError } = await getFactaAuthToken(user.facta_username, user.facta_password);
            if (tokenError || !token) {
                console.error("[Manual FGTS] Facta auth error:", tokenError);
                resolve(null);
                return;
            }
            const factaResult = await consultarSaldoFgtsFacta({cpf, userId, token });
            if (factaResult.success && factaResult.data && parseFloat(factaResult.data.saldo_total) > 0) {
                finalBalances.push({ provider: 'facta', balance: parseFloat(factaResult.data.saldo_total)});
            }
            resolve(null);
        });
        promises.push(factaPromise);
    }
    
    // --- V8 Provider Logic ---
    if (providers.includes('v8') && v8Provider) {
        const { credentials, error: credError } = await getUserCredentials(userId);
        if (credentials) {
            const { token: v8Token, error: v8TokenError } = await getAuthToken(credentials);
            if (v8Token) {
                const v8Promise = new Promise(async (resolve) => {
                    const balanceId = randomUUID(); // Generate a unique ID for this request
                    
                    // Dispatch the request but don't wait for the fetch itself
                    consultarSaldoFgts({ 
                        documentNumber: cpf, 
                        userId, 
                        userEmail, 
                        provider: v8Provider, 
                        token: v8Token, 
                        balanceId,
                        batchId: `manual-${balanceId}` // A unique "batch" id for this manual request
                    });

                    // Wait for the webhook response
                    const v8result = await waitForV8Response(balanceId);
                    if (v8result && v8result.balance > 0) {
                        finalBalances.push({ 
                            provider: 'V8DIGITAL', 
                            balance: v8result.balance,
                            v8Provider: v8result.v8Provider
                        });
                    }
                    resolve(null);
                });
                promises.push(v8Promise);
            } else {
                 console.error("[Manual FGTS] V8 auth error:", v8TokenError);
            }
        } else {
             console.error("[Manual FGTS] V8 credentials error:", credError);
        }
    }
    
    await Promise.all(promises);

    if (finalBalances.length === 0 && promises.length > 0) {
        return { balances: [], error: "Nenhum saldo encontrado para os provedores selecionados ou as consultas falharam."}
    }

    return { balances: finalBalances };
}
