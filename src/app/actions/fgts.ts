
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
    const vercelUrl = process.env.VERCEL_URL || process.env.NEXT_PUBLIC_VERCEL_URL;

    if (vercelEnv === 'production' || vercelEnv === 'preview') {
        // Ensure the URL starts with https://
        return `https://${vercelUrl}/api/webhook/balance`;
    }
    
    // For local development, use a tool like ngrok or the local dev server URL
    return process.env.LOCAL_WEBHOOK_URL || 'http://localhost:9002/api/webhook/balance';
}


export async function consultarSaldoFgts(input: z.infer<typeof actionSchema>): Promise<ActionResult> {
  const validation = actionSchema.safeParse(input);

  if (!validation.success) {
    return { status: 'error', stepIndex: 0, message: 'Dados de entrada inválidos.' };
  }
  
  const { documentNumber, token: authToken, userId, userEmail, provider, balanceId, batchId } = validation.data;
  
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
      balanceId: balanceId,
  };

  try {
    if (batchId && batchId.startsWith('manual-')) {
        await logActivity({
            userId: userId,
            action: `Consulta FGTS - V8`,
            documentNumber: documentNumber,
            provider: 'V8DIGITAL',
            details: `Parceiro: ${provider}`
        });
    }

    const response = await fetch(API_URL_CONSULTA, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.message || `API V8 retornou erro ${response.status}`;
        console.error(`[V8 BATCH] Failed to send request for balanceId ${balanceId}:`, errorMessage);
        await webhookResponseRef.set({
            status: 'error',
            message: `Falha ao enviar a requisição para a API V8: ${errorMessage}`,
            responseBody: { error: errorMessage }
        }, { merge: true });
        return { status: 'error', stepIndex: 1, message: errorMessage };
    }
    
    return { 
        status: 'success', 
        stepIndex: 1, 
        message: 'Consulta de saldo (V8) iniciada com sucesso. Aguardando o resultado via webhook.' 
    };

  } catch (error) {
    console.error("[V8 API] Erro de comunicação na consulta de saldo:", error);
    const message = error instanceof Error ? error.message : 'Ocorreu um erro de comunicação com a API.';
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
    
    if (providers.includes('v8') && v8Provider) {
        const { credentials, error: credError } = await getUserCredentials(userId);
        if (credentials) {
            const { token: v8Token, error: v8TokenError } = await getAuthToken(credentials);
            if (v8Token) {
                const v8Promise = new Promise(async (resolve) => {
                    const balanceId = randomUUID(); 
                    
                    consultarSaldoFgts({ 
                        documentNumber: cpf, 
                        userId, 
                        userEmail, 
                        provider: v8Provider, 
                        token: v8Token, 
                        balanceId,
                        batchId: `manual-${balanceId}`
                    });

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
