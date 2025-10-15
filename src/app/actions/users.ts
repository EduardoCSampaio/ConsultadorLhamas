
'use server';

import { z } from 'zod';
import { firestore, auth } from '@/firebase/server-init';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { UserRecord } from 'firebase-admin/auth';
import * as XLSX from 'xlsx';
import { createNotification, createNotificationsForAdmins } from './notifications';
import { createTeam } from './teams';

export type UserPermissions = {
  canViewFGTS?: boolean;
  canViewCLT?: boolean;
  canViewINSS?: boolean;
};

export type ApiCredentials = {
  v8_username?: string;
  v8_password?: string;
  v8_audience?: string;
  v8_client_id?: string;
  facta_username?: string;
  facta_password?: string;
  c6_username?: string;
  c6_password?: string;
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
    c6_username: z.string().optional(),
    c6_password: z.string().optional(),
  }).partial(),
});

const updateUserPermissionsSchema = z.object({
  uid: z.string().min(1),
  permissions: z.object({
    canViewFGTS: z.boolean().optional(),
    canViewCLT: z.boolean().optional(),
    canViewINSS: z.boolean().optional(),
  }).partial(),
});

const updateUserPhotoURLSchema = z.object({
  uid: z.string().min(1),
  photoURL: z.string().url(),
});


const updateUserStatusSchema = z.object({
  uid: z.string().min(1, { message: "UID do usuário é obrigatório." }),
  status: z.enum(['pending', 'active', 'rejected', 'inactive']),
});

const updateUserRoleSchema = z.object({
  uid: z.string().min(1),
  newRole: z.enum(['user', 'manager']),
  adminId: z.string().min(1),
  userEmail: z.string().email(),
});


const deleteUserSchema = z.object({
  uid: z.string().min(1, { message: "UID do usuário é obrigatório." }),
});


const setAdminClaimSchema = z.object({
  uid: z.string().min(1, { message: "UID do usuário é obrigatório." }),
});

const getUserActivitySchema = z.object({
  userId: z.string().min(1),
  limit: z.number().optional().default(5),
});

const exportUsersSchema = z.object({
    userId: z.string(),
});


export type UserProfile = {
    uid: string;
    email: string;
    photoURL?: string;
    role: 'super_admin' | 'manager' | 'user';
    status: 'pending' | 'active' | 'rejected' | 'inactive';
    createdAt: string;
    teamId?: string;
    teamName?: string;
    sector?: string;
    permissions?: UserPermissions;
} & ApiCredentials;

export type ActivityLog = {
    id: string;
    userId: string;
    userEmail: string;
    action: string;
    documentNumber?: string;
    provider?: string;
    details?: string;
    createdAt: string; // ISO string
};

type LogActivityInput = {
    userId: string;
    action: string;
    documentNumber?: string;
    provider?: string;
    details?: string;
    teamId?: string; // Optional teamId for invitation-based registrations
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

export async function logActivity(input: LogActivityInput) {
    try {
        const userDoc = await firestore.collection('users').doc(input.userId).get();
        if (!userDoc.exists) {
            console.error(`[logActivity] User with ID ${input.userId} not found.`);
            return;
        }
        const userEmail = userDoc.data()?.email || 'N/A';

        const { teamId, ...logData } = input;
        
        await firestore.collection('activityLogs').add({
            ...logData,
            userEmail: userEmail,
            createdAt: FieldValue.serverTimestamp(),
        });
        
        if (input.action.startsWith('User Registration (Invitation)') && teamId) {
            const teamDoc = await firestore.collection('teams').doc(teamId).get();
            if (teamDoc.exists) {
                const managerId = teamDoc.data()?.managerId;
                if (managerId) {
                    await createNotification({
                        userId: managerId,
                        title: 'Novo Membro Pendente',
                        message: `O usuário ${userEmail} se cadastrou e aguarda sua aprovação.`,
                        link: '/teams'
                    });
                }
            }
        } else if (input.action.startsWith('User Registration')) {
            await createNotificationsForAdmins({
                title: 'Novo Usuário Cadastrado',
                message: `O usuário ${userEmail} se cadastrou e aguarda aprovação.`,
                link: '/admin/users'
            });
        }


    } catch (logError) {
        console.error(`Failed to log activity "${input.action}":`, logError);
    }
}


// Action to fetch all activity logs
export async function getActivityLogs(): Promise<{logs: ActivityLog[] | null, error?: string}> {
    try {
        const logsSnapshot = await firestore.collection('activityLogs').orderBy('createdAt', 'desc').get();
        if (logsSnapshot.empty) {
            return { logs: [] };
        }
        
        const logs = logsSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                userId: data.userId,
                userEmail: data.userEmail,
                action: data.action,
                documentNumber: data.documentNumber,
                provider: data.provider,
                details: data.details,
                createdAt: toISODate(data.createdAt),
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
        const logsSnapshot = await firestore.collection('activityLogs')
            .where('userId', '==', userId)
            .orderBy('createdAt', 'desc')
            .limit(limit)
            .get();

        if (logsSnapshot.empty) {
            return { logs: [] };
        }
        
        let logs = logsSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                userId: data.userId,
                userEmail: data.userEmail,
                action: data.action,
                documentNumber: data.documentNumber,
                provider: data.provider,
                details: data.details,
                createdAt: toISODate(data.createdAt),
            } as ActivityLog;
        });
        
        return { logs: logs };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Ocorreu um erro desconhecido ao buscar os logs do usuário.";
        console.error(`Erro ao buscar logs para o usuário ${userId}:`, message);
        return { logs: null, error: message };
    }
}


const combineUserData = async (userRecord: UserRecord, teamsMap: Map<string, string>): Promise<UserProfile | null> => {
    if (!userRecord.email) {
        return null;
    }

    const userDocRef = firestore.collection('users').doc(userRecord.uid);
    const userDoc = await userDocRef.get();
    let profileData;

    if (!userDoc.exists) {
        console.log(`User ${userRecord.email} found in Auth but not in Firestore. Creating profile...`);
        const isSuperAdmin = userRecord.email === 'admin@lhamascred.com.br';
        const newProfile = {
            uid: userRecord.uid,
            email: userRecord.email,
            role: isSuperAdmin ? 'super_admin' : 'user',
            status: isSuperAdmin ? 'active' : 'pending',
            createdAt: FieldValue.serverTimestamp(),
            permissions: { 
                canViewFGTS: isSuperAdmin, 
                canViewCLT: isSuperAdmin, 
                canViewINSS: isSuperAdmin 
            }
        };
        await userDocRef.set(newProfile);
        const newUserDoc = await userDocRef.get();
        profileData = newUserDoc.data();

    } else {
        profileData = userDoc.data();
    }
    
    if (!profileData) {
        return null;
    }

    return {
        uid: userRecord.uid,
        email: userRecord.email,
        photoURL: userRecord.photoURL || profileData.photoURL,
        role: profileData.role || 'user',
        status: profileData.status || 'pending',
        createdAt: toISODate(profileData.createdAt),
        teamId: profileData.teamId,
        teamName: profileData.teamId ? teamsMap.get(profileData.teamId) : undefined,
        sector: profileData.sector,
        v8_username: profileData.v8_username,
        v8_password: profileData.v8_password,
        v8_audience: profileData.v8_audience,
        v8_client_id: profileData.v8_client_id,
        facta_username: profileData.facta_username,
        facta_password: profileData.facta_password,
        c6_username: profileData.c6_username,
        c6_password: profileData.c6_password,
        permissions: profileData.permissions || {},
    } as UserProfile;
};


export async function getUsers(): Promise<{users: UserProfile[] | null, error?: string}> {
    try {
        const [listUsersResult, teamsSnapshot] = await Promise.all([
            auth.listUsers(),
            firestore.collection('teams').get()
        ]);
        
        const teamsMap = new Map<string, string>();
        teamsSnapshot.forEach(doc => {
            teamsMap.set(doc.id, doc.data().name);
        });

        const authUsers = listUsersResult.users;
        const userPromises = authUsers.map(userRecord => combineUserData(userRecord, teamsMap));
        
        const usersWithNulls = await Promise.all(userPromises);
        const validUsers = usersWithNulls.filter((user): user is UserProfile => user !== null);

        validUsers.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        return { users: validUsers };
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
    await auth.setCustomUserClaims(validation.data.uid, { super_admin: true });
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
    const userRef = firestore.collection('users').doc(uid);
    await userRef.update({ status });
    return { success: true };
  } catch (error) {
    console.error("Erro ao atualizar status do usuário:", error);
    const message = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
    return { success: false, error: message };
  }
}

export async function updateUserRole(input: z.infer<typeof updateUserRoleSchema>): Promise<{success: boolean, message: string}> {
    const validation = updateUserRoleSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, message: "Dados inválidos." };
    }

    const { uid, newRole, adminId, userEmail } = validation.data;

    try {
        const userRef = firestore.collection('users').doc(uid);

        if (newRole === 'manager') {
            const userDoc = await userRef.get();
            const userData = userDoc.data();

            if (userData?.role === 'manager' && userData?.teamId) {
                return { success: false, message: "O usuário já é um gerente com uma equipe. A remoção de função deve ser tratada separadamente." };
            }

            const teamResult = await createTeam({ 
                name: `Time de ${userEmail.split('@')[0]}`,
                managerId: uid,
            });

            if (!teamResult.success) {
                throw new Error(teamResult.message);
            }
            
            await logActivity({
                userId: adminId,
                action: 'Promoção de Usuário',
                details: `Usuário ${userEmail} promovido para Gerente e time ${teamResult.team?.id} criado.`
            });

            return { success: true, message: "Usuário promovido a Gerente e uma nova equipe foi criada para ele." };

        } else if (newRole === 'user') {
            await userRef.update({ role: 'user' });
            return { success: true, message: "Função do usuário atualizada para Usuário." };
        }

        return { success: false, message: "Ação de função inválida." };

    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro desconhecido ao atualizar a função do usuário.";
        console.error(`Error updating role for user ${uid}:`, error);
        return { success: false, message };
    }
}


export async function deleteUser(input: z.infer<typeof deleteUserSchema>): Promise<{ success: boolean; error?: string }> {
    const validation = deleteUserSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, error: "UID do usuário inválido." };
    }

    const { uid } = validation.data;

    try {
        await auth.deleteUser(uid);
        await firestore.collection('users').doc(uid).delete();
        
        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Ocorreu um erro desconhecido ao excluir o usuário.";
        console.error(`Erro ao excluir usuário ${uid}:`, message);
        return { success: false, error: message };
    }
}


export async function updateUserPermissions(input: z.infer<typeof updateUserPermissionsSchema>): Promise<{success: boolean, error?: string}> {
    const validation = updateUserPermissionsSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, error: "Dados de permissão inválidos." };
    }

    const { uid, permissions } = validation.data;

    try {
        const userRef = firestore.collection('users').doc(uid);
        
        await userRef.update({ permissions });

        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Ocorreu um erro desconhecido ao salvar as permissões.";
        console.error("Erro ao salvar permissões:", message);
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
        const userRef = firestore.collection('users').doc(uid);
        
        const credentialsToUpdate = Object.fromEntries(
            Object.entries(credentials).filter(([_, value]) => value !== undefined)
        );

        if (Object.keys(credentialsToUpdate).length === 0) {
            return { success: true };
        }

        await userRef.update(credentialsToUpdate);

        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Ocorreu um erro desconhecido ao salvar as credenciais.";
        console.error("Erro ao salvar credenciais de API:", message);
        return { success: false, error: message };
    }
}

export async function updateUserPhotoURL(input: z.infer<typeof updateUserPhotoURLSchema>): Promise<{success: boolean, error?: string}> {
    const validation = updateUserPhotoURLSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, error: "Dados de entrada inválidos (UID ou URL)." };
    }

    const { uid, photoURL } = validation.data;

    try {
        const userRef = firestore.collection('users').doc(uid);
        await userRef.update({ photoURL });
        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Ocorreu um erro desconhecido ao salvar a foto no banco de dados.";
        console.error("Erro ao atualizar a foto no Firestore:", message);
        return { success: false, error: message };
    }
}


type ExportResult = {
    status: 'success' | 'error';
    fileName?: string;
    fileContent?: string;
    message?: string;
};

const getStatusText = (status: UserProfile['status']) => {
    switch (status) {
        case 'active': return 'Ativo';
        case 'pending': return 'Pendente';
        case 'rejected': return 'Rejeitado';
        case 'inactive': return 'Inativo';
        default: return status;
    }
};

const getRoleText = (role: UserProfile['role']) => {
    switch (role) {
        case 'super_admin': return 'Super Admin';
        case 'manager': return 'Gerente';
        case 'user': return 'Usuário';
        default: return role;
    }
};

export async function exportUsersToExcel(input: z.infer<typeof exportUsersSchema>): Promise<ExportResult> {
    const validation = exportUsersSchema.safeParse(input);
    if (!validation.success) {
        return { status: 'error', message: 'Input inválido.' };
    }
    
    await logActivity({
        userId: validation.data.userId,
        action: 'Download Relatório de Usuários',
    });
    
    try {
        const { users, error } = await getUsers();
        if (error || !users) {
            return { status: 'error', message: error || "Não foi possível buscar os usuários para exportar." };
        }

        const dataToExport = users.map(user => ({
            'Email': user.email,
            'Status': getStatusText(user.status),
            'Função': getRoleText(user.role),
            'Time': user.teamName || 'N/A',
            'Setor': user.sector || 'N/A',
            'Data de Cadastro': new Date(user.createdAt).toLocaleDateString('pt-BR'),
        }));
        
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Usuários');
        
        const header = ['Email', 'Status', 'Função', 'Time', 'Setor', 'Data de Cadastro'];
        const colWidths = header.map(h => ({ wch: Math.max(h.length, 20) }));
        worksheet['!cols'] = colWidths;


        const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
        const base64String = buffer.toString('base64');
        const fileContent = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64String}`;
        
        const formattedDate = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
        const fileName = `Relatorio_Usuarios_${formattedDate}.xlsx`;
        
        return {
            status: 'success',
            fileName,
            fileContent,
            message: 'Relatório de usuários gerado com sucesso.',
        };

    } catch (exportError) {
        const message = exportError instanceof Error ? exportError.message : "Ocorreu um erro desconhecido durante a exportação.";
        console.error("Erro ao exportar usuários:", message);
        return { status: 'error', message };
    }
}
