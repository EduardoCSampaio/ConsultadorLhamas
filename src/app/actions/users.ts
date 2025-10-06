
'use server';

import { z } from 'zod';
import { initializeFirebaseAdmin } from '@/firebase/server-init';
import { getFirestore } from 'firebase-admin/firestore';


const updateUserStatusSchema = z.object({
  uid: z.string().min(1, { message: "UID do usuário é obrigatório." }),
  status: z.enum(['pending', 'active', 'rejected']),
});

export type UserProfile = {
    uid: string;
    email: string;
    role: 'admin' | 'user';
    status: 'pending' | 'active' | 'rejected';
};

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
