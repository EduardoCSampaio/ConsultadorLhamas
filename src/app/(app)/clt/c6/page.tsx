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
import { Loader2, Search, AlertCircle, ExternalLink, Wallet, CircleDashed } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { useUser } from "@/firebase";
import { consultarLinkAutorizacaoC6, consultarOfertasCLTC6, type C6LinkResponse, type C6Offer } from "@/app/actions/c6";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

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

const formSchema = z.object({
  cpf: z.string().min(11, "CPF deve ter 11 dígitos.").max(14, "CPF inválido."),
  nome: z.string().min(3, "Nome é obrigatório."),
  data_nascimento: z.string().refine((val) => /^\d{2}\/\d{2}\/\d{4}$/.test(val), {
    message: "Data deve estar no formato DD/MM/AAAA.",
  }),
  telefone: z.object({
      codigo_area: z.string().min(2, "DDD é obrigatório.").max(2, "DDD deve ter 2 dígitos."),
      numero: z.string().min(8, "Número é obrigatório."),
  })
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

export default function C6Page() {
  const { user } = useUser();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkResult, setLinkResult] = useState<C6LinkResponse | null>(null);

  const [isOfferLoading, setIsOfferLoading] = useState(false);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [offerResult, setOfferResult] = useState<C6Offer[] | null>(null);
  const [noOffersMessage, setNoOffersMessage] = useState<string | null>(null);
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      cpf: "",
      nome: "",
      data_nascimento: "",
      telefone: {
          codigo_area: "",
          numero: "",
      }
    },
  });

  async function onLinkSubmit(values: z.infer<typeof formSchema>) {
    if (!user) {
      setError("Você precisa estar logado para realizar uma consulta.");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    setLinkResult(null);
    setOfferResult(null);
    setOfferError(null);
    setNoOffersMessage(null);

    const response = await consultarLinkAutorizacaoC6({ ...values, userId: user.uid });

    if (response.success && response.data) {
        setLinkResult(response.data);
    } else {
      setError(response.message);
    }
    
    setIsLoading(false);
  }

  async function onGetOffers() {
     if (!user) {
      setOfferError("Você precisa estar logado para realizar uma consulta.");
      return;
    }
    const cpf = form.getValues('cpf');
    if (!cpf) {
        setOfferError("CPF do cliente não encontrado para buscar ofertas.");
        return;
    }

    setIsOfferLoading(true);
    setOfferError(null);
    setOfferResult(null);
    setNoOffersMessage(null);
    
    const response = await consultarOfertasCLTC6({ cpf, userId: user.uid });

    if (response.success) {
      if (response.data && response.data.length > 0) {
        setOfferResult(response.data);
      } else {
        setNoOffersMessage(response.message || "Nenhuma oferta encontrada para este cliente.");
      }
    } else {
      setOfferError(response.message);
    }

    setIsOfferLoading(false);
  }


  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Crédito Privado CLT - C6"
        description="Gere um link de autorização e consulte as ofertas de crédito para o cliente."
      />
      <Card>
        <CardHeader>
            <CardTitle>1. Gerar Link de Autorização</CardTitle>
            <CardDescription>Insira os dados do cliente para gerar o link que ele usará para autorizar a consulta.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onLinkSubmit)} className="space-y-6">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="nome"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Nome Completo</FormLabel>
                            <FormControl>
                            <Input placeholder="Nome completo do cliente" {...field} disabled={isLoading}/>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
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
                     <FormField
                        control={form.control}
                        name="telefone.codigo_area"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>DDD</FormLabel>
                            <FormControl>
                            <Input placeholder="11" {...field} disabled={isLoading} maxLength={2}/>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                     <FormField
                        control={form.control}
                        name="telefone.numero"
                        render={({ field }) => (
                        <FormItem className="md:col-span-2">
                            <FormLabel>Número do Celular</FormLabel>
                            <FormControl>
                            <Input placeholder="997773344" {...field} disabled={isLoading}/>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                </div>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                {isLoading ? "Gerando..." : "Gerar Link"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
      
      {error && (
         <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Erro ao Gerar Link</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
         </Alert>
      )}
      
      {linkResult && (
        <Card>
            <CardHeader>
                <CardTitle>2. Link Gerado e Próximo Passo</CardTitle>
                <CardDescription>Envie o link ao cliente. Após ele confirmar a autorização, clique em "Buscar Ofertas".</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                     <Input value={linkResult.link} readOnly />
                     <Button asChild variant="secondary">
                        <a href={linkResult.link} target="_blank" rel="noopener noreferrer">
                            Abrir <ExternalLink className="ml-2 h-4 w-4" />
                        </a>
                    </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                    O link expira em: {new Date(linkResult.data_expiracao).toLocaleDateString('pt-BR')}
                </p>
                <Separator/>
                <Button onClick={onGetOffers} disabled={isOfferLoading}>
                    {isOfferLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wallet className="mr-2 h-4 w-4" />}
                    {isOfferLoading ? "Buscando..." : "Buscar Ofertas"}
                </Button>
            </CardContent>
        </Card>
      )}

      {offerError && (
         <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Erro ao Buscar Ofertas</AlertTitle>
            <AlertDescription>{offerError}</AlertDescription>
         </Alert>
      )}

       {noOffersMessage && (
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

      {offerResult && (
        <Card>
          <CardHeader>
            <CardTitle>Ofertas Encontradas</CardTitle>
            <CardDescription>As seguintes ofertas estão disponíveis para este cliente.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {offerResult.map(offer => (
              <div key={offer.id_oferta} className="border rounded-lg p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold text-lg">{offer.nome_produto}</h3>
                  <Badge>{offer.status}</Badge>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm pt-2">
                  <div className="flex flex-col">
                    <span className="text-muted-foreground">Valor Financiado</span>
                    <span className="font-semibold">{formatCurrency(offer.valor_financiado)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-muted-foreground">Valor da Parcela</span>
                    <span className="font-semibold">{formatCurrency(offer.valor_parcela)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-muted-foreground">Nº de Parcelas</span>
                    <span className="font-semibold">{offer.qtd_parcelas}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-muted-foreground">Taxa (mês)</span>
                    <span className="font-semibold">{offer.taxa_mes}%</span>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

    </div>
  );
}
