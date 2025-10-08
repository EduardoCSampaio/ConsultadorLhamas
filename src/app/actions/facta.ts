
'use server';

import { z } from 'zod';
import { initializeFirebaseAdmin } from '@/firebase/server-init';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { ApiCredentials } from './users';

const cltConsultaSchema = z.object({
  cpf: z.string().min(11, { message: "CPF deve ter 11 dígitos." }).max(11, { message: "CPF deve ter 11 dígitos." }),
  userId: z.string(),
});

const fgtsConsultaSchema = z.object({
    cpf: z.string().min(11, { message: "CPF deve ter 11 dígitos." }).max(11, { message: "CPF deve ter 11 dígitos." }),
    userId: z.string(),
    token: z.string().optional(),
});


type FactaTokenResponse = {
  erro: boolean;
  mensagem: string;
  token?: string;
};

export type FactaOffer = {
  oferta: {
    idSolicitacao: string;
    cpf: string;
    matricula: string;
    numeroInscricaoEmpregador: string;
    valorLiberado: string;
    nroParcelas: string;
    nomeTrabalhador: string;
    dataNascimento: string;
    margemDisponivel: string;
    elegivelEmprestimo: string;
    pessoaExpostaPoliticamente: string;
    dataAdmissao: string;
  };
  resposta: {
    contatos: string;
    idSolicitacao: string;
    numeroParcelas: string;
    numeroProposta: string;
    valorCETAnual: string;
    valorCETMensal: string;
    valorEmprestimo: string;
    valorIOF: string;
    valorLiberado: string;
    valorParcela: string;
    valorTaxaAnual: string;
    valorTaxaMensal: string;
  };
};

export type FactaFgtsBalance = {
    data_saldo: string;
    horaSaldo: string;
    saldo_total: string;
    [key: `dataRepasse_${number}`]: string;
    [key: `valor_${number}`]: string;
}

export type ConsultaFactaCltResult = {
  success: boolean;
  message: string;
  data?: FactaOffer[];
};

export type ConsultaFactaFgtsResult = {
  success: boolean;
  message: string;
  data?: FactaFgtsBalance;
};


const FACTA_API_BASE_URL_PROD = 'https://webservice.facta.com.br';

async function getFactaUserCredentials(userId: string): Promise<{ credentials: ApiCredentials | null; error: string | null }> {
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
            facta_username: userData.facta_username,
            facta_password: userData.facta_password,
        };

        if (!credentials.facta_username || !credentials.facta_password) {
            const missing = [
                !credentials.facta_username && "Username",
                !credentials.facta_password && "Password",
            ].filter(Boolean).join(', ');
            return { credentials: null, error: `Credenciais da Facta incompletas. Faltando: ${missing}. Por favor, configure-as na página de Configurações.` };
        }

        return { credentials, error: null };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao carregar credenciais da API Facta.";
        console.error(`[getFactaUserCredentials] Error fetching credentials for user ${userId}:`, error);
        return { credentials: null, error: message };
    }
}


export async function getFactaAuthToken(credentials: ApiCredentials): Promise<{ token: string | undefined; error: string | null }> {
  const { facta_username, facta_password } = credentials;

  if (!facta_username || !facta_password) {
      return { token: undefined, error: "Credenciais da Facta não fornecidas." };
  }

  const encodedCreds = Buffer.from(`${facta_username}:${facta_password}`).toString('base64');
  
  try {
    const response = await fetch(`${FACTA_API_BASE_URL_PROD}/gera-token`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${encodedCreds}`,
      },
    });

    const data: FactaTokenResponse = await response.json();

    if (data.erro || !data.token) {
      console.error(`[FACTA AUTH] Falha ao gerar token: ${data.mensagem}`);
      return { token: undefined, error: `Falha ao gerar token da Facta: ${data.mensagem}` };
    }

    return { token: data.token, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro de comunicação ao gerar token da Facta.";
    console.error('[FACTA AUTH] Erro de comunicação:', error);
    return { token: undefined, error: message };
  }
}

async function logActivity(userId: string, cpf: string, action: string) {
    try {
        const firestore = getFirestore();
        const userDoc = await firestore.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            console.error(`[logActivity] User with ID ${userId} not found.`);
            return;
        }
        const userEmail = userDoc.data()?.email || 'N/A';

        await firestore.collection('activityLogs').add({
            userId: userId,
            userEmail: userEmail,
            action: action,
            documentNumber: cpf,
            provider: 'facta',
            createdAt: FieldValue.serverTimestamp(),
        });
    } catch (logError) {
        console.error(`Failed to log ${action} activity:`, logError);
    }
}


export async function consultarOfertasFacta(input: z.infer<typeof cltConsultaSchema>): Promise<ConsultaFactaCltResult> {
    const validation = cltConsultaSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, message: 'Dados de entrada inválidos.' };
    }

    const { cpf, userId } = validation.data;

    const { credentials, error: credError } = await getFactaUserCredentials(userId);
    if (credError || !credentials) {
        return { success: false, message: credError || "Credenciais não encontradas." };
    }

    const { token, error: tokenError } = await getFactaAuthToken(credentials);
    if (tokenError || !token) {
        return { success: false, message: tokenError || "Não foi possível obter o token da Facta" };
    }
    
    await logActivity(userId, cpf, 'Consulta CLT Facta');

    try {
        const url = new URL(`${FACTA_API_BASE_URL_PROD}/consignado-trabalhador/consulta-ofertas`);
        url.searchParams.append('cpf', cpf);

        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        const data = await response.json();

        if (data.erro) {
            return { success: false, message: data.mensagem || 'Erro ao consultar ofertas na Facta.' };
        }

        if (data.total === 0) {
            return { success: true, message: 'Nenhuma oferta encontrada para o CPF informado.', data: [] };
        }

        return { success: true, message: data.mensagem, data: data.dados };

    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro de comunicação ao consultar ofertas da Facta.";
        console.error('[FACTA API] Erro na consulta de ofertas:', error);
        return { success: false, message };
    }
}

export async function consultarSaldoFgtsFacta(input: z.infer<typeof fgtsConsultaSchema>): Promise<ConsultaFactaFgtsResult> {
    const validation = fgtsConsultaSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, message: 'Dados de entrada inválidos.' };
    }

    const { cpf, userId } = validation.data;
    let { token } = validation.data;

    if (!token) {
        const { credentials, error: credError } = await getFactaUserCredentials(userId);
        if (credError || !credentials) {
            return { success: false, message: credError || "Credenciais não encontradas." };
        }

        const { token: authToken, error: tokenError } = await getFactaAuthToken(credentials);
        if (tokenError || !authToken) {
            return { success: false, message: tokenError || "Não foi possível obter o token da Facta" };
        }
        token = authToken;
    }


    await logActivity(userId, cpf, 'Consulta FGTS Facta');

    try {
        const url = new URL(`${FACTA_API_BASE_URL_PROD}/fgts/saldo`);
        url.searchParams.append('cpf', cpf);

        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });
        
        const data = await response.json();

        if (data.erro) {
            return { success: false, message: data.msg || 'Erro ao consultar saldo FGTS na Facta.' };
        }
        
        return { success: true, message: data.msg, data: data.retorno };

    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro de comunicação ao consultar saldo FGTS da Facta.";
        console.error('[FACTA API] Erro na consulta de saldo FGTS:', error);
        return { success: false, message };
    }
}

    