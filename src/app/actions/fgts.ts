
'use server';

import { z } from 'zod';

const actionSchema = z.object({
  documentNumber: z.string(),
  provider: z.enum(["cartos", "bms", "qi"]),
});

type ActionResult = {
  status: 'success' | 'error';
  stepIndex: number;
  message: string;
};

// Função de autenticação aprimorada com tratamento de erro robusto e corpo JSON
async function getAuthToken(): Promise<{token: string | null, error: string | null}> {
  const tokenUrl = 'https://auth.v8sistema.com/oauth/token';
  const bodyPayload = {
    grant_type: 'password',
    username: process.env.V8_USERNAME,
    password: process.env.V8_PASSWORD,
    audience: process.env.V8_AUDIENCE,
    scope: 'offline_access',
    client_id: process.env.V8_CLIENT_ID,
  };

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload),
    });

    const data = await response.json();

    if (!response.ok || !data.access_token) {
      const errorMessage = data.error_description || data.error || JSON.stringify(data);
      console.error(`[V8 AUTH] Falha na autenticação: ${errorMessage}`);
      return { token: null, error: `Falha na autenticação com a V8: ${errorMessage}` };
    }

    return { token: data.access_token, error: null };
  } catch (error) {
    console.error('[V8 AUTH] Erro de comunicação ao tentar autenticar:', error);
    return { token: null, error: 'Erro de rede ao tentar autenticar com a API parceira.' };
  }
}

export async function consultarSaldoFgts(input: z.infer<typeof actionSchema>): Promise<ActionResult> {
  const validation = actionSchema.safeParse(input);

  if (!validation.success) {
    return { status: 'error', stepIndex: 0, message: 'Dados de entrada inválidos.' };
  }

  // ETAPA 0: Validação de Variáveis de Ambiente
  const requiredEnvVars = ['V8_USERNAME', 'V8_PASSWORD', 'V8_AUDIENCE', 'V8_CLIENT_ID'];
  for (const varName of requiredEnvVars) {
    if (!process.env[varName]) {
        const errorMessage = `A variável de ambiente ${varName} não está configurada no servidor.`;
        console.error(`[ENV CHECK] ${errorMessage}`);
        return { status: 'error', stepIndex: 0, message: errorMessage };
    }
  }
  
  // Etapa 1: Autenticação
  const { token, error: tokenError } = await getAuthToken();

  if (tokenError) {
    return { status: 'error', stepIndex: 0, message: tokenError };
  }

  // Etapa 2: Iniciar a consulta de saldo
  const { documentNumber, provider } = validation.data;
  const API_URL_CONSULTA = 'https://bff.v8sistema.com/fgts/balance';
  const requestBody = { documentNumber, provider };
  const requestBodyString = JSON.stringify(requestBody);

  try {
    const consultaResponse = await fetch(API_URL_CONSULTA, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(requestBodyString).toString(),
      },
      body: requestBodyString,
    });
    
    const responseBody = await consultaResponse.text();
    let data = null;

    try {
      if (responseBody) {
        data = JSON.parse(responseBody);
      }
    } catch (e) {
      return { 
          status: 'error', 
          stepIndex: 1, 
          message: `A API parceira retornou uma resposta inesperada (não-JSON). Resposta: ${responseBody}` 
      };
    }
      
    if (!consultaResponse.ok) {
        let errorMessage = `Erro ao enviar consulta: ${consultaResponse.status} ${consultaResponse.statusText}.`;
        if (data && data.error) {
            errorMessage += ` Detalhes: ${JSON.stringify(data.error)}`;
        } else if(responseBody) {
            errorMessage += ` Resposta: ${responseBody}`;
        }
        return { status: 'error', stepIndex: 1, message: errorMessage };
    }
   
    if (data === null || (typeof data === 'object' && Object.keys(data).length === 0 && responseBody.trim() !== '{}')) {
        return { 
            status: 'error', 
            stepIndex: 1, 
            message: "A API parceira aceitou a requisição, mas não iniciou a consulta (resposta vazia). Verifique as credenciais ou contate o suporte da V8." 
        };
    }
    
    return { 
        status: 'success', 
        stepIndex: 1, 
        message: 'Consulta de saldo iniciada. Aguardando o resultado via webhook.' 
    };

  } catch (error) {
    console.error("[V8 API] Erro de comunicação na consulta de saldo:", error);
    const message = error instanceof Error ? error.message : 'Ocorreu um erro de comunicação com a API.';
    return { status: 'error', stepIndex: 1, message };
  }
}
