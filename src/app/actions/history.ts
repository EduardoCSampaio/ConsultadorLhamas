
'use server';

import { z } from 'zod';
import { initializeFirebaseAdmin } from '@/firebase/server-init';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { ActivityLog, logActivity } from './users';
import * as XLSX from 'xlsx';

export type ExportFilters = {
    email?: string;
    provider?: string;
    dateFrom?: string; // ISO String
    dateTo?: string; // ISO String
};

const exportHistorySchema = z.object({
    filters: z.object({
        email: z.string().optional(),
        provider: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
    }),
    userId: z.string(),
});

type ExportResult = {
    status: 'success' | 'error';
    fileName?: string;
    fileContent?: string;
    message?: string;
};

export async function exportHistoryToExcel(input: z.infer<typeof exportHistorySchema>): Promise<ExportResult> {
    const validation = exportHistorySchema.safeParse(input);
    if (!validation.success) {
        return { status: 'error', message: 'Filtros inválidos.' };
    }

    const { filters, userId } = validation.data;
    
    await logActivity({
        userId: userId,
        action: 'Download Histórico',
        details: `Filtros: ${JSON.stringify(filters)}`,
    });

    try {
        initializeFirebaseAdmin();
        const firestore = getFirestore();
        let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = firestore.collection('activityLogs');

        const { email, provider, dateFrom, dateTo } = filters;

        // Apply equality filters first
        if (email) {
            query = query.where('userEmail', '==', email);
        }
        if (provider) {
            query = query.where('provider', '==', provider);
        }
        
        // Always order by date
        query = query.orderBy('createdAt', 'desc');

        const logsSnapshot = await query.get();

        let logs = logsSnapshot.docs.map(doc => {
            const data = doc.data();
            const createdAt = data.createdAt;
            let serializableCreatedAt: string;

            if (createdAt instanceof Timestamp) {
                serializableCreatedAt = createdAt.toDate().toISOString();
            } else if (typeof createdAt === 'string') {
                serializableCreatedAt = createdAt;
            } else {
                serializableCreatedAt = new Date().toISOString();
            }

            return {
                id: doc.id,
                ...data,
                createdAt: serializableCreatedAt,
            } as ActivityLog;
        });

        // Manual date range filtering in memory
        if (dateFrom) {
            const fromDate = new Date(dateFrom);
            fromDate.setHours(0, 0, 0, 0); // Start of the day
            logs = logs.filter(log => new Date(log.createdAt) >= fromDate);
        }
        if (dateTo) {
            const toDate = new Date(dateTo);
            toDate.setHours(23, 59, 59, 999); // End of the day
            logs = logs.filter(log => new Date(log.createdAt) <= toDate);
        }


        if (logs.length === 0) {
            return { status: 'error', message: 'Nenhum registro encontrado com os filtros selecionados.' };
        }

        const dataToExport = logs.map(log => ({
            'Usuário': log.userEmail,
            'Ação': log.action,
            'Documento (CPF)': log.documentNumber || 'N/A',
            'Provedor': log.provider ? log.provider.toUpperCase() : 'N/A',
            'Detalhes': log.details || 'N/A',
            'Data': new Date(log.createdAt).toLocaleString('pt-BR'),
        }));
        
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Histórico de Atividade');
        
        const header = ['Usuário', 'Ação', 'Documento (CPF)', 'Provedor', 'Detalhes', 'Data'];
        const colWidths = header.map(h => ({ wch: Math.max(h.length, 20) }));
        worksheet['!cols'] = colWidths;

        const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
        const base64String = buffer.toString('base64');
        const fileContent = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64String}`;
        
        const formattedDate = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
        const fileName = `Relatorio_Atividades_${formattedDate}.xlsx`;
        
        return {
            status: 'success',
            fileName,
            fileContent,
        };

    } catch (error) {
        const message = error instanceof Error ? error.message : "Ocorreu um erro desconhecido durante a exportação do histórico.";
        console.error("Erro ao exportar histórico:", error);
        // This may indicate a missing index.
        if (message.includes('requires an index')) {
            return { status: 'error', message: 'A consulta requer um índice do Firestore que não existe. Tente filtros menos complexos ou crie o índice no Console do Firebase.' };
        }
        return { status: 'error', message };
    }
}
