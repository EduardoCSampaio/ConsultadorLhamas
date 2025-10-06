
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
import { Loader2, Search, CheckCircle2, XCircle, Circle } from "lucide-react";
import { useState } from "react";
import { consultarSaldoFgts } from "@/app/actions/fgts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useFirestore, useMemoFirebase } from "@/firebase";
import { doc } from "firebase/firestore";
import { cn } from "@/lib/utils";

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

export default function FgtsPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [currentCpf, setCurrentCpf] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
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

  // Update step 3 when webhook response is received
  if (webhookResponse && statusSteps[2].status !== 'success') {
    setStatusSteps(prev => prev.map((step, index) => 
      index === 2 ? { ...step, status: 'success' } : step
    ));
  }

  async function onManualSubmit(values: z.infer<typeof manualFormSchema>) {
    setIsLoading(true);
    setCurrentCpf(values.documentNumber);
    setApiError(null);
    setShowStatus(true);
    setStatusSteps(initialSteps);

    const updateStep = (index: number, status: StepStatus, message?: string) => {
        setStatusSteps(prev => prev.map((step, i) => 
          i === index ? { ...step, status, message } : step
        ));
    };

    // Step 1 & 2: Authentication and Request
    updateStep(0, 'running');
    const result = await consultarSaldoFgts(values);
    
    if (result.status === 'error') {
        updateStep(result.stepIndex, 'error', result.message);
        setApiError(result.message);
        setIsLoading(false);
        return; // Stop execution if there was an error
    }

    // Mark previous steps as successful
    updateStep(0, 'success');
    updateStep(1, 'success');
    
    // Step 3: Waiting for Webhook
    updateStep(2, 'running');
    
    // isLoading will now be primarily controlled by the webhook loading state
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
                                <Input placeholder="Digite o CPF" {...field} disabled={isLoading || isWebhookLoading}/>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <ProviderSelector control={manualForm.control} />
                      </div>
                      <Button type="submit" disabled={isLoading || isWebhookLoading}>
                        {isLoading || isWebhookLoading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Search className="mr-2 h-4 w-4" />
                        )}
                        {isWebhookLoading ? 'Aguardando Resposta...' : 'Consultar Saldo'}
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
                                                step.status === 'error' && 'text-red-500',
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

                  {webhookResponse && (
                    <Alert className="mt-6" variant="default">
                      <AlertTitle>Resposta do Webhook Recebida!</AlertTitle>
                      <AlertDescription>
                        <pre className="mt-2 rounded-md bg-muted p-4 overflow-auto">
                            {JSON.stringify(webhookResponse.responseBody || webhookResponse, null, 2)}
                        </pre>
                      </AlertDescription>
                    </Alert>
                  )}
                  
                  {apiError && !showStatus && ( // This might be redundant now but safe to keep
                    <Alert variant="destructive" className="mt-6">
                      <AlertTitle>Erro na Consulta</AlertTitle>
                      <AlertDescription>{apiError}</AlertDescription>
                    </Alert>
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
