
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
    
    const balanceId = payload.balanceId;

    if (Object.keys(payload).length === 0) {
        console.log("Webhook validation request received (empty body). Responding 200 OK.");
        return NextResponse.json({ status: 'success', message: 'Webhook test successful.'}, { status: 200 });
    }

    if (!balanceId) {
        console.error("Webhook payload missing 'balanceId'. Cannot process.", payload);
        return NextResponse.json({ status: 'error', message: "Webhook payload missing 'balanceId'."}, { status: 400 });
    }

    const docRef = firestore.collection('webhookResponses').doc(balanceId);
    const docSnapshot = await docRef.get();

    if (!docSnapshot.exists) {
        console.error(`Webhook received for unknown balanceId: ${balanceId}. Storing anyway.`);
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
    
    await docRef.update(dataToUpdate);
    console.log(`Payload stored/updated in Firestore for ID: ${docRef.id}. Status: ${status}.`);

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
