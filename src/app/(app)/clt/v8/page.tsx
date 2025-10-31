'use client';

import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { Loader2, AlertCircle, Search, User, KeyRound, List, Calculator, Check, ArrowRight } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { useUser } from "@/firebase";
import { gerarTermoConsentimento, getSimulationConfigs, criarSimulacaoCLT, type SimulationConfig, type SimulationResult } from "@/app/actions/clt";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

// Schemas
const consentFormSchema = z.object({
  borrowerDocumentNumber: z.string().min(11, "CPF deve ter 11 dígitos.").max(14, "CPF inválido."),
  gender: z.enum(["male", "female"], { required_error: "Gênero é obrigatório." }),
  birthDate: z.string().refine((val) => /^\d{2}\/\d{2}\/\d{4}$/.test(val), {
    message: "Data deve estar no formato DD/MM/AAAA.",
  }),
  signerName: z.string().min(3, "Nome é obrigatório."),
  signerEmail: z.string().email("Email inválido."),
  signerPhone: z.object({
    countryCode: z.string().min(1, "DDI é obrigatório."),
    areaCode: z.string().min(2, "DDD é obrigatório.").max(2),
    phoneNumber: z.string().min(8, "Número é obrigatório."),
  })
});

const simulationFormSchema = z.object({
    configId: z.string({ required_error: "Selecione uma tabela de simulação."}),
    numberOfInstallments: z.coerce.number().min(1, "Selecione o número de parcelas."),
    disbursedAmount: z.string().refine(val => !isNaN(parseFloat(val.replace(/\./g, '').replace(',', '.'))), { message: "Valor inválido" }),
});


// Helper Functions
const formatCurrency = (value: string | number | undefined | null) => {
    if (value === undefined || value === null) return 'N/A';
    const numberValue = typeof value === 'string' ? parseFloat(value.replace(/\./g, '').replace(',', '.')) : value;
    if (isNaN(numberValue)) return 'N/A';
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(numberValue);
};

const handleDateMask = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 8) value = value.substring(0, 8);
    if (value.length > 4) {
        value = `${value.substring(0, 2)}/${value.substring(2, 4)}/${value.substring(4)}`;
    } else if (value.length > 2) {
        value = `${value.substring(0, 2)}/${value.substring(2)}`;
    }
    e.target.value = value;
};

const handleCurrencyMask = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    value = value.replace(/\D/g, '');
    value = (parseInt(value, 10) / 100).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
    });
    if (value === 'NaN') value = '';
    e.target.value = value;
};


export default function V8CltPage() {
    const { user } = useUser();
    const [isLoading, setIsLoading] = useState< 'consent' | 'configs' | 'simulation' | false>(false);
    const [error, setError] = useState<string | null>(null);
    
    // State management for the flow
    const [step, setStep] = useState<number>(1);
    const [consultationId, setConsultationId] = useState<string | null>(null);
    const [configs, setConfigs] = useState<SimulationConfig[] | null>(null);
    const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);

    const consentForm = useForm<z.infer<typeof consentFormSchema>>({
        resolver: zodResolver(consentFormSchema),
        defaultValues: {
            borrowerDocumentNumber: "",
            signerName: "",
            birthDate: "",
            signerEmail: "",
            signerPhone: { countryCode: "55", areaCode: "", phoneNumber: "" }
        },
    });

    const simulationForm = useForm<z.infer<typeof simulationFormSchema>>({
        resolver: zodResolver(simulationFormSchema),
        defaultValues: {
            disbursedAmount: "1000,00"
        }
    });
    
    const selectedConfigId = useWatch({ control: simulationForm.control, name: 'configId' });
    const selectedConfig = configs?.find(c => c.id === selectedConfigId);


    const handleGenerateConsent = async (values: z.infer<typeof consentFormSchema>) => {
        if (!user) {
            setError("Você precisa estar logado para realizar uma consulta.");
            return;
        }
        setIsLoading('consent');
        setError(null);
        setStep(1);
        setConsultationId(null);
        setConfigs(null);
        setSimulationResult(null);

        const response = await gerarTermoConsentimento({ ...values, userId: user.uid, provider: "QI" });
        if (response.success && response.consultationId) {
            setConsultationId(response.consultationId);
            setStep(2);
            await handleFetchConfigs(user.uid);
        } else {
            setError(response.message);
        }
        setIsLoading(false);
    };
    
    const handleFetchConfigs = async (userId: string) => {
        setIsLoading('configs');
        setError(null);
        const response = await getSimulationConfigs({ userId });
        if (response.success && response.configs) {
            setConfigs(response.configs);
            setStep(2);
        } else {
            setError(response.message);
            setStep(1); // Go back if fetching configs fails
        }
         setIsLoading(false);
    };

    const handleCreateSimulation = async (values: z.infer<typeof simulationFormSchema>) => {
        if (!user || !consultationId) {
            setError("ID da consulta ou usuário não encontrado. Reinicie o processo.");
            return;
        }
        setIsLoading('simulation');
        setError(null);

        const response = await criarSimulacaoCLT({
            userId: user.uid,
            consult_id: consultationId,
            config_id: values.configId,
            number_of_installments: values.numberOfInstallments,
            disbursed_amount: parseFloat(values.disbursedAmount.replace(/\./g, '').replace(',', '.')),
            provider: "QI"
        });

        if (response.success && response.simulation) {
            setSimulationResult(response.simulation);
            setStep(3);
        } else {
            setError(response.message);
        }
        setIsLoading(false);
    };
    
    const startOver = () => {
        setStep(1);
        setConsultationId(null);
        setConfigs(null);
        setSimulationResult(null);
        setError(null);
        consentForm.reset();
        simulationForm.reset({ disbursedAmount: "1000,00" });
    }

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title="Crédito Privado CLT - V8"
                description="Simule e consulte ofertas de crédito privado do provedor V8."
            />
            
             <div className="flex items-center gap-4">
                <div className={`flex items-center gap-2 ${step >= 1 ? 'text-primary' : 'text-muted-foreground'}`}>
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center border-2 ${step >= 1 ? 'border-primary' : ''}`}>
                       {step > 1 ? <Check /> : <User />}
                    </div>
                    <span>Dados do Cliente</span>
                </div>
                <Separator className={`flex-1 ${step >= 2 ? 'bg-primary' : ''}`}/>
                <div className={`flex items-center gap-2 ${step >= 2 ? 'text-primary' : 'text-muted-foreground'}`}>
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center border-2 ${step >= 2 ? 'border-primary' : ''}`}>
                         {step > 2 ? <Check /> : <List />}
                    </div>
                    <span>Seleção de Tabela</span>
                </div>
                 <Separator className={`flex-1 ${step >= 3 ? 'bg-primary' : ''}`}/>
                <div className={`flex items-center gap-2 ${step >= 3 ? 'text-primary' : 'text-muted-foreground'}`}>
                     <div className={`h-8 w-8 rounded-full flex items-center justify-center border-2 ${step >= 3 ? 'border-primary' : ''}`}>
                        <Calculator />
                    </div>
                    <span>Resultado</span>
                </div>
            </div>

            {error && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Ocorreu um Erro</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {step === 1 && (
                <Card>
                    <CardHeader>
                        <CardTitle>1. Termo de Consentimento</CardTitle>
                        <CardDescription>Insira os dados do cliente para gerar o termo de consulta.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Form {...consentForm}>
                            <form onSubmit={consentForm.handleSubmit(handleGenerateConsent)} className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                     <FormField control={consentForm.control} name="signerName" render={({ field }) => (
                                        <FormItem><FormLabel>Nome Completo</FormLabel><FormControl><Input placeholder="Nome do cliente" {...field} /></FormControl><FormMessage /></FormItem>
                                     )}/>
                                     <FormField control={consentForm.control} name="borrowerDocumentNumber" render={({ field }) => (
                                        <FormItem><FormLabel>CPF</FormLabel><FormControl><Input placeholder="000.000.000-00" {...field} /></FormControl><FormMessage /></FormItem>
                                     )}/>
                                     <FormField control={consentForm.control} name="birthDate" render={({ field }) => (
                                        <FormItem><FormLabel>Data de Nascimento</FormLabel><FormControl><Input placeholder="DD/MM/AAAA" {...field} onChange={(e) => { handleDateMask(e); field.onChange(e.target.value); }} /></FormControl><FormMessage /></FormItem>
                                     )}/>
                                     <FormField control={consentForm.control} name="signerEmail" render={({ field }) => (
                                        <FormItem><FormLabel>Email</FormLabel><FormControl><Input placeholder="cliente@email.com" {...field} /></FormControl><FormMessage /></FormItem>
                                     )}/>
                                    <FormField control={consentForm.control} name="gender" render={({ field }) => (
                                        <FormItem><FormLabel>Gênero</FormLabel><FormControl>
                                            <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex gap-4 pt-2">
                                                <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="male" /></FormControl><FormLabel className="font-normal">Masculino</FormLabel></FormItem>
                                                <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="female" /></FormControl><FormLabel className="font-normal">Feminino</FormLabel></FormItem>
                                            </RadioGroup>
                                        </FormControl><FormMessage /></FormItem>
                                    )}/>
                                    <div className="flex gap-2">
                                        <FormField control={consentForm.control} name="signerPhone.areaCode" render={({ field }) => (
                                            <FormItem className="w-1/4"><FormLabel>DDD</FormLabel><FormControl><Input placeholder="11" {...field} /></FormControl><FormMessage /></FormItem>
                                        )}/>
                                        <FormField control={consentForm.control} name="signerPhone.phoneNumber" render={({ field }) => (
                                            <FormItem className="flex-1"><FormLabel>Celular</FormLabel><FormControl><Input placeholder="998877665" {...field} /></FormControl><FormMessage /></FormItem>
                                        )}/>
                                    </div>
                                </div>
                                <Button type="submit" disabled={isLoading === 'consent'}>
                                    {isLoading === 'consent' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                                    Gerar Consentimento
                                </Button>
                            </form>
                        </Form>
                    </CardContent>
                </Card>
            )}
            
            {step === 2 && (
                 <Card>
                    <CardHeader>
                        <CardTitle>2. Simulação</CardTitle>
                        <CardDescription>Selecione uma tabela, o número de parcelas e o valor desejado.</CardDescription>
                    </CardHeader>
                    <CardContent>
                         {isLoading === 'configs' ? <Loader2 className="animate-spin" /> : (
                            <Form {...simulationForm}>
                                <form onSubmit={simulationForm.handleSubmit(handleCreateSimulation)} className="space-y-6">
                                    <FormField control={simulationForm.control} name="configId" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Tabelas Disponíveis</FormLabel>
                                            <div className="rounded-md border">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow><TableHead>Nome</TableHead><TableHead>Taxa Mensal</TableHead><TableHead className="text-right">Ação</TableHead></TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {configs?.map(config => (
                                                            <TableRow key={config.id} className={field.value === config.id ? 'bg-muted' : ''}>
                                                                <TableCell>{config.slug}</TableCell>
                                                                <TableCell>{config.monthly_interest_rate}%</TableCell>
                                                                <TableCell className="text-right">
                                                                    <Button type="button" size="sm" variant={field.value === config.id ? 'default' : 'outline'} onClick={() => field.onChange(config.id)}>
                                                                        {field.value === config.id ? 'Selecionado' : 'Selecionar'}
                                                                    </Button>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                            <FormMessage />
                                        </FormItem>
                                    )}/>
                                    
                                    {selectedConfig && (
                                        <>
                                            <FormField control={simulationForm.control} name="numberOfInstallments" render={({ field }) => (
                                                <FormItem><FormLabel>Número de Parcelas</FormLabel><FormControl>
                                                    <RadioGroup onValueChange={(value) => field.onChange(Number(value))} defaultValue={String(field.value)} className="flex flex-wrap gap-x-4 gap-y-2 pt-2">
                                                        {selectedConfig.number_of_installments.map(inst => (
                                                            <FormItem key={inst} className="flex items-center space-x-2"><FormControl><RadioGroupItem value={inst} /></FormControl><FormLabel className="font-normal">{inst}x</FormLabel></FormItem>
                                                        ))}
                                                    </RadioGroup>
                                                </FormControl><FormMessage /></FormItem>
                                            )}/>
                                            <FormField control={simulationForm.control} name="disbursedAmount" render={({ field }) => (
                                                <FormItem><FormLabel>Valor Desejado para Liberação</FormLabel><FormControl><Input {...field} onChange={(e) => { handleCurrencyMask(e); field.onChange(e.target.value); }} /></FormControl><FormMessage /></FormItem>
                                            )}/>
                                        </>
                                    )}

                                    <div className="flex gap-2">
                                        <Button type="button" variant="outline" onClick={startOver}>Voltar</Button>
                                        <Button type="submit" disabled={isLoading === 'simulation' || !selectedConfigId}>
                                            {isLoading === 'simulation' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                                            Simular Crédito
                                        </Button>
                                    </div>
                                </form>
                            </Form>
                         )}
                    </CardContent>
                </Card>
            )}

            {step === 3 && simulationResult && (
                 <Card>
                    <CardHeader>
                        <CardTitle>3. Resultado da Simulação</CardTitle>
                        <CardDescription>Abaixo estão os detalhes da simulação de crédito.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="flex flex-col gap-1 rounded-md border p-3 bg-primary/5 col-span-1 md:col-span-2">
                                <span className="text-muted-foreground">Valor da Parcela</span>
                                <span className="font-bold text-2xl text-primary">{formatCurrency(simulationResult.installment_value)}</span>
                            </div>
                            <div className="flex flex-col gap-1 rounded-md border p-3">
                                <span className="text-muted-foreground">Valor Liberado</span>
                                <span className="font-semibold text-lg">{formatCurrency(simulationResult.disbursement_amount)}</span>
                            </div>
                            <div className="flex flex-col gap-1 rounded-md border p-3">
                                <span className="text-muted-foreground">Nº de Parcelas</span>
                                <span className="font-semibold text-lg">{simulationResult.number_of_installments}x</span>
                            </div>
                        </div>
                        <Separator />
                         <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div className="flex flex-col"><span className="text-muted-foreground">Valor da Operação</span><span className="font-semibold">{formatCurrency(simulationResult.operation_amount)}</span></div>
                            <div className="flex flex-col"><span className="text-muted-foreground">Taxa Mensal</span><span className="font-semibold">{simulationResult.monthly_interest_rate.toFixed(4)}%</span></div>
                            <div className="flex flex-col"><span className="text-muted-foreground">CET Mensal</span><span className="font-semibold">{(simulationResult.disbursement_option.cet * 100).toFixed(4)}%</span></div>
                            <div className="flex flex-col"><span className="text-muted-foreground">IOF</span><span className="font-semibold">{formatCurrency(simulationResult.disbursement_option.iof_amount)}</span></div>
                             <div className="flex flex-col"><span className="text-muted-foreground">Primeiro Vencimento</span><span className="font-semibold">{new Date(simulationResult.disbursement_option.first_due_date).toLocaleDateString('pt-BR')}</span></div>
                        </div>
                        <Button onClick={startOver}>
                            <ArrowRight className="mr-2 h-4 w-4" />
                            Realizar Nova Simulação
                        </Button>
                    </CardContent>
                 </Card>
            )}
        </div>
    );
}
