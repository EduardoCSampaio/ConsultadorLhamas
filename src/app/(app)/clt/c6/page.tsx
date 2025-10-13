
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
import { consultarOfertasC6 } from "@/app/actions/c6";

const formSchema = z.object({
  cpf: z.string().min(11, "CPF deve ter 11 dígitos.").max(11, "CPF deve ter 11 dígitos."),
});

export default function C6Page() {
  const { user } = useUser();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any[] | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  
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
    setInfoMessage(null);

    const response = await consultarOfertasC6({ cpf: values.cpf, userId: user.uid });

    if (response.success) {
        setInfoMessage(response.message);
        if(response.data && response.data.length > 0) {
            setResult(response.data);
        } else {
            // No offers found, but the message from the backend will be displayed
            setResult([]);
        }
    } else {
      setError(response.message);
    }
    
    setIsLoading(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Crédito Privado CLT - C6"
        description="Consulte ofertas de crédito privado CLT disponíveis no provedor C6."
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
      
      {infoMessage && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Informação</AlertTitle>
          <AlertDescription>{infoMessage}</AlertDescription>
        </Alert>
      )}

      {result && result.length === 0 && (
        <Card>
            <CardContent className="pt-6">
                <div className="flex flex-col items-center justify-center gap-4 text-center h-60 border-2 border-dashed rounded-lg">
                    <CircleDashed className="h-12 w-12 text-muted-foreground" />
                    <h3 className="text-2xl font-bold tracking-tight">
                        Nenhuma Oferta Encontrada
                    </h3>
                    <div className="text-sm text-muted-foreground">
                       Nenhuma oferta foi retornada para o CPF informado no momento.
                    </div>
                </div>
            </CardContent>
        </Card>
      )}
      
      {/* Placeholder for future results display */}
      {result && result.length > 0 && (
         <Card>
            <CardHeader>
                <CardTitle>Ofertas Encontradas</CardTitle>
            </CardHeader>
            <CardContent>
                <p>A exibição dos resultados será implementada aqui.</p>
            </CardContent>
        </Card>
      )}

    </div>
  );
}
