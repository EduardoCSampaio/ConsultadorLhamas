
import { NextRequest, NextResponse } from 'next/server';
import { firestore } from '@/firebase/server-init';
import { FieldValue } from 'firebase-admin/firestore';


export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: 'success',
    message: 'Webhook endpoint is active and ready to receive POST requests.',
  }, { status: 200 });
}


export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    console.log("--- Balance Webhook Received (Admin SDK) ---");
    console.log("Body (Payload):", JSON.stringify(payload, null, 2));
    
    // The V8 API sends balanceId on success, but not on some failures.
    // We will use balanceId as the primary key.
    const balanceId = payload.balanceId;

    if (Object.keys(payload).length === 0) {
        console.log("Webhook validation request received (empty body). Responding 200 OK.");
        return NextResponse.json({ status: 'success', message: 'Webhook test successful.'}, { status: 200 });
    }

    if (!balanceId) {
        console.error("Webhook payload missing 'balanceId'. Cannot process directly.", payload);
        // We could add a fallback here to query by documentNumber if needed,
        // but for now, we'll log it and return an error to highlight the API behavior.
        // This helps in debugging if the V8 API changes its error response format.
        return NextResponse.json({ status: 'error', message: "Webhook payload missing 'balanceId'."}, { status: 400 });
    }

    const docRef = firestore.collection('webhookResponses').doc(balanceId);
    const docSnapshot = await docRef.get();

    if (!docSnapshot.exists) {
        console.error(`Webhook received for unknown balanceId: ${balanceId}. Storing anyway.`);
        // We are receiving a webhook for an ID we don't have a pending record for.
        // This could happen if the batch creation failed but the V8 request went through.
        // We'll store it so the data isn't lost, but progress won't be updated.
        await docRef.set({
            status: 'error',
            message: 'Received webhook for an unknown balanceId.',
            responseBody: payload,
            createdAt: FieldValue.serverTimestamp(),
        });
        return NextResponse.json({ status: 'success', message: 'Webhook for unknown ID stored.' }, { status: 200 });
    }

    console.log(`Found document ${docRef.id}. Processing...`);
    
    const existingData = docSnapshot.data()!;
    const batchId = existingData.batchId;
    
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
    
    // Update the specific webhook response document
    await docRef.update(dataToUpdate);
    console.log(`Payload stored/updated in Firestore for ID: ${docRef.id}. Status: ${status}.`);

    // If this response is part of a batch, update the batch progress
    if (batchId && batchId.startsWith('batch-')) {
        const batchRef = firestore.collection('batches').doc(batchId);
        try {
            await firestore.runTransaction(async (transaction) => {
                const batchDoc = await transaction.get(batchRef);
                if (!batchDoc.exists) {
                    console.warn(`[Webhook Transaction] Batch document ${batchId} not found.`);
                    return;
                }
                const batchData = batchDoc.data()!;
                // Prevent updates on already finished batches
                if (batchData.status === 'completed' || (batchData.status === 'error' && batchData.processedCpfs >= batchData.totalCpfs)) {
                    console.log(`[Batch ${batchId}] Already finished. Ignoring webhook update.`);
                    return;
                }

                const updates: any = {
                    processedCpfs: FieldValue.increment(1)
                };

                const newProcessedCount = (batchData.processedCpfs || 0) + 1;

                // If this is the last CPF, mark the batch as complete
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
        // This is likely a validation request from the API provider with an empty body.
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
