
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
import { CalendarIcon, Loader2, FileSignature } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { gerarTermoConsentimento } from "@/app/actions/clt";
import { useUser } from "@/firebase";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import Link from "next/link";

const consentFormSchema = z.object({
  borrowerDocumentNumber: z.string().min(11, "CPF deve ter 11 dígitos.").max(11, "CPF deve ter 11 dígitos."),
  gender: z.enum(["male", "female"], { required_error: "Selecione o gênero." }),
  birthDate: z.date({ required_error: "Data de nascimento é obrigatória." }),
  signerName: z.string().min(3, "Nome do signatário é obrigatório."),
  signerEmail: z.string().email("Email do signatário inválido."),
  signerPhoneCountryCode: z.string().min(1, "DDI é obrigatório.").default("55"),
  signerPhoneAreaCode: z.string().min(2, "DDD é obrigatório."),
  signerPhoneNumber: z.string().min(8, "Número de telefone é obrigatório."),
});

type ConsentFormValues = z.infer<typeof consentFormSchema>;

export default function CltPage() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; consultationId?: string } | null>(null);
  const { user } = useUser();

  const form = useForm<ConsentFormValues>({
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

  async function onSubmit(values: ConsentFormValues) {
    if (!user) {
      toast({ variant: "destructive", title: "Erro de Autenticação", description: "Você precisa estar logado." });
      return;
    }
    
    setIsLoading(true);
    setResult(null);

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
        provider: 'QI', // Hardcoded as per documentation
        userId: user.uid,
    });
    
    setResult(result);
    setIsLoading(false);

    if (result.success) {
      toast({
        title: "Termo de Consentimento Gerado!",
        description: result.message,
      });
      form.reset();
    } else {
      toast({
        variant: "destructive",
        title: "Erro ao Gerar Termo",
        description: result.message,
      });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Crédito Privado CLT"
        description="Gere o termo de consentimento para iniciar uma nova consulta."
      />
      <Card>
        <CardHeader>
          <CardTitle>Gerar Termo de Consentimento</CardTitle>
          <CardDescription>
            Preencha os dados do tomador e do signatário para gerar o termo. Este é o primeiro passo para a análise de crédito.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <div className="grid md:grid-cols-2 gap-8">
                {/* Borrower Section */}
                <div className="space-y-6">
                    <h3 className="text-lg font-medium border-b pb-2">Dados do Tomador</h3>
                    <FormField
                        control={form.control}
                        name="borrowerDocumentNumber"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>CPF do Tomador</FormLabel>
                            <FormControl>
                            <Input placeholder="000.000.000-00" {...field} disabled={isLoading} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="birthDate"
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
                                    format(field.value, "PPP", { locale: ptBR })
                                    ) : (
                                    <span>Escolha uma data</span>
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
                        name="gender"
                        render={({ field }) => (
                            <FormItem className="space-y-3">
                            <FormLabel>Gênero</FormLabel>
                            <FormControl>
                                <RadioGroup
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                                className="flex space-x-4"
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
                 {/* Signer Section */}
                <div className="space-y-6">
                    <h3 className="text-lg font-medium border-b pb-2">Dados do Signatário</h3>
                     <FormField
                        control={form.control}
                        name="signerName"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Nome Completo</FormLabel>
                            <FormControl>
                            <Input placeholder="Nome do signatário" {...field} disabled={isLoading} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="signerEmail"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                            <Input placeholder="email@exemplo.com" {...field} disabled={isLoading} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <div>
                        <FormLabel>Telefone</FormLabel>
                        <div className="flex gap-2 mt-2">
                             <FormField
                                control={form.control}
                                name="signerPhoneCountryCode"
                                render={({ field }) => (
                                <FormItem className="w-20">
                                    <FormControl>
                                    <Input placeholder="+55" {...field} disabled={isLoading} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                             <FormField
                                control={form.control}
                                name="signerPhoneAreaCode"
                                render={({ field }) => (
                                <FormItem className="w-20">
                                    <FormControl>
                                    <Input placeholder="DDD" {...field} disabled={isLoading} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                             <FormField
                                control={form.control}
                                name="signerPhoneNumber"
                                render={({ field }) => (
                                <FormItem className="flex-1">
                                    <FormControl>
                                    <Input placeholder="99999-9999" {...field} disabled={isLoading} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                        </div>
                        <FormDescription className="mt-2">Inclua DDI, DDD e o número.</FormDescription>
                    </div>
                </div>
              </div>
              
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileSignature className="mr-2 h-4 w-4" />
                )}
                Gerar Termo
              </Button>
            </form>
          </Form>
          {result && (
              <Alert className={`mt-6 ${result.success ? 'border-green-500 text-green-700' : 'border-red-500'}`} variant={result.success ? 'default' : 'destructive'}>
                <AlertTitle className="font-bold">{result.success ? 'Sucesso!' : 'Falha na Operação'}</AlertTitle>
                <AlertDescription>
                    {result.message}
                    {result.success && result.consultationId && (
                        <p className="mt-2">ID da Consulta: <strong className="font-mono bg-muted p-1 rounded">{result.consultationId}</strong></p>
                    )}
                </AlertDescription>
              </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

    