
'use client';

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useUser, useFirestore, useMemoFirebase, useDoc } from "@/firebase";
import { doc } from "firebase/firestore";
import { updateApiCredentials, type UserProfile } from "@/app/actions/users";
import { Loader2, Save } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect } from "react";

// Schema for the form validation
const settingsFormSchema = z.object({
  v8_username: z.string().optional(),
  v8_password: z.string().optional(),
  v8_audience: z.string().optional(),
  v8_client_id: z.string().optional(),
});

type SettingsFormValues = z.infer<typeof settingsFormSchema>;

export default function ConfiguracoesPage() {
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  // Fetch current user's profile to get existing credentials
  const userProfileRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);

  const { data: userProfile, isLoading: isProfileLoading } = useDoc<UserProfile>(userProfileRef);

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: {
      v8_username: '',
      v8_password: '',
      v8_audience: '',
      v8_client_id: '',
    },
  });

  // When user profile is loaded, reset the form with their saved values
  useEffect(() => {
    if (userProfile) {
      form.reset({
        v8_username: userProfile.v8_username || '',
        v8_password: userProfile.v8_password || '',
        v8_audience: userProfile.v8_audience || '',
        v8_client_id: userProfile.v8_client_id || '',
      });
    }
  }, [userProfile, form]);

  const onSubmit = async (values: SettingsFormValues) => {
    if (!user) {
        toast({
            variant: "destructive",
            title: "Erro de Autenticação",
            description: "Você precisa estar logado para salvar as configurações.",
        });
        return;
    }

    const result = await updateApiCredentials({ uid: user.uid, credentials: values });

    if (result.success) {
      toast({
        title: "Configurações Salvas!",
        description: "Suas credenciais de API foram atualizadas com sucesso.",
      });
    } else {
      toast({
        variant: "destructive",
        title: "Erro ao Salvar",
        description: result.error || "Não foi possível atualizar as credenciais.",
      });
    }
  };

  const isLoading = form.formState.isSubmitting || isUserLoading || isProfileLoading;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Configurações da API"
        description="Gerencie suas credenciais para integração com a API V8."
      />
      <Card>
        <CardHeader>
          <CardTitle>Credenciais da API V8</CardTitle>
          <CardDescription>
            Estas informações são usadas para autenticar e realizar consultas de saldo FGTS. Elas são salvas de forma segura e associadas à sua conta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && !form.formState.isSubmitting ? (
             <div className="space-y-8">
                <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-10 w-full" />
                </div>
                 <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-10 w-full" />
                </div>
                 <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-10 w-full" />
                </div>
                 <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-10 w-full" />
                </div>
                <Skeleton className="h-10 w-32" />
            </div>
          ) : (
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <FormField
                    control={form.control}
                    name="v8_username"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>V8 Username</FormLabel>
                        <FormControl>
                        <Input placeholder="seu_usuario_v8" {...field} disabled={isLoading}/>
                        </FormControl>
                        <FormDescription>Seu nome de usuário para a API V8.</FormDescription>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="v8_password"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>V8 Password</FormLabel>
                        <FormControl>
                        <Input type="password" placeholder="********" {...field} disabled={isLoading} />
                        </FormControl>
                        <FormDescription>Sua senha para a API V8.</FormDescription>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="v8_audience"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>V8 Audience</FormLabel>
                        <FormControl>
                        <Input placeholder="https://audiencia.v8.com" {...field} disabled={isLoading} />
                        </FormControl>
                        <FormDescription>A audiência de destino da API.</FormDescription>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="v8_client_id"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>V8 Client ID</FormLabel>
                        <FormControl>
                        <Input placeholder="client_id_da_v8" {...field} disabled={isLoading} />
                        </FormControl>
                        <FormDescription>Seu ID de cliente para a aplicação.</FormDescription>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                <Button type="submit" disabled={isLoading}>
                    {isLoading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Save className="mr-2 h-4 w-4" />
                    )}
                    Salvar Configurações
                </Button>
                </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
