
'use server';

import { z } from 'zod';
import { firestore } from '@/firebase/server-init';
import { FieldValue } from 'firebase-admin/firestore';

const createNotificationSchema = z.object({
  userId: z.string(),
  title: z.string(),
  message: z.string(),
  link: z.string().optional(),
});

const notificationIdSchema = z.object({
  userId: z.string(),
  notificationId: z.string(),
});


export async function createNotification(input: z.infer<typeof createNotificationSchema>) {
    const validation = createNotificationSchema.safeParse(input);
    if (!validation.success) {
        console.error("Invalid notification data:", validation.error);
        return;
    }
    
    try {
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
        const adminsSnapshot = await firestore.collection('users').where('role', '==', 'super_admin').get();
        const managersSnapshot = await firestore.collection('users').where('role', '==', 'manager').get();

        const allAdminIds = [
            ...adminsSnapshot.docs.map(doc => doc.id),
            ...managersSnapshot.docs.map(doc => doc.id),
        ];

        const uniqueAdminIds = [...new Set(allAdminIds)];
        
        if (uniqueAdminIds.length === 0) {
            console.log("No admins or managers found to notify.");
            return;
        }

        const batch = firestore.batch();
        
        uniqueAdminIds.forEach(adminId => {
            const notificationRef = firestore.collection('users').doc(adminId).collection('notifications').doc();
            batch.set(notificationRef, {
                ...input,
                userId: adminId, // Make sure userId is set for the notification document itself
                isRead: false,
                createdAt: FieldValue.serverTimestamp(),
            });
        });

        await batch.commit();

    } catch (error) {
        console.error("Failed to create notifications for admins/managers:", error);
    }
}


export async function markNotificationAsRead(input: z.infer<typeof notificationIdSchema>): Promise<{ success: boolean; message?: string }> {
    const validation = notificationIdSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, message: "Dados inválidos." };
    }
    
    const { userId, notificationId } = input;

    try {
        const notifRef = firestore.collection('users').doc(userId).collection('notifications').doc(notificationId);
        await notifRef.update({ isRead: true });
        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao marcar notificação como lida.";
        console.error("markNotificationAsRead error:", error);
        return { success: false, message };
    }
}


export async function deleteNotification(input: z.infer<typeof notificationIdSchema>): Promise<{ success: boolean; message?: string }> {
    const validation = notificationIdSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, message: "Dados inválidos." };
    }
    
    const { userId, notificationId } = input;

    try {
        const notifRef = firestore.collection('users').doc(userId).collection('notifications').doc(notificationId);
        await notifRef.delete();
        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao excluir notificação.";
        console.error("deleteNotification error:", error);
        return { success: false, message };
    }
}