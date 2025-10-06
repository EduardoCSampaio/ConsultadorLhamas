
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

async function getAuthToken(): Promise<{token: string | null, error: string | null}> {
  const tokenUrl = 'https://auth.v8sistema.com/oauth/token';

  const params = new URLSearchParams();
  params.append('grant_type', 'password');
  params.append('username', process.env.V8_USERNAME!);
  params.append('password', process.env.V8_PASSWORD!);
  params.append('audience', process.env.V8_AUDIENCE!);
  params.append('scope', 'offline_access');
  params.append('client_id', process.env.V8_CLIENT_ID!);

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { token: null, error: `Falha na autenticação com a V8: ${response.status} ${response.statusText}. Detalhes: ${errorText}` };
    }

    const data = await response.json();
    return { token: data.access_token, error: null };
  } catch (error) {
    return { token: null, error: 'Erro de comunicação ao tentar autenticar com a API parceira.' };
  }
}

export async function consultarSaldoFgts(input: z.infer<typeof actionSchema>): Promise<ActionResult> {
  const validation = actionSchema.safeParse(input);

  if (!validation.success) {
    return { status: 'error', stepIndex: 0, message: 'Dados de entrada inválidos.' };
  }
  
  // Etapa 1: Autenticação
  const { token, error: tokenError } = await getAuthToken();

  if (tokenError) {
    return { status: 'error', stepIndex: 0, message: tokenError };
  }

  // Etapa 2: Iniciar a consulta de saldo
  const { documentNumber, provider } = validation.data;
  const API_URL_CONSULTA = 'https://bff.v8sistema.com/fgts/balance';

  try {
    const consultaResponse = await fetch(API_URL_CONSULTA, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`, 
      },
      body: JSON.stringify({ documentNumber, provider }),
      // @ts-ignore
      duplex: 'half',
    });
    
    // Resposta bem-sucedida, mas precisamos verificar o corpo
    if (consultaResponse.ok) { // Usa .ok para abranger status 200-299
      
      const textBody = await consultaResponse.text();
      let data = null;
      try {
        if (textBody) {
          data = JSON.parse(textBody);
        }
      } catch (e) {
        // Corpo não é JSON, o que pode ser um problema
         return { 
            status: 'error', 
            stepIndex: 1, 
            message: `A API parceira retornou uma resposta inesperada (não-JSON). Resposta: ${textBody}` 
        };
      }
      
      // Se a resposta for vazia ou nula, tratamos como erro de processamento na V8
      if (data === null || (typeof data === 'object' && Object.keys(data).length === 0 && textBody.trim() !== '{}')) {
         return { 
              status: 'error', 
              stepIndex: 1, 
              message: "A API parceira aceitou a requisição, mas não iniciou a consulta (resposta vazia). Verifique as credenciais ou contate o suporte da V8." 
          };
      }
      
      // Sucesso, a consulta foi iniciada
      return { 
          status: 'success', 
          stepIndex: 1, 
          message: 'Consulta de saldo iniciada. Aguardando o resultado via webhook.' 
      };

    } else {
      // Tratar erros HTTP
      let errorMessage = `Erro ao enviar consulta: ${consultaResponse.status} ${consultaResponse.statusText}.`;
      try {
          const errorData = await consultaResponse.json();
          errorMessage += ` Detalhes: ${errorData.message || JSON.stringify(errorData)}`;
      } catch(e) {
          errorMessage += ` Resposta: ${await consultaResponse.text()}`;
      }
      return { status: 'error', stepIndex: 1, message: errorMessage };
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ocorreu um erro de comunicação com a API.';
    return { status: 'error', stepIndex: 1, message };
  }
}
