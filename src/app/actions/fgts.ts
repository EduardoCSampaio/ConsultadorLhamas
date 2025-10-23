
'use server';

import { z } from 'zod';
import { firestore } from '@/firebase/server-init';
import { FieldValue } from 'firebase-admin/firestore';
import type { ApiCredentials } from './users';
import { getFactaAuthToken, consultarSaldoFgtsFacta } from './facta';
import { logActivity } from './users';
import { getAuthToken, getUserCredentials } from './clt';


const actionSchema = z.object({
  documentNumber: z.string(),
  token: z.string().optional(),
  provider: z.enum(['qi', 'cartos', 'bms']),
  userId: z.string(), 
  userEmail: z.string(),
  batchId: z.string().optional(),
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
    const vercelUrl = process.env.NEXT_PUBLIC_VERCEL_URL;
    const baseUrl = vercelUrl ? `https://${vercelUrl}` : 'http://localhost:9002';
    return `${baseUrl}/api/webhook/balance`;
}


export async function consultarSaldoFgts(input: z.infer<typeof actionSchema>): Promise<ActionResult> {
  const validation = actionSchema.safeParse(input);

  if (!validation.success) {
    return { status: 'error', stepIndex: 0, message: 'Dados de entrada inválidos.' };
  }
  
  const { documentNumber, userId, userEmail, provider, batchId } = validation.data;
  let authToken = validation.data.token;
  

  if (!authToken) {
      const { credentials, error: credError } = await getUserCredentials(userId);
      if (credError || !credentials) {
         return { status: 'error', stepIndex: 0, message: credError || "Credenciais V8 não encontradas." };
      }
      
      const { token, error: tokenError } = await getAuthToken(credentials);
      if (tokenError) {
        return { status: 'error', stepIndex: 0, message: tokenError };
      }
      authToken = token;
  }

  // If this is part of a batch, create a placeholder document to link the CPF to the batchId
  if (batchId) {
      const webhookResponseRef = firestore.collection('webhookResponses').doc(documentNumber);
      await webhookResponseRef.set({
          batchId: batchId,
          userId: userId, // <<< Store the userId here
          status: 'pending_webhook',
          provider: 'V8DIGITAL',
          v8Provider: provider,
          id: documentNumber,
          createdAt: FieldValue.serverTimestamp()
      }, { merge: true });
  }


  const API_URL_CONSULTA = 'https://bff.v8sistema.com/fgts/balance';
  
  const requestBody = { 
      documentNumber, 
      provider,
      webhookUrl: getWebhookUrl(), // Dynamically add the webhook URL
      ...(batchId && { batchId })
  };

  try {
    // Log activity only for manual queries, batch queries are logged once per file.
    if (!batchId) {
      await logActivity({
          userId: userId,
          action: `Consulta FGTS - V8`,
          documentNumber: documentNumber,
          provider: 'V8DIGITAL',
          details: `Parceiro: ${provider}`
      });
    }


    // Fire-and-forget the consultation request
    fetch(API_URL_CONSULTA, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        'User-Agent': 'insomnia/11.6.1',
      },
      body: JSON.stringify(requestBody),
    }).catch(fetchError => {
        // This is a fire-and-forget, but we should log if the initial request fails
        console.error(`[V8 BATCH] Failed to send request for CPF ${documentNumber} in batch ${batchId}:`, fetchError);
        // We can optionally write an error to the webhook response doc here too
        const docRef = firestore.collection('webhookResponses').doc(documentNumber);
        docRef.set({
            status: 'error',
            message: `Falha ao enviar a requisição para a API V8: ${fetchError.message}`,
            responseBody: { error: fetchError.message }
        }, { merge: true });
    });
    
    // Always return success immediately, as the actual result comes via webhook
    return { 
        status: 'success', 
        stepIndex: 1, 
        message: 'Consulta de saldo (V8) iniciada com sucesso. Aguardando o resultado via webhook.' 
    };

  } catch (error) {
    console.error("[V8 API] Erro de comunicação na consulta de saldo:", error);
    const message = error instanceof Error ? error.message : 'Ocorreu um erro de comunicação com a API.';
    const docRef = firestore.collection('webhookResponses').doc(documentNumber);
    await docRef.set({
        responseBody: { error: message },
        createdAt: FieldValue.serverTimestamp(),
        status: 'error',
        message: message,
        id: documentNumber.toString(),
        provider: 'V8DIGITAL',
        v8Provider: provider,
        ...(batchId && { batchId: batchId }),
    }, { merge: true });
    return { status: 'error', stepIndex: 1, message };
  }
}

async function waitForV8Response(cpf: string, timeout = 7000): Promise<{ balance: number, v8Provider?: 'qi' | 'cartos' | 'bms' } | null> {
    const docRef = firestore.collection('webhookResponses').doc(cpf);

    return new Promise((resolve) => {
        const unsubscribe = docRef.onSnapshot((doc) => {
            if (doc.exists) {
                const data = doc.data();
                // Check for success status and a positive balance
                if (data?.status === 'success' && data.responseBody?.balance > 0) {
                    unsubscribe();
                    resolve({ 
                        balance: data.responseBody.balance,
                        v8Provider: data.v8Provider
                    });
                // Also resolve if there is an error to stop waiting
                } else if (data?.status === 'error') {
                    unsubscribe();
                    resolve(null);
                }
            }
        });
        
        // Timeout to stop listening after a while
        setTimeout(() => {
            unsubscribe();
            resolve(null); // Resolve with null if no response within timeout
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

    // --- Facta Call (Synchronous) ---
    if (providers.includes('facta')) {
        const factaPromise = new Promise(async (resolve) => {
            const { token, error: tokenError } = await getFactaAuthToken(user.facta_username, user.facta_password);
            if (tokenError || !token) {
                console.error("[Manual FGTS] Facta auth error:", tokenError);
                resolve(null); // Don't add to balances
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
    
    // --- V8 Call (Simulated Synchronous) ---
    if (providers.includes('v8') && v8Provider) {
        const { credentials, error: credError } = await getUserCredentials(userId);
        if (credentials) {
            const { token: v8Token, error: v8TokenError } = await getAuthToken(credentials);
            if (v8Token) {
                const v8Promise = new Promise(async (resolve) => {
                    // Clear any previous webhook response for this CPF to ensure we get a fresh one
                    await firestore.collection('webhookResponses').doc(cpf).delete().catch(() => {});
                    
                    await consultarSaldoFgts({ documentNumber: cpf, userId, userEmail, provider: v8Provider, token: v8Token });
                    const v8result = await waitForV8Response(cpf); // Wait for webhook
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
