
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
import { Loader2, Search, CheckCircle2, XCircle, Circle, User, Briefcase, Landmark, Calendar, Banknote, Upload, FileText, Download } from "lucide-react";
import { useState, useEffect, useRef, ChangeEvent } from "react";
import { consultarSaldoFgts } from "@/app/actions/fgts";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useFirestore, useMemoFirebase } from "@/firebase";
import { doc } from "firebase/firestore";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import * as XLSX from 'xlsx';
import { processarLoteFgts } from "@/app/actions/batch";

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

const initialSteps: StatusStep[] = [
  { name: "Autenticando com a API V8", status: "pending" },
  { name: "Enviando solicitação de consulta", status: "pending" },
  { name: "Aguardando resposta do Webhook", status: "pending" },
];

function ProviderSelector({ control, disabled }: { control: any, disabled?: boolean }) {
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
                <FormLabel className="font-normal">QI Tech</FormLabel>
              </FormItem>
            </RadioGroup>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
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

const formatCurrency = (value: string | number | undefined) => {
    if (value === undefined) return 'N/A';
    const numberValue = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(numberValue);
};

const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('pt-BR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
};

export default function FgtsPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [currentCpf, setCurrentCpf] = useState<string | null>(null);
  const [statusSteps, setStatusSteps] = useState<StatusStep[]>(initialSteps);
  const [showStatus, setShowStatus] = useState(false);
  
  const [file, setFile] = useState<File | null>(null);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [batchResult, setBatchResult] = useState<{file: string, name: string} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const firestore = useFirestore();

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
      setFile(files[0]);
      setBatchResult(null); 
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
    setBatchResult(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        const cpfs = json.map(row => String((row as any)[0])).filter(cpf => cpf && cpf.length >= 11);

        const result = await processarLoteFgts({ cpfs, provider });

        if (result.status === 'success') {
            setBatchResult({ file: result.fileContent, name: result.fileName });
        } else {
            console.error("Erro ao processar lote:", result.message);
        }

        setIsProcessingBatch(false);
    };
    reader.readAsArrayBuffer(file);
  };
  
  const downloadExcel = () => {
    if (!batchResult) return;
    const link = document.createElement('a');
    link.href = batchResult.file;
    link.download = batchResult.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

                  {webhookData && (
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
                    Faça o upload de um arquivo XLSX com os CPFs na primeira coluna para consultar múltiplos clientes. Os resultados serão compilados em um novo arquivo Excel para download.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...loteForm}>
                        <form onSubmit={(e) => e.preventDefault()} className="space-y-8">
                          <div className="grid md:grid-cols-2 gap-8">
                            <ProviderSelector control={loteForm.control} disabled={isProcessingBatch} />
                            
                            <div className="space-y-4">
                                <FormLabel>Arquivo de CPFs</FormLabel>
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
                           <Button type="button" onClick={handleProcessBatch} disabled={!file || isProcessingBatch}>
                                {isProcessingBatch ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Search className="mr-2 h-4 w-4" />
                                )}
                                {isProcessingBatch ? 'Processando...' : 'Iniciar Processamento em Lote'}
                           </Button>
                        </form>
                    </Form>
                    {batchResult && (
                        <Card className="mt-6">
                            <CardHeader>
                                <CardTitle>Processamento Concluído</CardTitle>
                                <CardDescription>O processamento do seu lote foi finalizado. Clique no botão abaixo para baixar o arquivo com os resultados.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center gap-4 p-4 border rounded-lg bg-green-50 dark:bg-green-900/10">
                                    <CheckCircle2 className="h-8 w-8 text-green-600" />
                                    <div className="flex-grow">
                                        <h4 className="font-semibold">Lote Processado com Sucesso!</h4>
                                        <p className="text-sm text-muted-foreground">Seu arquivo <span className="font-medium text-primary">{batchResult.name}</span> está pronto.</p>
                                    </div>
                                    <Button onClick={downloadExcel}>
                                        <Download className="mr-2 h-4 w-4" />
                                        Baixar Resultados
                                    </Button>
                                </div>
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

    