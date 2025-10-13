
'use server';

import { z } from 'zod';
import { initializeFirebaseAdmin } from '@/firebase/server-init';
import { getFirestore } from 'firebase-admin/firestore';
import type { ApiCredentials } from './users';
import { logActivity } from './users';

async function getC6UserCredentials(userId: string): Promise<{ credentials: ApiCredentials | null; error: string | null }> {
    if (!userId) {
        return { credentials: null, error: 'ID do usuário não fornecido.' };
    }
    try {
        initializeFirebaseAdmin();
        const firestore = getFirestore();
        const userDoc = await firestore.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return { credentials: null, error: 'Usuário não encontrado.' };
        }
        const userData = userDoc.data()!;
        const credentials = {
            c6_username: userData.c6_username,
            c6_password: userData.c6_password,
        };

        if (!credentials.c6_username || !credentials.c6_password) {
            const missing = [
                !credentials.c6_username && "Username",
                !credentials.c6_password && "Password",
            ].filter(Boolean).join(', ');
            return { credentials: null, error: `Credenciais do C6 Bank incompletas. Faltando: ${missing}. Por favor, configure-as na página de Configurações.` };
        }

        return { credentials, error: null };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao carregar credenciais da API C6 Bank.";
        console.error(`[getC6UserCredentials] Error fetching credentials for user ${userId}:`, error);
        return { credentials: null, error: message };
    }
}


export async function getC6AuthToken(username?: string, password?: string): Promise<{ token: string | undefined; error: string | null }> {
  if (!username || !password) {
      return { token: undefined, error: "Credenciais do C6 Bank (usuário/senha) não fornecidas." };
  }
  
  const tokenUrl = 'https://marketplace-proposal-service-api-p.c6bank.info/auth/token';
  const bodyPayload = new URLSearchParams({
    username: username,
    password: password,
  });

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bodyPayload.toString(),
    });

    const data = await response.json();

    if (!response.ok || !data.access_token) {
      const errorMessage = data.message || data.error || JSON.stringify(data);
      console.error(`[C6 AUTH] Falha na autenticação: ${errorMessage}`);
      return { token: undefined, error: `Falha na autenticação com o C6 Bank: ${errorMessage}` };
    }

    return { token: data.access_token, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro de comunicação ao gerar token do C6 Bank.";
    console.error('[C6 AUTH] Erro de comunicação:', error);
    return { token: undefined, error: message };
  }
}
