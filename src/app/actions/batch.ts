
'use server';

import { z } from 'zod';
import { consultarSaldoFgts } from './fgts';
import * as XLSX from 'xlsx';
import { initializeFirebaseAdmin } from '@/firebase/server-init';
import { getFirestore } from 'firebase-admin/firestore';

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
 * Action to initiate batch processing. It loops through CPFs and starts
 * the balance query for each one. This is fire-and-forget.
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

  const { cpfs, provider } = validation.data;
  let successCount = 0;

  // We don't await the whole loop, just each call to keep them in sequence
  // but we don't wait for the webhook response.
  for (const cpf of cpfs) {
    const result = await consultarSaldoFgts({ documentNumber: cpf, provider });
    if (result.status === 'success') {
      successCount++;
    }
    // Small delay to avoid overwhelming the API
    await new Promise(resolve => setTimeout(resolve, 200));
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
                
                // Case 1: Success - We have a balance.
                if (data?.status === 'success' && responseBody && responseBody.balance !== undefined && responseBody.balance !== null) {
                    results.push({
                        CPF: cpf,
                        Saldo: parseFloat(responseBody.balance),
                        Mensagem: 'Sucesso',
                    });
                } 
                // Case 2: Error - The webhook explicitly marked it as an error.
                else if (data?.status === 'error' && responseBody) {
                    const errorMessage = responseBody.errorMessage || responseBody.error || data.message || "Erro retornado pelo webhook.";
                    results.push({
                        CPF: cpf,
                        Saldo: 'N/A',
                        Mensagem: `Erro: ${errorMessage}`,
                    });
                }
                // Case 3: Fallback for other non-success/non-error states, or invalid data.
                else {
                    results.push({
                        CPF: cpf,
                        Saldo: 'N/A',
                        Mensagem: 'Resposta inválida ou incompleta do webhook.',
                    });
                }
            } else {
                // Case 4: Document not created yet.
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
