
'use client';

import { useState } from "react";
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
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Loader2, Search, AlertCircle, CircleDashed, TableIcon } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { useUser } from "@/firebase";
import { consultarOperacoesInssFacta, type InssSimulationResult } from "@/app/actions/facta";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const formSchema = z.object({
  cpf: z.string().min(11, "CPF deve ter 11 dígitos.").max(11, "CPF deve ter 11 dígitos."),
  data_nascimento: z.date({
    required_error: "A data de nascimento é obrigatória.",
  }),
  valor_renda: z.string().min(1, "O valor da renda é obrigatório."),
  valor_desejado: z.string().min(1, "O valor desejado é obrigatório."),
});

const formatCurrency = (value: string | number | undefined | null) => {
    if (value === undefined || value === null) return 'N/A';
    const numberValue = typeof value === 'string' ? parseFloat(value.replace(',', '.')) : value;
    if (isNaN(numberValue)) return 'N/A';
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(numberValue);
};

export default function InssFactaPage() {
  const { user } = useUser();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InssSimulationResult[] | null>(null);
  const [noOffersMessage, setNoOffersMessage] = useState<string | null>(null);
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      cpf: "",
      valor_renda: "",
      valor_desejado: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!user) {
      setError("Você precisa estar logado para realizar uma consulta.");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    setResult(null);
    setNoOffersMessage(null);

    const formattedValues = {
        ...values,
        data_nascimento: format(values.data_nascimento, 'dd/MM/yyyy'),
        valor_renda: parseFloat(values.valor_renda.replace(',', '.')),
        valor_desejado: parseFloat(values.valor_desejado.replace(',', '.')),
        userId: user.uid,
    };

    const response = await consultarOperacoesInssFacta(formattedValues);

    if (response.success) {
        if(response.data && response.data.length > 0) {
            setResult(response.data);
        } else {
            setNoOffersMessage(response.message || "Nenhuma operação disponível encontrada para os dados informados.");
        }
    } else {
      setError(response.message);
    }
    
    setIsLoading(false);
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
            <CardDescription>Insira os dados do cliente para simular as operações.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                            <FormItem className="flex flex-col">
                            <FormLabel>Data de Nascimento</FormLabel>
                            <Popover>
                                <PopoverTrigger asChild>
                                <FormControl>
                                    <Button
                                    variant={"outline"}
                                    className={cn(
                                        "pl-3 text-left font-normal",
                                        !field.value && "text-muted-foreground"
                                    )}
                                    disabled={isLoading}
                                    >
                                    {field.value ? (
                                        format(field.value, "dd/MM/yyyy")
                                    ) : (
                                        <span>Selecione a data</span>
                                    )}
                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                    </Button>
                                </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    mode="single"
                                    selected={field.value}
                                    onSelect={field.onChange}
                                    disabled={(date) =>
                                    date > new Date() || date < new Date("1900-01-01")
                                    }
                                    initialFocus
                                />
                                </PopoverContent>
                            </Popover>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                     <FormField
                        control={form.control}
                        name="valor_renda"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Valor do Benefício (Renda)</FormLabel>
                            <FormControl>
                            <Input placeholder="1412,00" {...field} disabled={isLoading}/>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                     <FormField
                        control={form.control}
                        name="valor_desejado"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Valor de Saque Desejado</FormLabel>
                            <FormControl>
                            <Input placeholder="2000,00" {...field} disabled={isLoading}/>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                </div>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                {isLoading ? "Consultando..." : "Simular"}
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

      {noOffersMessage && !result && (
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

      {result && (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <TableIcon />
                    Operações Disponíveis
                </CardTitle>
                <CardDescription>
                    Foram encontradas {result.length} tabelas de operações para os dados informados.
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
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {result.map((item) => (
                                <TableRow key={item.codigoTabela}>
                                    <TableCell className="font-medium">{item.tabela}</TableCell>
                                    <TableCell>{item.prazo}</TableCell>
                                    <TableCell>{item.taxa}%</TableCell>
                                    <TableCell>{formatCurrency(item.contrato)}</TableCell>
                                    <TableCell className="font-semibold">{formatCurrency(item.parcela)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
      )}

    </div>
  );
}

