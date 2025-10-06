
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

/**
 * Inicia uma consulta de saldo FGTS. A resposta será enviada para o webhook configurado.
 * @param input Objeto contendo documentNumber e provider.
 * @returns A resposta da API de início de consulta.
 */
export async function consultarSaldoFgts(input: z.infer<typeof actionSchema>) {
  const validation = actionSchema.safeParse(input);

  if (!validation.success) {
    throw new Error('Dados de entrada inválidos.');
  }

  try {
    // 1. Obter o token de autenticação
    const authToken = await getAuthToken();

    // 2. Iniciar a consulta de saldo FGTS
    const { documentNumber, provider } = validation.data;
    
    const API_URL_CONSULTA = 'https://bff.v8sistema.com/fgts/balance'; 

    console.log(`[V8 API] Iniciando consulta... Endpoint: ${API_URL_CONSULTA}, Corpo: ${JSON.stringify({ documentNumber, provider })}`);

    const consultaResponse = await fetch(API_URL_CONSULTA, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`, 
      },
      body: JSON.stringify({
        documentNumber: documentNumber,
        provider: provider,
      }),
      // @ts-ignore - Required for some environments to handle POST requests correctly
      duplex: 'half',
    });

    // A resposta pode não ter corpo, mas o status HTTP é crucial.
    if (consultaResponse.status === 202 || consultaResponse.status === 200) {
        let data;
        try {
            data = await consultaResponse.json();
        } catch (e) {
            // Se não houver corpo JSON (ex: resposta 202 Accepted vazia), consideramos sucesso.
            console.log("[V8 API] Consulta aceita com sucesso (resposta sem corpo JSON).");
            return {
                status: "pending",
                message: "Consulta de saldo iniciada. O resultado será enviado para o webhook.",
                initialResponse: {},
            };
        }

        // Se houver corpo, mas for nulo/vazio, lançamos um erro claro.
        if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
            throw new Error("A API parceira (V8) não iniciou a consulta. A resposta foi vazia. Por favor, contate o suporte da V8.");
        }
        
        console.log("[V8 API] Consulta iniciada com sucesso, resposta:", data);
        return {
          status: "pending",
          message: "Consulta de saldo iniciada. O resultado será enviado para o webhook.",
          initialResponse: data,
        };
    } else {
        // Tratar erros HTTP
        let errorMessage = `Erro ao iniciar consulta: ${consultaResponse.status} ${consultaResponse.statusText}.`;
        try {
            const errorData = await consultaResponse.json();
            console.error("[V8 API] Detalhes do erro JSON:", errorData); 
            errorMessage += ` Detalhes: ${errorData.message || JSON.stringify(errorData)}`;
        } catch(e) {
            errorMessage += ` Resposta: ${await consultaResponse.text()}`;
        }
        throw new Error(errorMessage);
    }

  } catch (error) {
    console.error('Erro ao chamar a API de consulta FGTS:', error);
    if (error instanceof Error) {
        throw new Error(error.message);
    }
    throw new Error('Ocorreu um erro de comunicação com a API.');
  }
}
