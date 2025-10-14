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
import { Loader2, Search, AlertCircle, ExternalLink } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { useUser } from "@/firebase";
import { consultarOfertasC6, type C6LinkResponse } from "@/app/actions/c6";

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
  cpf: z.string().min(11, "CPF deve ter 11 dígitos.").max(11, "CPF deve ter 11 dígitos."),
  nome: z.string().min(3, "Nome é obrigatório."),
  data_nascimento: z.string().refine((val) => /^\d{2}\/\d{2}\/\d{4}$/.test(val), {
    message: "Data deve estar no formato DD/MM/AAAA.",
  }),
  telefone: z.object({
      codigo_area: z.string().min(2, "DDD é obrigatório.").max(2, "DDD deve ter 2 dígitos."),
      numero: z.string().min(8, "Número é obrigatório."),
  })
});


export default function C6Page() {
  const { user } = useUser();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<C6LinkResponse | null>(null);
  
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

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!user) {
      setError("Você precisa estar logado para realizar uma consulta.");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    setResult(null);

    const response = await consultarOfertasC6({ ...values, userId: user.uid });

    if (response.success && response.data) {
        setResult(response.data);
    } else {
      setError(response.message);
    }
    
    setIsLoading(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Crédito Privado CLT - C6"
        description="Gere um link de autorização de consulta de dados para o cliente."
      />
      <Card>
        <CardHeader>
            <CardTitle>Gerar Link de Autorização</CardTitle>
            <CardDescription>Insira os dados do cliente para gerar o link de autorização.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
            <AlertTitle>Erro na Consulta</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
         </Alert>
      )}
      
      {result && (
         <Card>
            <CardHeader>
                <CardTitle>Link Gerado com Sucesso!</CardTitle>
                <CardDescription>Envie o link abaixo para o cliente autorizar a consulta.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                     <Input value={result.link} readOnly />
                     <Button asChild variant="secondary">
                        <a href={result.link} target="_blank" rel="noopener noreferrer">
                            Abrir <ExternalLink className="ml-2 h-4 w-4" />
                        </a>
                    </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                    O link expira em: {new Date(result.data_expiracao).toLocaleDateString('pt-BR')}
                </p>
            </CardContent>
        </Card>
      )}
    </div>
  );
}
