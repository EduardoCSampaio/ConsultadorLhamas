
import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
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
    
    const v8Partner = payload.provider || 'qi'; // Default to 'qi' if not provided
    const batchId = payload.batchId; // Extract batchId if present

    const docRef = db.collection('webhookResponses').doc(docId.toString());

    const errorMessage = payload.errorMessage || payload.error || payload.message;
    const isError = !!errorMessage;
    const isSuccess = payload.balance !== undefined && payload.balance !== null;

    let status: 'received' | 'error' | 'success' = 'received';
    let statusMessage: string = 'Webhook payload successfully stored in Firestore via Admin SDK.';

    if (isError) {
        status = 'error';
        statusMessage = `Webhook received with error: ${errorMessage}`;
    } else if (isSuccess) {
        status = 'success';
        statusMessage = 'Webhook payload with balance successfully stored.';
    }

    const dataToSet = {
      responseBody: payload,
      createdAt: FieldValue.serverTimestamp(),
      status: status,
      message: statusMessage,
      id: docId.toString(),
      provider: "V8DIGITAL",
      v8Provider: v8Partner,
      ...(batchId && { batchId: batchId }), // Conditionally add batchId
    };

    await docRef.set(dataToSet, { merge: true });

    console.log(`Payload stored in Firestore with ID: ${docId}. Status: ${status}. Provider: V8DIGITAL (${v8Partner})`);
    
    // If the webhook is part of a batch, update the batch progress
    if (batchId) {
        const batchRef = db.collection('batches').doc(batchId);
        const batchDoc = await batchRef.get();
        if (batchDoc.exists) {
            const batchData = batchDoc.data()!;
            const newProcessedCount = (batchData.processedCpfs || 0) + 1;
            
            const updateData: any = {
                processedCpfs: newProcessedCount
            };
            
            // If all CPFs are processed, mark the batch as completed
            if (newProcessedCount >= batchData.totalCpfs) {
                updateData.status = 'completed';
                updateData.message = 'Processamento concluído via webhooks.';
                updateData.completedAt = FieldValue.serverTimestamp();
            }
            
            await batchRef.update(updateData);
            console.log(`[Batch ${batchId}] Progress updated. Processed count: ${newProcessedCount}/${batchData.totalCpfs}`);
        } else {
            console.warn(`[Webhook] Received payload for batchId ${batchId}, but batch document was not found.`);
        }
    }


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
