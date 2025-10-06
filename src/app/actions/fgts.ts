'use server';

import { z } from 'zod';

// Schema para validação dos dados de entrada da action
const actionSchema = z.object({
  documentNumber: z.string(),
  provider: z.enum(["cartos", "bms", "qi"]),
});

export async function consultarSaldoFgts(input: z.infer<typeof actionSchema>) {
  const validation = actionSchema.safeParse(input);

  if (!validation.success) {
    throw new Error('Dados de entrada inválidos.');
  }

  const { documentNumber, provider } = validation.data;

  // =================================================================
  // AQUI VOCÊ DEVE INSERIR A URL DA SUA API
  // =================================================================
  const API_URL = 'https://sua-api.com/endpoint/consulta-fgts'; 

  // =================================================================
  // AQUI VOCÊ DEVE INSERIR SUAS CREDENCIAIS/CHAVES DE API
  // Utilize variáveis de ambiente (.env.local) para segurança
  // =================================================================
  const API_KEY = process.env.SUA_API_KEY; 

  console.log(`Consultando CPF: ${documentNumber} no provedor: ${provider}`);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Exemplo de header de autorização, ajuste conforme sua API
        'Authorization': `Bearer ${API_KEY}`, 
      },
      body: JSON.stringify({
        cpf: documentNumber,
        provedor: provider,
      }),
    });

    if (!response.ok) {
      // Tenta extrair uma mensagem de erro do corpo da resposta
      const errorBody = await response.json().catch(() => ({ message: 'Não foi possível obter detalhes do erro.' }));
      throw new Error(`Erro na API: ${response.status} ${response.statusText}. Detalhes: ${errorBody.message}`);
    }

    const data = await response.json();
    
    // Retorna os dados da API para o componente cliente
    return data;

  } catch (error) {
    console.error('Erro ao chamar a API de consulta FGTS:', error);
    // Propaga o erro para ser tratado no componente do cliente
    if (error instanceof Error) {
        throw new Error(error.message);
    }
    throw new Error('Ocorreu um erro de comunicação com a API.');
  }
}
