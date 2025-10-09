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
import { getInssCreditOperations, type InssCreditOffer } from "@/app/actions/facta";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const formSchema = z.object({
  cpf: z.string().min(11, "CPF deve ter 11 dígitos.").max(11, "CPF deve ter 11 dígitos."),
  data_nascimento: z.string().refine((val) => /^\d{2}\/\d{2}\/\d{4}$/.test(val), {
    message: "Data de nascimento deve estar no formato DD/MM/AAAA.",
  }),
  valor_contrato: z.string().optional(),
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


export default function InssCreditPage() {
  const { user } = useUser();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [operations, setOperations] = useState<InssCreditOffer[] | null>(null);
  const [noOffersMessage, setNoOffersMessage] = useState<string | null>(null);
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      cpf: "",
      data_nascimento: "",
      valor_contrato: "",
    },
  });

  async function onGetOperations(values: z.infer<typeof formSchema>) {
    if (!user) {
      setError("Você precisa estar logado para realizar uma consulta.");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    setOperations(null);
    setNoOffersMessage(null);

    const formattedValues = {
        ...values,
        tipo_operacao: '13', // Hardcoded to "Novo Digital"
        valor_contrato: values.valor_contrato ? parseFloat(values.valor_contrato.replace(/\./g, '').replace(',', '.')) : undefined,
        userId: user.uid,
    };

    const response = await getInssCreditOperations(formattedValues);

    if (response.success) {
        if(response.data && response.data.length > 0) {
            setOperations(response.data);
        } else {
            setNoOffersMessage(response.message || "Nenhuma operação de crédito encontrada para os dados informados.");
        }
    } else {
      setError(response.message);
    }
    
    setIsLoading(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Crédito Novo INSS - FACTA"
        description="Consulte e simule operações de Crédito Novo Digital."
      />
      <Card>
        <CardHeader>
            <CardTitle>Simular Operação</CardTitle>
            <CardDescription>Insira os dados para buscar as opções de crédito disponíveis.</CardDescription>
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
                    name="valor_contrato"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Valor do Contrato Desejado (Opcional)</FormLabel>
                        <FormControl>
                        <Input placeholder="1.000,00" {...field} onChange={(e) => { handleCurrencyMask(e); field.onChange(e.target.value); }} disabled={isLoading}/>
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />

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
                        Operações Encontradas
                    </CardTitle>
                    <CardDescription>
                        Foram encontradas {operations.length} tabelas de operações para o valor solicitado.
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
                                {operations.map((item, index) => (
                                    <TableRow key={`${item.codigoTabela}-${index}`}>
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
