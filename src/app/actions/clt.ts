
'use server';

import { z } from 'zod';
import type { ApiCredentials } from './users';
import { firestore } from '@/firebase/server-init';
import { logActivity } from './users';

const phoneSchema = z.object({
    countryCode: z.string(),
    areaCode: z.string(),
    phoneNumber: z.string(),
});

const consentActionSchema = z.object({
  borrowerDocumentNumber: z.string(),
  gender: z.enum(["male", "female"]),
  birthDate: z.string(), // DD/MM/AAAA
  signerName: z.string(),
  signerEmail: z.string().email(),
  signerPhone: phoneSchema,
  provider: z.literal("QI"),
  userId: z.string(),
});

const getConfigsSchema = z.object({
  userId: z.string(),
});

const simulationActionSchema = z.object({
  consult_id: z.string(),
  config_id: z.string(),
  disbursed_amount: z.number(),
  number_of_installments: z.number(),
  provider: z.literal("QI"),
  userId: z.string(),
});

export type CLTConsentResult = {
  success: boolean;
  message: string;
  consultationId?: string;
};

export type SimulationConfig = {
    id: string;
    slug: string;
    monthly_interest_rate: string;
    number_of_installments: string[];
};

export type SimulationResult = {
  id_simulation: string;
  partner_id: string;
  number_of_installments: number;
  monthly_interest_rate: number;
  disbursement_amount: number;
  installment_value: number;
  operation_amount: number;
  issue_amount: number;
  disbursed_issue_amount: number;
  disbursement_option: {
    iof_amount: number;
    cet: number;
    first_due_date: string;
    installments: {
      installment_number: number;
      due_date: string;
      total_amount: number;
    }[];
  };
};

type CreateSimulacaoResult = {
    success: boolean;
    message: string;
    simulation?: SimulationResult;
};

type GetConfigsResult = {
    success: boolean;
    message: string;
    configs?: SimulationConfig[];
}


export async function getUserCredentials(userId: string): Promise<{ credentials: ApiCredentials | null; error: string | null }> {
    if (!userId) {
        return { credentials: null, error: 'ID do usuário não fornecido.' };
    }
    try {
        const userDoc = await firestore.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return { credentials: null, error: 'Usuário não encontrado para buscar credenciais.' };
        }
        const userData = userDoc.data()!;
        const credentials = {
            v8_username: userData.v8_username,
            v8_password: userData.v8_password,
            v8_audience: userData.v8_audience,
            v8_client_id: userData.v8_client_id,
        };

        if (!credentials.v8_username || !credentials.v8_password || !credentials.v8_audience || !credentials.v8_client_id) {
            const missing = [
                !credentials.v8_username && "Username",
                !credentials.v8_password && "Password",
                !credentials.v8_audience && "Audience",
                !credentials.v8_client_id && "Client ID"
            ].filter(Boolean).join(', ');
            return { credentials: null, error: `Credenciais da V8 incompletas. Faltando: ${missing}. Por favor, configure-as na página de Configurações.` };
        }

        return { credentials, error: null };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao carregar credenciais de API.";
        console.error(`[getUserCredentials] Error fetching credentials for user ${userId}:`, error);
        return { credentials: null, error: message };
    }
}

export async function getAuthToken(credentials: ApiCredentials): Promise<{token: string | null, error: string | null}> {
  const { v8_username, v8_password, v8_audience, v8_client_id } = credentials;
  
  const tokenUrl = 'https://auth.v8sistema.com/oauth/token';
  const bodyPayload = new URLSearchParams({
    grant_type: 'password',
    username: v8_username!,
    password: v8_password!,
    audience: v8_audience!,
    scope: 'offline_access',
    client_id: v8_client_id!,
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

function convertDateToYYYYMMDD(dateStr: string): string {
    const [day, month, year] = dateStr.split('/');
    return `${year}-${month}-${day}`;
}


export async function gerarTermoConsentimento(input: z.infer<typeof consentActionSchema>): Promise<CLTConsentResult> {
    const validation = consentActionSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, message: 'Dados de entrada inválidos.' };
    }

    const { userId, birthDate, ...data } = validation.data;

    await logActivity({
        userId,
        action: 'Geração Termo CLT V8',
        provider: 'V8',
        documentNumber: data.borrowerDocumentNumber,
    });

    const { credentials, error: credError } = await getUserCredentials(userId);
    if (credError || !credentials) {
        return { success: false, message: credError || "Credenciais não encontradas." };
    }

    const { token, error: tokenError } = await getAuthToken(credentials);
    if (tokenError) {
        return { success: false, message: tokenError };
    }
    
    const API_URL = 'https://bff.v8sistema.com/private-consignment/consult';
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
    };

    try {
        const requestBody = {
            ...data,
            birthDate: convertDateToYYYYMMDD(birthDate)
        };

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody),
        });

        const responseData = await response.json();

        if (!response.ok) {
            const errorMessage = responseData.detail || responseData.message || responseData.error || 'Erro desconhecido da API ao gerar o termo.';
            console.error(`[CLT_CONSENT] API Error: ${JSON.stringify(responseData)}`);
            return { success: false, message: `Falha ao gerar termo: ${errorMessage}` };
        }
        
        const consultationId = responseData.id;
        if (!consultationId) {
            console.error('[CLT_CONSENT] API Success but no consultationId returned:', responseData);
            return { success: false, message: "API retornou sucesso mas não incluiu o ID da consulta." };
        }

        return { 
            success: true, 
            message: 'Termo de consentimento gerado com sucesso.',
            consultationId: consultationId
        };

    } catch (error) {
        console.error("[CLT_CONSENT] Network or parsing error:", error);
        const message = error instanceof Error ? error.message : 'Ocorreu um erro de comunicação.';
        return { success: false, message };
    }
}


export async function getSimulationConfigs(input: z.infer<typeof getConfigsSchema>): Promise<GetConfigsResult> {
    const validation = getConfigsSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, message: 'ID de usuário inválido.' };
    }
    const { userId } = validation.data;

    const { credentials, error: credError } = await getUserCredentials(userId);
    if (credError || !credentials) {
        return { success: false, message: credError || "Credenciais não encontradas." };
    }
    const { token, error: tokenError } = await getAuthToken(credentials);
    if (tokenError) {
        return { success: false, message: tokenError };
    }

    const API_URL = 'https://bff.v8sistema.com/private-consignment/simulation/configs';
    try {
        const response = await fetch(API_URL, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` },
        });
        const responseData = await response.json();

        if (!response.ok) {
            const errorMessage = responseData.message || 'Erro ao buscar configurações de simulação.';
            return { success: false, message: errorMessage };
        }

        return { success: true, message: "Configurações encontradas.", configs: responseData.configs };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro de rede ao buscar configurações.';
        return { success: false, message };
    }
}


export async function criarSimulacaoCLT(input: z.infer<typeof simulationActionSchema>): Promise<CreateSimulacaoResult> {
    const validation = simulationActionSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, message: 'Dados de entrada para simulação inválidos.' };
    }

    const { userId, ...simulationData } = validation.data;
    
    await logActivity({
        userId,
        action: 'Criação Simulação CLT V8',
        provider: 'V8',
        details: `Config ID: ${simulationData.config_id}, Valor: ${simulationData.disbursed_amount}`
    });

    const { credentials, error: credError } = await getUserCredentials(userId);
    if (credError || !credentials) {
        return { success: false, message: credError || "Credenciais não encontradas para a simulação." };
    }

    const { token, error: tokenError } = await getAuthToken(credentials);
    if (tokenError) {
        return { success: false, message: tokenError };
    }

    const API_URL = 'https://bff.v8sistema.com/private-consignment/simulation';

    try {
        const requestBody = {
            ...simulationData,
            installment_face_value: 0 // API seems to require this, even if 0
        };

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(requestBody),
        });
        const responseData = await response.json();

        if (!response.ok) {
             const errorMessage = responseData.message || responseData.error || 'Erro desconhecido ao criar simulação.';
            return { success: false, message: `Erro da API V8: ${errorMessage}` };
        }

        return { success: true, message: "Simulação criada com sucesso.", simulation: responseData };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro de rede ao criar simulação.';
        return { success: false, message };
    }
}
