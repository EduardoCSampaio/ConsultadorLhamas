

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
import { Loader2, Search, CheckCircle2, XCircle, Circle, User, Briefcase, Landmark, Calendar, Banknote } from "lucide-react";
import { useState, useEffect } from "react";
import { consultarSaldoFgts } from "@/app/actions/fgts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useFirestore, useMemoFirebase } from "@/firebase";
import { doc } from "firebase/firestore";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";

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

function ProviderSelector({ control }: { control: any }) {
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
  
  const { data: webhookResponse, isLoading: isWebhookLoading } = useDoc(docRef);

  const webhookData = webhookResponse?.responseBody;

  useEffect(() => {
    if (webhookData && statusSteps[2].status === 'running') {
      setStatusSteps(prev => prev.map((step, index) => 
        index === 2 ? { ...step, status: 'success', message: 'Resposta recebida!' } : step
      ));
    }
  }, [webhookData, statusSteps]);


  async function onManualSubmit(values: z.infer<typeof manualFormSchema>) {
    setIsLoading(true);
    setCurrentCpf(values.documentNumber);
    setShowStatus(true);
    setStatusSteps(initialSteps);

    const updateStep = (index: number, status: StepStatus, message?: string) => {
      setStatusSteps(prev => {
        const newSteps = [...prev];
        newSteps[index] = { ...newSteps[index], status, message };
        // If a step fails, ensure subsequent steps are not marked as running
        if (status === 'error') {
          for (let i = index + 1; i < newSteps.length; i++) {
            newSteps[i] = { ...newSteps[i], status: 'pending', message: undefined };
          }
        }
        return newSteps;
      });
    };
  
    updateStep(0, 'running');
    const result = await consultarSaldoFgts(values);
  
    if (result.status === 'error') {
      for (let i = 0; i < result.stepIndex; i++) {
        updateStep(i, 'success');
      }
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
                        <ProviderSelector control={manualForm.control} />
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
                    Faça o upload de um arquivo para consultar múltiplos clientes de uma vez.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...loteForm}>
                        <form className="space-y-8">
                          <div className="grid md:grid-cols-2 gap-8">
                            <ProviderSelector control={loteForm.control} />
                            <div className="flex flex-col items-center justify-center gap-4 text-center h-48 border-2 border-dashed rounded-lg">
                                <h3 className="text-2xl font-bold tracking-tight">
                                    Upload de Arquivo
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                    A funcionalidade de upload será implementada aqui.
                                </p>
                                <Button variant="outline">Selecionar Arquivo</Button>
                            </div>
                          </div>
                        </form>
                    </Form>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
