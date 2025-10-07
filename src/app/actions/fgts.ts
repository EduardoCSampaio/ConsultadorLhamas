
'use server';

import { z } from 'zod';
import { initializeFirebaseAdmin } from '@/firebase/server-init';
import { getFirestore } from 'firebase-admin/firestore';
import type { ApiCredentials } from './users';

const actionSchema = z.object({
  documentNumber: z.string(),
  provider: z.enum(["cartos", "bms", "qi"]),
  // O token agora pode ser passado como argumento opcional
  token: z.string().optional(),
});

type ActionResult = {
  status: 'success' | 'error';
  stepIndex: number;
  message: string;
};

// Função de autenticação foi exportada para ser usada externamente
export async function getAuthToken(credentials: ApiCredentials): Promise<{token: string | null, error: string | null}> {
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

export async function consultarSaldoFgts(input: z.infer<typeof actionSchema>): Promise<ActionResult> {
  const validation = actionSchema.safeParse(input);

  if (!validation.success) {
    return { status: 'error', stepIndex: 0, message: 'Dados de entrada inválidos.' };
  }
  
  let authToken = input.token;
  
  // Se nenhum token for passado, faz a autenticação
  if (!authToken) {
      let userCredentials: ApiCredentials;
      try {
        initializeFirebaseAdmin();
        const firestore = getFirestore();
        const userQuery = await firestore.collection('users').where('email', '==', 'admin@lhamascred.com.br').limit(1).get();
        
        if (userQuery.empty) {
            return { status: 'error', stepIndex: 0, message: 'Usuário administrador não encontrado para buscar as credenciais.' };
        }
        
        const userData = userQuery.docs[0].data();
        userCredentials = {
          v8_username: userData.v8_username,
          v8_password: userData.v8_password,
          v8_audience: userData.v8_audience,
          v8_client_id: userData.v8_client_id,
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

  // Etapa 2: Iniciar a consulta de saldo
  const { documentNumber, provider } = validation.data;
  const API_URL_CONSULTA = 'https://bff.v8sistema.com/fgts/balance';
  
  const requestBody = { documentNumber, provider };

  try {
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
        const errorMessage = `Erro ao enviar consulta: ${consultaResponse.status} ${consultaResponse.statusText}. Detalhes: ${errorDetails}`;
        return { status: 'error', stepIndex: 1, message: errorMessage };
    }
   
    return { 
        status: 'success', 
        stepIndex: 1, 
        message: 'Consulta de saldo iniciada com sucesso. Aguardando o resultado via webhook.' 
    };

  } catch (error) {
    console.error("[V8 API] Erro de comunicação na consulta de saldo:", error);
    const message = error instanceof Error ? error.message : 'Ocorreu um erro de comunicação com a API.';
    return { status: 'error', stepIndex: 1, message };
  }
}
