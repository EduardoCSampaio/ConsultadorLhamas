
'use server';

import { z } from 'zod';
import { initializeFirebaseAdmin } from '@/firebase/server-init';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

export type ApiCredentials = {
  v8_username?: string;
  v8_password?: string;
  v8_audience?: string;
  v8_client_id?: string;
  facta_username?: string;
  facta_password?: string;
};

const updateApiCredentialsSchema = z.object({
  uid: z.string().min(1),
  credentials: z.object({
    v8_username: z.string().optional(),
    v8_password: z.string().optional(),
    v8_audience: z.string().optional(),
    v8_client_id: z.string().optional(),
    facta_username: z.string().optional(),
    facta_password: z.string().optional(),
  }).partial(), // Allows partial updates
});


const updateUserStatusSchema = z.object({
  uid: z.string().min(1, { message: "UID do usuário é obrigatório." }),
  status: z.enum(['pending', 'active', 'rejected', 'inactive']),
});

const setAdminClaimSchema = z.object({
  uid: z.string().min(1, { message: "UID do usuário é obrigatório." }),
});

const getUserActivitySchema = z.object({
  userId: z.string().min(1),
  limit: z.number().optional().default(5),
});


export type UserProfile = {
    uid: string;
    email: string;
    role: 'admin' | 'user';
    status: 'pending' | 'active' | 'rejected' | 'inactive';
    createdAt: string; // Changed to string to be serializable
} & ApiCredentials;

export type ActivityLog = {
    id: string;
    userId: string;
    userEmail: string;
    action: string;
    documentNumber?: string;
    createdAt: string; // ISO string
};

// Action to fetch all activity logs
export async function getActivityLogs(): Promise<{logs: ActivityLog[] | null, error?: string}> {
    try {
        initializeFirebaseAdmin();
        const firestore = getFirestore();
        const logsSnapshot = await firestore.collection('activityLogs').orderBy('createdAt', 'desc').get();
        if (logsSnapshot.empty) {
            return { logs: [] };
        }
        
        const logs = logsSnapshot.docs.map(doc => {
            const data = doc.data();
            const createdAt = data.createdAt;

            let serializableCreatedAt = new Date().toISOString(); // Default value
            if (createdAt instanceof Timestamp) {
                serializableCreatedAt = createdAt.toDate().toISOString();
            } else if (typeof createdAt === 'string') {
                serializableCreatedAt = createdAt;
            }

            return {
                id: doc.id,
                userId: data.userId,
                userEmail: data.userEmail,
                action: data.action,
                documentNumber: data.documentNumber,
                createdAt: serializableCreatedAt,
            } as ActivityLog;
        });

        return { logs };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Ocorreu um erro desconhecido ao buscar logs de atividade.";
        console.error("Erro ao buscar logs de atividade:", message);
        return { logs: null, error: message };
    }
}

export async function getUserActivityLogs(input: z.infer<typeof getUserActivitySchema>): Promise<{logs: ActivityLog[] | null, error?: string}> {
    const validation = getUserActivitySchema.safeParse(input);
    if (!validation.success) {
        return { logs: null, error: "Dados de entrada inválidos." };
    }
    const { userId, limit } = validation.data;
    try {
        initializeFirebaseAdmin();
        const firestore = getFirestore();
        const logsSnapshot = await firestore.collection('activityLogs')
            .where('userId', '==', userId)
            .orderBy('createdAt', 'desc')
            .limit(limit)
            .get();

        if (logsSnapshot.empty) {
            return { logs: [] };
        }
        
        const logs = logsSnapshot.docs.map(doc => {
            const data = doc.data();
            const createdAt = data.createdAt;

            let serializableCreatedAt = new Date().toISOString(); // Default value
            if (createdAt instanceof Timestamp) {
                serializableCreatedAt = createdAt.toDate().toISOString();
            } else if (typeof createdAt === 'string') {
                serializableCreatedAt = createdAt;
            }

            return {
                id: doc.id,
                userId: data.userId,
                userEmail: data.userEmail,
                action: data.action,
                documentNumber: data.documentNumber,
                createdAt: serializableCreatedAt,
            } as ActivityLog;
        });

        return { logs };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Ocorreu um erro desconhecido ao buscar os logs do usuário.";
        console.error(`Erro ao buscar logs para o usuário ${userId}:`, message);
        return { logs: null, error: message };
    }
}


// Nova Server Action para buscar todos os usuários
export async function getUsers(): Promise<{users: UserProfile[] | null, error?: string}> {
    try {
        initializeFirebaseAdmin();
        const firestore = getFirestore();
        const usersSnapshot = await firestore.collection('users').orderBy('createdAt', 'desc').get();
        if (usersSnapshot.empty) {
            return { users: [] };
        }
        
        const users = usersSnapshot.docs.map(doc => {
            const data = doc.data();
            const createdAt = data.createdAt;

            // Convert Firestore Timestamp to a serializable format (ISO string)
            let serializableCreatedAt = new Date().toISOString(); // Default value
            if (createdAt instanceof Timestamp) {
                serializableCreatedAt = createdAt.toDate().toISOString();
            } else if (typeof createdAt === 'string') {
                serializableCreatedAt = createdAt;
            }

            return {
                uid: data.uid,
                email: data.email,
                role: data.role,
                status: data.status,
                createdAt: serializableCreatedAt,
                v8_username: data.v8_username,
                v8_password: data.v8_password,
                v8_audience: data.v8_audience,
                v8_client_id: data.v8_client_id,
                facta_username: data.facta_username,
                facta_password: data.facta_password,
            } as UserProfile;
        });

        return { users };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Ocorreu um erro desconhecido ao buscar usuários.";
        console.error("Erro ao buscar usuários:", message);
        return { users: null, error: message };
    }
}


export async function setAdminClaim(input: z.infer<typeof setAdminClaimSchema>): Promise<{success: boolean, error?: string}> {
  const validation = setAdminClaimSchema.safeParse(input);
  if (!validation.success) {
    return { success: false, error: "UID inválido." };
  }
  
  try {
    initializeFirebaseAdmin();
    const auth = getAuth();
    await auth.setCustomUserClaims(validation.data.uid, { admin: true });
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ocorreu um erro desconhecido ao definir a claim de admin.";
    console.error("Erro ao definir custom claim:", message);
    return { success: false, error: message };
  }
}


export async function updateUserStatus(input: z.infer<typeof updateUserStatusSchema>) {
  const validation = updateUserStatusSchema.safeParse(input);

  if (!validation.success) {
    const errorMessages = validation.error.flatten().fieldErrors;
    return { success: false, error: JSON.stringify(errorMessages) };
  }

  const { uid, status } = validation.data;
  
  try {
    initializeFirebaseAdmin();
    const firestore = getFirestore();
    const userRef = firestore.collection('users').doc(uid);
    await userRef.update({ status });
    return { success: true };
  } catch (error) {
    console.error("Erro ao atualizar status do usuário:", error);
    const message = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
    return { success: false, error: message };
  }
}

export async function updateApiCredentials(input: z.infer<typeof updateApiCredentialsSchema>): Promise<{success: boolean, error?: string}> {
    const validation = updateApiCredentialsSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, error: "Dados de entrada inválidos." };
    }

    const { uid, credentials } = validation.data;

    try {
        initializeFirebaseAdmin();
        const firestore = getFirestore();
        const userRef = firestore.collection('users').doc(uid);
        
        // Filter out undefined values so Firestore doesn't overwrite fields with null
        const credentialsToUpdate = Object.fromEntries(
            Object.entries(credentials).filter(([_, value]) => value !== undefined)
        );

        if (Object.keys(credentialsToUpdate).length === 0) {
            return { success: true }; // Nothing to update
        }

        await userRef.update(credentialsToUpdate);

        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Ocorreu um erro desconhecido ao salvar as credenciais.";
        console.error("Erro ao salvar credenciais de API:", message);
        return { success: false, error: message };
    }
}
