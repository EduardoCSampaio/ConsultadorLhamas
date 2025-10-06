
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
 */
export async function POST(request: NextRequest) {
  const app = initializeFirebaseClient();
  const db = getFirestore(app);
  const auth = getAuth(app);

  try {
    // Etapa 1: Autenticar como um serviço anônimo para ter permissão de escrita
    // As regras do Firestore devem permitir a escrita para usuários autenticados.
    await signInAnonymously(auth);
    console.log("Webhook endpoint authenticated anonymously.");

    const payload = await request.json();

    console.log("--- Balance Webhook Received ---");
    console.log("Headers:", Object.fromEntries(request.headers));
    console.log("Body (Payload):", JSON.stringify(payload, null, 2));

    // O identificador mais confiável é o documentNumber (CPF) do payload.
    const docId = payload.documentNumber || payload.id;

    if (!docId) {
      console.error("Error: Webhook payload is missing 'documentNumber' or 'id'. Cannot create document.");
      return NextResponse.json({
        status: 'error',
        message: 'Payload missing required identifier (documentNumber or id).',
      }, { status: 400 });
    }

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

  } catch (error) {
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
