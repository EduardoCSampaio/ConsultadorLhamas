
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
import { Loader2, Search, Send } from "lucide-react";
import { useState } from "react";
import { consultarSaldoFgts } from "@/app/actions/fgts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useFirestore, useMemoFirebase } from "@/firebase";
import { doc } from "firebase/firestore";
import { Textarea } from "@/components/ui/textarea";

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

// Helper function to simulate a webhook call
async function simulateWebhook(payload: any) {
  const response = await fetch('/api/webhook/balance', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Simulação de Webhook falhou: ${errorData.message || 'Erro desconhecido'}`);
  }
  return response.json();
}

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

export default function FgtsPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [currentCpf, setCurrentCpf] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [simulationPayload, setSimulationPayload] = useState('{\n  "documentNumber": "37227404870",\n  "balance": 1234.56\n}');
  
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

  async function onManualSubmit(values: z.infer<typeof manualFormSchema>) {
    setIsLoading(true);
    setCurrentCpf(values.documentNumber);
    setApiError(null);
    setSimulationPayload(`{\n  "documentNumber": "${values.documentNumber}",\n  "balance": 1234.56\n}`);

    try {
      await consultarSaldoFgts(values);
    } catch (error) {
        if (error instanceof Error) {
            setApiError(error.message);
        } else {
            setApiError("Ocorreu um erro inesperado.");
        }
        setCurrentCpf(null);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSimulation() {
    setApiError(null);
    try {
      const payload = JSON.parse(simulationPayload);
      if (!payload.documentNumber) {
        throw new Error("O payload de simulação precisa ter a propriedade 'documentNumber'.");
      }
      setCurrentCpf(payload.documentNumber);
      await simulateWebhook(payload);
    } catch (error) {
       if (error instanceof Error) {
            setApiError(error.message);
        } else {
            setApiError("Ocorreu um erro inesperado na simulação.");
        }
    }
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
                                <Input placeholder="Digite o CPF" {...field} disabled={isLoading}/>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <ProviderSelector control={manualForm.control} />
                      </div>
                      <Button type="submit" disabled={isLoading}>
                        {isLoading || isWebhookLoading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Search className="mr-2 h-4 w-4" />
                        )}
                        {isWebhookLoading ? 'Aguardando Resposta...' : 'Consultar Saldo'}
                      </Button>
                    </form>
                  </Form>
                  {currentCpf && !webhookResponse && !apiError && !isLoading && (
                    <Alert className="mt-6">
                      <AlertTitle>Consulta Iniciada!</AlertTitle>
                      <AlertDescription>
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Aguardando a resposta do webhook para o CPF: {currentCpf}. A resposta aparecerá aqui automaticamente.</span>
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}
                  {webhookResponse && (
                    <Alert className="mt-6" variant="default">
                      <AlertTitle>Resposta Recebida!</AlertTitle>
                      <AlertDescription>
                        <pre className="mt-2 rounded-md bg-muted p-4 overflow-auto">
                            {JSON.stringify(webhookResponse.responseBody || webhookResponse, null, 2)}
                        </pre>
                      </AlertDescription>
                    </Alert>
                  )}
                  {apiError && (
                    <Alert variant="destructive" className="mt-6">
                      <AlertTitle>Erro na Consulta</AlertTitle>
                      <AlertDescription>{apiError}</AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>

              <Card className="mt-6">
                <CardHeader>
                  <CardTitle>Simulador de Webhook</CardTitle>
                   <CardDescription>
                    Use esta ferramenta para testar o recebimento de dados sem precisar de um deploy. 
                    Cole o JSON que a V8 enviaria e clique em simular.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    placeholder="Cole o JSON de resposta do webhook aqui"
                    value={simulationPayload}
                    onChange={(e) => setSimulationPayload(e.target.value)}
                    rows={5}
                  />
                  <Button onClick={handleSimulation}>
                    <Send className="mr-2 h-4 w-4" />
                    Simular Resposta do Webhook
                  </Button>
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
                </Header>
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
