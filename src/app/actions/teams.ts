
'use server';

import { z } from 'zod';
import { firestore } from '@/firebase/server-init';
import { FieldValue } from 'firebase-admin/firestore';
import { logActivity } from './users';
import type { UserPermissions, UserProfile } from './users';


export type Team = {
    id: string;
    name: string;
    managerId: string;
    createdAt: string;
    sectors: {
        [sectorName: string]: {
            isManager?: boolean;
            permissions: UserPermissions;
        }
    }
};

const createTeamSchema = z.object({
  name: z.string().min(3, "O nome do time deve ter pelo menos 3 caracteres."),
  managerId: z.string().min(1, "ID do gerente é obrigatório."),
});

const getTeamAndManagerSchema = z.object({
    teamId: z.string().min(1),
});


const getTeamMembersSchema = z.object({
    teamId: z.string().min(1),
    managerId: z.string().min(1),
});

const updateTeamSectorsSchema = z.object({
  teamId: z.string().min(1),
  sectors: z.record(z.object({
      isManager: z.boolean().optional(),
      permissions: z.object({
          canViewFGTS: z.boolean(),
          canViewCLT: z.boolean(),
          canViewINSS: z.boolean(),
      })
  }))
});


type CreateTeamResult = {
  success: boolean;
  message: string;
  team?: Team;
};

type GetTeamMembersResult = {
    success: boolean;
    members?: UserProfile[];
    error?: string;
}

type GetTeamAndManagerResult = {
    success: boolean;
    team?: Team;
    manager?: {
        email: string;
        name?: string;
    };
    error?: string;
};


export async function createTeam(input: z.infer<typeof createTeamSchema>): Promise<CreateTeamResult> {
    const validation = createTeamSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, message: 'Dados inválidos para criar o time.' };
    }

    const { name, managerId } = validation.data;

    try {
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
                // Default "Gerente" sector with full permissions for the team manager
                'Gerente': {
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
            // Update the user's role to 'manager' and assign them to the new team and default sector
            transaction.update(managerRef, { 
                role: 'manager', 
                teamId: teamRef.id,
                sector: 'Gerente', // Assign manager to their own sector
                permissions: newTeamData.sectors.Gerente.permissions, // Give them full permissions
             });
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


export async function getTeamMembers(input: z.infer<typeof getTeamMembersSchema>): Promise<GetTeamMembersResult> {
    const validation = getTeamMembersSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, error: "Dados de entrada inválidos." };
    }
    const { teamId, managerId } = validation.data;

    try {
        // Security check: ensure the requesting user is actually the manager of this team.
        const teamDoc = await firestore.collection('teams').doc(teamId).get();
        if (!teamDoc.exists() || teamDoc.data()?.managerId !== managerId) {
            return { success: false, error: "Você não tem permissão para ver os membros desta equipe." };
        }
        
        const membersSnapshot = await firestore.collection('users').where('teamId', '==', teamId).get();
        if (membersSnapshot.empty) {
            return { success: true, members: [] };
        }

        const members = membersSnapshot.docs
            .map(doc => doc.data() as UserProfile)
            .filter(member => member.uid !== managerId); // Exclude the manager from their own list of members

        return { success: true, members };

    } catch (error) {
        const message = error instanceof Error ? error.message : "Ocorreu um erro ao buscar os membros da equipe.";
        console.error(`[getTeamMembers] Error:`, message);
        return { success: false, error: message };
    }
}

export async function getTeamAndManager(input: z.infer<typeof getTeamAndManagerSchema>): Promise<GetTeamAndManagerResult> {
    const validation = getTeamAndManagerSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, error: "ID do time inválido." };
    }
    const { teamId } = validation.data;

    try {
        const teamDoc = await firestore.collection('teams').doc(teamId).get();
        if (!teamDoc.exists()) {
            return { success: false, error: "Time não encontrado." };
        }
        const teamData = teamDoc.data() as Team;

        const managerDoc = await firestore.collection('users').doc(teamData.managerId).get();
        if (!managerDoc.exists()) {
            return { success: false, error: "Gerente do time não encontrado." };
        }
        const managerData = managerDoc.data() as UserProfile;

        return {
            success: true,
            team: { ...teamData, id: teamDoc.id },
            manager: {
                email: managerData.email,
                name: managerData.email.split('@')[0], // Simple name extraction
            },
        };

    } catch (error) {
        const message = error instanceof Error ? error.message : "Ocorreu um erro ao buscar os dados do time.";
        console.error(`[getTeamAndManager] Error:`, error);
        return { success: false, error: message };
    }
}



export async function updateTeamSectors(input: z.infer<typeof updateTeamSectorsSchema>): Promise<{success: boolean, message: string}> {
    const validation = updateTeamSectorsSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, message: 'Dados inválidos para atualizar setores.' };
    }

    const { teamId, sectors } = validation.data;
    
    try {
        const teamRef = firestore.collection('teams').doc(teamId);

        await teamRef.update({ sectors });

        return { success: true, message: "Setores da equipe atualizados com sucesso." };
    } catch(error) {
        const message = error instanceof Error ? error.message : "Erro desconhecido ao atualizar setores.";
        console.error("updateTeamSectors error:", error);
        return { success: false, message };
    }
}
