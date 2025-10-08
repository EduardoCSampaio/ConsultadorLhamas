
'use client';

import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
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
import { updateApiCredentials, type UserProfile, type ApiCredentials } from "@/app/actions/users";
import { Loader2, Save } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useState } from "react";
import { Separator } from "@/components/ui/separator";

// Schemas for form validation
const v8FormSchema = z.object({
  v8_username: z.string().optional(),
  v8_password: z.string().optional(),
  v8_audience: z.string().optional(),
  v8_client_id: z.string().optional(),
});

const factaFormSchema = z.object({
  facta_username: z.string().optional(),
  facta_password: z.string().optional(),
});

type V8FormValues = z.infer<typeof v8FormSchema>;
type FactaFormValues = z.infer<typeof factaFormSchema>;

export default function ConfiguracoesPage() {
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const [isV8Submitting, setIsV8Submitting] = useState(false);
  const [isFactaSubmitting, setIsFactaSubmitting] = useState(false);

  // Fetch current user's profile to get existing credentials
  const userProfileRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);

  const { data: userProfile, isLoading: isProfileLoading } = useDoc<UserProfile>(userProfileRef);

  const v8Form = useForm<V8FormValues>({
    resolver: zodResolver(v8FormSchema),
    defaultValues: {
      v8_username: '',
      v8_password: '',
      v8_audience: '',
      v8_client_id: '',
    },
  });

  const factaForm = useForm<FactaFormValues>({
    resolver: zodResolver(factaFormSchema),
    defaultValues: {
      facta_username: '',
      facta_password: '',
    },
  });

  // When user profile is loaded, reset the forms with their saved values
  useEffect(() => {
    if (userProfile) {
      v8Form.reset({
        v8_username: userProfile.v8_username || '',
        v8_password: userProfile.v8_password || '',
        v8_audience: userProfile.v8_audience || '',
        v8_client_id: userProfile.v8_client_id || '',
      });
      factaForm.reset({
        facta_username: userProfile.facta_username || '',
        facta_password: userProfile.facta_password || '',
      });
    }
  }, [userProfile, v8Form, factaForm]);

  const handleSave = async (credentials: Partial<ApiCredentials>, provider: 'v8' | 'facta') => {
    if (!user) {
      toast({
        variant: "destructive",
        title: "Erro de Autenticação",
        description: "Você precisa estar logado para salvar as configurações.",
      });
      return;
    }
    
    if (provider === 'v8') setIsV8Submitting(true);
    if (provider === 'facta') setIsFactaSubmitting(true);

    const result = await updateApiCredentials({ uid: user.uid, credentials });

    if (result.success) {
      toast({
        title: `Configurações ${provider.toUpperCase()} Salvas!`,
        description: `Suas credenciais para a API ${provider.toUpperCase()} foram atualizadas.`,
      });
    } else {
      toast({
        variant: "destructive",
        title: "Erro ao Salvar",
        description: result.error || `Não foi possível atualizar as credenciais da ${provider.toUpperCase()}.`,
      });
    }

    if (provider === 'v8') setIsV8Submitting(false);
    if (provider === 'facta') setIsFactaSubmitting(false);
  };
  
  const isLoading = isUserLoading || isProfileLoading;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Configurações das APIs"
        description="Gerencie suas credenciais para integração com as APIs."
      />
      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
             <div className="space-y-8">
                <Skeleton className="h-8 w-48 mb-4" />
                <div className="space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-10 w-full" /></div>
                <div className="space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-10 w-full" /></div>
                <div className="space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-10 w-full" /></div>
                <div className="space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-10 w-full" /></div>
                <Skeleton className="h-10 w-32 mt-4" />
                <Separator />
                <Skeleton className="h-8 w-48 mb-4" />
                <div className="space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-10 w-full" /></div>
                <div className="space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-10 w-full" /></div>
                <Skeleton className="h-10 w-32 mt-4" />
            </div>
          ) : (
            <div className="space-y-12">
              {/* V8 Form */}
              <Form {...v8Form}>
                  <form onSubmit={v8Form.handleSubmit((values) => handleSave(values, 'v8'))} className="space-y-8">
                    <div>
                      <h3 className="text-lg font-medium font-headline">Credenciais da API V8</h3>
                      <p className="text-sm text-muted-foreground">
                        Para consulta de saldo FGTS e Crédito Privado CLT (V8).
                      </p>
                    </div>
                    <div className="space-y-8 pl-2 border-l-2 border-border ml-2">
                       <FormField
                          control={v8Form.control}
                          name="v8_username"
                          render={({ field }) => (
                          <FormItem>
                              <FormLabel>V8 Username</FormLabel>
                              <FormControl>
                              <Input placeholder="seu_usuario_v8" {...field} disabled={isV8Submitting}/>
                              </FormControl>
                              <FormDescription>Seu nome de usuário para a API V8.</FormDescription>
                              <FormMessage />
                          </FormItem>
                          )}
                      />
                      <FormField
                          control={v8Form.control}
                          name="v8_password"
                          render={({ field }) => (
                          <FormItem>
                              <FormLabel>V8 Password</FormLabel>
                              <FormControl>
                              <Input type="password" placeholder="********" {...field} disabled={isV8Submitting} />
                              </FormControl>
                              <FormDescription>Sua senha para a API V8.</FormDescription>
                              <FormMessage />
                          </FormItem>
                          )}
                      />
                      <FormField
                          control={v8Form.control}
                          name="v8_audience"
                          render={({ field }) => (
                          <FormItem>
                              <FormLabel>V8 Audience</FormLabel>
                              <FormControl>
                              <Input placeholder="https://audiencia.v8.com" {...field} disabled={isV8Submitting} />
                              </FormControl>
                              <FormDescription>A audiência de destino da API.</FormDescription>
                              <FormMessage />
                          </FormItem>
                          )}
                      />
                      <FormField
                          control={v8Form.control}
                          name="v8_client_id"
                          render={({ field }) => (
                          <FormItem>
                              <FormLabel>V8 Client ID</FormLabel>
                              <FormControl>
                              <Input placeholder="client_id_da_v8" {...field} disabled={isV8Submitting} />
                              </FormControl>
                              <FormDescription>Seu ID de cliente para a aplicação.</FormDescription>
                              <FormMessage />
                          </FormItem>
                          )}
                      />
                    </div>
                    <Button type="submit" disabled={isV8Submitting}>
                        {isV8Submitting ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Save className="mr-2 h-4 w-4" />
                        )}
                        Salvar Credenciais V8
                    </Button>
                  </form>
              </Form>

              <Separator />
              
              {/* Facta Form */}
              <Form {...factaForm}>
                  <form onSubmit={factaForm.handleSubmit((values) => handleSave(values, 'facta'))} className="space-y-8">
                    <div>
                      <h3 className="text-lg font-medium font-headline">Credenciais da API Facta</h3>
                      <p className="text-sm text-muted-foreground">
                        Para consulta de Crédito Privado CLT (Facta).
                      </p>
                    </div>
                     <div className="space-y-8 pl-2 border-l-2 border-border ml-2">
                       <FormField
                          control={factaForm.control}
                          name="facta_username"
                          render={({ field }) => (
                          <FormItem>
                              <FormLabel>Facta Username</FormLabel>
                              <FormControl>
                              <Input placeholder="seu_usuario_facta" {...field} disabled={isFactaSubmitting}/>
                              </FormControl>
                              <FormDescription>Seu nome de usuário para a API Facta.</FormDescription>
                              <FormMessage />
                          </FormItem>
                          )}
                      />
                      <FormField
                          control={factaForm.control}
                          name="facta_password"
                          render={({ field }) => (
                          <FormItem>
                              <FormLabel>Facta Password</FormLabel>
                              <FormControl>
                              <Input type="password" placeholder="********" {...field} disabled={isFactaSubmitting} />
                              </FormControl>
                              <FormDescription>Sua senha para a API Facta.</FormDescription>
                              <FormMessage />
                          </FormItem>
                          )}
                      />
                     </div>
                      <Button type="submit" disabled={isFactaSubmitting}>
                        {isFactaSubmitting ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Save className="mr-2 h-4 w-4" />
                        )}
                        Salvar Credenciais Facta
                    </Button>
                  </form>
              </Form>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
