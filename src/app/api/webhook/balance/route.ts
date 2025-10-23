
import { NextRequest, NextResponse } from 'next/server';
import { firestore } from '@/firebase/server-init';
import { FieldValue } from 'firebase-admin/firestore';


/**
 * Handles GET requests to the webhook URL for validation purposes.
 * Some APIs will send a GET request to verify the endpoint is active.
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: 'success',
    message: 'Webhook endpoint is active and ready to receive POST requests.',
  }, { status: 200 });
}


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

    const consultationId = payload.consultationId;

    if (!consultationId) {
        if (!payload.documentNumber && !payload.id) {
            console.log("Webhook validation request received (empty or invalid body). Responding 200 OK.");
            return NextResponse.json({
                status: 'success',
                message: 'Webhook test successful. Endpoint is active.',
            }, { status: 200 });
        }
        
        console.error("Webhook payload missing 'consultationId'. Cannot process.", payload);
        return NextResponse.json({
            status: 'error',
            message: "Webhook payload is missing the required 'consultationId' field.",
        }, { status: 400 });
    }
    
    const docRef = firestore.collection('webhookResponses').doc(consultationId.toString());

    // 1. First, get the existing document to safely retrieve the batchId.
    const docSnapshot = await docRef.get();
    const existingData = docSnapshot.data();
    const batchId = existingData?.batchId;

    // 2. Prepare the update data for the webhook response document itself.
    const errorMessage = payload.errorMessage || payload.error || payload.message;
    const isError = !!errorMessage;
    const isSuccess = payload.balance !== undefined && payload.balance !== null;

    let status: 'received' | 'error' | 'success' = 'received';
    if (isError) status = 'error';
    else if (isSuccess) status = 'success';

    const dataToUpdate = {
        responseBody: payload,
        updatedAt: FieldValue.serverTimestamp(),
        status: status,
        message: isError ? `Webhook received with error: ${errorMessage}` : 'Webhook payload successfully stored.',
    };
    
    // 3. Update the webhook response document. 
    await docRef.update(dataToUpdate);
    console.log(`Payload stored/updated in Firestore for ID: ${consultationId}. Status: ${status}.`);

    // 4. If a batchId was found, update the batch progress in a transaction.
    if (batchId && batchId.startsWith('batch-')) { // Check if it's a real batch
        const batchRef = firestore.collection('batches').doc(batchId);
        try {
            await firestore.runTransaction(async (transaction) => {
                const batchDoc = await transaction.get(batchRef);
                if (!batchDoc.exists) {
                    console.warn(`[Webhook Transaction] Batch document ${batchId} not found.`);
                    return;
                }
                const batchData = batchDoc.data()!;
                if (batchData.status === 'completed' || (batchData.status === 'error' && batchData.processedCpfs >= batchData.totalCpfs)) {
                    console.log(`[Batch ${batchId}] Already finished. Ignoring webhook update.`);
                    return;
                }

                const updates: any = {
                    processedCpfs: FieldValue.increment(1)
                };

                const newProcessedCount = (batchData.processedCpfs || 0) + 1;

                if (newProcessedCount >= batchData.totalCpfs) {
                     console.log(`[Batch ${batchId}] Final CPF received. Marking as complete.`);
                     updates.status = 'completed';
                     updates.message = 'Processamento concluído via webhooks.';
                     updates.completedAt = FieldValue.serverTimestamp();
                } else if (batchData.status === 'pending') {
                    updates.status = 'processing';
                    updates.message = 'Processamento iniciado.';
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
