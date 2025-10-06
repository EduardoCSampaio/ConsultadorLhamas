

'use server';

import { z } from 'zod';
import { consultarSaldoFgts } from './fgts';
import * as XLSX from 'xlsx';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { initializeFirebaseAdmin } from '@/firebase/server-init';

const processActionSchema = z.object({
  cpfs: z.array(z.string()),
  provider: z.enum(["cartos", "bms", "qi"]),
});

const reportActionSchema = z.object({
  cpfs: z.array(z.string()),
  provider: z.string(), // Provider is just for filename, not used in logic
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

    const { cpfs } = validation.data;
    const { firestore } = initializeFirebaseAdmin();
    
    const results: { CPF: string; Saldo: string | number; Mensagem: string }[] = [];

    for (const cpf of cpfs) {
        try {
            const docRef = doc(firestore, 'webhookResponses', cpf);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data().responseBody;
                if (data.balance !== undefined && data.balance !== null) {
                    results.push({
                        CPF: cpf,
                        Saldo: parseFloat(data.balance),
                        Mensagem: 'Sucesso',
                    });
                } else if (data.errorMessage) {
                     results.push({
                        CPF: cpf,
                        Saldo: 'N/A',
                        Mensagem: data.errorMessage,
                    });
                } else {
                    results.push({
                        CPF: cpf,
                        Saldo: 'N/A',
                        Mensagem: 'Resposta do webhook sem saldo ou erro.',
                    });
                }
            } else {
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
        if (worksheet[cellRef]) {
            worksheet[cellRef].z = '"R$"#,##0.00';
        }
    });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Resultados FGTS');

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    const base64String = buffer.toString('base64');
    
    const fileName = `Resultados_Lote_${new Date().toISOString().split('T')[0]}.xlsx`;
    const fileContent = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64String}`;

    return {
        status: 'success',
        fileName,
        fileContent,
        message: 'Relatório gerado com sucesso.',
    };
}
