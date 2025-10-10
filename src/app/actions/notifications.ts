'use server';

import { z } from 'zod';
import { initializeFirebaseAdmin } from '@/firebase/server-init';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const createNotificationSchema = z.object({
  userId: z.string(),
  title: z.string(),
  message: z.string(),
  link: z.string().optional(),
});

export async function createNotification(input: z.infer<typeof createNotificationSchema>) {
    const validation = createNotificationSchema.safeParse(input);
    if (!validation.success) {
        console.error("Invalid notification data:", validation.error);
        return;
    }
    
    try {
        const firestore = getFirestore();
        const notificationRef = firestore.collection('users').doc(input.userId).collection('notifications').doc();
        
        await notificationRef.set({
            ...input,
            isRead: false,
            createdAt: FieldValue.serverTimestamp(),
        });

    } catch (error) {
        console.error("Failed to create notification:", error);
    }
}

export async function createNotificationsForAdmins(input: Omit<z.infer<typeof createNotificationSchema>, 'userId'>) {
    try {
        const firestore = getFirestore();
        const adminsSnapshot = await firestore.collection('users').where('role', '==', 'admin').get();
        
        if (adminsSnapshot.empty) {
            console.log("No admins found to notify.");
            return;
        }

        const batch = firestore.batch();
        
        adminsSnapshot.forEach(adminDoc => {
            const notificationRef = adminDoc.ref.collection('notifications').doc();
            batch.set(notificationRef, {
                ...input,
                isRead: false,
                createdAt: FieldValue.serverTimestamp(),
            });
        });

        await batch.commit();

    } catch (error) {
        console.error("Failed to create notifications for admins:", error);
    }
}
