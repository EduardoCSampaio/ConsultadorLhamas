
'use server';

import { z } from 'zod';
import { consultarSaldoFgts, getAuthToken } from './fgts';
import * as XLSX from 'xlsx';
import { initializeFirebaseAdmin } from '@/firebase/server-init';
import { getFirestore } from 'firebase-admin/firestore';
import type { ApiCredentials } from './users';

const processActionSchema = z.object({
  cpfs: z.array(z.string()),
  provider: z.enum(["cartos", "bms", "qi"]),
});

const reportActionSchema = z.object({
  cpfs: z.array(z.string()),
  fileName: z.string(),
  createdAt: z.string(),
});


type ProcessActionResult = {
  status: 'success' | 'error';
  count: number;
  message?: string;
};

type ReportActionResult = {
  status: 'success' | 'error';
  fileName: string;
  fileContent: string;
  message?: string;
};

/**
 * Action to initiate batch processing. It authenticates once, then loops 
 * through CPFs and starts the balance query for each one using the same token.
 */
export async function processarLoteFgts(input: z.infer<typeof processActionSchema>): Promise<ProcessActionResult> {
  const validation = processActionSchema.safeParse(input);

  if (!validation.success) {
    return { 
        status: 'error', 
        count: 0,
        message: 'Dados de entrada inválidos.' 
    };
  }

  // 1. Obter credenciais do Admin
  let userCredentials: ApiCredentials;
  try {
    initializeFirebaseAdmin();
    const firestore = getFirestore();
    const userQuery = await firestore.collection('users').where('email', '==', 'admin@lhamascred.com.br').limit(1).get();
    if (userQuery.empty) {
        return { status: 'error', count: 0, message: 'Usuário administrador não encontrado para buscar as credenciais.' };
    }
    const userData = userQuery.docs[0].data();
    userCredentials = {
      v8_username: userData.v8_username,
      v8_password: userData.v8_password,
      v8_audience: userData.v8_audience,
      v8_client_id: userData.v8_client_id,
    };
  } catch(error) {
      const message = error instanceof Error ? error.message : "Erro ao buscar credenciais.";
      return { status: 'error', count: 0, message: `Não foi possível carregar as credenciais de API: ${message}` };
  }

  // 2. Autenticar UMA VEZ para todo o lote
  const { token, error: tokenError } = await getAuthToken(userCredentials);
  if (tokenError) {
    return { status: 'error', count: 0, message: `Falha na autenticação do lote: ${tokenError}` };
  }

  // 3. Processar CPFs com o token reutilizado
  const { cpfs, provider } = validation.data;
  let successCount = 0;

  for (const cpf of cpfs) {
    // Passa o token obtido para a função de consulta
    const result = await consultarSaldoFgts({ documentNumber: cpf, provider, token: token! });
    if (result.status === 'success') {
      successCount++;
    }
    // Small delay to avoid overwhelming the API
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return {
    status: 'success',
    count: successCount,
    message: `Foram iniciadas ${successCount} de ${cpfs.length} consultas.`,
  };
}

/**
 * Action to generate the final report. It fetches the results for each CPF
 * from Firestore, where the webhook has saved them.
 */
export async function gerarRelatorioLote(input: z.infer<typeof reportActionSchema>): Promise<ReportActionResult> {
    const validation = reportActionSchema.safeParse(input);

    if (!validation.success) {
        return { 
            status: 'error', 
            fileName: '', 
            fileContent: '', 
            message: 'Dados de entrada para o relatório são inválidos.' 
        };
    }

    const { cpfs, fileName: originalFileName, createdAt } = validation.data;
    initializeFirebaseAdmin();
    const firestore = getFirestore();
    
    const results: { CPF: string; Saldo: string | number; Mensagem: string }[] = [];

    for (const cpf of cpfs) {
        try {
            const docRef = firestore.collection('webhookResponses').doc(cpf);
            const docSnap = await docRef.get();

            if (docSnap.exists) {
                const data = docSnap.data();
                const responseBody = data?.responseBody;
                
                // Case 1: Clear Success (status is success and balance is present)
                const isSuccess = data?.status === 'success' && responseBody && responseBody.balance !== undefined && responseBody.balance !== null;

                if (isSuccess) {
                    const balanceValue = parseFloat(responseBody.balance);
                    results.push({
                        CPF: cpf,
                        Saldo: isNaN(balanceValue) ? '0.00' : balanceValue, // Use number for currency formatting
                        Mensagem: 'Sucesso',
                    });
                } 
                // Case 2: Any other state is considered an error or pending.
                else {
                    const errorMessage = responseBody?.errorMessage || responseBody?.error || data?.message || "Erro no processamento do webhook.";
                    results.push({
                        CPF: cpf,
                        Saldo: 'N/A',
                        Mensagem: errorMessage,
                    });
                }
            } else {
                // Case 3: Document doesn't exist yet.
                results.push({
                    CPF: cpf,
                    Saldo: 'N/A',
                    Mensagem: 'Aguardando resposta do webhook...',
                });
            }
        } catch (error) {
             results.push({
                CPF: cpf,
                Saldo: 'N/A',
                Mensagem: 'Erro ao consultar resultado no Firestore.',
            });
        }
    }

    // Create an Excel file with the results
    const worksheet = XLSX.utils.json_to_sheet(results);
    // Set column widths
    worksheet['!cols'] = [
        { wch: 15 }, // CPF
        { wch: 15 }, // Saldo
        { wch: 70 }, // Mensagem
    ];
    // Format Saldo column as currency
    results.forEach((_, index) => {
        const cellRef = XLSX.utils.encode_cell({c: 1, r: index + 1});
        if (worksheet[cellRef] && typeof worksheet[cellRef].v === 'number') {
            worksheet[cellRef].z = '"R$"#,##0.00';
        }
    });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Resultados FGTS');

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    const base64String = buffer.toString('base64');
    
    const date = new Date(createdAt);
    const formattedDate = date.toLocaleDateString('pt-BR').replace(/\//g, '-');
    const formattedTime = date.toTimeString().split(' ')[0].replace(/:/g, '-');
    const fileName = `HIGIENIZACAO_${originalFileName.replace(/\.xlsx?$/i, '')}_${formattedDate}_${formattedTime}.xlsx`;

    const fileContent = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64String}`;

    return {
        status: 'success',
        fileName,
        fileContent,
        message: 'Relatório gerado com sucesso.',
    };
}
