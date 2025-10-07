
'use client';

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Loader2, FileSignature, Wand, Banknote, Calendar as CalendarIconComponent, Hash, Percent } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { gerarTermoConsentimento, consultarTaxasCLT, criarSimulacaoCLT } from "@/app/actions/clt";
import type { SimulationConfig, SimulationResult, CLTConsentResult } from "@/app/actions/clt";
import { useUser } from "@/firebase";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


// Schemas
const consentFormSchema = z.object({
  borrowerDocumentNumber: z.string().min(11, "CPF deve ter 11 dígitos.").max(11, "CPF deve ter 11 dígitos."),
  signerName: z.string().min(3, "Nome completo é obrigatório."),
  signerEmail: z.string().email("Email inválido."),
  birthDate: z.date({ required_error: "Data de nascimento é obrigatória." }),
  gender: z.enum(["male", "female"], { required_error: "Selecione o gênero." }),
  signerPhoneCountryCode: z.string().min(1, "DDI é obrigatório.").default("55"),
  signerPhoneAreaCode: z.string().min(2, "DDD é obrigatório."),
  signerPhoneNumber: z.string().min(8, "Número de telefone é obrigatório."),
});

type ConsentFormValues = z.infer<typeof consentFormSchema>;

const formatCurrency = (value: number | undefined | null) => {
    if (value === undefined || value === null) return 'N/A';
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(value);
};

export default function CltPage() {
  const { toast } = useToast();
  const { user } = useUser();

  const [currentStep, setCurrentStep] = useState<'consent' | 'simulation'>('consent');
  const [isLoading, setIsLoading] = useState(false);
  const [consentResult, setConsentResult] = useState<CLTConsentResult | null>(null);
  
  const [simulationConfigs, setSimulationConfigs] = useState<SimulationConfig[] | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  
  // State for simulation form fields
  const [configId, setConfigId] = useState<string>('');
  const [numberOfInstallments, setNumberOfInstallments] = useState<string>('');
  const [disbursedAmount, setDisbursedAmount] = useState<number>(0);
  const [formError, setFormError] = useState<string | null>(null);

  const selectedConfig = simulationConfigs?.find(c => c.id === configId) || null;

  const consentForm = useForm<ConsentFormValues>({
    resolver: zodResolver(consentFormSchema),
    defaultValues: {
      borrowerDocumentNumber: "",
      signerName: "",
      signerEmail: "",
      signerPhoneCountryCode: "55",
      signerPhoneAreaCode: "",
      signerPhoneNumber: "",
    },
  });

  useEffect(() => {
    if (currentStep === 'simulation' && !simulationConfigs && user) {
      const fetchTaxas = async () => {
        setIsLoading(true);
        const result = await consultarTaxasCLT({ userId: user.uid });
        if (result.success && result.configs) {
          setSimulationConfigs(result.configs);
        } else {
          toast({
            variant: "destructive",
            title: "Erro ao Buscar Taxas",
            description: result.message,
          });
          setCurrentStep('consent'); // Fallback to consent step
        }
        setIsLoading(false);
      };
      fetchTaxas();
    }
  }, [currentStep, simulationConfigs, toast, user]);
  
  const handleConfigChange = (value: string) => {
      setConfigId(value);
      setNumberOfInstallments('');
  }

  async function onConsentSubmit(values: ConsentFormValues) {
    if (!user) {
      toast({ variant: "destructive", title: "Erro de Autenticação", description: "Você precisa estar logado." });
      return;
    }
    
    setIsLoading(true);
    setConsentResult(null);

    const result = await gerarTermoConsentimento({
        borrowerDocumentNumber: values.borrowerDocumentNumber,
        gender: values.gender,
        birthDate: format(values.birthDate, 'yyyy-MM-dd'),
        signerName: values.signerName,
        signerEmail: values.signerEmail,
        signerPhone: {
            countryCode: values.signerPhoneCountryCode,
            areaCode: values.signerPhoneAreaCode,
            phoneNumber: values.signerPhoneNumber
        },
        provider: 'QI',
        userId: user.uid,
    });
    
    setConsentResult(result);
    setIsLoading(false);

    if (result.success) {
      toast({
        title: "Termo de Consentimento Gerado!",
        description: "Agora você pode prosseguir para a simulação.",
      });
      setCurrentStep('simulation');
    } else {
      toast({
        variant: "destructive",
        title: "Erro ao Gerar Termo",
        description: result.message,
      });
    }
  }
  
  async function onSimulationSubmit(event: React.FormEvent) {
      event.preventDefault();
      if (!user || !consentResult?.consultationId) {
          toast({ variant: "destructive", title: "Erro", description: "ID de consulta ou usuário não encontrado." });
          return;
      }
      
      // Manual validation
      if (!configId || !numberOfInstallments || !disbursedAmount || disbursedAmount <= 0) {
          setFormError("Todos os campos da simulação são obrigatórios e o valor deve ser positivo.");
          return;
      }
      setFormError(null);

      setIsSimulating(true);
      setSimulationResult(null);
      const result = await criarSimulacaoCLT({
          consult_id: consentResult.consultationId,
          config_id: configId,
          disbursed_amount: disbursedAmount,
          number_of_installments: parseInt(numberOfInstallments, 10),
          provider: 'QI',
          userId: user.uid,
      });
      setIsSimulating(false);
      if (result.success && result.simulation) {
          setSimulationResult(result.simulation);
          toast({
              title: "Simulação Realizada com Sucesso!",
          });
      } else {
          toast({
              variant: "destructive",
              title: "Erro na Simulação",
              description: result.message,
          });
      }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Crédito Privado CLT"
        description="Gere o termo de consentimento e simule as condições de crédito."
      />
      
      {currentStep === 'consent' && (
        <Card>
            <CardHeader>
            <CardTitle>Etapa 1: Termo de Consentimento</CardTitle>
            <CardDescription>
                Preencha os dados do cliente para gerar o termo. Este é o primeiro passo para a análise de crédito.
            </CardDescription>
            </CardHeader>
            <CardContent>
            <Form {...consentForm}>
                <form onSubmit={consentForm.handleSubmit(onConsentSubmit)} className="space-y-8">
                    <div className="space-y-6 max-w-lg">
                        <h3 className="text-lg font-medium border-b pb-2">Dados do Cliente</h3>
                        <FormField control={consentForm.control} name="signerName" render={({ field }) => ( 
                            <FormItem> 
                                <FormLabel>Nome Completo</FormLabel> 
                                <FormControl> 
                                    <Input placeholder="Nome do cliente" {...field} disabled={isLoading} /> 
                                </FormControl> 
                                <FormMessage /> 
                            </FormItem> 
                        )}/>
                        <FormField control={consentForm.control} name="borrowerDocumentNumber" render={({ field }) => ( 
                            <FormItem> 
                                <FormLabel>CPF</FormLabel> 
                                <FormControl> 
                                    <Input placeholder="000.000.000-00" {...field} disabled={isLoading} /> 
                                </FormControl> 
                                <FormMessage /> 
                            </FormItem> 
                        )}/>
                         <FormField control={consentForm.control} name="signerEmail" render={({ field }) => ( 
                            <FormItem> 
                                <FormLabel>Email</FormLabel> 
                                <FormControl> 
                                    <Input placeholder="email@exemplo.com" {...field} disabled={isLoading} /> 
                                </FormControl> 
                                <FormMessage /> 
                            </FormItem> 
                        )}/>
                        <div>
                            <Label>Telefone</Label>
                            <div className="flex gap-2 mt-2">
                                <FormField control={consentForm.control} name="signerPhoneCountryCode" render={({ field }) => ( 
                                    <FormItem className="w-20"> 
                                        <FormControl> 
                                            <Input placeholder="+55" {...field} disabled={isLoading} /> 
                                        </FormControl> 
                                        <FormMessage /> 
                                    </FormItem> 
                                )}/>
                                <FormField control={consentForm.control} name="signerPhoneAreaCode" render={({ field }) => ( 
                                    <FormItem className="w-20"> 
                                        <FormControl> 
                                            <Input placeholder="DDD" {...field} disabled={isLoading} /> 
                                        </FormControl> 
                                        <FormMessage /> 
                                    </FormItem> 
                                )}/>
                                <FormField control={consentForm.control} name="signerPhoneNumber" render={({ field }) => ( 
                                    <FormItem className="flex-1"> 
                                        <FormControl> 
                                            <Input placeholder="99999-9999" {...field} disabled={isLoading} /> 
                                        </FormControl> 
                                        <FormMessage /> 
                                    </FormItem> 
                                )}/>
                            </div>
                            <FormDescription className="mt-2">Inclua DDI, DDD e o número.</FormDescription>
                        </div>

                        <div className="grid grid-cols-2 gap-8">
                             <FormField
                                control={consentForm.control}
                                name="birthDate"
                                render={({ field }) => (
                                    <FormItem className="flex flex-col">
                                    <FormLabel>Data de Nascimento</FormLabel>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                          <FormControl>
                                            <Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")} disabled={isLoading}>
                                                {field.value ? (format(field.value, "PPP", { locale: ptBR })) : (<span>Escolha uma data</span>)}
                                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                            </Button>
                                          </FormControl>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar
                                            mode="single"
                                            captionLayout="dropdown-buttons"
                                            fromYear={1940}
                                            toYear={new Date().getFullYear()}
                                            selected={field.value}
                                            onSelect={field.onChange}
                                            disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
                                            initialFocus
                                        />
                                        </PopoverContent>
                                    </Popover>
                                    <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={consentForm.control}
                                name="gender"
                                render={({ field }) => (
                                    <FormItem className="space-y-3">
                                    <FormLabel>Gênero</FormLabel>
                                    <FormControl>
                                        <RadioGroup
                                            onValueChange={field.onChange}
                                            defaultValue={field.value}
                                            className="flex space-x-4 pt-2"
                                            disabled={isLoading}
                                        >
                                            <FormItem className="flex items-center space-x-2 space-y-0">
                                                <FormControl>
                                                    <RadioGroupItem value="male" />
                                                </FormControl>
                                                <FormLabel className="font-normal">Masculino</FormLabel>
                                            </FormItem>
                                            <FormItem className="flex items-center space-x-2 space-y-0">
                                                <FormControl>
                                                    <RadioGroupItem value="female" />
                                                </FormControl>
                                                <FormLabel className="font-normal">Feminino</FormLabel>
                                            </FormItem>
                                        </RadioGroup>
                                    </FormControl>
                                    <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                    </div>
                
                <Button type="submit" disabled={isLoading}>
                    {isLoading ? (<Loader2 className="mr-2 h-4 w-4 animate-spin" />) : (<FileSignature className="mr-2 h-4 w-4" />)}
                    Gerar Termo e Avançar
                </Button>
                </form>
            </Form>
            </CardContent>
        </Card>
      )}

      {currentStep === 'simulation' && (
        <Card>
            <CardHeader>
                <CardTitle>Etapa 2: Simulação de Crédito</CardTitle>
                <CardDescription>
                   ID da Consulta: <strong className="font-mono bg-muted p-1 rounded">{consentResult?.consultationId}</strong>.
                   Selecione as condições e simule o crédito.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex items-center justify-center h-40">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <form onSubmit={onSimulationSubmit} className="space-y-8">
                        <div className="grid md:grid-cols-3 gap-8 items-start">
                             <div className="space-y-2">
                                <Label htmlFor="config_id">Tabela de Juros</Label>
                                <Select value={configId} onValueChange={handleConfigChange} disabled={isSimulating}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecione uma tabela..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {simulationConfigs?.map(config => (
                                            <SelectItem key={config.id} value={config.id}>
                                                {config.slug} ({parseFloat(config.monthly_interest_rate).toFixed(2)}% a.m.)
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            
                            <div className="space-y-2">
                                <Label htmlFor="number_of_installments">Número de Parcelas</Label>
                                <Select value={numberOfInstallments} onValueChange={setNumberOfInstallments} disabled={!selectedConfig || isSimulating}>
                                    <SelectTrigger>
                                        <SelectValue placeholder={!selectedConfig ? "Selecione uma tabela primeiro" : "Selecione as parcelas..."} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {selectedConfig?.number_of_installments.map(installment => (
                                            <SelectItem key={installment} value={String(installment)}>
                                                {installment} parcelas
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            
                            <div className="space-y-2">
                                <Label htmlFor="disbursed_amount">Valor Desejado</Label>
                                <Input 
                                    id="disbursed_amount"
                                    type="number" 
                                    placeholder="1000,00" 
                                    value={disbursedAmount || ''}
                                    onChange={(e) => setDisbursedAmount(parseFloat(e.target.value))}
                                    disabled={isSimulating} 
                                />
                            </div>
                        </div>
                        {formError && <p className="text-sm font-medium text-destructive">{formError}</p>}
                        <Button type="submit" disabled={isSimulating || !configId || !numberOfInstallments || !disbursedAmount}>
                            {isSimulating ? (<Loader2 className="mr-2 h-4 w-4 animate-spin" />) : (<Wand className="mr-2 h-4 w-4" />)}
                            Simular Crédito
                        </Button>
                    </form>
                )}
                {simulationResult && (
                     <div className="mt-8 space-y-6">
                        <Separator />
                        <h3 className="text-xl font-semibold tracking-tight">Resultado da Simulação</h3>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="flex flex-col gap-1 rounded-lg border p-3">
                                <p className="text-sm text-muted-foreground flex items-center gap-2"><Banknote className="h-4 w-4"/> Valor da Parcela</p>
                                <p className="text-lg font-bold">{formatCurrency(simulationResult.installment_value)}</p>
                            </div>
                            <div className="flex flex-col gap-1 rounded-lg border p-3">
                                <p className="text-sm text-muted-foreground flex items-center gap-2"><Banknote className="h-4 w-4"/> Valor Liberado</p>
                                <p className="text-lg font-bold">{formatCurrency(simulationResult.disbursement_amount)}</p>
                            </div>
                             <div className="flex flex-col gap-1 rounded-lg border p-3">
                                <p className="text-sm text-muted-foreground flex items-center gap-2"><Percent className="h-4 w-4"/> CET Mensal</p>
                                <p className="text-lg font-bold">{simulationResult.disbursement_option.cet.toFixed(4)}%</p>
                            </div>
                            <div className="flex flex-col gap-1 rounded-lg border p-3">
                                <p className="text-sm text-muted-foreground flex items-center gap-2"><CalendarIconComponent className="h-4 w-4"/> 1º Vencimento</p>
                                <p className="text-lg font-bold">{format(new Date(simulationResult.disbursement_option.first_due_date), "dd/MM/yyyy")}</p>
                            </div>
                        </div>

                         <div>
                            <h4 className="text-lg font-medium mb-4">Detalhes das Parcelas</h4>
                            <div className="rounded-md border max-h-96 overflow-y-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[100px]"><Hash className="inline-block mr-1 h-4 w-4"/> Parcela</TableHead>
                                            <TableHead><CalendarIconComponent className="inline-block mr-1 h-4 w-4"/> Vencimento</TableHead>
                                            <TableHead className="text-right"><Banknote className="inline-block mr-1 h-4 w-4"/> Valor Total</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {simulationResult.disbursement_option.installments.map(item => (
                                            <TableRow key={item.installment_number}>
                                                <TableCell className="font-medium">{item.installment_number}</TableCell>
                                                <TableCell>{format(new Date(item.due_date), "dd/MM/yyyy")}</TableCell>
                                                <TableCell className="text-right">{formatCurrency(item.total_amount)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                     </div>
                )}
            </CardContent>
        </Card>
      )}
    </div>
  );
}

