
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

// Função de autenticação alinhada com a documentação oficial da V8
async function getAuthToken(): Promise<{token: string | null, error: string | null}> {
  // CORREÇÃO: URL de autenticação corrigida para o host correto da documentação.
  const tokenUrl = 'https://auth.v8sistema.com/oauth/token';

  // CORREÇÃO: A API de autenticação exige 'application/x-www-form-urlencoded'.
  const bodyPayload = new URLSearchParams({
    grant_type: 'password',
    username: process.env.V8_USERNAME || '',
    password: process.env.V8_PASSWORD || '',
    audience: process.env.V8_AUDIENCE || '',
    scope: 'offline_access',
    client_id: process.env.V8_CLIENT_ID || '',
  });

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bodyPayload.toString(),
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
  
  // CORREÇÃO: Enviando o provider em minúsculas, conforme o erro 400 indica.
  const requestBody = { documentNumber, provider };

  try {
    const consultaResponse = await fetch(API_URL_CONSULTA, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
    });
    
    // CORREÇÃO: A documentação diz que a resposta de sucesso para o POST é `null` ou vazia.
    // Qualquer coisa diferente de um status 2xx é um erro.
    if (!consultaResponse.ok) {
        const responseBody = await consultaResponse.text();
        let errorDetails = responseBody;
        try {
            // Tenta parsear para pegar uma mensagem de erro mais detalhada
            const errorJson = JSON.parse(responseBody);
            errorDetails = errorJson.error || errorJson.message || responseBody;
        } catch (e) {
            // ignora se não for JSON
        }
        const errorMessage = `Erro ao enviar consulta: ${consultaResponse.status} ${consultaResponse.statusText}. Detalhes: ${errorDetails}`;
        return { status: 'error', stepIndex: 1, message: errorMessage };
    }
   
    // Se a resposta for OK (2xx), consideramos que a consulta foi iniciada.
    return { 
        status: 'success', 
        stepIndex: 1, 
        message: 'Consulta de saldo iniciada com sucesso. Aguardando o resultado via webhook.' 
    };

  } catch (error) {
    console.error("[V8 API] Erro de comunicação na consulta de saldo:", error);
    const message = error instanceof Error ? error.message : 'Ocorreu um erro de comunicação com a API.';
    return { status: 'error', stepIndex: 1, message };
  }
}
