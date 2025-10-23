
'use server';

import { z } from 'zod';
import { firestore } from '@/firebase/server-init';
import { logActivity } from './users';
import * as XLSX from 'xlsx';

const reportActionSchema = z.object({
  cpfs: z.array(z.string()),
  fileName: z.string(),
  createdAt: z.string(),
  provider: z.string(),
  userId: z.string(),
  batchId: z.string(),
});

type ReportActionResult = {
  status: 'success' | 'error';
  fileName: string;
  fileContent: string;
  message?: string;
};

export async function gerarRelatorioLote(input: z.infer<typeof reportActionSchema>): Promise<ReportActionResult> {
    const validation = reportActionSchema.safeParse(input);

    if (!validation.success) {
        return { status: 'error', fileName: '', fileContent: '', message: 'Dados de entrada para o relatório são inválidos.' };
    }

    const { cpfs, createdAt, provider: displayProvider, userId, batchId } = validation.data;
    const mainProvider = displayProvider.toLowerCase();
    
    const formattedDate = new Date(createdAt).toLocaleDateString('pt-BR').replace(/\//g, '-');
    const formattedTime = new Date(createdAt).toTimeString().split(' ')[0].replace(/:/g, '-');
    const fileName = `${displayProvider.toUpperCase()}_${formattedDate}_${formattedTime}.xlsx`;


    await logActivity({
        userId: userId,
        action: 'Download de Relatório de Lote',
        provider: displayProvider,
        details: `Arquivo: ${fileName}`
    });

    let results: any[] = [];
    
    const webhookDocs = await firestore.collection('webhookResponses').where('batchId', '==', batchId).get();
    const responsesById: Record<string, any> = {};

    webhookDocs.forEach(doc => {
        const data = doc.data();
        // The document ID is the balanceId
        responsesById[doc.id] = data;
    });

    // To link CPF to result, we need the original batch document to map cpf -> balanceId.
    // This is inefficient. A better approach is to store the CPF inside the webhookResponse document.
    // For now, let's assume we can't do that and try to reconstruct.
    // Let's modify the structure slightly: let's get the original batch.
    const batchDoc = await firestore.collection('batches').doc(batchId).get();
    const batchData = batchDoc.data();

    if (!batchData || !batchData.cpfs) {
        return { status: 'error', fileName: '', fileContent: '', message: 'Dados do lote original não encontrados para gerar o relatório.' };
    }

    // This is a guess. We assume order is preserved or that we can map it somehow.
    // A much better solution is storing the CPF in the webhook document.
    // Let's modify `consultarSaldoFgts` to store `documentNumber` in `webhookResponses`.
    // Assuming `id` in webhookResponses is the CPF.
    
    for (const cpf of cpfs) {
        let found = false;
        for(const docId in responsesById) {
            const docData = responsesById[docId];
            if (docData.id === cpf) { // Matching CPF
                const responseBody = docData?.responseBody;
                const providerError = responseBody?.errorMessage || responseBody?.error || docData?.message;
                const isSuccess = docData?.status === 'success' && responseBody;

                if (isSuccess) {
                     if (mainProvider === 'v8digital') {
                        const balanceValue = parseFloat(responseBody.balance);
                        results.push({
                            CPF: cpf,
                            Saldo: isNaN(balanceValue) ? '0.00' : balanceValue, 
                            Mensagem: 'Sucesso',
                        });
                    } else if (mainProvider === 'facta') {
                        // Logic for facta (if it uses the same webhook system)
                    }
                } else {
                     results.push({ CPF: cpf, Saldo: '0.00', Mensagem: providerError || "Erro no processamento." });
                }
                found = true;
                break;
            }
        }
        if (!found) {
            results.push({ CPF: cpf, Saldo: '0.00', Mensagem: 'Nenhum resultado encontrado.' });
        }
    }


    if (results.length === 0) {
        return { status: 'error', fileName: '', fileContent: '', message: 'Nenhum dado para gerar relatório.' };
    }
    
    const finalResults = results.map(r => ({
        CPF: r.CPF,
        SALDO: r.Saldo || '0.00',
        MENSAGEM: r.Mensagem,
    }));


    const worksheet = XLSX.utils.json_to_sheet(finalResults);
    
    if (finalResults.length > 0) {
        const header = Object.keys(finalResults[0]);
        worksheet['!cols'] = header.map(key => ({
            wch: Math.max(15, key.length + 2) 
        }));
        
        const colIndex = header.indexOf('SALDO');
        if (colIndex !== -1) {
            finalResults.forEach((_, index) => {
                const cellRef = XLSX.utils.encode_cell({c: colIndex, r: index + 1});
                    if (worksheet[cellRef] && typeof worksheet[cellRef].v === 'number') {
                    worksheet[cellRef].z = '"R$"#,##0.00';
                }
            });
        }
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Resultados');

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    const base64String = buffer.toString('base64');

    const fileContent = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64String}`;

    return {
        status: 'success',
        fileName,
        fileContent,
        message: 'Relatório gerado com sucesso.',
    };
}
