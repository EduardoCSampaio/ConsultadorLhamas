
import { NextRequest, NextResponse } from 'next/server';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { firebaseConfig } from '@/firebase/config';

// Helper para inicializar o Firebase no lado do cliente (adequado para /api routes)
function initializeFirebaseClient() {
  if (getApps().length) {
    return getApp();
  }
  return initializeApp(firebaseConfig);
}

/**
 * Handles POST requests from the V8 API balance webhook.
 * This endpoint now uses the Client SDK and authenticates anonymously
 * to ensure it has permissions to write to Firestore based on security rules.
 * It also handles webhook validation requests with empty bodies.
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    console.log("--- Balance Webhook Received ---");
    console.log("Headers:", Object.fromEntries(request.headers));
    console.log("Body (Payload):", JSON.stringify(payload, null, 2));

    // O identificador mais confiável é o documentNumber (CPF) do payload.
    const docId = payload.documentNumber || payload.id;

    if (!docId) {
      // This is likely a test/validation request from V8 with an empty body.
      // We respond with 200 OK to pass their validation check.
      console.log("Webhook validation request received (empty or invalid body). Responding 200 OK.");
      return NextResponse.json({
        status: 'success',
        message: 'Webhook test successful. Endpoint is active.',
      }, { status: 200 });
    }
    
    // If we have a docId, proceed to write to Firestore.
    const app = initializeFirebaseClient();
    const db = getFirestore(app);
    const auth = getAuth(app);
    
    // Etapa 1: Autenticar como um serviço anônimo para ter permissão de escrita
    await signInAnonymously(auth);
    console.log("Webhook endpoint authenticated anonymously to write data.");

    // Criar uma referência para o documento na coleção 'webhookResponses'.
    const docRef = doc(db, 'webhookResponses', docId.toString());

    // Salvar o payload do webhook no Firestore.
    await setDoc(docRef, {
      responseBody: payload,
      createdAt: serverTimestamp(),
      status: 'received',
      message: 'Webhook payload successfully stored in Firestore.',
      id: docId.toString(), // Salvar o ID também dentro do documento
    }, { merge: true });

    console.log(`Payload stored in Firestore with ID: ${docId}`);

    return NextResponse.json({ 
        status: 'success', 
        message: 'Webhook received and processed successfully.' 
    }, { status: 200 });

  } catch (error: any) {
    // Handle JSON parsing errors, which can happen with empty bodies.
    if (error instanceof SyntaxError && error.message.includes('Unexpected end of JSON input')) {
        console.log("Webhook validation request received (empty body). Responding 200 OK.");
        return NextResponse.json({
            status: 'success',
            message: 'Webhook test successful. Endpoint is active.',
        }, { status: 200 });
    }

    console.error("Error processing webhook:", error);
    let errorMessage = "Unknown error";
    if (error instanceof Error) {
        errorMessage = error.message;
    }
    return NextResponse.json({ 
        status: 'error', 
        message: 'Internal error processing webhook.',
        details: errorMessage,
    }, { status: 500 });
  }
}
