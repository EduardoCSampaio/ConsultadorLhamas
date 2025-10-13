
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
import { Loader2, Search, AlertCircle, CircleDashed } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { useUser } from "@/firebase";
import { consultarOfertasFacta, type FactaOffer } from "@/app/actions/facta";
import { Separator } from "@/components/ui/separator";

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

export default function FactaPage() {
  const { user } = useUser();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FactaOffer[] | null>(null);
  const [noOffersMessage, setNoOffersMessage] = useState<string | null>(null);
  
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
    setResult(null);
    setNoOffersMessage(null);

    const response = await consultarOfertasFacta({ cpf: values.cpf, userId: user.uid });

    if (response.success) {
        if(response.data && response.data.length > 0) {
            setResult(response.data);
        } else {
            setNoOffersMessage(response.message || "Nenhuma oferta encontrada para o CPF informado.");
        }
    } else {
      setError(response.message);
    }
    
    setIsLoading(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Crédito Privado CLT - FACTA"
        description="Consulte ofertas de crédito privado CLT disponíveis no provedor FACTA."
      />
      <Card>
        <CardHeader>
            <CardTitle>Consultar Ofertas</CardTitle>
            <CardDescription>Insira o CPF do cliente para buscar ofertas de crédito.</CardDescription>
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
      
      {error && (
         <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Erro na Consulta</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
         </Alert>
      )}

      {noOffersMessage && !result && (
        <Card>
            <CardContent className="pt-6">
                <div className="flex flex-col items-center justify-center gap-4 text-center h-60 border-2 border-dashed rounded-lg">
                    <CircleDashed className="h-12 w-12 text-muted-foreground" />
                    <h3 className="text-2xl font-bold tracking-tight">
                        Nenhuma Oferta Encontrada
                    </h3>
                    <div className="text-sm text-muted-foreground">
                       {noOffersMessage}
                    </div>
                </div>
            </CardContent>
        </Card>
      )}

      {result && result.map((item, index) => (
        <Card key={item.oferta.idSolicitacao}>
            <CardHeader>
                <CardTitle>Oferta Encontrada #{index + 1}</CardTitle>
                <CardDescription>Proposta: {item.resposta.numeroProposta}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div>
                    <h4 className="font-semibold text-lg mb-2 font-headline">Detalhes da Oferta</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                       <div className="flex flex-col gap-1 rounded-md border p-3">
                           <span className="text-muted-foreground">Nome</span>
                           <span className="font-semibold">{item.oferta.nomeTrabalhador}</span>
                       </div>
                       <div className="flex flex-col gap-1 rounded-md border p-3">
                           <span className="text-muted-foreground">CPF</span>
                           <span className="font-semibold">{item.oferta.cpf}</span>
                       </div>
                       <div className="flex flex-col gap-1 rounded-md border p-3">
                           <span className="text-muted-foreground">Margem Disponível</span>
                           <span className="font-semibold">{formatCurrency(item.oferta.margemDisponivel)}</span>
                       </div>
                       <div className="flex flex-col gap-1 rounded-md border p-3">
                           <span className="text-muted-foreground">Valor Liberado</span>
                           <span className="font-semibold">{formatCurrency(item.oferta.valorLiberado)}</span>
                       </div>
                       <div className="flex flex-col gap-1 rounded-md border p-3">
                           <span className="text-muted-foreground">Data de Admissão</span>
                           <span className="font-semibold">{item.oferta.dataAdmissao}</span>
                       </div>
                       <div className="flex flex-col gap-1 rounded-md border p-3">
                           <span className="text-muted-foreground">Elegível?</span>
                           <span className="font-semibold">{item.oferta.elegivelEmprestimo}</span>
                       </div>
                    </div>
                </div>

                <Separator />
                
                <div>
                    <h4 className="font-semibold text-lg mb-2 font-headline">Condições do Empréstimo</h4>
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                       <div className="flex flex-col gap-1 rounded-md border p-3 bg-primary/5">
                           <span className="text-muted-foreground">Valor Liberado ao Cliente</span>
                           <span className="font-bold text-lg text-primary">{formatCurrency(item.resposta.valorLiberado)}</span>
                       </div>
                        <div className="flex flex-col gap-1 rounded-md border p-3">
                           <span className="text-muted-foreground">Valor da Parcela</span>
                           <span className="font-semibold">{formatCurrency(item.resposta.valorParcela)}</span>
                       </div>
                       <div className="flex flex-col gap-1 rounded-md border p-3">
                           <span className="text-muted-foreground">Nº de Parcelas</span>
                           <span className="font-semibold">{item.resposta.numeroParcelas}</span>
                       </div>
                       <div className="flex flex-col gap-1 rounded-md border p-3">
                           <span className="text-muted-foreground">Valor Total do Empréstimo</span>
                           <span className="font-semibold">{formatCurrency(item.resposta.valorEmprestimo)}</span>
                       </div>
                       <div className="flex flex-col gap-1 rounded-md border p-3">
                           <span className="text-muted-foreground">Taxa Mensal</span>
                           <span className="font-semibold">{item.resposta.valorTaxaMensal}%</span>
                       </div>
                       <div className="flex flex-col gap-1 rounded-md border p-3">
                           <span className="text-muted-foreground">CET Mensal</span>
                           <span className="font-semibold">{item.resposta.valorCETMensal}%</span>
                       </div>
                     </div>
                </div>
                 {item.resposta.contatos && (
                    <div className="pt-4">
                        <Button asChild>
                            <a href={item.resposta.contatos.startsWith('http') ? item.resposta.contatos : `https://${item.resposta.contatos}`} target="_blank" rel="noopener noreferrer">
                                Continuar Contratação
                            </a>
                        </Button>
                    </div>
                 )}

            </CardContent>
        </Card>
      ))}

    </div>
  );
}

    
