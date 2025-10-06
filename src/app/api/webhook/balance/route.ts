
import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, serverTimestamp } from 'firebase-admin/firestore';
import { initializeFirebaseAdmin } from '@/firebase/server-init';

/**
 * Handles POST requests from the V8 API balance webhook.
 * This endpoint now uses the Admin SDK to write directly to Firestore,
 * bypassing client-side security rules and not interfering with user auth sessions.
 */
export async function POST(request: NextRequest) {
  // Initialize the Firebase Admin SDK
  initializeFirebaseAdmin();
  const db = getFirestore();

  try {
    const payload = await request.json();
    console.log("--- Balance Webhook Received (Admin SDK) ---");
    console.log("Headers:", Object.fromEntries(request.headers));
    console.log("Body (Payload):", JSON.stringify(payload, null, 2));

    const docId = payload.documentNumber || payload.id;

    if (!docId) {
      console.log("Webhook validation request received (empty or invalid body). Responding 200 OK.");
      return NextResponse.json({
        status: 'success',
        message: 'Webhook test successful. Endpoint is active.',
      }, { status: 200 });
    }
    
    const docRef = db.collection('webhookResponses').doc(docId.toString());

    // Check for error messages within the payload
    const errorMessage = payload.error || payload.errorMessage || payload.message;
    // An error is only considered a definitive failure if there is an error message AND no balance.
    const isError = !!errorMessage && payload.balance === undefined;

    await docRef.set({
      responseBody: payload,
      createdAt: serverTimestamp(),
      status: isError ? 'error' : 'received',
      message: isError ? `Webhook received with error: ${errorMessage}` : 'Webhook payload successfully stored in Firestore via Admin SDK.',
      id: docId.toString(),
    }, { merge: true });

    console.log(`Payload stored in Firestore with ID: ${docId}. Status: ${isError ? 'error' : 'received'}`);

    return NextResponse.json({ 
        status: 'success', 
        message: 'Webhook received and processed successfully.' 
    }, { status: 200 });

  } catch (error: any) {
    if (error instanceof SyntaxError && error.message.includes('Unexpected end of JSON input')) {
        console.log("Webhook validation request received (empty body). Responding 200 OK.");
        return NextResponse.json({
            status: 'success',
            message: 'Webhook test successful. Endpoint is active.',
        }, { status: 200 });
    }

    console.error("Error processing webhook with Admin SDK:", error);
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
