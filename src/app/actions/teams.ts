
'use server';

import { z } from 'zod';
import { firestore } from '@/firebase/server-init';
import { FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore';
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

export type TeamWithManager = Team & {
    managerEmail: string;
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
    currentUserId: z.string().min(1),
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

function toISODate(timestamp: Timestamp | string | Date | undefined): string {
    if (!timestamp) return new Date().toISOString();
    if (timestamp instanceof Timestamp) {
        return timestamp.toDate().toISOString();
    }
    if (typeof timestamp === 'string') {
        return timestamp;
    }
    return timestamp.toISOString();
}


export async function createTeam(input: z.infer<typeof createTeamSchema>): Promise<CreateTeamResult> {
    const validation = createTeamSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, message: 'Dados inválidos para criar o time.' };
    }

    const { name, managerId } = validation.data;

    try {
        const teamRef = firestore.collection('teams').doc();
        const managerRef = firestore.collection('users').doc(managerId);

        const existingTeamsQuery = await firestore.collection('teams').where('managerId', '==', managerId).limit(1).get();
        if (!existingTeamsQuery.empty) {
            return { success: false, message: 'Este gerente já possui um time.' };
        }

        const newTeamData = {
            name,
            managerId,
            createdAt: FieldValue.serverTimestamp(),
            sectors: {} // Start with empty sectors
        };

        await firestore.runTransaction(async (transaction) => {
            transaction.set(teamRef, newTeamData);
            transaction.update(managerRef, { 
                role: 'manager', 
                teamId: teamRef.id,
                sector: '', // No default sector
                // Manager has all permissions by default, which can be configured later
                permissions: {
                    canViewFGTS: true,
                    canViewCLT: true,
                    canViewINSS: true,
                },
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
    const { teamId, currentUserId } = validation.data;

    try {
        const currentUserDoc = await firestore.collection('users').doc(currentUserId).get();
        const currentUserData = currentUserDoc.data();
        
        // The permission check for viewing members is now simplified.
        // It's handled on the client-side before calling this function,
        // but we keep a server-side check as a safeguard.
        if (currentUserData?.role !== 'super_admin' && currentUserData?.teamId !== teamId) {
            return { success: false, error: "Você não tem permissão para visualizar os membros desta equipe." };
        }
        
        const membersSnapshot = await firestore.collection('users').where('teamId', '==', teamId).get();
        if (membersSnapshot.empty) {
            return { success: true, members: [] };
        }

        const teamDoc = await firestore.collection('teams').doc(teamId).get();
        const managerId = teamDoc.data()?.managerId;


        const members = membersSnapshot.docs
            .map(doc => {
                const data = doc.data();
                return {
                    ...data,
                    createdAt: toISODate(data.createdAt),
                } as UserProfile;
            })
            // Exclude the manager from the list of members
            .filter(member => member.uid !== managerId); 

        return { success: true, members };

    } catch (error) {
        const message = error instanceof Error ? error.message : "Ocorreu um erro ao buscar os membros da equipe.";
        console.error(`[getTeamMembers] Error:`, error);
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
        
        if (!teamDoc.exists) {
            return { success: false, error: "Time não encontrado." };
        }
        const teamData = teamDoc.data();
        if (!teamData) {
            return { success: false, error: "Dados do time não puderam ser lidos." };
        }

        const managerDoc = await firestore.collection('users').doc(teamData.managerId).get();
        if (!managerDoc.exists) {
             return { success: false, error: "Dados do gerente do time não encontrados." };
        }
        const managerData = managerDoc.data();
         if (!managerData) {
            return { success: false, error: "Dados do gerente não puderam ser lidos." };
        }
        
        const serializableTeam: Team = {
            id: teamDoc.id,
            name: teamData.name,
            managerId: teamData.managerId,
            sectors: teamData.sectors,
            createdAt: toISODate(teamData.createdAt),
        };

        return {
            success: true,
            team: serializableTeam,
            manager: {
                email: managerData.email,
                name: managerData.email.split('@')[0], 
            },
        };

    } catch (error) {
        const message = error instanceof Error ? error.message : "Ocorreu um erro ao buscar os dados do time.";
        console.error(`[getTeamAndManager] Error:`, error);
        return { success: false, error: message };
    }
}

export async function getAllTeams(): Promise<{ success: boolean; teams?: TeamWithManager[]; error?: string; }> {
    try {
        const teamsSnapshot = await firestore.collection('teams').get();
        if (teamsSnapshot.empty) {
            return { success: true, teams: [] };
        }

        const managerIds = teamsSnapshot.docs.map(doc => doc.data().managerId);
        
        // Fetch all managers in one go
        const managersSnapshot = await firestore.collection('users').where(FieldPath.documentId(), 'in', managerIds).get();
        const managersMap = new Map(managersSnapshot.docs.map(doc => [doc.id, doc.data().email]));

        const teams: TeamWithManager[] = teamsSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                name: data.name,
                managerId: data.managerId,
                managerEmail: managersMap.get(data.managerId) || 'Não encontrado',
                sectors: data.sectors,
                createdAt: toISODate(data.createdAt),
            };
        });

        return { success: true, teams };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Ocorreu um erro ao buscar as equipes.";
        console.error(`[getAllTeams] Error:`, error);
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
