
'use server';

import { z } from 'zod';
import type { ApiCredentials } from './users';
import { initializeFirebaseAdmin } from '@/firebase/server-init';
import { getFirestore } from 'firebase-admin/firestore';

const phoneSchema = z.object({
    countryCode: z.string(),
    areaCode: z.string(),
    phoneNumber: z.string(),
});

const actionSchema = z.object({
  borrowerDocumentNumber: z.string(),
  gender: z.enum(["male", "female"]),
  birthDate: z.string(),
  signerName: z.string(),
  signerEmail: z.string().email(),
  signerPhone: phoneSchema,
  provider: z.literal("QI"),
  userId: z.string(),
});

type ActionResult = {
  success: boolean;
  message: string;
  consultationId?: string;
};

async function getAuthToken(credentials: ApiCredentials): Promise<{token: string | null, error: string | null}> {
  const { v8_username, v8_password, v8_audience, v8_client_id } = credentials;

  if (!v8_username || !v8_password || !v8_audience || !v8_client_id) {
    const missing = [
      !v8_username && "Username",
      !v8_password && "Password",
      !v8_audience && "Audience",
      !v8_client_id && "Client ID"
    ].filter(Boolean).join(', ');
    return { token: null, error: `Credenciais de API incompletas. Faltando: ${missing}. Por favor, configure-as na página de Configurações.` };
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
      return { token: null, error: `Falha na autenticação com a V8: ${errorMessage}` };
    }

    return { token: data.access_token, error: null };
  } catch (error) {
    console.error('[V8 AUTH] Erro de comunicação ao tentar autenticar:', error);
    return { token: null, error: 'Erro de rede ao tentar autenticar com a API parceira.' };
  }
}

export async function gerarTermoConsentimento(input: z.infer<typeof actionSchema>): Promise<ActionResult> {
    const validation = actionSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, message: 'Dados de entrada inválidos.' };
    }

    const { userId, ...requestData } = validation.data;

    let userCredentials: ApiCredentials;
    try {
        initializeFirebaseAdmin();
        const firestore = getFirestore();
        const userDoc = await firestore.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return { success: false, message: 'Usuário não encontrado para buscar credenciais.' };
        }
        const userData = userDoc.data();
        userCredentials = {
            v8_username: userData?.v8_username,
            v8_password: userData?.v8_password,
            v8_audience: userData?.v8_audience,
            v8_client_id: userData?.v8_client_id,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao carregar credenciais de API.";
        return { success: false, message };
    }

    const { token, error: tokenError } = await getAuthToken(userCredentials);
    if (tokenError) {
        return { success: false, message: tokenError };
    }

    const API_URL = 'https://bff.v8sistema.com/private-consignment/consult';

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(requestData),
        });

        const responseData = await response.json();

        if (!response.ok) {
            const errorMessage = responseData.message || responseData.error || 'Erro desconhecido da API.';
            console.error(`[CLT_CONSENT] API Error: ${JSON.stringify(responseData)}`);
            return { success: false, message: `Falha ao gerar termo: ${errorMessage}` };
        }
        
        const consultationId = responseData.consultationId; // Assuming the API returns this
        if (!consultationId) {
            return { success: false, message: "API retornou sucesso mas não incluiu o ID da consulta." };
        }

        return { 
            success: true, 
            message: 'Termo de consentimento gerado com sucesso. O ID da consulta foi recebido.',
            consultationId: consultationId
        };
    } catch (error) {
        console.error("[CLT_CONSENT] Network or parsing error:", error);
        const message = error instanceof Error ? error.message : 'Ocorreu um erro de comunicação.';
        return { success: false, message };
    }
}

    