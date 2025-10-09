
'use client';

import { useState, useEffect, useCallback } from "react";
import Link from 'next/link';
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Download, RefreshCw, AlertCircle, Inbox, Trash2, Play } from 'lucide-react';
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

export default function EsteiraPage() {
    const { toast } = useToast();
    const { user } = useUser();
    const [batches, setBatches] = useState<BatchJob[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isReprocessing, setIsReprocessing] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fetchBatches = useCallback(async (showLoading = true) => {
        if(showLoading) setIsLoading(true);
        setError(null);
        const { batches: fetchedBatches, error: fetchError } = await getBatches();
        if (fetchError) {
            setError(fetchError);
            toast({ variant: 'destructive', title: 'Erro ao buscar lotes', description: fetchError });
            setBatches([]);
        } else {
            setBatches(fetchedBatches || []);
        }
        if(showLoading) setIsLoading(false);
    }, [toast]);

    useEffect(() => {
        fetchBatches(true); // Initial fetch with loading state

        const intervalId = setInterval(() => {
            // Only fetch in the background if there are batches currently processing
            setBatches(currentBatches => {
                if (currentBatches.some(b => b.status === 'processing')) {
                    fetchBatches(false); 
                }
                return currentBatches;
            });
        }, 10000); // 10 seconds

        return () => clearInterval(intervalId);
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
                            <p className="text-sm text-muted-foreground">
                               Envie um lote na página de <Link href="/fgts" className="text-primary underline">Consulta FGTS</Link> para começar.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    {batches.map(batch => (
                        <Card key={batch.id}>
                            <CardContent className="p-4 space-y-3">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="font-semibold">{batch.fileName} ({batch.provider.toUpperCase()})</h3>
                                        <p className="text-sm text-muted-foreground">
                                            Enviado em: {new Date(batch.createdAt).toLocaleString('pt-BR')}
                                        </p>
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
                                                    onClick={() => handleDeleteBatch(batch.id)}
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
                    ))}
                </div>
            )}
        </div>
    );
}
