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
import { Loader2, Search, AlertCircle, Wallet } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { useUser } from "@/firebase";
import { consultarSaldoManual, type FgtsBalance } from "@/app/actions/fgts";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type Provider = 'v8' | 'facta';
type V8Provider = 'qi' | 'cartos' | 'bms';

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

export default function FgtsManualPage() {
  const { user } = useUser();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<FgtsBalance[] | null>(null);
  const [selectedProviders, setSelectedProviders] = useState<Provider[]>([]);
  const [v8Provider, setV8Provider] = useState<V8Provider>('qi');

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      cpf: "",
    },
  });

  const handleProviderChange = (provider: Provider) => {
    setSelectedProviders(prev =>
        prev.includes(provider) ? prev.filter(p => p !== provider) : [...prev, provider]
    );
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!user) {
      setError("Você precisa estar logado para realizar uma consulta.");
      return;
    }
    if (selectedProviders.length === 0) {
        setError("Selecione pelo menos um provedor para a consulta.");
        return;
    }
    
    setIsLoading(true);
    setError(null);
    setResults(null);

    const { balances, error: apiError } = await consultarSaldoManual({ 
        cpf: values.cpf, 
        userId: user.uid,
        providers: selectedProviders,
        v8Provider: selectedProviders.includes('v8') ? v8Provider : undefined,
    });

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
        description="Consulte o saldo de FGTS para um CPF em provedores específicos."
      />
      <Card>
        <CardHeader>
            <CardTitle>Consultar Saldo</CardTitle>
            <CardDescription>Insira o CPF e selecione os provedores para buscar o saldo.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                    <div className="space-y-3">
                         <FormLabel>Provedores</FormLabel>
                         <div className="flex items-center space-x-6 pt-2">
                            <div className="flex items-center space-x-2">
                                <Checkbox id="v8" checked={selectedProviders.includes('v8')} onCheckedChange={() => handleProviderChange('v8')} />
                                <Label htmlFor="v8" className='text-base'>V8 (Webhook)</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Checkbox id="facta" checked={selectedProviders.includes('facta')} onCheckedChange={() => handleProviderChange('facta')} />
                                <Label htmlFor="facta" className='text-base'>Facta (Síncrono)</Label>
                            </div>
                        </div>
                    </div>
                </div>

                 {selectedProviders.includes('v8') && (
                    <div className='space-y-3 p-4 border rounded-lg bg-muted/50'>
                        <Label className='text-base'>Parceiro V8</Label>
                        <RadioGroup defaultValue="qi" value={v8Provider} onValueChange={(value: V8Provider) => setV8Provider(value)}>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="qi" id="qi" />
                                <Label htmlFor="qi">QI Tech</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="cartos" id="cartos" />
                                <Label htmlFor="cartos">CARTOS</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="bms" id="bms" />
                                <Label htmlFor="bms">BMS</Label>
                            </div>
                        </RadioGroup>
                    </div>
                )}
              
              <Button type="submit" disabled={isLoading || selectedProviders.length === 0}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                {isLoading ? "Consultando..." : "Consultar"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
      
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
             {Array.from({ length: selectedProviders.includes('v8') ? 2 : 1 }).map((_, i) => (
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
                       Não foi possível encontrar saldo liberado para este CPF nos provedores selecionados.
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
                        <p className="text-xl font-bold uppercase">{result.provider}</p>
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
