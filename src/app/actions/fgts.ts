'use server';

import { z } from 'zod';

// Schema para validação dos dados de entrada da action
const actionSchema = z.object({
  documentNumber: z.string(),
  provider: z.enum(["cartos", "bms", "qi"]),
});

/**
 * Obtém o token de autenticação da API da V8.
 * @returns O token de acesso.
 */
async function getAuthToken() {
  const tokenUrl = 'https://auth.v8sistema.com/oauth/token';

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'password',
      username: process.env.V8_USERNAME,
      password: process.env.V8_PASSWORD,
      audience: process.env.V8_AUDIENCE,
      scope: 'offline_access',
      client_id: process.env.V8_CLIENT_ID,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ message: 'Erro ao obter token de autenticação.' }));
    console.error('Erro de autenticação V8:', errorBody);
    throw new Error(`Falha na autenticação com a V8: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.access_token;
}

export async function consultarSaldoFgts(input: z.infer<typeof actionSchema>) {
  const validation = actionSchema.safeParse(input);

  if (!validation.success) {
    throw new Error('Dados de entrada inválidos.');
  }

  try {
    // 1. Obter o token de autenticação
    const authToken = await getAuthToken();

    // 2. Realizar a consulta de saldo FGTS usando o token
    const { documentNumber, provider } = validation.data;
    
    // =================================================================
    // AQUI VOCÊ DEVE INSERIR A URL DA SUA API DE CONSULTA DE SALDO
    // =================================================================
    const API_URL_CONSULTA = 'https://bff.v8sistema.com/seu/endpoint/de/consulta'; // <-- SUBSTITUA AQUI

    console.log(`Consultando CPF: ${documentNumber} no provedor: ${provider}`);

    const consultaResponse = await fetch(API_URL_CONSULTA, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`, 
      },
      body: JSON.stringify({
        cpf: documentNumber,
        provedor: provider, // ou como a API de consulta espera o provedor
      }),
    });

    if (!consultaResponse.ok) {
      const errorBody = await consultaResponse.json().catch(() => ({ message: 'Não foi possível obter detalhes do erro.' }));
      throw new Error(`Erro na API de consulta: ${consultaResponse.status} ${consultaResponse.statusText}. Detalhes: ${errorBody.message}`);
    }

    const data = await consultaResponse.json();
    
    return data;

  } catch (error) {
    console.error('Erro ao chamar a API de consulta FGTS:', error);
    if (error instanceof Error) {
        throw new Error(error.message);
    }
    throw new Error('Ocorreu um erro de comunicação com a API.');
  }
}
