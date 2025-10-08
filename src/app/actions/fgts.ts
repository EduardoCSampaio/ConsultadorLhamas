
'use server';

import { z } from 'zod';
import { initializeFirebaseAdmin } from '@/firebase/server-init';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { ApiCredentials } from './users';

const actionSchema = z.object({
  documentNumber: z.string(),
  token: z.string().optional(),
  // For logging purposes
  userId: z.string(), 
  userEmail: z.string(),
});

type ActionResult = {
  status: 'success' | 'error';
  stepIndex: number;
  message: string;
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
  
  const { documentNumber, userId, userEmail } = validation.data;
  let authToken = validation.data.token;
  
  // This function is only for V8, so we get V8 creds.
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
  
  const requestBody = { documentNumber, provider: "qi" };

  try {
    try {
        const firestore = getFirestore();
        await firestore.collection('activityLogs').add({
            userId: userId,
            userEmail: userEmail,
            action: `Consulta FGTS - V8`,
            documentNumber: documentNumber,
            provider: 'v8', // Log provider as 'v8'
            createdAt: FieldValue.serverTimestamp(),
        });
    } catch (logError) {
        console.error("Failed to log user activity:", logError);
    }

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
        // Also save this error to webhookResponses for traceability
        const firestore = getFirestore();
        await firestore.collection('webhookResponses').doc(documentNumber).set({
            responseBody: { error: errorMessage },
            createdAt: FieldValue.serverTimestamp(),
            status: 'error',
            message: errorMessage,
            id: documentNumber.toString(),
            provider: 'v8',
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
     // Also save this error to webhookResponses for traceability
    const firestore = getFirestore();
    await firestore.collection('webhookResponses').doc(documentNumber).set({
        responseBody: { error: message },
        createdAt: FieldValue.serverTimestamp(),
        status: 'error',
        message: message,
        id: documentNumber.toString(),
        provider: 'v8',
    }, { merge: true });
    return { status: 'error', stepIndex: 1, message };
  }
}
