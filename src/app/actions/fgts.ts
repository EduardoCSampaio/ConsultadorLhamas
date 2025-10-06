
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

  const params = new URLSearchParams();
  params.append('grant_type', 'password');
  params.append('username', process.env.V8_USERNAME!);
  params.append('password', process.env.V8_PASSWORD!);
  params.append('audience', process.env.V8_AUDIENCE!);
  params.append('scope', 'offline_access');
  params.append('client_id', process.env.V8_CLIENT_ID!);

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Erro de autenticação V8:', errorText);
    throw new Error(`Falha na autenticação com a V8: ${response.status} ${response.statusText}. Resposta: ${errorText}`);
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
    
    const API_URL_CONSULTA = 'https://bff.v8sistema.com/fgts/balance'; 

    const requestBody = {
      documentNumber: documentNumber,
      provider: provider, // Usar o valor do provider diretamente (cartos, bms, qi)
    };

    console.log(`[V8 API] Consultando... Endpoint: ${API_URL_CONSULTA}, Corpo da Requisição: ${JSON.stringify(requestBody)}`);

    const consultaResponse = await fetch(API_URL_CONSULTA, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`, 
      },
      body: JSON.stringify(requestBody),
    });

    if (!consultaResponse.ok) {
        const errorText = await consultaResponse.text();
        console.error("Erro na API de consulta:", errorText);

        let errorMessage = `Erro na API de consulta: ${consultaResponse.status} ${consultaResponse.statusText}.`;
        try {
            const errorJson = JSON.parse(errorText);
            errorMessage += ` Detalhes: ${errorJson.message || JSON.stringify(errorJson)}`;
        } catch(e) {
            errorMessage += ` Resposta: ${errorText}`;
        }
        throw new Error(errorMessage);
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
