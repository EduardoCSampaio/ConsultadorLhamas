
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
    const documentNumber = payload.documentNumber;

    if (!balanceId && !documentNumber) {
        console.log("Webhook validation request received (empty or invalid body). Responding 200 OK.");
        return NextResponse.json({
            status: 'success',
            message: 'Webhook test successful. Endpoint is active.',
        }, { status: 200 });
    }

    let docRef: FirebaseFirestore.DocumentReference | null = null;
    let docSnapshot: FirebaseFirestore.DocumentSnapshot | null = null;
    let foundBy: 'balanceId' | 'query' | null = null;

    if (balanceId) {
        docRef = firestore.collection('webhookResponses').doc(balanceId.toString());
        docSnapshot = await docRef.get();
        if (docSnapshot.exists) {
            foundBy = 'balanceId';
        }
    }
    
    // Fallback to querying by documentNumber if not found by balanceId
    if (!docSnapshot || !docSnapshot.exists) {
        console.warn(`Webhook doc not found for balanceId: ${balanceId}. Falling back to query.`);
        const querySnapshot = await firestore.collection('webhookResponses')
            .where('documentNumber', '==', documentNumber)
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();
        
        if (!querySnapshot.empty) {
            docSnapshot = querySnapshot.docs[0];
            docRef = docSnapshot.ref;
            foundBy = 'query';
        }
    }

    if (!docRef || !docSnapshot || !docSnapshot.exists) {
        console.error(`Webhook received for unknown identifier. Payload:`, payload);
        // We can't process this webhook, but we don't want the sender to retry.
        return NextResponse.json({
            status: 'error',
            message: 'No corresponding document found for this webhook response.',
        }, { status: 404 });
    }

    console.log(`Found document ${docRef.id} by ${foundBy}.`);
    
    const existingData = docSnapshot.data();
    const batchId = existingData?.batchId;
    
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
    
    await docRef.set(dataToUpdate, { merge: true });
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
