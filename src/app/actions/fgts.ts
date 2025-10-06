
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

// Função de autenticação aprimorada com tratamento de erro robusto
async function getAuthToken(): Promise<{token: string | null, error: string | null}> {
  const tokenUrl = 'https://auth.v8sistema.com/oauth/token';
  const params = new URLSearchParams({
    grant_type: 'password',
    username: process.env.V8_USERNAME!,
    password: process.env.V8_PASSWORD!,
    audience: process.env.V8_AUDIENCE!,
    scope: 'offline_access',
    client_id: process.env.V8_CLIENT_ID!,
  });

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const data = await response.json();

    // Validação explícita do access_token na resposta
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
  
  // Etapa 1: Autenticação
  const { token, error: tokenError } = await getAuthToken();

  if (tokenError) {
    // Retorna o erro vindo diretamente da função de autenticação
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
      body: JSON.stringify({ 
        documentNumber, 
        provider // Enviando o provedor como recebido (minúsculas)
      }),
      // @ts-ignore - Propriedade necessária para alguns ambientes Node.js
      duplex: 'half',
    });
    
    // A API V8 pode retornar 200 OK com corpo vazio ou nulo mesmo em caso de erro lógico.
    // Portanto, não podemos confiar apenas em `consultaResponse.ok`.
    const responseBody = await consultaResponse.text();
    let data = null;

    try {
      // Tenta parsear o JSON apenas se o corpo não for vazio.
      if (responseBody) {
        data = JSON.parse(responseBody);
      }
    } catch (e) {
      // Se a resposta não for um JSON válido, é um erro.
      return { 
          status: 'error', 
          stepIndex: 1, 
          message: `A API parceira retornou uma resposta inesperada (não-JSON). Resposta: ${responseBody}` 
      };
    }
      
    // Se, após o parse, `data` for nulo ou um objeto vazio, consideramos um erro,
    // pois a V8 não iniciou a consulta.
    if (data === null || (typeof data === 'object' && Object.keys(data).length === 0 && responseBody.trim() !== '{}')) {
        // Se a resposta HTTP não foi OK, usamos o status para montar a mensagem.
        if (!consultaResponse.ok) {
             let errorMessage = `Erro ao enviar consulta: ${consultaResponse.status} ${consultaResponse.statusText}.`;
             try {
                 // Tenta obter mais detalhes do corpo, se houver
                 const errorData = JSON.parse(responseBody);
                 errorMessage += ` Detalhes: ${errorData.message || JSON.stringify(errorData)}`;
             } catch(e) {
                 errorMessage += ` Resposta: ${responseBody}`;
             }
             return { status: 'error', stepIndex: 1, message: errorMessage };
        }
       
        // Se a resposta HTTP foi OK, mas o corpo é nulo/vazio.
        return { 
            status: 'error', 
            stepIndex: 1, 
            message: "A API parceira aceitou a requisição, mas não iniciou a consulta (resposta vazia). Verifique as credenciais ou contate o suporte da V8." 
        };
    }
    
    // Se chegamos aqui, a resposta é um JSON válido e não vazio.
    return { 
        status: 'success', 
        stepIndex: 1, 
        message: 'Consulta de saldo iniciada. Aguardando o resultado via webhook.' 
    };

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ocorreu um erro de comunicação com a API.';
    return { status: 'error', stepIndex: 1, message };
  }
}

