
'use server';

import { z } from 'zod';
import { initializeFirebaseAdmin } from '@/firebase/server-init';
import { getFirestore } from 'firebase-admin/firestore';
import type { ApiCredentials } from './users';

const consultaSchema = z.object({
  cpf: z.string().min(11, { message: "CPF deve ter 11 dígitos." }).max(11, { message: "CPF deve ter 11 dígitos." }),
  userId: z.string(),
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

export type ConsultaFactaResult = {
  success: boolean;
  message: string;
  data?: FactaOffer[];
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


async function getFactaToken(credentials: ApiCredentials): Promise<{ token: string | null; error: string | null }> {
  const { facta_username, facta_password } = credentials;

  if (!facta_username || !facta_password) {
      return { token: null, error: "Credenciais da Facta não fornecidas." };
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
      return { token: null, error: `Falha ao gerar token da Facta: ${data.mensagem}` };
    }

    return { token: data.token, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro de comunicação ao gerar token da Facta.";
    console.error('[FACTA AUTH] Erro de comunicação:', error);
    return { token: null, error: message };
  }
}

export async function consultarOfertasFacta(input: z.infer<typeof consultaSchema>): Promise<ConsultaFactaResult> {
    const validation = consultaSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, message: 'Dados de entrada inválidos.' };
    }

    const { cpf, userId } = validation.data;

    // 1. Get Facta Credentials
    const { credentials, error: credError } = await getFactaUserCredentials(userId);
    if (credError || !credentials) {
        return { success: false, message: credError || "Credenciais não encontradas." };
    }

    // 2. Get Facta Token
    const { token, error: tokenError } = await getFactaToken(credentials);
    if (tokenError) {
        return { success: false, message: tokenError };
    }

    // 3. Consult Offers
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
