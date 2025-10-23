
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

    // New Robust Logic: Read first to get batchId if it exists
    const docSnapshot = await docRef.get();
    const existingData = docSnapshot.data();
    const batchId = existingData?.batchId; // Get batchId safely from existing document

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
    
    const dataToUpdate: any = {
        ...existingData, // Preserve existing data like original batchId
        responseBody: payload,
        updatedAt: FieldValue.serverTimestamp(),
        status: status,
        message: statusMessage,
        provider: "V8DIGITAL",
        v8Provider: v8Partner,
    };
    
    // Write the updated response data
    await docRef.set(dataToUpdate, { merge: true });

    console.log(`Payload stored in Firestore with ID: ${consultationId}. Status: ${status}. Provider: V8DIGITAL (${v8Partner})`);
    
    // If a batchId was found, update the batch progress
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

                const updates: any = { };

                if (batchData.status === 'pending') {
                    updates.status = 'processing';
                    updates.message = 'Processamento iniciado.';
                }
                
                updates.processedCpfs = FieldValue.increment(1);
                transaction.update(batchRef, updates);

                // Check for completion after incrementing
                const newProcessedCount = (batchData.processedCpfs || 0) + 1;
                if (newProcessedCount >= batchData.totalCpfs) {
                     console.log(`[Batch ${batchId}] Final CPF received. Marking as complete.`);
                     const finalUpdates: any = { 
                        status: 'completed',
                        message: 'Processamento concluído via webhooks.',
                        completedAt: FieldValue.serverTimestamp()
                     };
                     transaction.update(batchRef, finalUpdates);
                }
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
