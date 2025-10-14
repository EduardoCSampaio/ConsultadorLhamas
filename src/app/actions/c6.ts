
'use server';

import { z } from 'zod';
import { firestore } from '@/firebase/server-init';
import type { ApiCredentials } from './users';
import { logActivity } from './users';

const phoneSchema = z.object({
  codigo_area: z.string().min(2).max(2),
  numero: z.string().min(8),
});

const cltConsultaSchema = z.object({
  cpf: z.string().min(11).max(11),
  nome: z.string(),
  data_nascimento: z.string(), // DD/MM/AAAA
  telefone: phoneSchema,
  userId: z.string(),
});

export type C6LinkResponse = {
    link: string;
    data_expiracao: string;
};

type C6QueryResult = {
    success: boolean;
    message: string;
    data?: C6LinkResponse;
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
                !credentials.c6_username && "Client ID",
                !credentials.c6_password && "Client Secret",
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


export async function getC6AuthToken(clientId?: string, clientSecret?: string): Promise<{ token: string | undefined; error: string | null }> {
  if (!clientId || !clientSecret) {
      return { token: undefined, error: "Credenciais do C6 (Client ID/Client Secret) não fornecidas." };
  }
  
  const tokenUrl = 'https://marketplace-proposal-service-api-p.c6bank.info/auth/token';
  const bodyPayload = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
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

function convertDateToYYYYMMDD(dateStr: string): string {
    const [day, month, year] = dateStr.split('/');
    return `${year}-${month}-${day}`;
}

export async function consultarOfertasC6(input: z.infer<typeof cltConsultaSchema>): Promise<C6QueryResult> {
    const validation = cltConsultaSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, message: 'Dados de entrada inválidos.' };
    }

    const { userId, ...apiData } = validation.data;

    const { credentials, error: credError } = await getC6UserCredentials(userId);
    if (credError || !credentials) {
        return { success: false, message: credError || "Credenciais não encontradas." };
    }

    const { token, error: tokenError } = await getC6AuthToken(credentials.c6_username, credentials.c6_password);
    if (tokenError || !token) {
        return { success: false, message: tokenError || "Não foi possível obter o token do C6." };
    }
    
    await logActivity({ userId, documentNumber: apiData.cpf, action: 'Geração Link CLT C6', provider: 'c6' });
    
    const apiUrl = 'https://marketplace-proposal-service-api-p.c6bank.info/marketplace/authorization/generate-liveness';
    
    const requestBody = {
        nome: apiData.nome,
        cpf: apiData.cpf,
        data_nascimento: convertDateToYYYYMMDD(apiData.data_nascimento),
        telefone: {
            numero: apiData.telefone.numero,
            codigo_area: apiData.telefone.codigo_area
        }
    };

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Accept': 'application/vnd.c6bank_authorization_generate_liveness_v1+json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (!response.ok) {
            const errorMessage = data.message || data.error_description || JSON.stringify(data);
            console.error('[C6 API Error]', errorMessage);
            return { success: false, message: `Erro da API do C6: ${errorMessage}` };
        }
        
        return { 
            success: true, 
            message: 'Link de autorização gerado com sucesso.',
            data: data
        };

    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro de comunicação ao gerar link de autorização do C6.";
        console.error('[C6 API Error]', message);
        return { success: false, message: message };
    }
}
