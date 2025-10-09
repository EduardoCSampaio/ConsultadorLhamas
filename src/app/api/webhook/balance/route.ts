
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
        
        try {
             // Transaction to safely increment the processed count.
            await db.runTransaction(async (transaction) => {
                const batchDoc = await transaction.get(batchRef);
                if (!batchDoc.exists) {
                    console.warn(`[Webhook Transaction] Batch document ${batchId} not found.`);
                    return;
                }
                 // Only increment. Don't do any other logic inside the transaction.
                transaction.update(batchRef, { processedCpfs: FieldValue.increment(1) });
            });

             // After the transaction, read the updated document to check for completion.
            const updatedBatchDoc = await batchRef.get();
            if (updatedBatchDoc.exists) {
                const batchData = updatedBatchDoc.data()!;
                console.log(`[Batch ${batchId}] Progress updated. Processed count: ${batchData.processedCpfs}/${batchData.totalCpfs}`);
                
                 // If the batch is now complete, update its status.
                if (batchData.processedCpfs >= batchData.totalCpfs && batchData.status !== 'completed') {
                    console.log(`[Batch ${batchId}] All CPFs processed. Marking as complete.`);
                    await batchRef.update({
                        status: 'completed',
                        message: 'Processamento concluído via webhooks.',
                        completedAt: FieldValue.serverTimestamp(),
                    });
                }
            }
        } catch (e) {
            console.error(`[Batch ${batchId}] Failed to update batch progress: `, e);
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
