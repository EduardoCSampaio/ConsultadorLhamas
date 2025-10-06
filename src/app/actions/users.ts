
'use server';

import { z } from 'zod';
import { initializeFirebaseAdmin } from '@/firebase/server-init';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';


const updateUserStatusSchema = z.object({
  uid: z.string().min(1, { message: "UID do usuário é obrigatório." }),
  status: z.enum(['pending', 'active', 'rejected']),
});

const setAdminClaimSchema = z.object({
  uid: z.string().min(1, { message: "UID do usuário é obrigatório." }),
});


export type UserProfile = {
    uid: string;
    email: string;
    role: 'admin' | 'user';
    status: 'pending' | 'active' | 'rejected';
};

// Nova Server Action para buscar todos os usuários
export async function getUsers(): Promise<{users: UserProfile[], error?: string}> {
    try {
        initializeFirebaseAdmin();
        const firestore = getFirestore();
        const usersSnapshot = await firestore.collection('users').get();
        if (usersSnapshot.empty) {
            return { users: [] };
        }
        const users = usersSnapshot.docs.map(doc => doc.data() as UserProfile);
        return { users };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Ocorreu um erro desconhecido ao buscar usuários.";
        console.error("Erro ao buscar usuários:", message);
        return { users: [], error: message };
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
