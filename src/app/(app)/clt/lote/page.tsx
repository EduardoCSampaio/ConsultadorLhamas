'use client';

import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { useDropzone } from 'react-dropzone';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { UploadCloud, File, Loader2, ArrowRight } from 'lucide-react';
import { processarLoteClt } from '@/app/actions/batch';
import { useUser } from '@/firebase';
import Link from 'next/link';

type Provider = 'v8' | 'facta' | 'c6';

export default function CltBatchPage() {
    const { toast } = useToast();
    const { user } = useUser();
    const [file, setFile] = useState<File | null>(null);
    const [cpfs, setCpfs] = useState<string[]>([]);
    const [selectedProviders, setSelectedProviders] = useState<Provider[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    
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
                const extractedCpfs = json.flat().map(String).filter(cpf => cpf && /^\d{11}$/.test(cpf.trim()));
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
        for (const provider of selectedProviders) {
            const result = await processarLoteClt({
                cpfs,
                provider,
                userId: user.uid,
                userEmail: user.email!,
                fileName: file.name,
            });

            if (result.status === 'success' && result.batch) {
                toast({
                    title: `Lote CLT para ${result.batch.provider.toUpperCase()} iniciado`,
                    description: `${cpfs.length} CPFs foram enviados para a esteira.`,
                });
            } else {
                toast({
                    variant: "destructive",
                    title: `Erro ao iniciar lote CLT para ${provider.toUpperCase()}`,
                    description: result.message,
                });
            }
        }
        setFile(null);
        setCpfs([]);
        setSelectedProviders([]);
        setIsProcessing(false);
         toast({
            title: "Lotes enviados!",
            description: (
                <Button variant="outline" size="sm" asChild>
                    <Link href="/esteira">
                        Acompanhar na Esteira
                        <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                </Button>
            )
        });
    };

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title="Consulta de Crédito CLT em Lote"
                description="Envie uma planilha com CPFs para consultar ofertas de crédito em massa nos provedores."
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
                    <CardDescription>Escolha em quais provedores a consulta de CLT será realizada.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-6">
                    <div className="flex items-center space-x-6">
                        <div className="flex items-center space-x-2">
                            <Checkbox id="v8" checked={selectedProviders.includes('v8')} onCheckedChange={() => handleProviderChange('v8')} />
                            <Label htmlFor="v8" className='text-base'>V8</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Checkbox id="facta" checked={selectedProviders.includes('facta')} onCheckedChange={() => handleProviderChange('facta')} />
                            <Label htmlFor="facta" className='text-base'>FACTA</Label>
                        </div>
                         <div className="flex items-center space-x-2">
                            <Checkbox id="c6" checked={selectedProviders.includes('c6')} onCheckedChange={() => handleProviderChange('c6')} />
                            <Label htmlFor="c6" className='text-base'>C6</Label>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Button onClick={handleProcessBatch} disabled={isProcessing || !file || cpfs.length === 0 || selectedProviders.length === 0}>
                {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <File className="mr-2 h-4 w-4" />}
                Processar Lote
            </Button>
        </div>
    );
}