
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

const consentActionSchema = z.object({
  borrowerDocumentNumber: z.string(),
  gender: z.enum(["male", "female"]),
  birthDate: z.string(),
  signerName: z.string(),
  signerEmail: z.string().email(),
  signerPhone: phoneSchema,
  provider: z.literal("QI"),
  userId: z.string(),
});

const simulationActionSchema = z.object({
  consult_id: z.string(),
  config_id: z.string(),
  disbursed_amount: z.number(),
  number_of_installments: z.number(),
  provider: z.literal("QI"),
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

type GetTaxasResult = {
    success: boolean;
    message: string;
    configs?: SimulationConfig[];
};

type CreateSimulacaoResult = {
    success: boolean;
    message: string;
    simulation?: SimulationResult;
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

async function getUserCredentials(userId: string): Promise<{ credentials: ApiCredentials | null; error: string | null }> {
    try {
        initializeFirebaseAdmin();
        const firestore = getFirestore();
        const userDoc = await firestore.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return { credentials: null, error: 'Usuário não encontrado para buscar credenciais.' };
        }
        const userData = userDoc.data()!;
        return {
            credentials: {
                v8_username: userData.v8_username,
                v8_password: userData.v8_password,
                v8_audience: userData.v8_audience,
                v8_client_id: userData.v8_client_id,
            },
            error: null,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao carregar credenciais de API.";
        return { credentials: null, error: message };
    }
}

export async function gerarTermoConsentimento(input: z.infer<typeof consentActionSchema>): Promise<CLTConsentResult> {
    const validation = consentActionSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, message: 'Dados de entrada inválidos.' };
    }

    const { userId, ...requestData } = validation.data;

    const { credentials, error: credError } = await getUserCredentials(userId);
    if (credError) {
        return { success: false, message: credError };
    }

    const { token, error: tokenError } = await getAuthToken(credentials!);
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
        
        const consultationId = responseData.consultationId;
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

export async function consultarTaxasCLT(): Promise<GetTaxasResult> {
     // For now, we don't have a user context here, but if needed, userId could be passed.
    // Let's assume a generic admin or service account for fetching configs.
    const { credentials, error: credError } = await getUserCredentials('admin'); // Or a specific service account user
     if (credError) {
        // A simple workaround: try to find any admin user to get credentials
        // This is not ideal for production but works for a single-admin setup.
        console.warn("Could not find dedicated admin user for configs, will attempt to find one.");
    }

    // This is a placeholder for getting any admin user's credentials.
    // In a real app, you'd have a more robust way to handle service-to-service auth.
    let token: string | null;

    try {
        initializeFirebaseAdmin();
        const firestore = getFirestore();
        const usersSnapshot = await firestore.collection('users').where('role', '==', 'admin').limit(1).get();
        if (usersSnapshot.empty) {
            return { success: false, message: "Nenhum usuário administrador configurado para buscar taxas." };
        }
        const adminUser = usersSnapshot.docs[0].data();
         const { token: fetchedToken, error: tokenError } = await getAuthToken(adminUser);
         if (tokenError) {
             return { success: false, message: tokenError };
         }
         token = fetchedToken;

    } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to fetch admin credentials.';
        return { success: false, message };
    }


    if (!token) return { success: false, message: "Não foi possível autenticar para buscar as taxas." };

    const API_URL = 'https://bff.v8sistema.com/private-consignment/simulation/configs';
    try {
        const response = await fetch(API_URL, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });
        const responseData = await response.json();
        if (!response.ok) {
            const errorMessage = responseData.message || 'Falha ao buscar configurações de simulação.';
            return { success: false, message: errorMessage };
        }
        return { success: true, message: "Taxas carregadas com sucesso.", configs: responseData.configs };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro de rede ao buscar taxas.';
        return { success: false, message };
    }
}

export async function criarSimulacaoCLT(input: z.infer<typeof simulationActionSchema>): Promise<CreateSimulacaoResult> {
    const validation = simulationActionSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, message: 'Dados de entrada para simulação inválidos.' };
    }

    // We need a user context to get the right token
    const { auth } = await initializeFirebaseAdmin();
    const userRecords = await auth.listUsers();
    const currentUser = userRecords.users.find(u => u.uid); // simplistic selection
    
    if (!currentUser) return { success: false, message: 'Usuário não encontrado para a simulação.' };

    const { credentials, error: credError } = await getUserCredentials(currentUser.uid);
    if (credError) {
        return { success: false, message: credError };
    }

    const { token, error: tokenError } = await getAuthToken(credentials!);
    if (tokenError) {
        return { success: false, message: tokenError };
    }

    const API_URL = 'https://bff.v8sistema.com/private-consignment/simulation';

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(validation.data),
        });
        const responseData = await response.json();

        if (!response.ok) {
             const errorMessage = responseData.message || responseData.error || 'Erro desconhecido ao criar simulação.';
            return { success: false, message: errorMessage };
        }

        return { success: true, message: "Simulação criada com sucesso.", simulation: responseData };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro de rede ao criar simulação.';
        return { success: false, message };
    }
}
