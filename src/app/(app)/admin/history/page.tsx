
'use client';

import { useState, useEffect, useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { getActivityLogs, type ActivityLog } from "@/app/actions/users";
import { Badge } from "@/components/ui/badge";
import { BookMarked, Inbox } from "lucide-react";

export default function AdminHistoryPage() {
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [emailFilter, setEmailFilter] = useState("");
    const [documentFilter, setDocumentFilter] = useState("");
    const [providerFilter, setProviderFilter] = useState("all");

    useEffect(() => {
        async function loadLogs() {
            setIsLoading(true);
            const { logs: fetchedLogs, error: fetchError } = await getActivityLogs();
            if (fetchError) {
                setError(fetchError);
            } else {
                setLogs(fetchedLogs || []);
            }
            setIsLoading(false);
        }
        loadLogs();
    }, []);

    const providers = useMemo(() => {
        const allProviders = logs.map(log => log.provider).filter(Boolean);
        return ['all', ...Array.from(new Set(allProviders))];
    }, [logs]);

    const filteredLogs = useMemo(() => {
        return logs.filter(log => {
            const emailMatch = log.userEmail.toLowerCase().includes(emailFilter.toLowerCase());
            const documentMatch = log.documentNumber ? log.documentNumber.includes(documentFilter) : documentFilter === "";
            const providerMatch = providerFilter === 'all' || log.provider === providerFilter;
            return emailMatch && documentMatch && providerMatch;
        });
    }, [logs, emailFilter, documentFilter, providerFilter]);
    
    const getProviderVariant = (provider: string = '') => {
        if (provider.includes('v8')) return 'secondary';
        if (provider.includes('facta')) return 'default';
        return 'outline';
    }


    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title="Histórico de Atividade"
                description="Visualize e filtre todos os logs de atividade da plataforma."
            />
            <Card>
                <CardHeader>
                    <CardTitle>Filtros</CardTitle>
                    <CardDescription>Use os campos abaixo para filtrar os logs de atividade.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Input
                            placeholder="Filtrar por e-mail do usuário..."
                            value={emailFilter}
                            onChange={e => setEmailFilter(e.target.value)}
                        />
                        <Input
                            placeholder="Filtrar por documento (CPF)..."
                            value={documentFilter}
                            onChange={e => setDocumentFilter(e.target.value)}
                        />
                        <Select value={providerFilter} onValueChange={setProviderFilter}>
                            <SelectTrigger>
                                <SelectValue placeholder="Filtrar por provedor" />
                            </SelectTrigger>
                            <SelectContent>
                                {providers.map(provider => (
                                    <SelectItem key={provider} value={provider}>
                                        {provider === 'all' ? 'Todos os Provedores' : provider.toUpperCase()}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            <Card>
                 <CardContent className="pt-6">
                     <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Usuário</TableHead>
                                    <TableHead>Ação</TableHead>
                                    <TableHead>Documento</TableHead>
                                    <TableHead>Provedor</TableHead>
                                    <TableHead className="text-right">Data</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    Array.from({ length: 10 }).map((_, i) => (
                                        <TableRow key={i}>
                                            <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                                            <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                                            <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                                            <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                                            <TableCell className="text-right"><Skeleton className="h-5 w-36" /></TableCell>
                                        </TableRow>
                                    ))
                                ) : filteredLogs.length > 0 ? (
                                    filteredLogs.map(log => (
                                        <TableRow key={log.id}>
                                            <TableCell className="font-medium truncate">{log.userEmail}</TableCell>
                                            <TableCell>{log.action}</TableCell>
                                            <TableCell className="font-mono text-xs">{log.documentNumber || 'N/A'}</TableCell>
                                            <TableCell>
                                                {log.provider && (
                                                    <Badge variant={getProviderVariant(log.provider)}>{log.provider.toUpperCase()}</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                                                {new Date(log.createdAt).toLocaleString('pt-BR')}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-60 text-center">
                                             <div className="flex flex-col items-center justify-center gap-4">
                                                <Inbox className="h-12 w-12 text-muted-foreground" />
                                                <h3 className="text-xl font-bold tracking-tight">Nenhum log encontrado</h3>
                                                <p className="text-sm text-muted-foreground">
                                                    Não há registros que correspondam aos filtros aplicados.
                                                </p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                 </CardContent>
            </Card>
        </div>
    );
}
