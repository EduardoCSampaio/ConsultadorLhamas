
import { NextRequest, NextResponse } from 'next/server';

/**
 * Lida com as requisições POST do webhook de saldo da V8 API.
 * A V8 pode enviar uma requisição para validar a URL e depois para enviar os resultados.
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    console.log("--- Webhook de Saldo Recebido ---");
    console.log("Headers:", Object.fromEntries(request.headers));
    console.log("Corpo (Payload):", JSON.stringify(payload, null, 2));
    
    // A V8 pode enviar uma requisição de validação. 
    // Se o payload tiver uma estrutura específica de validação, você deve responder adequadamente.
    // Por enquanto, vamos apenas logar e retornar sucesso.
    // Ex: if (payload.type === 'webhook_validation') { ... }

    // TODO: Adicionar lógica para processar o resultado do saldo.
    // 1. Salvar o resultado no banco de dados associado ao CPF.
    // 2. Notificar o usuário no front-end (via WebSockets, Server-Sent Events, etc.)

    return NextResponse.json({ 
        status: 'success', 
        message: 'Webhook recebido com sucesso.' 
    }, { status: 200 });

  } catch (error) {
    console.error("Erro ao processar o webhook:", error);
    let errorMessage = "Erro desconhecido";
    if (error instanceof Error) {
        errorMessage = error.message;
    }
    return NextResponse.json({ 
        status: 'error', 
        message: 'Erro interno ao processar o webhook.',
        details: errorMessage,
    }, { status: 500 });
  }
}
