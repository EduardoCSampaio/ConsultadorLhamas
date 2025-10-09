
'use server';

import { z } from 'zod';
import { initializeFirebaseAdmin } from '@/firebase/server-init';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { ApiCredentials } from './users';
import { getFactaAuthToken, consultarSaldoFgtsFacta } from './facta';
import { logActivity } from './users';

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


export async function getAuthToken(credentials: ApiCredentials): Promise<{token: string | undefined, error: string | null}> {
  const { v8_username, v8_password, v8_audience, v8_client_id } = credentials;

  if (!v8_username || !v8_password || !v8_audience || !v8_client_id) {
    const missing = [
      !v8_username && "Username",
      !v8_password && "Password",
      !v8_audience && "Audience",
      !v8_client_id && "Client ID"
    ].filter(Boolean).join(', ');
    return { token: undefined, error: `Credenciais da V8 incompletas. Faltando: ${missing}. Por favor, configure-as na página de Configurações.` };
  }
  
  const tokenUrl = 'https://auth.v8sistema.com/oauth/token';
  const bodyPayload = new URLSearchParams({
    grant_type: 'password',
    username: v8_username,
    password: v8_password,
    audience: v8_audience,
    scope: 'offline_access',
    client_id: v8_client_id,
  });

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bodyPayload.toString(),
    });

    const data = await response.json();

    if (!response.ok || !data.access_token) {
      const errorMessage = data.error_description || data.error || JSON.stringify(data);
      console.error(`[V8 AUTH] Falha na autenticação: ${errorMessage}`);
      return { token: undefined, error: `Falha na autenticação com a V8: ${errorMessage}` };
    }

    return { token: data.access_token, error: null };
  } catch (error) {
    console.error('[V8 AUTH] Erro de comunicação ao tentar autenticar:', error);
    return { token: undefined, error: 'Erro de rede ao tentar autenticar com a API parceira.' };
  }
}

export async function consultarSaldoFgts(input: z.infer<typeof actionSchema>): Promise<ActionResult> {
  const validation = actionSchema.safeParse(input);

  if (!validation.success) {
    return { status: 'error', stepIndex: 0, message: 'Dados de entrada inválidos.' };
  }
  
  const { documentNumber, userId, userEmail, provider, batchId } = validation.data;
  let authToken = validation.data.token;
  
  if (!authToken) {
      let userCredentials: ApiCredentials;
      try {
        initializeFirebaseAdmin();
        const firestore = getFirestore();
        const userDoc = await firestore.collection('users').doc(userId).get();
        
        if (!userDoc.exists) {
            return { status: 'error', stepIndex: 0, message: 'Usuário não encontrado para buscar as credenciais.' };
        }
        
        const userData = userDoc.data();
        userCredentials = {
          v8_username: userData?.v8_username,
          v8_password: userData?.v8_password,
          v8_audience: userData?.v8_audience,
          v8_client_id: userData?.v8_client_id,
        };

      } catch(error) {
          const message = error instanceof Error ? error.message : "Ocorreu um erro desconhecido ao buscar credenciais.";
          console.error("Erro ao buscar credenciais do usuário:", message);
          return { status: 'error', stepIndex: 0, message: 'Não foi possível carregar as credenciais de API do usuário.' };
      }
      
      const { token, error: tokenError } = await getAuthToken(userCredentials);
      if (tokenError) {
        return { status: 'error', stepIndex: 0, message: tokenError };
      }
      authToken = token;
  }

  const API_URL_CONSULTA = 'https://bff.v8sistema.com/fgts/balance';
  
  const requestBody = { 
      documentNumber, 
      provider,
      ...(batchId && { batchId })
  };

  try {
    await logActivity({
        userId: userId,
        action: `Consulta FGTS - V8`,
        documentNumber: documentNumber,
        provider: 'V8DIGITAL',
        details: `Parceiro: ${provider}`
    });

    const consultaResponse = await fetch(API_URL_CONSULTA, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        'User-Agent': 'insomnia/11.6.1',
      },
      body: JSON.stringify(requestBody),
    });
    
    if (!consultaResponse.ok) {
        const responseBody = await consultaResponse.text();
        let errorDetails = responseBody;
        try {
            const errorJson = JSON.parse(responseBody);
            errorDetails = errorJson.error || errorJson.message || responseBody;
        } catch (e) {
            // ignora se não for JSON
        }
        const errorMessage = `Erro ao enviar consulta V8: ${consultaResponse.status} ${consultaResponse.statusText}. Detalhes: ${errorDetails}`;
        const firestore = getFirestore();
        await firestore.collection('webhookResponses').doc(documentNumber).set({
            responseBody: { error: errorMessage },
            createdAt: FieldValue.serverTimestamp(),
            status: 'error',
            message: errorMessage,
            id: documentNumber.toString(),
            provider: 'V8DIGITAL',
            v8Provider: provider,
            ...(batchId && { batchId: batchId }),
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
    const firestore = getFirestore();
    await firestore.collection('webhookResponses').doc(documentNumber).set({
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
    initializeFirebaseAdmin();
    const firestore = getFirestore();
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

    initializeFirebaseAdmin();
    const firestore = getFirestore();
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
        const { token: v8Token, error: v8TokenError } = await getAuthToken(user);
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
    }
    
    await Promise.all(promises);

    if (finalBalances.length === 0 && promises.length > 0) {
        return { balances: [], error: "Nenhum saldo encontrado para os provedores selecionados ou as consultas falharam."}
    }

    return { balances: finalBalances };
}
