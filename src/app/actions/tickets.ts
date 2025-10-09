
'use server';

import { z } from 'zod';
import { initializeFirebaseAdmin } from '@/firebase/server-init';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

const createTicketSchema = z.object({
  userId: z.string().min(1),
  userEmail: z.string().email(),
  title: z.string().min(5).max(100),
  initialMessage: z.string().min(10).max(1000),
});

const getTicketsSchema = z.object({
    userId: z.string().min(1),
});

export type Ticket = {
    id: string;
    ticketNumber: string;
    userId: string;
    userEmail: string;
    title: string;
    status: 'aberto' | 'em_atendimento' | 'resolvido';
    createdAt: string; // ISO String
    updatedAt: string; // ISO String
    lastMessage?: string;
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
    const firestore = getFirestore();
    const counterRef = firestore.collection('internal').doc('ticketCounter');
    
    let newNumber = 1;
    await firestore.runTransaction(async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        if (!counterDoc.exists) {
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
        initializeFirebaseAdmin();
        const firestore = getFirestore();
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
        initializeFirebaseAdmin();
        const firestore = getFirestore();
        const ticketsSnapshot = await firestore.collection('tickets')
            .where('userId', '==', input.userId)
            .orderBy('updatedAt', 'desc')
            .get();

        if (ticketsSnapshot.empty) {
            return { success: true, tickets: [] };
        }

        const tickets = ticketsSnapshot.docs.map(doc => {
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
            } as Ticket;
        });

        return { success: true, tickets };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Ocorreu um erro ao buscar seus chamados.";
        console.error(`getTicketsForUser error for user ${input.userId}:`, error);
        return { success: false, error: message };
    }
}
