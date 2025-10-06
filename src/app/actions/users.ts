
'use server';

import { z } from 'zod';
import { doc, updateDoc } from 'firebase/firestore';
import { initializeFirebaseAdmin } from '@/firebase/server-init';

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
    return { success: false, error: validation.error.flatten().fieldErrors };
  }

  const { uid, status } = validation.data;
  const { firestore } = initializeFirebaseAdmin();

  try {
    const userRef = doc(firestore, 'users', uid);
    await updateDoc(userRef, { status });
    return { success: true };
  } catch (error) {
    console.error("Erro ao atualizar status do usuário:", error);
    const message = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
    return { success: false, error: message };
  }
}
