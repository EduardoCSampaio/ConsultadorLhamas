
'use server';

import { z } from 'zod';
import { initializeFirebaseAdmin } from '@/firebase/server-init';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { ApiCredentials } from './users';
import { logActivity } from './users';

const cltConsultaSchema = z.object({
  cpf: z.string().min(11, { message: "CPF deve ter 11 dígitos." }).max(11, { message: "CPF deve ter 11 dígitos." }),
  userId: z.string(),
});

const fgtsConsultaSchema = z.object({
    cpf: z.string().min(11, { message: "CPF deve ter 11 dígitos." }).max(11, { message: "CPF deve ter 11 dígitos." }),
    userId: z.string(),
    token: z.string().optional(),
});

const inssGetOperationsSchema = z.object({
    cpf: z.string(),
    data_nascimento: z.string(),
    valor_renda: z.number(),
    userId: z.string(),
});

const inssGetCreditOperationsSchema = z.object({
    cpf: z.string(),
    data_nascimento: z.string(),
    valor_contrato: z.number(),
    tipo_operacao: z.enum(['13', '27']),
    userId: z.string(),
});

const inssSubmitSimulationSchema = z.object({
    cpf: z.string(),
    data_nascimento: z.string(),
    valor_renda: z.number(),
    codigo_tabela: z.number(),
    prazo: z.number(),
    valor_operacao: z.number(),
    valor_parcela: z.number(),
    coeficiente: z.number(),
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

export type FactaFgtsBalance = {
    data_saldo: string;
    horaSaldo: string;
    saldo_total: string;
    [key: `dataRepasse_${number}`]: string;
    [key: `valor_${number}`]: string;
}

export type InssOperation = {
    convenio: string;
    idConvenio: number;
    averbador: string;
    tabela: string;
    taxa: number;
    prazo: number;
    tipoop: number;
    tipoOperacao: string;
    codigoTabela: number;
    coeficiente: number;
    primeiro_vencimento: string | null;
    codigoNormativa: string;
    contrato: number;
    parcela: number;
}

export type InssCreditOffer = {
    convenio: string;
    idConvenio: number;
    averbador: string;
    tabela: string;
    taxa: number;
    prazo: number;
    tipoop: number;
    tipoOperacao: string;
    codigoTabela: number;
    coeficiente: number;
    primeiro_vencimento: string | null;
    contrato: number;
    parcela: number;
}

export type InssSubmitResult = {
    id_simulador: string;
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

export type GetInssOperationsResult = {
    success: boolean;
    message: string;
    data?: InssOperation[];
};

export type GetInssCreditResult = {
    success: boolean;
    message: string;
    data?: InssCreditOffer[];
};

export type SubmitInssSimulationResult = {
    success: boolean;
    message: string;
    data?: InssSubmitResult;
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


export async function getFactaAuthToken(username?: string, password?: string): Promise<{ token: string | undefined; error: string | null }> {
  if (!username || !password) {
      return { token: undefined, error: "Credenciais da Facta (usuário/senha) não fornecidas." };
  }

  const encodedCreds = Buffer.from(`${username}:${password}`).toString('base64');
  
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

    const { token, error: tokenError } = await getFactaAuthToken(credentials.facta_username, credentials.facta_password);
    if (tokenError || !token) {
        return { success: false, message: tokenError || "Não foi possível obter o token da Facta" };
    }
    
    await logActivity({ userId, documentNumber: cpf, action: 'Consulta CLT Facta', provider: 'facta' });

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

        return { success: true, message: data.mensagem || 'Ofertas encontradas com sucesso.', data: data.dados };

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

        const { token: authToken, error: tokenError } = await getFactaAuthToken(credentials.facta_username, credentials.facta_password);
        if (tokenError || !authToken) {
            return { success: false, message: tokenError || "Não foi possível obter o token da Facta" };
        }
        token = authToken;
    }


    await logActivity({ userId, documentNumber: cpf, action: 'Consulta FGTS Facta', provider: 'facta' });

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
        
        return { success: true, message: data.msg || 'Saldo FGTS consultado com sucesso.', data: data.retorno };

    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro de comunicação ao consultar saldo FGTS da Facta.";
        console.error('[FACTA API] Erro na consulta de saldo FGTS:', error);
        return { success: false, message };
    }
}


export async function getInssOperations(input: z.infer<typeof inssGetOperationsSchema>): Promise<GetInssOperationsResult> {
    const validation = inssGetOperationsSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, message: 'Dados de entrada inválidos: ' + JSON.stringify(validation.error.flatten()) };
    }

    const { cpf, data_nascimento, valor_renda, userId } = validation.data;
    
    const { credentials, error: credError } = await getFactaUserCredentials(userId);
    if (credError || !credentials) {
        return { success: false, message: credError || "Credenciais não encontradas." };
    }

    const { token, error: tokenError } = await getFactaAuthToken(credentials.facta_username, credentials.facta_password);
    if (tokenError || !token) {
        return { success: false, message: tokenError || "Não foi possível obter o token da Facta" };
    }
    
    await logActivity({ userId, documentNumber: cpf, action: 'Consulta Cartão INSS Facta', provider: 'facta', details: `Renda: ${valor_renda}` });

    try {
        const url = new URL(`${FACTA_API_BASE_URL_PROD}/proposta/operacoes-disponiveis`);
        url.searchParams.append('produto', 'D');
        url.searchParams.append('tipo_operacao', '33');
        url.searchParams.append('averbador', '3');
        url.searchParams.append('convenio', '3');
        url.searchParams.append('opcao_valor', '1');
        url.searchParams.append('cpf', cpf);
        url.searchParams.append('data_nascimento', data_nascimento);
        url.searchParams.append('valor_renda', String(valor_renda));
        url.searchParams.append('valor', ''); // Explicitly empty for this operation type

        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        const data = await response.json();
        
        if (data.erro) {
            return { success: false, message: data.mensagem || 'Erro ao simular operações na Facta.' };
        }

        if (!data.tabelas || data.tabelas.length === 0) {
            return { success: true, message: 'Nenhuma tabela de operação encontrada para os dados informados.', data: [] };
        }

        return { success: true, message: 'Simulação realizada com sucesso.', data: data.tabelas };

    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro de comunicação ao simular operações da Facta.";
        console.error('[FACTA API] Erro na simulação de operações INSS:', error);
        return { success: false, message };
    }
}

export async function submitInssSimulation(input: z.infer<typeof inssSubmitSimulationSchema>): Promise<SubmitInssSimulationResult> {
    const validation = inssSubmitSimulationSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, message: 'Dados de entrada inválidos para submissão: ' + JSON.stringify(validation.error.flatten()) };
    }

    const { userId, ...formData } = validation.data;
     const { credentials, error: credError } = await getFactaUserCredentials(userId);
    if (credError || !credentials || !credentials.facta_username) {
        return { success: false, message: credError || "Credenciais não encontradas ou incompletas." };
    }

    const { token, error: tokenError } = await getFactaAuthToken(credentials.facta_username, credentials.facta_password);
    if (tokenError || !token) {
        return { success: false, message: tokenError || "Não foi possível obter o token da Facta" };
    }

    await logActivity({ userId, documentNumber: formData.cpf, action: 'Confirmação Simulação INSS Facta', provider: 'facta', details: `Tabela: ${formData.codigo_tabela}` });

    try {
        const body = new URLSearchParams({
            produto: 'D',
            tipo_operacao: '33',
            averbador: '3',
            convenio: '3',
            login_certificado: credentials.facta_username,
            ...Object.fromEntries(Object.entries(formData).map(([key, value]) => [key, String(value)])),
        });

        const response = await fetch(`${FACTA_API_BASE_URL_PROD}/proposta/etapa1-simulador`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: body.toString(),
        });

        const data = await response.json();

        if (data.erro) {
            return { success: false, message: data.mensagem || 'Erro ao submeter simulação na Facta.' };
        }

        return { success: true, message: 'Simulação submetida com sucesso.', data };

    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro de comunicação ao submeter simulação da Facta.";
        console.error('[FACTA API] Erro na submissão de simulação INSS:', error);
        return { success: false, message };
    }
}


export async function getInssCreditOperations(input: z.infer<typeof inssGetCreditOperationsSchema>): Promise<GetInssCreditResult> {
    const validation = inssGetCreditOperationsSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, message: 'Dados de entrada inválidos: ' + JSON.stringify(validation.error.flatten()) };
    }

    const { cpf, data_nascimento, valor_contrato, tipo_operacao, userId } = validation.data;

    const { credentials, error: credError } = await getFactaUserCredentials(userId);
    if (credError || !credentials) {
        return { success: false, message: credError || "Credenciais não encontradas." };
    }

    const { token, error: tokenError } = await getFactaAuthToken(credentials.facta_username, credentials.facta_password);
    if (tokenError || !token) {
        return { success: false, message: tokenError || "Não foi possível obter o token da Facta" };
    }
    
    await logActivity({ userId, documentNumber: cpf, action: 'Consulta Crédito Novo INSS Facta', provider: 'facta', details: `Tipo: ${tipo_operacao}, Valor: ${valor_contrato}` });

    try {
        const url = new URL(`${FACTA_API_BASE_URL_PROD}/proposta/operacoes-disponiveis`);
        url.searchParams.append('produto', 'D');
        url.searchParams.append('tipo_operacao', tipo_operacao);
        url.searchParams.append('averbador', '3');
        url.searchParams.append('convenio', '3');
        url.searchParams.append('opcao_valor', '1'); // 1 = contrato
        url.searchParams.append('valor', String(valor_contrato));
        url.searchParams.append('cpf', cpf);
        url.searchParams.append('data_nascimento', data_nascimento);

        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        const data = await response.json();
        
        if (data.erro) {
            return { success: false, message: data.mensagem || 'Erro ao buscar operações de crédito na Facta.' };
        }

        if (!data.tabelas || data.tabelas.length === 0) {
            return { success: true, message: 'Nenhuma tabela de crédito encontrada para os dados informados.', data: [] };
        }

        return { success: true, message: 'Operações de crédito encontradas com sucesso.', data: data.tabelas };

    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro de comunicação ao buscar operações de crédito da Facta.";
        console.error('[FACTA API] Erro na busca de operações de crédito INSS:', error);
        return { success: false, message };
    }
}
