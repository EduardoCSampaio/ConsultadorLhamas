'use server';

import { z } from 'zod';
import { initializeFirebaseAdmin } from '@/firebase/server-init';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logActivity } from './users';

export type Team = {
    id: string;
    name: string;
    managerId: string;
    createdAt: string;
    sectors: {
        [sectorName: string]: {
            isManager?: boolean;
            permissions: {
                canViewFGTS: boolean;
                canViewCLT: boolean;
                canViewINSS: boolean;
            }
        }
    }
};

const createTeamSchema = z.object({
  name: z.string().min(3, "O nome do time deve ter pelo menos 3 caracteres."),
  managerId: z.string().min(1, "ID do gerente é obrigatório."),
});

type CreateTeamResult = {
  success: boolean;
  message: string;
  team?: Team;
};

export async function createTeam(input: z.infer<typeof createTeamSchema>): Promise<CreateTeamResult> {
    const validation = createTeamSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, message: 'Dados inválidos para criar o time.' };
    }

    const { name, managerId } = validation.data;

    try {
        initializeFirebaseAdmin();
        const firestore = getFirestore();
        const teamRef = firestore.collection('teams').doc();
        const managerRef = firestore.collection('users').doc(managerId);

        // Check if manager already has a team
        const existingTeamsQuery = await firestore.collection('teams').where('managerId', '==', managerId).limit(1).get();
        if (!existingTeamsQuery.empty) {
            return { success: false, message: 'Este gerente já possui um time.' };
        }

        const newTeamData = {
            name,
            managerId,
            createdAt: FieldValue.serverTimestamp(),
            sectors: {
                // Default "TI" sector with full permissions for the team
                'TI': {
                    isManager: true,
                    permissions: {
                        canViewFGTS: true,
                        canViewCLT: true,
                        canViewINSS: true,
                    }
                }
            }
        };

        await firestore.runTransaction(async (transaction) => {
            transaction.set(teamRef, newTeamData);
            // Update the user's role to 'manager' and assign them to the new team
            transaction.update(managerRef, { role: 'manager', teamId: teamRef.id });
        });

        await logActivity({
            userId: managerId,
            action: 'Criação de Time',
            details: `Gerente criou o time: ${name}`
        });

        return {
            success: true,
            message: 'Time criado com sucesso!',
            team: {
                id: teamRef.id,
                ...newTeamData,
                createdAt: new Date().toISOString()
            } as Team,
        };

    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro desconhecido ao criar o time.";
        console.error("createTeam error:", error);
        return { success: false, message };
    }
}
