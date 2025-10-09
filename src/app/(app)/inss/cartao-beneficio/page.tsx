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
import { Loader2, Search, AlertCircle, CircleDashed, TableIcon, ArrowRight } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { useUser } from "@/firebase";
import { getInssOperations, submitInssSimulation, type InssOperation } from "@/app/actions/facta";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";


const formSchema = z.object({
  cpf: z.string().min(11, "CPF deve ter 11 dígitos.").max(11, "CPF deve ter 11 dígitos."),
  data_nascimento: z.string().refine((val) => /^\d{2}\/\d{2}\/\d{4}$/.test(val), {
    message: "Data de nascimento deve estar no formato DD/MM/AAAA.",
  }),
  calculationType: z.enum(['renda', 'margem']),
  valor_renda: z.string().optional(),
  margem_cartao: z.string().optional(),
}).refine(data => {
    if (data.calculationType === 'renda' && !data.valor_renda) return false;
    if (data.calculationType === 'margem' && !data.margem_cartao) return false;
    return true;
}, {
    message: "Preencha o valor correspondente ao tipo de cálculo.",
    path: ["valor_renda"], // Or margem_cartao, just to point somewhere
});


const formatCurrency = (value: string | number | undefined | null) => {
    if (value === undefined || value === null) return 'N/A';
    const numberValue = typeof value === 'string' ? parseFloat(value.replace(/\./g, '').replace(',', '.')) : value;
    if (isNaN(numberValue)) return 'N/A';
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(numberValue);
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


export default function InssCardPage() {
  const { user } = useUser();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [operations, setOperations] = useState<InssOperation[] | null>(null);
  const [noOffersMessage, setNoOffersMessage] = useState<string | null>(null);
  const [selectedOperation, setSelectedOperation] = useState<InssOperation | null>(null);
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      cpf: "",
      data_nascimento: "",
      calculationType: 'renda',
      valor_renda: "",
      margem_cartao: "",
    },
  });

  const calculationType = useWatch({ control: form.control, name: "calculationType" });

  async function onGetOperations(values: z.infer<typeof formSchema>) {
    if (!user) {
      setError("Você precisa estar logado para realizar uma consulta.");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    setOperations(null);
    setNoOffersMessage(null);
    setSelectedOperation(null);

    const formattedValues = {
        ...values,
        valor_renda: values.valor_renda ? parseFloat(values.valor_renda.replace(/\./g, '').replace(',', '.')) : undefined,
        margem_cartao: values.margem_cartao ? parseFloat(values.margem_cartao.replace(/\./g, '').replace(',', '.')) : undefined,
        userId: user.uid,
    };

    const response = await getInssOperations(formattedValues);

    if (response.success) {
        if(response.data && response.data.length > 0) {
            setOperations(response.data);
        } else {
            setNoOffersMessage(response.message || "Nenhuma operação encontrada para os dados informados.");
        }
    } else {
      setError(response.message);
    }
    
    setIsLoading(false);
  }
  
  async function handleSubmitSimulation() {
    if (!selectedOperation || !user) {
        toast({ variant: 'destructive', title: 'Erro', description: 'Nenhuma operação selecionada ou usuário não autenticado.' });
        return;
    }

    setIsSubmitting(true);
    setError(null);

    const values = form.getValues();
    const result = await submitInssSimulation({
        cpf: values.cpf,
        data_nascimento: values.data_nascimento,
        valor_renda: parseFloat(values.valor_renda!.replace(/\./g, '').replace(',', '.')),
        codigo_tabela: selectedOperation.codigoTabela,
        prazo: selectedOperation.prazo,
        valor_operacao: selectedOperation.contrato,
        valor_parcela: selectedOperation.parcela,
        coeficiente: selectedOperation.coeficiente,
        userId: user.uid,
    });

    if (result.success) {
        toast({
            title: "Simulação Gerada com Sucesso!",
            description: `A simulação ID ${result.data?.id_simulador} foi criada.`,
        });
        setOperations(null);
        setSelectedOperation(null);
    } else {
        setError(result.message);
        toast({
            variant: "destructive",
            title: "Erro ao Gerar Simulação",
            description: result.message,
        });
    }

    setIsSubmitting(false);
  }


  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Cartão Benefício INSS - FACTA"
        description="Simule e consulte operações de cartão benefício INSS disponíveis."
      />
      <Card>
        <CardHeader>
            <CardTitle>Simular Operações</CardTitle>
            <CardDescription>Insira os dados do cliente para buscar as tabelas de operações.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onGetOperations)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="cpf"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>CPF</FormLabel>
                            <FormControl>
                            <Input placeholder="000.000.000-00" {...field} disabled={isLoading}/>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <FormField
                      control={form.control}
                      name="data_nascimento"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Data de Nascimento</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="DD/MM/AAAA" 
                              {...field} 
                              onChange={(e) => {
                                handleDateMask(e);
                                field.onChange(e.target.value);
                              }}
                              disabled={isLoading}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                </div>
                
                <FormField
                    control={form.control}
                    name="calculationType"
                    render={({ field }) => (
                        <FormItem className="space-y-3">
                            <FormLabel>Tipo de Cálculo</FormLabel>
                            <FormControl>
                                <RadioGroup
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                                className="flex flex-col space-y-1"
                                >
                                <FormItem className="flex items-center space-x-3 space-y-0">
                                    <FormControl>
                                    <RadioGroupItem value="renda" />
                                    </FormControl>
                                    <FormLabel className="font-normal">
                                    Calcular pela Renda (Benefício)
                                    </FormLabel>
                                </FormItem>
                                <FormItem className="flex items-center space-x-3 space-y-0">
                                    <FormControl>
                                    <RadioGroupItem value="margem" />
                                    </FormControl>
                                    <FormLabel className="font-normal">
                                    Calcular pela Margem do Cartão
                                    </FormLabel>
                                </FormItem>
                                </RadioGroup>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {calculationType === 'renda' && (
                    <FormField
                        control={form.control}
                        name="valor_renda"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Valor do Benefício (Renda)</FormLabel>
                            <FormControl>
                            <Input placeholder="1.412,00" {...field} onChange={(e) => { handleCurrencyMask(e); field.onChange(e.target.value); }} disabled={isLoading}/>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                )}

                {calculationType === 'margem' && (
                    <FormField
                        control={form.control}
                        name="margem_cartao"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Margem Cartão (R$)</FormLabel>
                            <FormControl>
                            <Input placeholder="75,90" {...field} onChange={(e) => { handleCurrencyMask(e); field.onChange(e.target.value); }} disabled={isLoading}/>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                )}


              <Button type="submit" disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                {isLoading ? "Buscando..." : "Buscar Operações"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
      
      {error && (
         <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Erro na Simulação</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
         </Alert>
      )}

      {noOffersMessage && !operations && (
        <Card>
            <CardContent className="pt-6">
                <div className="flex flex-col items-center justify-center gap-4 text-center h-60 border-2 border-dashed rounded-lg">
                    <CircleDashed className="h-12 w-12 text-muted-foreground" />
                    <h3 className="text-2xl font-bold tracking-tight">
                        Nenhuma Operação Disponível
                    </h3>
                    <p className="text-sm text-muted-foreground">
                       {noOffersMessage}
                    </p>
                </div>
            </CardContent>
        </Card>
      )}

      {operations && (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <TableIcon />
                        Selecione uma Operação
                    </CardTitle>
                    <CardDescription>
                        Foram encontradas {operations.length} tabelas de operações. Selecione uma para prosseguir.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Tabela</TableHead>
                                    <TableHead>Prazo</TableHead>
                                    <TableHead>Taxa</TableHead>
                                    <TableHead>Contrato</TableHead>
                                    <TableHead>Parcela</TableHead>
                                    <TableHead className="text-right">Ação</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {operations.map((item, index) => (
                                    <TableRow 
                                        key={`${item.codigoTabela}-${index}`}
                                        className={selectedOperation?.codigoTabela === item.codigoTabela ? "bg-muted hover:bg-muted" : ""}
                                    >
                                        <TableCell className="font-medium">{item.tabela}</TableCell>
                                        <TableCell>{item.prazo}</TableCell>
                                        <TableCell>{item.taxa}%</TableCell>
                                        <TableCell>{formatCurrency(item.contrato)}</TableCell>
                                        <TableCell className="font-semibold">{formatCurrency(item.parcela)}</TableCell>
                                        <TableCell className="text-right">
                                            <Button 
                                                variant={selectedOperation?.codigoTabela === item.codigoTabela ? "default" : "outline"} 
                                                size="sm"
                                                onClick={() => setSelectedOperation(item)}
                                            >
                                                {selectedOperation?.codigoTabela === item.codigoTabela ? "Selecionado" : "Selecionar"}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
      )}

      {selectedOperation && (
         <Card>
            <CardHeader>
                <CardTitle>Confirmar Simulação</CardTitle>
                <CardDescription>Confirme os detalhes abaixo para registrar a simulação.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                    <div className="flex flex-col gap-1 rounded-md border p-3 col-span-1 md:col-span-2">
                        <span className="text-muted-foreground">Tabela</span>
                        <span className="font-semibold">{selectedOperation.tabela}</span>
                    </div>
                    <div className="flex flex-col gap-1 rounded-md border p-3">
                        <span className="text-muted-foreground">Valor do Contrato</span>
                        <span className="font-semibold">{formatCurrency(selectedOperation.contrato)}</span>
                    </div>
                     <div className="flex flex-col gap-1 rounded-md border p-3">
                        <span className="text-muted-foreground">Valor da Parcela</span>
                        <span className="font-semibold">{formatCurrency(selectedOperation.parcela)}</span>
                    </div>
                     <div className="flex flex-col gap-1 rounded-md border p-3">
                        <span className="text-muted-foreground">Prazo</span>
                        <span className="font-semibold">{selectedOperation.prazo} meses</span>
                    </div>
                </div>
                <Button onClick={handleSubmitSimulation} disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                    Confirmar e Gerar Simulação
                </Button>
            </CardContent>
         </Card>
      )}
    </div>
  );
}
