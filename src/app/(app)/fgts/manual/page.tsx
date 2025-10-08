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
import { Loader2, Search, AlertCircle, CircleDashed, Wallet } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { useUser } from "@/firebase";
import { consultarSaldoManual, type FgtsBalance } from "@/app/actions/fgts";
import { QiTechLogo, CartosLogo, BmsLogo } from "@/components/provider-logos";
import { Skeleton } from "@/components/ui/skeleton";


const formSchema = z.object({
  cpf: z.string().min(11, "CPF deve ter 11 dígitos.").max(11, "CPF deve ter 11 dígitos."),
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

const ProviderLogo = ({ provider }: { provider: string }) => {
    switch (provider) {
        case 'qi':
            return <QiTechLogo className="h-8 w-auto" />;
        case 'cartos':
            return <CartosLogo className="h-8 w-auto" />;
        case 'bms':
            return <BmsLogo className="h-8 w-auto" />;
        case 'facta':
             return <p className="text-2xl font-bold text-blue-600">Facta</p>;
        default:
            return <span className="text-sm font-semibold capitalize">{provider}</span>;
    }
}


export default function FgtsManualPage() {
  const { user } = useUser();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<FgtsBalance[] | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      cpf: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!user) {
      setError("Você precisa estar logado para realizar uma consulta.");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    setResults(null);

    const { balances, error: apiError } = await consultarSaldoManual({ cpf: values.cpf, userId: user.uid });

    if (apiError) {
      setError(apiError);
    } else {
      setResults(balances);
    }
    
    setIsLoading(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Consulta Manual de Saldo FGTS"
        description="Consulte o saldo de FGTS para um CPF em todos os provedores habilitados."
      />
      <Card>
        <CardHeader>
            <CardTitle>Consultar Saldo</CardTitle>
            <CardDescription>Insira o CPF para buscar o saldo disponível.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="cpf"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CPF do Cliente</FormLabel>
                    <FormControl>
                      <Input placeholder="000.000.000-00" {...field} disabled={isLoading}/>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                {isLoading ? "Consultando..." : "Consultar"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
      
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
             {Array.from({ length: 3 }).map((_, i) => (
                 <Card key={i} className="p-4 flex flex-col justify-between">
                    <Skeleton className="h-8 w-24 mb-4"/>
                    <Skeleton className="h-6 w-32"/>
                </Card>
             ))}
        </div>
      )}

      {error && (
         <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Erro na Consulta</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
         </Alert>
      )}

      {!isLoading && results && results.length === 0 && !error && (
        <Card>
            <CardContent className="pt-6">
                <div className="flex flex-col items-center justify-center gap-4 text-center h-60 border-2 border-dashed rounded-lg">
                    <Wallet className="h-12 w-12 text-muted-foreground" />
                    <h3 className="text-2xl font-bold tracking-tight">
                        Nenhum Saldo Encontrado
                    </h3>
                    <p className="text-sm text-muted-foreground">
                       Não foi possível encontrar saldo liberado para este CPF nos provedores disponíveis.
                    </p>
                </div>
            </CardContent>
        </Card>
      )}

      {!isLoading && results && results.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map((result) => (
                <Card key={result.provider} className="p-4 flex flex-col justify-between">
                    <div className="mb-4">
                        <ProviderLogo provider={result.provider} />
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground">Saldo Disponível</p>
                        <p className="text-2xl font-bold font-headline">{formatCurrency(result.balance)}</p>
                    </div>
                </Card>
            ))}
        </div>
      )}

    </div>
  );
}
