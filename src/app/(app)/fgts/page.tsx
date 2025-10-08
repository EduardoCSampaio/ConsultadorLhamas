'use client';

import { useState, useCallback, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { useDropzone } from 'react-dropzone';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { UploadCloud, File, Loader2, Download, RefreshCw, AlertCircle } from 'lucide-react';
import { processarLoteFgts, gerarRelatorioLote, getBatchStatus, type BatchJob } from '@/app/actions/batch';
import { useUser } from '@/firebase';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";


type Provider = 'v8' | 'facta';

export default function FgtsBatchPage() {
    const { toast } = useToast();
    const { user } = useUser();
    const [file, setFile] = useState<File | null>(null);
    const [cpfs, setCpfs] = useState<string[]>([]);
    const [selectedProviders, setSelectedProviders] = useState<Provider[]>(['v8', 'facta']);
    const [isProcessing, setIsProcessing] = useState(false);
    const [activeBatches, setActiveBatches] = useState<BatchJob[]>([]);

    useEffect(() => {
        const storedBatches = localStorage.getItem('activeFgtsBatches');
        if (storedBatches) {
            setActiveBatches(JSON.parse(storedBatches));
        }
    }, []);

    useEffect(() => {
        localStorage.setItem('activeFgtsBatches', JSON.stringify(activeBatches));
    }, [activeBatches]);

    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (acceptedFiles.length > 0) {
            const uploadedFile = acceptedFiles[0];
            if (uploadedFile.type !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' && uploadedFile.name.split('.').pop() !== 'xlsx') {
                toast({
                    variant: "destructive",
                    title: "Tipo de arquivo inválido",
                    description: "Por favor, envie um arquivo .xlsx.",
                });
                return;
            }
            setFile(uploadedFile);
            const reader = new FileReader();
            reader.onload = (event) => {
                const data = new Uint8Array(event.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                const extractedCpfs = json.flat().map(String).filter(cpf => cpf && /^\d{11}$/.test(cpf));
                setCpfs(extractedCpfs);
                if (extractedCpfs.length === 0) {
                    toast({
                        variant: "destructive",
                        title: "Nenhum CPF válido encontrado",
                        description: "A planilha não contém CPFs válidos na primeira coluna.",
                    });
                }
            };
            reader.readAsArrayBuffer(uploadedFile);
        }
    }, [toast]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        multiple: false,
        accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] }
    });

    const handleProviderChange = (provider: Provider) => {
        setSelectedProviders(prev =>
            prev.includes(provider) ? prev.filter(p => p !== provider) : [...prev, provider]
        );
    };

    const handleProcessBatch = async () => {
        if (!file || cpfs.length === 0 || selectedProviders.length === 0 || !user) {
            toast({
                variant: "destructive",
                title: "Faltam informações",
                description: "Verifique se um arquivo foi selecionado, se ele contém CPFs e se pelo menos um provedor foi escolhido.",
            });
            return;
        }

        setIsProcessing(true);
        const newBatches: BatchJob[] = [];
        for (const provider of selectedProviders) {
            const result = await processarLoteFgts({
                cpfs,
                provider,
                userId: user.uid,
                userEmail: user.email!,
                fileName: file.name,
            });

            if (result.status === 'success' && result.batch) {
                newBatches.push(result.batch);
                toast({
                    title: `Lote para ${provider.toUpperCase()} iniciado`,
                    description: `${cpfs.length} CPFs foram enviados para processamento.`,
                });
            } else {
                toast({
                    variant: "destructive",
                    title: `Erro ao iniciar lote para ${provider.toUpperCase()}`,
                    description: result.message,
                });
            }
        }
        setActiveBatches(prev => [...newBatches, ...prev]);
        setFile(null);
        setCpfs([]);
        setIsProcessing(false);
    };

    const handleRefreshStatus = useCallback(async (batchId: string) => {
        const { status, batch, message } = await getBatchStatus({ batchId });
        if (status === 'success' && batch) {
            setActiveBatches(prev => prev.map(b => b.id === batchId ? batch : b));
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
                title="Consulta de Saldo FGTS em Lote"
                description="Envie uma planilha com CPFs para consultar o saldo em massa nos provedores."
            />

            <Card>
                <CardHeader>
                    <CardTitle>1. Enviar Planilha</CardTitle>
                </CardHeader>
                <CardContent>
                    <div {...getRootProps()} className={`flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${isDragActive ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}>
                        <input {...getInputProps()} />
                        <UploadCloud className="h-12 w-12 text-muted-foreground mb-4" />
                        {file ? (
                            <div className='text-center'>
                                <p className="font-semibold">{file.name}</p>
                                <p className="text-sm text-muted-foreground">{cpfs.length} CPFs válidos encontrados.</p>
                            </div>
                        ) : (
                            <div className='text-center'>
                                <p className="font-semibold">Arraste e solte o arquivo .xlsx aqui</p>
                                <p className="text-sm text-muted-foreground">ou clique para selecionar</p>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>2. Selecionar Provedores</CardTitle>
                    <CardDescription>Escolha em quais provedores a consulta de FGTS será realizada.</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center space-x-6">
                    <div className="flex items-center space-x-2">
                        <Checkbox id="v8" checked={selectedProviders.includes('v8')} onCheckedChange={() => handleProviderChange('v8')} />
                        <Label htmlFor="v8" className='text-base'>V8 (Webhook)</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Checkbox id="facta" checked={selectedProviders.includes('facta')} onCheckedChange={() => handleProviderChange('facta')} />
                        <Label htmlFor="facta" className='text-base'>Facta (Síncrono)</Label>
                    </div>
                </CardContent>
            </Card>

            <Button onClick={handleProcessBatch} disabled={isProcessing || !file || cpfs.length === 0 || selectedProviders.length === 0}>
                {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <File className="mr-2 h-4 w-4" />}
                Processar Lote
            </Button>

            {activeBatches.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Lotes de Processamento</CardTitle>
                        <CardDescription>Acompanhe o andamento e baixe os relatórios dos lotes enviados.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {activeBatches.map(batch => (
                            <div key={batch.id} className="p-4 border rounded-lg space-y-3">
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
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
