
'use server';

import { z } from 'zod';
import { getFactaAuthToken } from './facta';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeFirebaseAdmin } from '@/firebase/server-init';
import type { ApiCredentials } from './users';
import { logActivity } from './users';
import * as XLSX from 'xlsx';

const getProposalsSchema = z.object({
  userId: z.string().min(1),
  dateFrom: z.string(), // DD/MM/AAAA
  dateTo: z.string(), // DD/MM/AAAA
});

export type FactaProposal = {
    proposta: string;
    data_digitacao: string;
    hora_digitacao: string;
    situacao: string; // Not in new example, but was there before. Maybe it's status_proposta? Keeping for now.
    convenio: string;
    cpf: string;
    cliente: string;
    valor_liberado: number; // Not in new example, but was there before. Maybe it's valor_bruto?
    vlrprestacao: number;
    numeroprestacao: number;
    login_corretor: string;
    nome_login: string; // Not in new example
    corretor: string;
    codigo_indicador: string;
    codigo_master: string;
    data_movimento: string;
    data_movimento_ocorrencia: string;
    hora_movimento_ocorrencia: string;
    observacao_ocorrencia: string;
    averbador: string;
    codigo_af: string;
    numero_contrato: string;
    numero_contrato_refin: string;
    produto: string;
    saldo_devedor: number;
    status_proposta: string;
    status_crivo: string;
    tabela: string;
    tipo_operacao: string;
    valor_af: number;
    valor_bruto: number;
    taxa: number;
    valor_iof: number;
    valor_seguro: number;
    vendedor: string;
    matricula: string;
    especie_beneficio: string;
    meio_pagamento_beneficio: string;
    banco: string;
    agencia: string;
    conta: string;
    banco_desconto: string;
    agencia_desconto: string;
    conta_desconto: string;
    assinatura_digital: string;
    tipo_chave_pix: string;
    chave_pix: string;
    data_efetivacao: string;
    data_pgto_cliente: string;
};


type GetProposalsResult = {
  success: boolean;
  message: string;
  proposals?: FactaProposal[];
};

type ReportResult = {
  success: boolean;
  message: string;
  fileName?: string;
  fileContent?: string;
};


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
            return { credentials: null, error: `Credenciais da Facta incompletas. Por favor, configure-as.` };
        }

        return { credentials, error: null };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao carregar credenciais da API Facta.";
        return { credentials: null, error: message };
    }
}


async function getProposalsFromFacta(input: z.infer<typeof getProposalsSchema>): Promise<GetProposalsResult> {
    const { userId, dateFrom, dateTo } = input;
    
    const { credentials, error: credError } = await getFactaUserCredentials(userId);
    if (credError || !credentials) {
        return { success: false, message: credError || "Credenciais não encontradas." };
    }

    const { token, error: tokenError } = await getFactaAuthToken(credentials.facta_username, credentials.facta_password);
    if (tokenError || !token) {
        return { success: false, message: tokenError || "Não foi possível obter o token da Facta" };
    }

    await logActivity({ userId, action: 'Consulta Auxílio Propostas', provider: 'facta', details: `Período: ${dateFrom} a ${dateTo}` });

    try {
        const FACTA_API_URL_PROD = 'https://webservice.facta.com.br';
        const url = new URL(`${FACTA_API_URL_PROD}/proposta/andamento-propostas`);
        url.searchParams.append('data_ini', dateFrom);
        url.searchParams.append('data_fim', dateTo);
        // The API is paginated, but for now we fetch the first page (default 5000 records).
        // For a full implementation, we would need to loop through pages.
        url.searchParams.append('quantidade', '5000'); 

        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        const data = await response.json();

        if (data.erro) {
            return { success: false, message: data.mensagem || 'Erro ao consultar propostas na Facta.' };
        }

        if (data.total === 0) {
            return { success: true, message: 'Nenhuma proposta encontrada no período informado.', proposals: [] };
        }
        
        // The actual data is in the `propostas` key
        return { success: true, message: 'Propostas encontradas com sucesso.', proposals: data.propostas };

    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro de comunicação ao consultar propostas da Facta.";
        console.error('[FACTA API] Erro na consulta de andamento de propostas:', error);
        return { success: false, message };
    }
}


export async function getFactaProposalsReport(input: z.infer<typeof getProposalsSchema>): Promise<ReportResult> {
    const validation = getProposalsSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, message: 'Dados de entrada inválidos.' };
    }

    const result = await getProposalsFromFacta(validation.data);

    if (!result.success || !result.proposals) {
        return { success: false, message: result.message };
    }
    
    if (result.proposals.length === 0) {
        return { success: false, message: "Nenhuma proposta encontrada para gerar o relatório." };
    }
    
    try {
        const dataToExport = result.proposals.map(p => ({
            'Proposta': p.proposta,
            'Data Digitação': p.data_digitacao,
            'Hora Digitação': p.hora_digitacao,
            'Data Efetivação': p.data_efetivacao,
            'Data Pgto Cliente': p.data_pgto_cliente,
            'Situação': p.status_proposta,
            'CPF': p.cpf,
            'Cliente': p.cliente,
            'Valor Liberado (AF)': p.valor_af,
            'Valor Bruto': p.valor_bruto,
            'Valor Prestação': p.vlrprestacao,
            'Prazo': p.numeroprestacao,
            'Taxa': p.taxa,
            'Valor IOF': p.valor_iof,
            'Valor Seguro': p.valor_seguro,
            'Login Corretor': p.login_corretor,
            'Corretor': p.corretor,
            'Código Indicador': p.codigo_indicador,
            'Código Master': p.codigo_master,
            'Vendedor': p.vendedor,
            'Data Movimento': p.data_movimento,
            'Data Mov. Ocorrência': p.data_movimento_ocorrencia,
            'Hora Mov. Ocorrência': p.hora_movimento_ocorrencia,
            'Observação Ocorrência': p.observacao_ocorrencia,
            'Averbador': p.averbador,
            'Código AF': p.codigo_af,
            'Contrato': p.numero_contrato,
            'Contrato Refin': p.numero_contrato_refin,
            'Convênio': p.convenio,
            'Produto': p.produto,
            'Saldo Devedor': p.saldo_devedor,
            'Status Crivo': p.status_crivo,
            'Tabela': p.tabela,
            'Tipo Operação': p.tipo_operacao,
            'Matrícula': p.matricula,
            'Espécie Benefício': p.especie_beneficio,
            'Meio Pagamento': p.meio_pagamento_beneficio,
            'Banco': p.banco,
            'Agência': p.agencia,
            'Conta': p.conta,
            'Banco Desconto': p.banco_desconto,
            'Agência Desconto': p.agencia_desconto,
            'Conta Desconto': p.conta_desconto,
            'Assinatura Digital': p.assinatura_digital,
            'Tipo Chave PIX': p.tipo_chave_pix,
            'Chave PIX': p.chave_pix,
        }));

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Propostas Facta');

        // Set column widths
        if (dataToExport.length > 0) {
            const header = Object.keys(dataToExport[0]);
            worksheet['!cols'] = header.map(h => ({ wch: Math.max(h.length, 18) }));
        }
        
        const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
        const base64String = buffer.toString('base64');
        const fileContent = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64String}`;
        
        const formattedDate = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
        const fileName = `Relatorio_Propostas_Facta_${formattedDate}.xlsx`;

        return {
            success: true,
            message: "Relatório gerado com sucesso.",
            fileName,
            fileContent,
        };

    } catch (error) {
        const message = error instanceof Error ? error.message : "Ocorreu um erro desconhecido ao gerar o arquivo Excel.";
        console.error("Erro ao gerar Excel:", error);
        return { success: false, message };
    }
}
