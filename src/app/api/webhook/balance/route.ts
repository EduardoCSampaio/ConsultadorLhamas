
import { NextRequest, NextResponse } from 'next/server';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';

// Initialize Firebase Admin
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/**
 * Handles POST requests from the V8 API balance webhook.
 * V8 may send a request to validate the URL and then to send results.
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    console.log("--- Balance Webhook Received ---");
    console.log("Headers:", Object.fromEntries(request.headers));
    console.log("Body (Payload):", JSON.stringify(payload, null, 2));

    // For now, we assume the payload contains a unique identifier 
    // that we can use as the document ID. Let's assume it's `payload.id`
    // or a transaction ID. If not available, we might need to generate one
    // or use the documentNumber (CPF) if it's unique per user request.
    const docId = payload.id || payload.documentNumber || new Date().getTime().toString();

    // Create a reference to the document in the 'webhookResponses' collection.
    const docRef = doc(db, 'webhookResponses', docId);

    // Save the webhook payload to Firestore.
    await setDoc(docRef, {
      responseBody: payload,
      createdAt: serverTimestamp(),
      status: 'received',
      message: 'Webhook payload successfully stored in Firestore.'
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
