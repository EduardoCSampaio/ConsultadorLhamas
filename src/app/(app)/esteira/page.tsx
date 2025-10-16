
'use client';

import { useState, useEffect, useCallback } from "react";
import Link from 'next/link';
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Download, RefreshCw, AlertCircle, Inbox, Trash2, Play, Timer, CheckCircle, FileText, Briefcase, ExternalLink } from 'lucide-react';
import { getBatches, deleteBatch, type BatchJob, gerarRelatorioLote, reprocessarLoteComErro } from '@/app/actions/batch';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useUser } from "@/firebase";

const formatDuration = (ms: number) => {
    if (ms < 0) ms = 0;
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
};


export default function EsteiraPage() {
    const { toast } = useToast();
    const { user } = useUser();
    const [batches, setBatches] = useState<BatchJob[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isReprocessing, setIsReprocessing] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [_, setTick] = useState(0); // For re-rendering to update timer

    const fetchBatches = useCallback(async (showLoading = true) => {
        if (!user) return;
        if(showLoading) setIsLoading(true);
        setError(null);
        const { batches: fetchedBatches, error: fetchError } = await getBatches({ userId: user.uid });
        if (fetchError) {
            setError(fetchError);
            toast({ variant: 'destructive', title: 'Erro ao buscar lotes', description: fetchError });
            setBatches([]);
        } else {
            setBatches(fetchedBatches || []);
        }
        if(showLoading) setIsLoading(false);
    }, [toast, user]);

    useEffect(() => {
        if (user) {
            fetchBatches(true); // Initial fetch with loading screen
        }
    }, [user, fetchBatches]);

    useEffect(() => {
        // Interval to update the visual timer every second
        const timerInterval = setInterval(() => {
            setTick(t => t + 1);
        }, 1000);
        
        // Interval to fetch data from the server every 10 seconds
        const dataFetchInterval = setInterval(() => {
            setBatches(currentBatches => {
                // Only fetch data if there's a batch currently processing or pending
                if (currentBatches.some(b => b.status === 'processing' || b.status === 'pending')) {
                    fetchBatches(false); // Fetch silently in the background
                }
                return currentBatches;
            });
        }, 10000);

        return () => {
            clearInterval(timerInterval);
            clearInterval(dataFetchInterval);
        };
    }, [fetchBatches]);
    
    const handleDownloadReport = async (batch: BatchJob) => {
        if (!user) {
            toast({ variant: "destructive", title: "Erro de autenticação" });
            return;
        }
        toast({ title: "Gerando relatório...", description: "Aguarde enquanto preparamos seu arquivo." });
        const result = await gerarRelatorioLote({ 
            cpfs: batch.cpfs, 
            fileName: batch.fileName, 
            createdAt: batch.createdAt, 
            provider: batch.provider,
            userId: user.uid,
            batchId: batch.id,
        });
        
        if (result.status === 'success' && result.fileContent && result.fileName) {
            const link = document.createElement("a");
            link.href = result.fileContent;
            link.download = result.fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            toast({ title: "Download iniciado!", description: `O arquivo ${result.fileName} está sendo baixado.` });
        } else {
            toast({ variant: "destructive", title: "Erro ao gerar relatório", description: result.message });
        }
    };
    
    const handleDeleteBatch = async (batchId: string) => {
        const { status, message } = await deleteBatch({ batchId });
        if (status === 'success') {
            toast({ title: 'Lote excluído!', description: message });
            await fetchBatches(false); 
        } else {
            toast({ variant: 'destructive', title: 'Erro ao excluir lote', description: message });
        }
    };

    const handleReprocessBatch = async (batchId: string) => {
        setIsReprocessing(batchId);
        toast({ title: "Tentando reprocessar...", description: "Enviando comando para o servidor."})
        const result = await reprocessarLoteComErro({ batchId });
        if (result.status === 'success') {
            toast({
                title: 'Reprocessamento iniciado!',
                description: result.message,
            });
            await fetchBatches(false);
        } else {
            toast({
                variant: 'destructive',
                title: 'Erro ao reprocessar',
                description: result.message
            });
        }
        setIsReprocessing(null);
    };

    const getStatusVariant = (status: BatchJob['status']) => {
        switch (status) {
            case 'completed': return 'default';
            case 'processing': return 'secondary';
            case 'error': return 'destructive';
            case 'pending': return 'outline';
            default: return 'outline';
        }
    };
    
    const getStatusText = (status: BatchJob['status']) => {
        switch (status) {
            case 'completed': return 'Completo';
            case 'processing': return 'Processando';
            case 'error': return 'Erro';
            case 'pending': return 'Pendente';
            default: return 'Desconhecido';
        }
    }


    const BatchCard = ({ batch }: { batch: BatchJob }) => {
        return (
            <Card>
                <CardContent className="p-4 space-y-3">
                    <div className="flex justify-between items-start">
                        <div>
                            <div className='flex items-center gap-2 mb-1'>
                                {batch.type === 'fgts' ? <FileText className='h-5 w-5 text-muted-foreground'/> : <Briefcase className='h-5 w-5 text-muted-foreground'/>}
                                <h3 className="font-semibold">{batch.fileName} ({batch.provider.toUpperCase()})</h3>
                            </div>
                            <div className="text-sm text-muted-foreground">
                                Enviado em: {new Date(batch.createdAt).toLocaleString('pt-BR')}
                            </div>
                                {batch.status === 'processing' && (
                                <div className="text-sm text-muted-foreground flex items-center gap-1.5">
                                    <Timer className="h-3.5 w-3.5"/>
                                    Em andamento por: {formatDuration(Date.now() - new Date(batch.createdAt).getTime())}
                                </div>
                            )}
                            {(batch.status === 'completed' || batch.status === 'error') && batch.completedAt && (
                                    <div className="text-sm text-muted-foreground flex items-center gap-1.5">
                                    <CheckCircle className="h-3.5 w-3.5"/>
                                    Concluído em: {formatDuration(new Date(batch.completedAt).getTime() - new Date(batch.createdAt).getTime())} - {new Date(batch.completedAt).toLocaleDateString('pt-BR')} às {new Date(batch.completedAt).toLocaleTimeString('pt-BR')}
                                </div>
                            )}
                        </div>
                        <div className='flex items-center gap-2'>
                            <Badge variant={getStatusVariant(batch.status)} className="capitalize">{getStatusText(batch.status)}</Badge>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10">
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                    <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Esta ação não pode ser desfeita. Isso irá excluir permanentemente o lote e seus dados associados.
                                    </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction
                                        className="bg-destructive hover:bg-destructive/90"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteBatch(batch.id);
                                        }}
                                    >
                                        Excluir
                                    </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </div>
                    
                    <div>
                        <div className="flex justify-between text-sm text-muted-foreground mb-1">
                            <span>Progresso</span>
                            <span>{batch.processedCpfs} / {batch.totalCpfs}</span>
                        </div>
                        <Progress value={(batch.processedCpfs / batch.totalCpfs) * 100} />
                    </div>

                    {batch.status === 'error' && (
                            <Alert variant="destructive" className="mt-2">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Erro no Lote</AlertTitle>
                            <AlertDescription>{batch.message || "Ocorreu um erro desconhecido durante o processamento."}</AlertDescription>
                            </Alert>
                    )}
                    <div className="mt-4 flex flex-wrap gap-2">
                        {batch.status === 'completed' && (
                            <Button onClick={() => handleDownloadReport(batch)} size="sm">
                                <Download className="mr-2 h-4 w-4" />
                                Baixar Relatório
                            </Button>
                        )}
                        {batch.status === 'error' && (
                            <Button onClick={() => handleReprocessBatch(batch.id)} size="sm" variant="outline" disabled={isReprocessing === batch.id}>
                                {isReprocessing === batch.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                                Tentar Novamente
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title="Esteira de Processamento de Lotes"
                description="Acompanhe o andamento e baixe os relatórios dos lotes enviados para consulta."
            >
                <Button variant="outline" onClick={() => fetchBatches(true)} disabled={isLoading}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    Atualizar
                </Button>
            </PageHeader>
            
            {error && (
                 <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Erro ao Carregar Esteira</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                 </Alert>
            )}

            {isLoading ? (
                <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Card key={i}>
                            <CardContent className="p-4 space-y-3">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <Skeleton className="h-5 w-48 mb-2" />
                                        <Skeleton className="h-4 w-64" />
                                    </div>
                                    <Skeleton className="h-8 w-24" />
                                </div>
                                <div>
                                    <div className="flex justify-between mb-1">
                                        <Skeleton className="h-4 w-16" />
                                        <Skeleton className="h-4 w-20" />
                                    </div>
                                    <Skeleton className="h-2 w-full" />
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : batches.length === 0 && !error ? (
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex flex-col items-center justify-center gap-4 text-center h-60 border-2 border-dashed rounded-lg">
                            <Inbox className="h-12 w-12 text-muted-foreground" />
                            <h3 className="text-2xl font-bold tracking-tight">
                                Nenhum Lote na Esteira
                            </h3>
                            <div className="text-sm text-muted-foreground">
                               Envie um lote nas páginas de consulta em lote para começar.
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    {batches.map(batch => (
                        <BatchCard key={batch.id} batch={batch} />
                    ))}
                </div>
            )}
        </div>
    );
}
