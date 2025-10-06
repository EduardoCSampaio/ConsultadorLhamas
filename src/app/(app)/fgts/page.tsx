

'use client';

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Search, CheckCircle2, XCircle, Circle, User, Briefcase, Landmark, Calendar, Banknote, Upload, FileText, Download, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useEffect, useRef, ChangeEvent } from "react";
import { consultarSaldoFgts } from "@/app/actions/fgts";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useFirestore, useMemoFirebase } from "@/firebase";
import { doc } from "firebase/firestore";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import * as XLSX from 'xlsx';
import { processarLoteFgts, gerarRelatorioLote } from "@/app/actions/batch";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

const manualFormSchema = z.object({
  documentNumber: z.string().min(11, {
    message: "O CPF deve ter no mínimo 11 caracteres.",
  }),
  provider: z.enum(["cartos", "bms", "qi"], {
    required_error: "Você precisa selecionar um provedor.",
  }),
});

const loteFormSchema = z.object({
    provider: z.enum(["cartos", "bms", "qi"], {
        required_error: "Você precisa selecionar um provedor.",
    }),
});

type StepStatus = "pending" | "running" | "success" | "error";
type StatusStep = {
  name: string;
  status: StepStatus;
  message?: string;
};

type BatchJob = {
  id: string;
  fileName: string;
  provider: string;
  status: 'processing' | 'completed' | 'error';
  totalCpfs: number;
  processedCpfs: number;
  cpfs: string[];
  createdAt: string; // Add timestamp for consistent naming
};


const initialSteps: StatusStep[] = [
  { name: "Autenticando com a API V8", status: "pending" },
  { name: "Enviando solicitação de consulta", status: "pending" },
  { name: "Aguardando resposta do Webhook", status: "pending" },
];

function ProviderSelector({ control, disabled }: { control: any; disabled?: boolean; }) {
    return (
        <FormField
            control={control}
            name="provider"
            render={({ field }) => (
                <FormItem className="space-y-3">
                    <FormLabel>Selecione o Provedor</FormLabel>
                    <FormControl>
                        <RadioGroup
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                            className="flex flex-col space-y-1"
                            disabled={disabled}
                        >
                            <FormItem className="flex items-center space-x-3 space-y-0">
                                <FormControl>
                                    <RadioGroupItem value="cartos" />
                                </FormControl>
                                <FormLabel className="font-normal">Cartos</FormLabel>
                            </FormItem>
                            <FormItem className="flex items-center space-x-3 space-y-0">
                                <FormControl>
                                    <RadioGroupItem value="bms" />
                                </FormControl>
                                <FormLabel className="font-normal">BMS</FormLabel>
                            </FormItem>
                            <FormItem className="flex items-center space-x-3 space-y-0">
                                <FormControl>
                                    <RadioGroupItem value="qi" />
                               
                                </FormControl>
                                <FormLabel className="font-normal">QI</FormLabel>
                            </FormItem>
                        </RadioGroup>
                    </FormControl>
                    <FormMessage />
                </FormItem>
            )} />
    );
}

const StepIcon = ({ status }: { status: StepStatus }) => {
    switch (status) {
      case "running":
        return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
      case "success":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "error":
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Circle className="h-5 w-5 text-muted-foreground" />;
    }
  };

const formatCurrency = (value: string | number | undefined | null) => {
    if (value === undefined || value === null) return 'N/A';
    const numberValue = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(numberValue)) return 'N/A';
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(numberValue);
};

const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'N/A';
    // Handle ISO string with or without milliseconds
    try {
        return new Date(dateString).toLocaleDateString('pt-BR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    } catch {
        return 'Data inválida';
    }
};

const formatBatchName = (fileName: string, isoDate: string) => {
    const date = new Date(isoDate);
    const formattedDate = date.toLocaleDateString('pt-BR').replace(/\//g, '-');
    const formattedTime = date.toTimeString().split(' ')[0].replace(/:/g, '-');
    return `HIGIENIZACAO_${fileName}_${formattedDate}_${formattedTime}`;
};

const LOCAL_STORAGE_KEY = 'recentBatches';
const ITEMS_PER_PAGE = 5;

export default function FgtsPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [currentCpf, setCurrentCpf] = useState<string | null>(null);
  const [statusSteps, setStatusSteps] = useState<StatusStep[]>(initialSteps);
  const [showStatus, setShowStatus] = useState(false);
  
  const [file, setFile] = useState<File | null>(null);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const firestore = useFirestore();

  const [recentBatches, setRecentBatches] = useState<BatchJob[]>(() => {
    if (typeof window === 'undefined') {
        return [];
    }
    try {
        const storedBatches = window.localStorage.getItem(LOCAL_STORAGE_KEY);
        return storedBatches ? JSON.parse(storedBatches) : [];
    } catch (error) {
        console.error("Failed to parse recent batches from localStorage", error);
        return [];
    }
  });

  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.ceil(recentBatches.length / ITEMS_PER_PAGE);
  const paginatedBatches = recentBatches.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    if (typeof window !== 'undefined') {
        try {
            window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(recentBatches));
        } catch (error) {
            console.error("Failed to save recent batches to localStorage", error);
        }
    }
  }, [recentBatches]);

  const manualForm = useForm<z.infer<typeof manualFormSchema>>({
    resolver: zodResolver(manualFormSchema),
    defaultValues: {
      documentNumber: "",
    },
  });

  const loteForm = useForm<z.infer<typeof loteFormSchema>>({
      resolver: zodResolver(loteFormSchema),
  });

  const docRef = useMemoFirebase(() => {
    if (!firestore || !currentCpf) return null;
    return doc(firestore, "webhookResponses", currentCpf);
  }, [firestore, currentCpf]);
  
  const { data: webhookResponse } = useDoc(docRef);

  const webhookData = webhookResponse?.responseBody;

  useEffect(() => {
    if (webhookData && statusSteps[2].status === 'running') {
      setStatusSteps(prev => prev.map((step, index) => 
        index === 2 ? { ...step, status: 'success', message: 'Resposta recebida!' } : step
      ));
    }
  }, [webhookData, statusSteps]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const selectedFile = files[0];
      if (selectedFile.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || selectedFile.type === 'application/vnd.ms-excel') {
        setFile(selectedFile);
      } else {
        toast({
          variant: "destructive",
          title: "Tipo de arquivo inválido",
          description: "Por favor, selecione um arquivo .xlsx ou .xls",
        });
        setFile(null);
      }
    }
  };

  const handleProcessBatch = async () => {
    if (!file) return;

    const provider = loteForm.getValues("provider");
    if (!provider) {
        loteForm.setError("provider", { type: "manual", message: "Selecione um provedor antes de processar." });
        return;
    }

    setIsProcessingBatch(true);

    const reader = new FileReader();
    reader.onload = async (e) => {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        const cpfs = json.slice(1).map(row => String((row as any)[0])).filter(cpf => cpf && cpf.length >= 11);
        
        const newBatch: BatchJob = {
          id: `batch-${Date.now()}`,
          fileName: file.name,
          provider: provider,
          status: 'processing',
          totalCpfs: cpfs.length,
          processedCpfs: 0,
          cpfs: cpfs,
          createdAt: new Date().toISOString(),
        };

        setRecentBatches(prev => [newBatch, ...prev]);

        const result = await processarLoteFgts({ cpfs, provider });
        
        setIsProcessingBatch(false);
        if (result.status === 'success') {
            setRecentBatches(prev => prev.map(b => b.id === newBatch.id ? {...b, status: 'completed'} : b));
            toast({
                title: "Lote enviado para processamento!",
                description: `${result.count} consultas foram iniciadas em segundo plano.`,
            });
        } else {
            setRecentBatches(prev => prev.map(b => b.id === newBatch.id ? {...b, status: 'error'} : b));
            toast({
                variant: "destructive",
                title: "Erro ao processar lote",
                description: result.message,
            });
        }
        setFile(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };
    reader.readAsArrayBuffer(file);
  };
  
  const handleGenerateReport = async (batch: BatchJob) => {
    setIsGeneratingReport(batch.id);
    const result = await gerarRelatorioLote({ 
        cpfs: batch.cpfs, 
        fileName: batch.fileName,
        createdAt: batch.createdAt,
    });
    setIsGeneratingReport(null);

    if (result.status === 'success') {
        const link = document.createElement('a');
        link.href = result.fileContent;
        link.download = result.fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast({
            title: "Relatório gerado com sucesso!",
            description: `O arquivo ${result.fileName} está sendo baixado.`
        });
    } else {
        toast({
            variant: "destructive",
            title: "Erro ao gerar relatório",
            description: result.message,
        });
    }
  };

  const handleDeleteBatch = (batchId: string) => {
    setRecentBatches(prev => prev.filter(b => b.id !== batchId));
    toast({
      title: "Lote excluído",
      description: "O lote foi removido do seu histórico local.",
    });
  };


  async function onManualSubmit(values: z.infer<typeof manualFormSchema>) {
    setIsLoading(true);
    setCurrentCpf(values.documentNumber);
    setShowStatus(true);
    setStatusSteps(initialSteps.map(s => ({...s, status: 'pending', message: undefined})));

    const updateStep = (index: number, status: StepStatus, message?: string) => {
      setStatusSteps(prev => {
        const newSteps = [...prev];
        newSteps[index] = { ...newSteps[index], status, message };
        if (status === 'error') {
          for (let i = index + 1; i < newSteps.length; i++) {
            newSteps[i] = { ...newSteps[i], status: 'pending' };
          }
        }
        return newSteps;
      });
    };
  
    updateStep(0, 'running');
    const result = await consultarSaldoFgts(values);
  
    if (result.status === 'error') {
      updateStep(result.stepIndex, 'error', result.message);
      setIsLoading(false);
      return; 
    }
  
    updateStep(0, 'success');
    updateStep(1, 'success', result.message);
    updateStep(2, 'running');
  
    setIsLoading(false);
  }

  const getBatchProgress = (batch: BatchJob) => {
    if (batch.status === 'processing') return 50; // In-progress state
    if (batch.status === 'completed' || batch.status === 'error') return 100;
    return 0;
  }
  
  const getBatchProgressText = (batch: BatchJob) => {
    if (batch.status === 'processing') return "Em andamento...";
    if (batch.status === 'completed') return "Pronto para download";
    if (batch.status === 'error') return "Falha ao enviar";
    return "Pendente";
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader 
        title="Consulta de Saldo FGTS" 
        description="Realize consultas de saldo de forma manual ou em lote."
      />
      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="manual">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="manual">Consulta Manual</TabsTrigger>
              <TabsTrigger value="lote">Consulta em Lote</TabsTrigger>
            </TabsList>
            <TabsContent value="manual">
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle>Consulta Manual de FGTS</CardTitle>
                  <CardDescription>
                    Preencha as informações abaixo para realizar uma consulta individual.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Form {...manualForm}>
                    <form onSubmit={manualForm.handleSubmit(onManualSubmit)} className="space-y-8">
                      <div className="grid md:grid-cols-2 gap-8">
                        <FormField
                          control={manualForm.control}
                          name="documentNumber"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>CPF do Cliente</FormLabel>
                              <FormControl>
                                <Input placeholder="Digite o CPF" {...field} disabled={isLoading || statusSteps[2].status === 'running'}/>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <ProviderSelector control={manualForm.control} disabled={isLoading || statusSteps[2].status === 'running'} />
                      </div>
                      <Button type="submit" disabled={isLoading || statusSteps[2].status === 'running'}>
                        {isLoading || statusSteps[2].status === 'running' ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Search className="mr-2 h-4 w-4" />
                        )}
                        {statusSteps[2].status === 'running' ? 'Aguardando Resposta...' : 'Consultar Saldo'}
                      </Button>
                    </form>
                  </Form>
                  
                  {showStatus && (
                     <Card className="mt-6">
                        <CardHeader>
                            <CardTitle>Status da Consulta</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ul className="space-y-4">
                                {statusSteps.map((step, index) => (
                                    <li key={index} className="flex items-start gap-4">
                                        <StepIcon status={step.status} />
                                        <div className="flex flex-col">
                                            <span className={cn(
                                                "font-medium",
                                                step.status === 'error' && 'text-destructive',
                                                step.status === 'success' && 'text-green-500'
                                            )}>
                                                {step.name}
                                            </span>
                                            {step.message && (
                                                <span className="text-sm text-muted-foreground">{step.message}</span>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </CardContent>
                    </Card>
                  )}

                  {webhookData && statusSteps[2].status === 'success' && (
                     <Card className="mt-6">
                        <CardHeader>
                            <CardTitle>Resultado da Consulta</CardTitle>
                            <CardDescription>
                                O saldo e as parcelas disponíveis para o CPF consultado foram recebidos.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid gap-6">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="flex items-center gap-4 rounded-lg border p-4">
                                        <Landmark className="h-8 w-8 text-primary" />
                                        <div>
                                            <p className="text-sm text-muted-foreground">Saldo Total</p>
                                            <p className="text-2xl font-bold">{formatCurrency(webhookData.balance)}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 rounded-lg border p-4">
                                        <User className="h-8 w-8 text-primary" />
                                        <div>
                                            <p className="text-sm text-muted-foreground">CPF</p>
                                            <p className="text-lg font-semibold">{webhookData.documentNumber}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 rounded-lg border p-4">
                                        <Briefcase className="h-8 w-8 text-primary" />
                                        <div>
                                            <p className="text-sm text-muted-foreground">Provedor</p>
                                            <p className="text-lg font-semibold capitalize">{webhookData.provider}</p>
                                        </div>
                                    </div>
                                </div>
                                <Separator />
                                <div>
                                    <h4 className="text-lg font-medium mb-4">Parcelas Disponíveis</h4>
                                    <div className="rounded-md border">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead><Calendar className="inline-block mr-2 h-4 w-4" />Data de Vencimento</TableHead>
                                                    <TableHead className="text-right"><Banknote className="inline-block mr-2 h-4 w-4" />Valor da Parcela</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {webhookData.installments?.map((item: any, index: number) => (
                                                    <TableRow key={index}>
                                                        <TableCell className="font-medium">{formatDate(item.dueDate)}</TableCell>
                                                        <TableCell className="text-right">{formatCurrency(item.amount)}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                  )}
                  
                </CardContent>
              </Card>

            </TabsContent>
            <TabsContent value="lote">
               <Card className="mt-4">
                 <CardHeader>
                  <CardTitle>Consulta de FGTS em Lote</CardTitle>
                  <CardDescription>
                    Faça o upload de um arquivo XLSX com os CPFs na primeira coluna para consultar múltiplos clientes de forma assíncrona.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...loteForm}>
                        <form onSubmit={(e) => e.preventDefault()} className="space-y-8">
                          <div className="grid md:grid-cols-2 gap-8 items-start">
                            <ProviderSelector control={loteForm.control} disabled={isProcessingBatch} />
                            
                            <div className="space-y-4">
                                <FormLabel>Arquivo de CPFs (.xlsx)</FormLabel>
                                <Input 
                                    type="file" 
                                    ref={fileInputRef} 
                                    onChange={handleFileChange} 
                                    accept=".xlsx, .xls"
                                    className="hidden" 
                                    disabled={isProcessingBatch}
                                />
                                <div 
                                    className={cn(
                                        "flex flex-col items-center justify-center gap-2 text-center h-48 border-2 border-dashed rounded-lg",
                                        !isProcessingBatch && "cursor-pointer hover:border-primary"
                                    )}
                                    onClick={() => !isProcessingBatch && fileInputRef.current?.click()}
                                >
                                    <Upload className="h-8 w-8 text-muted-foreground" />
                                    {file ? (
                                        <div className="flex items-center gap-2">
                                            <FileText className="h-5 w-5 text-primary" />
                                            <span className="text-sm font-medium text-primary">{file.name}</span>
                                        </div>
                                    ) : (
                                      <>
                                        <h3 className="text-lg font-bold tracking-tight">
                                            Selecionar Arquivo
                                        </h3>
                                        <p className="text-sm text-muted-foreground">
                                            Arraste ou clique para fazer o upload.
                                        </p>
                                      </>
                                    )}
                                </div>
                            </div>
                          </div>
                           <div className="flex gap-4">
                                <Button type="button" onClick={handleProcessBatch} disabled={!file || isProcessingBatch}>
                                    {isProcessingBatch ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <Search className="mr-2 h-4 w-4" />
                                    )}
                                    {isProcessingBatch ? 'Enviando Lote...' : 'Enviar Lote para Fila'}
                                </Button>
                           </div>
                        </form>
                    </Form>
                    {recentBatches.length > 0 && (
                        <Card className="mt-8">
                            <CardHeader>
                                <CardTitle>Histórico de Lotes Recentes</CardTitle>
                                <CardDescription>Os resultados ficam disponíveis para download assim que o processamento é concluído.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="border rounded-md">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Lote</TableHead>
                                            <TableHead className="w-[200px]">Progresso</TableHead>
                                            <TableHead colSpan={2} className="text-right w-[200px]">Ação</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {paginatedBatches.map((batch) => (
                                            <TableRow key={batch.id}>
                                                <TableCell>
                                                    <div className="font-medium">{formatBatchName(batch.fileName, batch.createdAt)}</div>
                                                    <div className="text-sm text-muted-foreground">{batch.totalCpfs} CPFs</div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col gap-2">
                                                        <Progress value={getBatchProgress(batch)} className="h-2" />
                                                        <span className="text-xs text-muted-foreground">{getBatchProgressText(batch)}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button 
                                                        size="sm"
                                                        onClick={() => handleGenerateReport(batch)}
                                                        disabled={batch.status !== 'completed' || isGeneratingReport === batch.id}
                                                    >
                                                        {isGeneratingReport === batch.id ? (
                                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                        ) : (
                                                            <Download className="mr-2 h-4 w-4" />
                                                        )}
                                                        Baixar
                                                    </Button>
                                                </TableCell>
                                                 <TableCell className="text-right pr-4">
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                                                <Trash2 className="h-4 w-4 text-destructive"/>
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                            <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                Esta ação não pode ser desfeita. Isso excluirá permanentemente o lote do seu histórico local.
                                                            </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                            <AlertDialogAction onClick={() => handleDeleteBatch(batch.id)} className="bg-destructive hover:bg-destructive/90">Excluir</AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                                {recentBatches.length === 0 && (
                                     <div className="text-center p-8 text-muted-foreground">
                                        Nenhum lote enviado ainda.
                                    </div>
                                )}
                                </div>
                                {totalPages > 1 && (
                                    <div className="flex items-center justify-end space-x-2 py-4">
                                        <div className="text-sm text-muted-foreground">
                                            Página {currentPage} de {totalPages}
                                        </div>
                                        <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                        disabled={currentPage === 1}
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                            Anterior
                                        </Button>
                                        <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                        disabled={currentPage === totalPages}
                                        >
                                            Próxima
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
