
'use client';

import { useState, useEffect, useCallback } from "react";
import Link from 'next/link';
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Download, RefreshCw, AlertCircle, Inbox } from 'lucide-react';
import { getBatches, getBatchStatus, gerarRelatorioLote, type BatchJob } from '@/app/actions/batch';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

export default function EsteiraPage() {
    const { toast } = useToast();
    const [batches, setBatches] = useState<BatchJob[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchBatches = useCallback(async () => {
        const { batches: fetchedBatches, error: fetchError } = await getBatches();
        if (fetchError) {
            setError(fetchError);
            toast({ variant: 'destructive', title: 'Erro ao buscar lotes', description: fetchError });
        } else {
            setBatches(fetchedBatches || []);
        }
        setIsLoading(false);
    }, [toast]);

    useEffect(() => {
        setIsLoading(true);
        fetchBatches();
    }, [fetchBatches]);

    const handleRefreshStatus = useCallback(async (batchId: string) => {
        const { status, batch, message } = await getBatchStatus({ batchId });
        if (status === 'success' && batch) {
            setBatches(prev => prev.map(b => b.id === batchId ? batch : b));
            toast({ title: 'Status atualizado!', description: `Lote ${batch.fileName} verificado.`});
        } else {
            toast({ variant: 'destructive', title: 'Erro ao atualizar status', description: message });
        }
    }, [toast]);
    
    const handleDownloadReport = async (batch: BatchJob) => {
        toast({ title: "Gerando relatório...", description: "Aguarde enquanto preparamos seu arquivo." });
        const result = await gerarRelatorioLote({ cpfs: batch.cpfs, fileName: batch.fileName, createdAt: batch.createdAt, provider: batch.provider });
        
        if (result.status === 'success') {
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
    
    const getStatusVariant = (status: BatchJob['status']) => {
        switch (status) {
            case 'completed': return 'default';
            case 'processing': return 'secondary';
            case 'error': return 'destructive';
            default: return 'outline';
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title="Esteira de Processamento de Lotes"
                description="Acompanhe o andamento e baixe os relatórios dos lotes enviados para consulta."
            >
                <Button variant="outline" onClick={() => { setIsLoading(true); fetchBatches(); }} disabled={isLoading}>
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
                                        <Badge variant={getStatusVariant(batch.status)} className="capitalize">{batch.status}</Badge>
                                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleRefreshStatus(batch.id)}>
                                            <RefreshCw className="h-4 w-4" />
                                        </Button>
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
                                {batch.status === 'completed' && (
                                    <Button onClick={() => handleDownloadReport(batch)} size="sm">
                                        <Download className="mr-2 h-4 w-4" />
                                        Baixar Relatório
                                    </Button>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
