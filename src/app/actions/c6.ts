
'use server';

import { z } from 'zod';
import { firestore } from '@/firebase/server-init';
import type { ApiCredentials } from './users';
import { logActivity } from './users';

const cltConsultaSchema = z.object({
  cpf: z.string().min(11, { message: "CPF deve ter 11 dígitos." }).max(11, { message: "CPF deve ter 11 dígitos." }),
  userId: z.string(),
});

type C6QueryResult = {
    success: boolean;
    message: string;
    data?: any; // Placeholder for actual offer data structure
}

async function getC6UserCredentials(userId: string): Promise<{ credentials: ApiCredentials | null; error: string | null }> {
    if (!userId) {
        return { credentials: null, error: 'ID do usuário não fornecido.' };
    }
    try {
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
            return { credentials: null, error: `Credenciais do C6 incompletas. Faltando: ${missing}. Por favor, configure-as na página de Configurações.` };
        }

        return { credentials, error: null };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao carregar credenciais da API C6.";
        console.error(`[getC6UserCredentials] Error fetching credentials for user ${userId}:`, error);
        return { credentials: null, error: message };
    }
}


export async function getC6AuthToken(username?: string, password?: string): Promise<{ token: string | undefined; error: string | null }> {
  if (!username || !password) {
      return { token: undefined, error: "Credenciais do C6 (usuário/senha) não fornecidas." };
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
      return { token: undefined, error: `Falha na autenticação com o C6: ${errorMessage}` };
    }

    return { token: data.access_token, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro de comunicação ao gerar token do C6.";
    console.error('[C6 AUTH] Erro de comunicação:', error);
    return { token: undefined, error: message };
  }
}


export async function consultarOfertasC6(input: z.infer<typeof cltConsultaSchema>): Promise<C6QueryResult> {
    const validation = cltConsultaSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, message: 'Dados de entrada inválidos.' };
    }

    const { cpf, userId } = validation.data;

    const { credentials, error: credError } = await getC6UserCredentials(userId);
    if (credError || !credentials) {
        return { success: false, message: credError || "Credenciais não encontradas." };
    }

    const { token, error: tokenError } = await getC6AuthToken(credentials.c6_username, credentials.c6_password);
    if (tokenError || !token) {
        return { success: false, message: tokenError || "Não foi possível obter o token do C6." };
    }
    
    await logActivity({ userId, documentNumber: cpf, action: 'Consulta CLT C6', provider: 'c6' });

    // TODO: Implement actual API call to fetch offers from C6.
    // For now, we return a placeholder message.
    return { 
        success: true, 
        message: 'A autenticação com o C6 foi bem-sucedida. A funcionalidade de consulta de ofertas será implementada em breve.',
        data: [] 
    };
}
