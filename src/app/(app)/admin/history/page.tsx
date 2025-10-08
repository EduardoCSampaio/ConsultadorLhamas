
'use client';

import { useState, useEffect, useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { getActivityLogs, type ActivityLog } from "@/app/actions/users";
import { exportHistoryToExcel, type ExportFilters } from "@/app/actions/history";
import { Badge } from "@/components/ui/badge";
import { BookMarked, Inbox, Download, Loader2, CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { useUser } from "@/firebase";


export default function AdminHistoryPage() {
    const { toast } = useToast();
    const { user } = useUser();
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filters for the table
    const [emailFilter, setEmailFilter] = useState("");
    const [documentFilter, setDocumentFilter] = useState("");
    const [providerFilter, setProviderFilter] = useState("all");
    
    // State for the export modal
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [exportEmail, setExportEmail] = useState("");
    const [exportProvider, setExportProvider] = useState("all");
    const [exportDateRange, setExportDateRange] = useState<DateRange | undefined>();


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
        const allProviders = logs.map(log => log.provider).filter(Boolean).map(p => p!.toUpperCase());
        return ['all', ...Array.from(new Set(allProviders))];
    }, [logs]);

    const filteredLogs = useMemo(() => {
        return logs.filter(log => {
            const emailMatch = log.userEmail.toLowerCase().includes(emailFilter.toLowerCase());
            const documentMatch = log.documentNumber ? log.documentNumber.includes(documentFilter) : documentFilter === "";
            const providerMatch = providerFilter === 'all' || log.provider?.toUpperCase() === providerFilter;
            return emailMatch && documentMatch && providerMatch;
        });
    }, [logs, emailFilter, documentFilter, providerFilter]);
    
    const getProviderVariant = (provider: string = '') => {
        if (provider.toLowerCase().includes('v8')) return 'secondary';
        if (provider.toLowerCase().includes('facta')) return 'default';
        return 'outline';
    }
    
    const handleExport = async () => {
        if (!user) {
            toast({ variant: "destructive", title: "Erro de autenticação", description: "Usuário não encontrado."});
            return;
        }
        setIsExporting(true);
        toast({ title: "Gerando relatório...", description: "Isso pode levar alguns segundos. Aguarde." });

        const filters: ExportFilters = {
            email: exportEmail || undefined,
            provider: exportProvider === 'all' ? undefined : exportProvider,
            dateFrom: exportDateRange?.from?.toISOString(),
            dateTo: exportDateRange?.to?.toISOString(),
        };
        
        const result = await exportHistoryToExcel({
            filters,
            userId: user.uid,
        });

        if (result.status === 'success' && result.fileContent && result.fileName) {
            const link = document.createElement("a");
            link.href = result.fileContent;
            link.download = result.fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            toast({ title: "Download iniciado!", description: `O arquivo ${result.fileName} está sendo baixado.` });
            setIsExportModalOpen(false); // Close modal on success
        } else {
            toast({ variant: "destructive", title: "Erro ao exportar", description: result.message });
        }
        
        setIsExporting(false);
    }


    return (
        <>
            <PageHeader
                title="Histórico de Atividade"
                description="Visualize e filtre todos os logs de atividade da plataforma."
            >
                <Dialog open={isExportModalOpen} onOpenChange={setIsExportModalOpen}>
                    <DialogTrigger asChild>
                         <Button>
                            <Download className="mr-2 h-4 w-4" />
                            Extrair Histórico
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[480px]">
                        <DialogHeader>
                            <DialogTitle>Extrair Histórico de Atividade</DialogTitle>
                            <DialogDescription>
                                Selecione os filtros para exportar os logs em uma planilha Excel.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="email-export" className="text-right">
                                    E-mail
                                </Label>
                                <Input 
                                    id="email-export" 
                                    placeholder="Filtrar por e-mail..." 
                                    className="col-span-3"
                                    value={exportEmail}
                                    onChange={(e) => setExportEmail(e.target.value)}
                                />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="provider-export" className="text-right">
                                    Provedor
                                </Label>
                                    <Select value={exportProvider} onValueChange={setExportProvider}>
                                    <SelectTrigger className="col-span-3">
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
                                <div className="grid grid-cols-4 items-center gap-4">
                                <Label className="text-right">
                                    Período
                                </Label>
                                <div className="col-span-3">
                                    <Popover>
                                        <PopoverTrigger asChild>
                                        <Button
                                            id="date"
                                            variant={"outline"}
                                            className={cn(
                                            "w-full justify-start text-left font-normal",
                                            !exportDateRange && "text-muted-foreground"
                                            )}
                                        >
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {exportDateRange?.from ? (
                                            exportDateRange.to ? (
                                                <>
                                                {format(exportDateRange.from, "LLL dd, y")} -{" "}
                                                {format(exportDateRange.to, "LLL dd, y")}
                                                </>
                                            ) : (
                                                format(exportDateRange.from, "LLL dd, y")
                                            )
                                            ) : (
                                            <span>Selecione o período</span>
                                            )}
                                        </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar
                                            initialFocus
                                            mode="range"
                                            defaultMonth={exportDateRange?.from}
                                            selected={exportDateRange}
                                            onSelect={setExportDateRange}
                                            numberOfMonths={2}
                                        />
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsExportModalOpen(false)}>Cancelar</Button>
                            <Button onClick={handleExport} disabled={isExporting}>
                                    {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                                Exportar
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </PageHeader>
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
                                    <TableHead>Detalhes</TableHead>
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
                                            <TableCell className="font-mono text-xs">{log.details || log.documentNumber || 'N/A'}</TableCell>
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
        </>
    );
}
