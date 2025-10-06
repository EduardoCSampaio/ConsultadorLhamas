
'use server';

import { z } from 'zod';
import { consultarSaldoFgts } from './fgts';
import * as XLSX from 'xlsx';

const actionSchema = z.object({
  cpfs: z.array(z.string()),
  provider: z.enum(["cartos", "bms", "qi"]),
});

type ActionResult = {
  status: 'success' | 'error';
  fileName: string;
  fileContent: string;
  message?: string;
};

// Esta função simula a espera pelas respostas dos webhooks.
// Em um sistema real, isso seria muito mais complexo, envolvendo
// escutar mudanças no Firestore para cada CPF.
// Para este exemplo, vamos apenas chamar a função de consulta e
// registrar o resultado imediato da API (sucesso/erro ao iniciar).
export async function processarLoteFgts(input: z.infer<typeof actionSchema>): Promise<ActionResult> {
  const validation = actionSchema.safeParse(input);

  if (!validation.success) {
    return { 
        status: 'error', 
        fileName: '', 
        fileContent: '', 
        message: 'Dados de entrada inválidos.' 
    };
  }

  const { cpfs, provider } = validation.data;
  const results: { CPF: string; Status: string; Mensagem: string }[] = [];

  for (const cpf of cpfs) {
    // A consulta não aguarda o webhook, ela retorna se a SOLICITAÇÃO foi bem sucedida.
    const result = await consultarSaldoFgts({ documentNumber: cpf, provider });
    results.push({
      CPF: cpf,
      Status: result.status === 'success' ? 'Consulta Iniciada' : 'Falha ao Iniciar',
      Mensagem: result.message,
    });
  }

  // Criar um arquivo Excel com os resultados
  const worksheet = XLSX.utils.json_to_sheet(results);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Resultados');

  // Escrever o arquivo em um buffer e converter para Base64
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  const base64String = buffer.toString('base64');
  
  const fileName = `Resultados_Lote_${new Date().toISOString()}.xlsx`;
  const fileContent = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64String}`;

  return {
    status: 'success',
    fileName,
    fileContent,
    message: 'Processamento em lote finalizado. O arquivo de resultados está pronto para download.',
  };
}

    