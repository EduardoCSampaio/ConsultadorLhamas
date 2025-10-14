
'use server';

import { z } from 'zod';
import { firestore } from '@/firebase/server-init';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { createNotification, createNotificationsForAdmins } from './notifications';

const ticketStatusEnum = z.enum(["aberto", "em_atendimento", "em_desenvolvimento", "testando", "liberado", "resolvido"]);

const createTicketSchema = z.object({
  userId: z.string().min(1),
  userEmail: z.string().email(),
  title: z.string().min(5).max(100),
  initialMessage: z.string().min(10).max(1000),
});

const getTicketsSchema = z.object({
    userId: z.string().min(1),
});

const getTicketByIdSchema = z.object({
    ticketId: z.string().min(1),
});

const addMessageSchema = z.object({
    ticketId: z.string().min(1),
    userId: z.string().min(1),
    userEmail: z.string().email(),
    isAdmin: z.boolean(),
    content: z.string().min(1).max(2000),
});

const markAsReadSchema = z.object({
    ticketId: z.string().min(1),
    userId: z.string().min(1),
});

const updateStatusSchema = z.object({
    ticketId: z.string().min(1),
    status: ticketStatusEnum,
});


export type Ticket = {
    id: string;
    ticketNumber: string;
    userId: string;
    userEmail: string;
    title: string;
    status: z.infer<typeof ticketStatusEnum>;
    createdAt: string; // ISO String
    updatedAt: string; // ISO String
    lastMessage?: string;
    unreadByUser?: number;
    unreadByAdmin?: number;
};

export type TicketMessage = {
    id: string;
    senderId: string;
    senderEmail: string;
    content: string;
    createdAt: string; // ISO string
};


type CreateTicketResult = {
  success: boolean;
  message: string;
  ticket?: Ticket;
};

type GetTicketsResult = {
    success: boolean;
    tickets?: Ticket[];
    error?: string;
};

type GetTicketResult = {
    success: boolean;
    ticket?: Ticket;
    error?: string;
};

type AddMessageResult = {
    success: boolean;
    message: string;
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

async function getNextTicketNumber(): Promise<string> {
    const counterRef = firestore.collection('internal').doc('ticketCounter');
    
    let newNumber = 1;
    await firestore.runTransaction(async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        if (!counterDoc.exists()) {
            transaction.set(counterRef, { currentNumber: newNumber });
        } else {
            newNumber = (counterDoc.data()?.currentNumber || 0) + 1;
            transaction.update(counterRef, { currentNumber: newNumber });
        }
    });

    return `#${String(newNumber).padStart(4, '0')}`;
}


export async function createTicket(input: z.infer<typeof createTicketSchema>): Promise<CreateTicketResult> {
    const validation = createTicketSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, message: 'Dados inválidos para criar chamado.' };
    }
    
    try {
        const ticketRef = firestore.collection('tickets').doc();
        const messageRef = ticketRef.collection('messages').doc();
        const now = FieldValue.serverTimestamp();
        const ticketNumber = await getNextTicketNumber();

        const newTicketData = {
            userId: input.userId,
            userEmail: input.userEmail,
            title: input.title,
            status: 'aberto' as const,
            createdAt: now,
            updatedAt: now,
            ticketNumber: ticketNumber,
            lastMessage: input.initialMessage,
            unreadByAdmin: 1, // First message from user is unread for admin
            unreadByUser: 0,
        };

        const newMessageData = {
            senderId: input.userId,
            senderEmail: input.userEmail,
            content: input.initialMessage,
            createdAt: now,
        };

        const batch = firestore.batch();
        batch.set(ticketRef, newTicketData);
        batch.set(messageRef, newMessageData);
        await batch.commit();

        await createNotificationsForAdmins({
            title: `Novo Chamado: ${ticketNumber}`,
            message: `De: ${input.userEmail} - "${input.title}"`,
            link: `/chamados/${ticketRef.id}`
        });

        return {
            success: true,
            message: 'Chamado criado com sucesso.',
            ticket: {
                ...newTicketData,
                id: ticketRef.id,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            },
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro desconhecido ao criar chamado.";
        console.error("createTicket error:", error);
        return { success: false, message };
    }
}

export async function getTicketsForUser(input: z.infer<typeof getTicketsSchema>): Promise<GetTicketsResult> {
    const validation = getTicketsSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, error: "ID de usuário inválido." };
    }

    try {
        const userRef = firestore.collection('users').doc(input.userId);
        const userDoc = await userRef.get();
        
        if (!userDoc.exists()) {
            return { success: false, error: "Usuário não encontrado." };
        }
        
        const userData = userDoc.data();
        const isAdmin = userData?.role === 'super_admin' || userData?.role === 'manager';

        let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = firestore.collection('tickets');

        if (!isAdmin) {
            query = query.where('userId', '==', input.userId);
        }
        
        const ticketsSnapshot = await query.get();

        if (ticketsSnapshot.empty) {
            return { success: true, tickets: [] };
        }

        let tickets = ticketsSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ticketNumber: data.ticketNumber,
                userId: data.userId,
                userEmail: data.userEmail,
                title: data.title,
                status: data.status,
                createdAt: toISODate(data.createdAt),
                updatedAt: toISODate(data.updatedAt),
                lastMessage: data.lastMessage,
                unreadByAdmin: data.unreadByAdmin,
                unreadByUser: data.unreadByUser,
            } as Ticket;
        });
        
        tickets.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());


        return { success: true, tickets };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Ocorreu um erro ao buscar seus chamados.";
        console.error(`getTicketsForUser error for user ${input.userId}:`, error);
        return { success: false, error: message };
    }
}

export async function getTicketById(input: z.infer<typeof getTicketByIdSchema>): Promise<GetTicketResult> {
    const validation = getTicketByIdSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, error: "ID de chamado inválido." };
    }
    try {
        const ticketDoc = await firestore.collection('tickets').doc(input.ticketId).get();

        if (!ticketDoc.exists()) {
            return { success: false, error: 'Chamado não encontrado.' };
        }

        const data = ticketDoc.data()!;
        const ticket: Ticket = {
            id: ticketDoc.id,
            ticketNumber: data.ticketNumber,
            userId: data.userId,
            userEmail: data.userEmail,
            title: data.title,
            status: data.status,
            createdAt: toISODate(data.createdAt),
            updatedAt: toISODate(data.updatedAt),
            lastMessage: data.lastMessage,
            unreadByAdmin: data.unreadByAdmin,
            unreadByUser: data.unreadByUser,
        };

        return { success: true, ticket };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao buscar o chamado.";
        console.error("getTicketById error:", error);
        return { success: false, error: message };
    }
}

export async function addMessageToTicket(input: z.infer<typeof addMessageSchema>): Promise<AddMessageResult> {
    const validation = addMessageSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, message: "Dados da mensagem inválidos." };
    }
    
    const { ticketId, userId, userEmail, isAdmin, content } = validation.data;

    try {
        const ticketRef = firestore.collection('tickets').doc(ticketId);
        const messageRef = ticketRef.collection('messages').doc();

        const now = FieldValue.serverTimestamp();

        const newMessageData = {
            senderId: userId,
            senderEmail: userEmail,
            content: content,
            createdAt: now,
        };

        const ticketUpdates: { [key: string]: any } = {
            updatedAt: now,
            lastMessage: content,
        };

        const ticketDoc = await ticketRef.get();
        if (!ticketDoc.exists()) {
            throw new Error("Chamado não encontrado.");
        }
        const ticketData = ticketDoc.data() as Omit<Ticket, 'id'>;

        if (isAdmin) {
            ticketUpdates.unreadByUser = FieldValue.increment(1);
            await createNotification({
                userId: ticketData.userId,
                title: `Nova resposta no chamado #${ticketData.ticketNumber}`,
                message: `Sua solicitação "${ticketData.title}" foi respondida.`,
                link: `/chamados/${ticketId}`
            });

        } else {
            ticketUpdates.unreadByAdmin = FieldValue.increment(1);
            await createNotificationsForAdmins({
                title: `Nova Mensagem no Chamado #${ticketData.ticketNumber}`,
                message: `De: ${userEmail} - "${content.substring(0, 50)}..."`,
                link: `/chamados/${ticketId}`
            });
        }

        
        if (ticketData.status === 'aberto' && isAdmin) {
            ticketUpdates.status = 'em_atendimento';
        }
        
        const batch = firestore.batch();
        batch.set(messageRef, newMessageData);
        batch.update(ticketRef, ticketUpdates);
        await batch.commit();

        return { success: true, message: 'Mensagem enviada com sucesso.' };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao enviar mensagem.";
        console.error("addMessageToTicket error:", error);
        return { success: false, message };
    }
}


export async function markTicketAsRead(input: z.infer<typeof markAsReadSchema>): Promise<{ success: boolean; message?: string }> {
    const validation = markAsReadSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, message: "Dados inválidos." };
    }
    
    const { ticketId, userId } = input;

    try {
        const ticketRef = firestore.collection('tickets').doc(ticketId);
        const userRef = firestore.collection('users').doc(userId);

        const [ticketDoc, userDoc] = await Promise.all([ticketRef.get(), userRef.get()]);

        if (!ticketDoc.exists()) {
            return { success: false, message: "Chamado não encontrado." };
        }
        if (!userDoc.exists()) {
            return { success: false, message: "Usuário não encontrado." };
        }

        const userData = userDoc.data();
        const isAdmin = userData?.role === 'super_admin' || userData?.role === 'manager';
        const ticketData = ticketDoc.data();
        
        let updateData = {};
        if (isAdmin) {
             if (ticketData?.unreadByAdmin > 0) {
                updateData = { unreadByAdmin: 0 };
            }
        } else {
            if (ticketData?.unreadByUser > 0) {
                updateData = { unreadByUser: 0 };
            }
        }

        if (Object.keys(updateData).length > 0) {
            await ticketRef.update(updateData);
        }
        
        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao marcar chamado como lido.";
        console.error("markTicketAsRead error:", error);
        return { success: false, message };
    }
}


export async function updateTicketStatus(input: z.infer<typeof updateStatusSchema>): Promise<{ success: boolean; message?: string }> {
    const validation = updateStatusSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, message: "Dados de atualização de status inválidos." };
    }
    const { ticketId, status } = validation.data;

    try {
        const ticketRef = firestore.collection('tickets').doc(ticketId);

        await ticketRef.update({
            status: status,
            updatedAt: FieldValue.serverTimestamp(),
        });
        
        return { success: true };
    } catch(error) {
        const message = error instanceof Error ? error.message : "Erro ao atualizar status do chamado.";
        console.error("updateTicketStatus error:", error);
        return { success: false, message };
    }
}
    

