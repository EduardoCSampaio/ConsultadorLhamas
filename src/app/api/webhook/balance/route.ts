
import { NextRequest, NextResponse } from 'next/server';
import { firestore } from '@/firebase/server-init';
import { FieldValue } from 'firebase-admin/firestore';


/**
 * Handles POST requests from the V8 API balance webhook.
 * This endpoint now uses the Admin SDK to write directly to Firestore,
 * bypassing client-side security rules and not interfering with user auth sessions.
 */
export async function POST(request: NextRequest) {
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
    
    const docRef = firestore.collection('webhookResponses').doc(docId.toString());

    // Before writing, let's see if we can find a batchId from a pre-existing doc.
    let batchId: string | undefined = payload.batchId;
    let userId: string | undefined;

    const existingDoc = await docRef.get();
    if (existingDoc.exists) {
        const existingData = existingDoc.data();
        if (!batchId) batchId = existingData?.batchId;
        if (!userId) userId = existingData?.userId;
    }

    const v8Partner = payload.provider || 'qi';
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

    const dataToSet: any = {
      responseBody: payload,
      updatedAt: FieldValue.serverTimestamp(), // Use a different field to avoid overwriting createdAt
      status: status,
      message: statusMessage,
      id: docId.toString(),
      provider: "V8DIGITAL",
      v8Provider: v8Partner,
      ...(batchId && { batchId: batchId }),
    };
    if (userId) {
        dataToSet.userId = userId;
    }


    await docRef.set(dataToSet, { merge: true });

    console.log(`Payload stored in Firestore with ID: ${docId}. Status: ${status}. Provider: V8DIGITAL (${v8Partner})`);
    
    if (batchId) {
        const batchRef = firestore.collection('batches').doc(batchId);
        try {
            await firestore.runTransaction(async (transaction) => {
                const batchDoc = await transaction.get(batchRef);
                if (!batchDoc.exists) {
                    console.warn(`[Webhook Transaction] Batch document ${batchId} not found.`);
                    return;
                }
                const batchData = batchDoc.data()!;
                if (batchData.status === 'completed') {
                    console.log(`[Batch ${batchId}] Already completed. Ignoring webhook update.`);
                    return;
                }

                const newProcessedCount = (batchData.processedCpfs || 0) + 1;
                const updates: any = { processedCpfs: newProcessedCount };

                if (newProcessedCount >= batchData.totalCpfs) {
                    console.log(`[Batch ${batchId}] Final CPF received. Marking as complete.`);
                    updates.status = 'completed';
                    updates.message = 'Processamento concluído via webhooks.';
                    updates.completedAt = FieldValue.serverTimestamp();
                    
                }

                transaction.update(batchRef, updates);
            });
             console.log(`[Batch ${batchId}] Progress transaction completed successfully.`);
        } catch (e) {
            console.error(`[Batch ${batchId}] Failed to update batch progress transaction: `, e);
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

  