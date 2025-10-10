'use client';

import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { useForm, useWatch } from "react-hook-form";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search, AlertCircle, ArrowRight, ArrowLeft, Send } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { useUser } from "@/firebase";
import { gerarTermoConsentimento, consultarTaxasCLT, criarSimulacaoCLT, type CLTConsentResult, type SimulationConfig, type SimulationResult } from "@/app/actions/clt";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";

const consentSchema = z.object({
  borrowerDocumentNumber: z.string().min(11, "CPF deve ter 11 dígitos.").max(14, "CPF inválido."),
  gender: z.enum(["male", "female"], { required_error: "Selecione o gênero." }),
  birthDate: z.string().refine((val) => /^\d{2}\/\d{2}\/\d{4}$/.test(val), { message: "Data deve estar no formato DD/MM/AAAA." }),
  signerName: z.string().min(3, "Nome do assinante é obrigatório."),
  signerEmail: z.string().email("Email do assinante inválido."),
  signerPhoneCountryCode: z.string().min(1, "DDI obrigatório.").default("55"),
  signerPhoneAreaCode: z.string().min(2, "DDD obrigatório."),
  signerPhoneNumber: z.string().min(8, "Número de telefone inválido."),
});

const simulationSchema = z.object({
    configId: z.string({ required_error: "Selecione uma modalidade de taxa." }),
    disbursedAmount: z.preprocess(
        (val) => String(val).replace(/\./g, '').replace(',', '.'),
        z.string().refine(val => !isNaN(parseFloat(val)), { message: "Valor inválido." })
            .transform(Number)
            .refine(val => val > 0, { message: "O valor deve ser maior que zero." })
    ),
    installments: z.string({ required_error: "Selecione o número de parcelas." }),
});

type Step = 'consent' | 'simulation' | 'result';


const handleCurrencyMask = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
     value = (parseInt(value, 10) / 100).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
    });
    if (value === 'NaN') value = '';
    e.target.value = value;
};

const formatCurrency = (value: string | number | undefined | null) => {
    if (value === undefined || value === null) return 'N/A';
    const numberValue = typeof value === 'string' ? parseFloat(value.replace(/\./g, '').replace(',', '.')) : value;
    if (isNaN(numberValue)) return 'N/A';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numberValue);
};

export default function V8Page() {
    const { user } = useUser();
    const { toast } = useToast();
    const [step, setStep] = useState<Step>('consent');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // State for data flow between steps
    const [consultationId, setConsultationId] = useState<string | null>(null);
    const [simulationConfigs, setSimulationConfigs] = useState<SimulationConfig[]>([]);
    const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);

    const consentForm = useForm<z.infer<typeof consentSchema>>({
        resolver: zodResolver(consentSchema),
        defaultValues: {
            signerPhoneCountryCode: "55",
        },
    });

    const simulationForm = useForm<z.infer<typeof simulationSchema>>({
        resolver: zodResolver(simulationSchema)
    });
    
    const selectedConfigId = useWatch({ control: simulationForm.control, name: 'configId' });
    const selectedConfig = simulationConfigs.find(c => c.id === selectedConfigId);

    async function onConsentSubmit(values: z.infer<typeof consentSchema>) {
        if (!user) {
            setError("Você precisa estar logado para realizar esta operação.");
            return;
        }
        
        setIsLoading(true);
        setError(null);

        const consentData = {
            ...values,
            birthDate: values.birthDate.split('/').reverse().join('-'), // YYYY-MM-DD
            borrowerDocumentNumber: values.borrowerDocumentNumber.replace(/\D/g, ''),
            signerPhone: {
                countryCode: values.signerPhoneCountryCode,
                areaCode: values.signerPhoneAreaCode,
                phoneNumber: values.signerPhoneNumber,
            },
            provider: "QI" as const,
            userId: user.uid,
        };

        const result: CLTConsentResult = await gerarTermoConsentimento(consentData);
        
        if (result.success && result.consultationId) {
            setConsultationId(result.consultationId);
            toast({ title: "Termo de Consentimento autorizado!", description: "Buscando taxas disponíveis..." });
            
            // Now fetch simulation configs
            const taxasResult = await consultarTaxasCLT({ userId: user.uid });
            if (taxasResult.success && taxasResult.configs) {
                setSimulationConfigs(taxasResult.configs);
                setStep('simulation');
            } else {
                setError(taxasResult.message);
            }

        } else {
            setError(result.message);
        }
        
        setIsLoading(false);
    }
    
    async function onSimulationSubmit(values: z.infer<typeof simulationSchema>) {
        if (!user || !consultationId) {
             setError("ID da consulta ou usuário não encontrado. Volte para o passo anterior.");
             return;
        }
        setIsLoading(true);
        setError(null);

        const result = await criarSimulacaoCLT({
            consult_id: consultationId,
            config_id: values.configId,
            disbursed_amount: values.disbursedAmount,
            number_of_installments: Number(values.installments),
            provider: "QI",
            userId: user.uid,
        });

        if (result.success && result.simulation) {
            setSimulationResult(result.simulation);
            setStep('result');
            toast({ title: "Simulação criada com sucesso!" });
        } else {
            setError(result.message);
        }

        setIsLoading(false);
    }

    const startOver = () => {
        setStep('consent');
        setError(null);
        setConsultationId(null);
        setSimulationConfigs([]);
        setSimulationResult(null);
        consentForm.reset();
        simulationForm.reset();
    };

    return (
        <div className="flex flex-col gap-6">
            <PageHeader 
                title="Crédito Privado CLT - V8" 
                description="Simule e contrate crédito privado através do provedor V8."
            />
            {error && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Ocorreu um Erro</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
            
            {step === 'consent' && (
                <Card>
                    <CardHeader>
                        <CardTitle>Passo 1: Termo de Consentimento</CardTitle>
                        <CardDescription>Para prosseguir, precisamos do consentimento do cliente para a consulta de dados.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Form {...consentForm}>
                            <form onSubmit={consentForm.handleSubmit(onConsentSubmit)} className="space-y-6">
                                <div className="grid md:grid-cols-2 gap-4">
                                     <FormField control={consentForm.control} name="borrowerDocumentNumber" render={({ field }) => (
                                        <FormItem><FormLabel>CPF do Cliente</FormLabel><FormControl><Input placeholder="000.000.000-00" {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                     <FormField control={consentForm.control} name="birthDate" render={({ field }) => (
                                        <FormItem><FormLabel>Data de Nascimento</FormLabel><FormControl><Input placeholder="DD/MM/AAAA" {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                     <FormField control={consentForm.control} name="gender" render={({ field }) => (
                                        <FormItem><FormLabel>Gênero</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger></FormControl>
                                                <SelectContent><SelectItem value="male">Masculino</SelectItem><SelectItem value="female">Feminino</SelectItem></SelectContent>
                                            </Select><FormMessage />
                                        </FormItem>
                                    )} />
                                </div>
                                <Separator />
                                <p className="text-sm font-medium">Dados do Assinante do Termo</p>
                                <div className="grid md:grid-cols-2 gap-4">
                                    <FormField control={consentForm.control} name="signerName" render={({ field }) => (
                                        <FormItem><FormLabel>Nome Completo</FormLabel><FormControl><Input placeholder="Nome do assinante" {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                    <FormField control={consentForm.control} name="signerEmail" render={({ field }) => (
                                        <FormItem><FormLabel>Email</FormLabel><FormControl><Input placeholder="email@dominio.com" {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                </div>
                                 <div className="grid md:grid-cols-4 gap-4">
                                     <FormField control={consentForm.control} name="signerPhoneCountryCode" render={({ field }) => (
                                        <FormItem><FormLabel>DDI</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                      <FormField control={consentForm.control} name="signerPhoneAreaCode" render={({ field }) => (
                                        <FormItem><FormLabel>DDD</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                      <FormField control={consentForm.control} name="signerPhoneNumber" render={({ field }) => (
                                        <FormItem className="md:col-span-2"><FormLabel>Número</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                 </div>
                                <Button type="submit" disabled={isLoading}>
                                    {isLoading ? <><Loader2 className="animate-spin" /> Gerando...</> : <><Send /> Gerar e Autorizar Termo</>}
                                </Button>
                            </form>
                        </Form>
                    </CardContent>
                </Card>
            )}

            {step === 'simulation' && (
                 <Card>
                    <CardHeader>
                        <CardTitle>Passo 2: Simular Empréstimo</CardTitle>
                        <CardDescription>Selecione a modalidade, o valor desejado e o número de parcelas.</CardDescription>
                    </CardHeader>
                    <CardContent>
                         <Form {...simulationForm}>
                            <form onSubmit={simulationForm.handleSubmit(onSimulationSubmit)} className="space-y-6">
                                <div className="grid md:grid-cols-2 gap-4">
                                    <FormField control={simulationForm.control} name="configId" render={({ field }) => (
                                        <FormItem><FormLabel>Taxas Disponíveis</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl><SelectTrigger><SelectValue placeholder="Selecione a modalidade..." /></SelectTrigger></FormControl>
                                                <SelectContent>{simulationConfigs.map(config => (
                                                    <SelectItem key={config.id} value={config.id}>{config.slug}</SelectItem>
                                                ))}</SelectContent>
                                            </Select><FormMessage />
                                        </FormItem>
                                    )} />
                                    <FormField control={simulationForm.control} name="disbursedAmount" render={({ field }) => (
                                        <FormItem><FormLabel>Valor Desejado</FormLabel>
                                            <FormControl><Input placeholder="R$ 1.000,00" {...field} onChange={(e) => { handleCurrencyMask(e); field.onChange(e); }} /></FormControl><FormMessage />
                                        </FormItem>
                                    )} />
                                    {selectedConfig && (
                                        <FormField control={simulationForm.control} name="installments" render={({ field }) => (
                                            <FormItem><FormLabel>Número de Parcelas</FormLabel>
                                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger></FormControl>
                                                    <SelectContent>{selectedConfig.number_of_installments.map(inst => (
                                                        <SelectItem key={inst} value={inst}>{inst}</SelectItem>
                                                    ))}</SelectContent>
                                                </Select><FormMessage />
                                            </FormItem>
                                        )} />
                                    )}
                                </div>
                                <div className="flex gap-2">
                                     <Button type="button" variant="outline" onClick={startOver}><ArrowLeft /> Voltar</Button>
                                    <Button type="submit" disabled={isLoading}>
                                        {isLoading ? <><Loader2 className="animate-spin" /> Simulando...</> : <><Search /> Criar Simulação</>}
                                    </Button>
                                </div>
                            </form>
                         </Form>
                    </CardContent>
                </Card>
            )}

            {step === 'result' && simulationResult && (
                 <Card>
                    <CardHeader>
                        <CardTitle>Passo 3: Resultado da Simulação</CardTitle>
                        <CardDescription>Simulação {simulationResult.id_simulation} criada com sucesso.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                           <div className="flex flex-col gap-1 rounded-md border p-3 bg-primary/5">
                                <span className="text-muted-foreground">Valor Liberado</span>
                                <span className="font-bold text-lg text-primary">{formatCurrency(simulationResult.disbursement_amount)}</span>
                           </div>
                           <div className="flex flex-col gap-1 rounded-md border p-3">
                               <span className="text-muted-foreground">Valor da Parcela</span>
                               <span className="font-semibold">{formatCurrency(simulationResult.installment_value)}</span>
                           </div>
                           <div className="flex flex-col gap-1 rounded-md border p-3">
                               <span className="text-muted-foreground">Nº de Parcelas</span>
                               <span className="font-semibold">{simulationResult.number_of_installments}</span>
                           </div>
                           <div className="flex flex-col gap-1 rounded-md border p-3">
                               <span className="text-muted-foreground">Valor Total da Operação</span>
                               <span className="font-semibold">{formatCurrency(simulationResult.operation_amount)}</span>
                           </div>
                           <div className="flex flex-col gap-1 rounded-md border p-3">
                               <span className="text-muted-foreground">Taxa Mensal</span>
                               <span className="font-semibold">{simulationResult.monthly_interest_rate}%</span>
                           </div>
                           <div className="flex flex-col gap-1 rounded-md border p-3">
                               <span className="text-muted-foreground">CET Mensal</span>
                               <span className="font-semibold">{simulationResult.disbursement_option.cet}%</span>
                           </div>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button onClick={startOver}><ArrowLeft /> Iniciar Nova Simulação</Button>
                    </CardFooter>
                 </Card>
            )}
        </div>
    );
}
