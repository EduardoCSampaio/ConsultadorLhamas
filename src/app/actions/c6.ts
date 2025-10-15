
'use server';

import { z } from 'zod';
import { firestore } from '@/firebase/server-init';
import type { ApiCredentials } from './users';
import { logActivity } from './users';

const phoneSchema = z.object({
  codigo_area: z.string().min(2).max(2),
  numero: z.string().min(8),
});

const linkSchema = z.object({
  cpf: z.string().min(11).max(14),
  nome: z.string(),
  data_nascimento: z.string(), // DD/MM/AAAA
  telefone: phoneSchema,
  userId: z.string(),
});

const getOffersSchema = z.object({
    cpf: z.string().min(11).max(14),
    userId: z.string(),
});


export type C6LinkResponse = {
    link: string;
    data_expiracao: string;
};

export type C6Offer = {
    id_oferta: string;
    nome_produto: string;
    valor_financiado: number;
    valor_parcela: number;
    qtd_parcelas: number;
    taxa_mes: number;
    status: string;
}

export type C6AuthStatus = {
    status: "AGUARDANDO_AUTORIZACAO" | "AUTORIZADO" | "NAO_AUTORIZADO";
    observacao: string;
}

type C6LinkResult = {
    success: boolean;
    message: string;
    data?: C6LinkResponse;
}

type C6OfferResult = {
    success: boolean;
    message: string;
    data?: C6Offer[];
}

type C6StatusResult = {
    success: boolean;
    message: string;
    data?: C6AuthStatus;
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
      const errorMessage = data.message || data.error_description || JSON.stringify(data);
      console.error(`[C6 AUTH] Falha na autenticação: ${errorMessage}`, data);
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

export async function consultarLinkAutorizacaoC6(input: z.infer<typeof linkSchema>): Promise<C6LinkResult> {
    const validation = linkSchema.safeParse(input);
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
        cpf: apiData.cpf.replace(/\D/g, ''),
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
                'Authorization': `${token}`
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


export async function consultarOfertasCLTC6(input: z.infer<typeof getOffersSchema>): Promise<C6OfferResult> {
    const validation = getOffersSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, message: 'CPF inválido.' };
    }

    const { userId, cpf } = validation.data;

    const { credentials, error: credError } = await getC6UserCredentials(userId);
    if (credError || !credentials) {
        return { success: false, message: credError || "Credenciais não encontradas." };
    }

    const { token, error: tokenError } = await getC6AuthToken(credentials.c6_username, credentials.c6_password);
    if (tokenError || !token) {
        return { success: false, message: tokenError || "Não foi possível obter o token do C6." };
    }

    await logActivity({ userId, action: 'Consulta Ofertas CLT C6', provider: 'c6', documentNumber: cpf });

    const apiUrl = 'https://marketplace-proposal-service-api-p.c6bank.info/marketplace/worker-payroll-loan-offers';

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Accept': 'application/vnd.c6bank_generate_offer_v1+json',
                'Content-Type': 'application/json',
                'Authorization': `${token}`
            },
            body: JSON.stringify({ cpf_cliente: cpf.replace(/\D/g, '') })
        });
        
        const textResponse = await response.text();
        if (!response.ok) {
            if (response.status === 404) {
                 return { success: false, message: `Erro da API do C6: Endpoint não encontrado (404). Verifique o URL da API.` };
            }
            if (textResponse.startsWith('{') || textResponse.startsWith('[')) {
                try {
                    const data = JSON.parse(textResponse);
                    const errorMessage = data.message || data.error_description || JSON.stringify(data);
                    console.error('[C6 API Error - Get Offers]', errorMessage);
                    return { success: false, message: `Erro da API do C6: ${errorMessage}` };
                } catch(e) {
                     console.error('[C6 API Error - Get Offers]', textResponse);
                    return { success: false, message: `Erro da API do C6: ${textResponse}` };
                }
            } else {
                 console.error('[C6 API Error - Get Offers]', textResponse);
                return { success: false, message: `Erro da API do C6: ${textResponse}` };
            }
        }
        
        const data = JSON.parse(textResponse);

        if (!data.ofertas || data.ofertas.length === 0) {
            return { success: true, message: "Nenhuma oferta encontrada para este cliente.", data: [] };
        }

        return { 
            success: true, 
            message: 'Ofertas encontradas com sucesso.',
            data: data.ofertas 
        };

    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro de comunicação ao consultar as ofertas do C6.";
        console.error('[C6 API Error - Get Offers]', message);
        return { success: false, message };
    }
}


export async function verificarStatusAutorizacaoC6(input: z.infer<typeof getOffersSchema>): Promise<C6StatusResult> {
    const validation = getOffersSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, message: 'CPF inválido.' };
    }

    const { userId, cpf } = validation.data;

    const { credentials, error: credError } = await getC6UserCredentials(userId);
    if (credError || !credentials) {
        return { success: false, message: credError || "Credenciais não encontradas." };
    }

    const { token, error: tokenError } = await getC6AuthToken(credentials.c6_username, credentials.c6_password);
    if (tokenError || !token) {
        return { success: false, message: tokenError || "Não foi possível obter o token do C6." };
    }

    await logActivity({ userId, action: 'Verifica Status Autorização C6', provider: 'c6', documentNumber: cpf });

    const apiUrl = `https://marketplace-proposal-service-api-p.c6bank.info/marketplace/authorization/status`;

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Accept': 'application/vnd.c6bank.authorization_status_v1+json',
                'Content-Type': 'application/json',
                'Authorization': `${token}`
            },
            body: JSON.stringify({ cpf: cpf.replace(/\D/g, '') })
        });
        
        const textResponse = await response.text();
        if (!response.ok) {
            const errorMessage = textResponse.startsWith('{') ? JSON.parse(textResponse).message : textResponse;
            console.error('[C6 API Error - Check Status]', errorMessage);
            return { success: false, message: `Erro da API do C6: ${errorMessage}` };
        }
        
        const data = JSON.parse(textResponse);

        return { 
            success: true, 
            message: 'Status verificado com sucesso.',
            data: data 
        };

    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro de comunicação ao verificar o status no C6.";
        console.error('[C6 API Error - Check Status]', message);
        return { success: false, message };
    }
}
    

    