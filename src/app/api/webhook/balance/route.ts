
import { NextRequest, NextResponse } from 'next/server';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { initializeFirebaseAdmin } from '@/firebase/server-init';

/**
 * Handles POST requests from the V8 API balance webhook.
 * V8 may send a request to validate the URL and then to send results.
 */
export async function POST(request: NextRequest) {
  try {
    // Initialize Firebase within the request handler for serverless environments.
    const { firestore: db } = initializeFirebaseAdmin();
    
    const payload = await request.json();

    console.log("--- Balance Webhook Received ---");
    console.log("Headers:", Object.fromEntries(request.headers));
    console.log("Body (Payload):", JSON.stringify(payload, null, 2));

    // The most reliable identifier is the documentNumber (CPF) from the payload.
    // Let's ensure we use that as the document ID.
    const docId = payload.documentNumber || payload.id;

    if (!docId) {
      console.error("Error: Webhook payload is missing 'documentNumber' or 'id'. Cannot create document.");
      return NextResponse.json({
        status: 'error',
        message: 'Payload missing required identifier (documentNumber or id).',
      }, { status: 400 });
    }

    // Create a reference to the document in the 'webhookResponses' collection.
    const docRef = doc(db, 'webhookResponses', docId.toString());

    // Save the webhook payload to Firestore.
    await setDoc(docRef, {
      responseBody: payload,
      createdAt: serverTimestamp(),
      status: 'received',
      message: 'Webhook payload successfully stored in Firestore.',
      id: docId.toString(), // Also save the ID inside the document for reference
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
