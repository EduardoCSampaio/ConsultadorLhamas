
'use client';

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
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
import { Loader2, Save, Settings, SlidersHorizontal, User as UserIcon, Lock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ImageUploadDialog } from "@/components/image-upload-dialog";


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

const c6FormSchema = z.object({
  c6_username: z.string().optional(),
  c6_password: z.string().optional(),
});

type V8FormValues = z.infer<typeof v8FormSchema>;
type FactaFormValues = z.infer<typeof factaFormSchema>;
type C6FormValues = z.infer<typeof c6FormSchema>;

export default function ConfiguracoesPage() {
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const [isV8Submitting, setIsV8Submitting] = useState(false);
  const [isFactaSubmitting, setIsFactaSubmitting] = useState(false);
  const [isC6Submitting, setIsC6Submitting] = useState(false);

  const [isV8ModalOpen, setIsV8ModalOpen] = useState(false);
  const [isFactaModalOpen, setIsFactaModalOpen] = useState(false);
  const [isC6ModalOpen, setIsC6ModalOpen] = useState(false);

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

  const c6Form = useForm<C6FormValues>({
    resolver: zodResolver(c6FormSchema),
    defaultValues: {
      c6_username: '',
      c6_password: '',
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
      c6Form.reset({
        c6_username: userProfile.c6_username || '',
        c6_password: userProfile.c6_password || '',
      });
    }
  }, [userProfile, v8Form, factaForm, c6Form]);

  const handleSave = async (credentials: Partial<ApiCredentials>, provider: 'v8' | 'facta' | 'c6') => {
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
    if (provider === 'c6') setIsC6Submitting(true);

    const result = await updateApiCredentials({ uid: user.uid, credentials });

    if (result.success) {
      toast({
        title: `Configurações ${provider.toUpperCase()} Salvas!`,
        description: `Suas credenciais para a API ${provider.toUpperCase()} foram atualizadas.`,
      });
      if (provider === 'v8') setIsV8ModalOpen(false);
      if (provider === 'facta') setIsFactaModalOpen(false);
      if (provider === 'c6') setIsC6ModalOpen(false);
    } else {
      toast({
        variant: "destructive",
        title: "Erro ao Salvar",
        description: result.error || `Não foi possível atualizar as credenciais da ${provider.toUpperCase()}.`,
      });
    }

    if (provider === 'v8') setIsV8Submitting(false);
    if (provider === 'facta') setIsFactaSubmitting(false);
    if (provider === 'c6') setIsC6Submitting(false);
  };
  
  const getInitials = (email = '') => {
    return email.substring(0, 2).toUpperCase();
  }
  
  const isLoading = isUserLoading || isProfileLoading;
  
  const getRoleText = (role: UserProfile['role'] | undefined) => {
    if (!role) return '';
    switch (role) {
        case 'super_admin': return 'Super Admin';
        case 'manager': return 'Gerente';
        case 'user': return 'Usuário';
        default: return role;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Configurações"
        description="Gerencie seu perfil e suas credenciais para integração com as APIs."
      />
      
      {isLoading ? (
        <Card>
            <CardContent className="pt-6">
                <div className="space-y-4">
                    <Skeleton className="h-10 w-48" />
                    <Skeleton className="h-40 w-full" />
                </div>
            </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="perfil">
            <TabsList className="grid w-full grid-cols-2 max-w-md">
                <TabsTrigger value="perfil">Perfil</TabsTrigger>
                <TabsTrigger value="apis">APIs</TabsTrigger>
            </TabsList>
            <TabsContent value="perfil">
                <Card>
                    <CardHeader>
                        <CardTitle>Configurações de Perfil</CardTitle>
                        <CardDescription>Gerencie sua conta e aparência no sistema.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex items-center gap-4 p-4 border rounded-lg">
                            <Avatar className="h-16 w-16">
                                {user?.photoURL && <AvatarImage src={user.photoURL} alt="User Avatar" />}
                                <AvatarFallback className="text-xl">{getInitials(user?.email || '??')}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                                <h3 className="font-semibold">{user?.email}</h3>
                                <p className="text-sm text-muted-foreground">{getRoleText(userProfile?.role)}</p>
                            </div>
                            <ImageUploadDialog>
                                <Button variant="outline">Alterar Foto</Button>
                            </ImageUploadDialog>
                        </div>

                         <Card>
                            <CardHeader className="flex flex-row items-center gap-4">
                                <Lock className="h-6 w-6 text-muted-foreground"/>
                                <div>
                                    <CardTitle>Alterar Senha</CardTitle>
                                    <CardDescription className="text-xs">Altere sua senha de acesso.</CardDescription>
                                </div>
                            </CardHeader>
                            <CardContent>
                               <Button disabled>Alterar Senha</Button>
                               <p className="text-xs text-muted-foreground mt-2">Funcionalidade em breve.</p>
                            </CardContent>
                        </Card>

                    </CardContent>
                </Card>
            </TabsContent>
            <TabsContent value="apis">
                <Card>
                  <CardHeader>
                    <CardTitle>Provedores de API</CardTitle>
                    <CardDescription>
                        Clique em um provedor para editar suas credenciais de API.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     {/* V8 Dialog Trigger */}
                     <Dialog open={isV8ModalOpen} onOpenChange={setIsV8ModalOpen}>
                        <DialogTrigger asChild>
                            <button className="flex flex-col items-center justify-center gap-4 text-center p-6 border-2 border-dashed rounded-lg hover:border-primary hover:bg-primary/5 transition-colors">
                                <SlidersHorizontal className="h-10 w-10 text-primary" />
                                <h3 className="text-xl font-bold tracking-tight">
                                    API V8
                                </h3>
                                <div className="text-sm text-muted-foreground">
                                    Credenciais para consulta de saldo FGTS e Crédito Privado CLT.
                                </div>
                            </button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                                <DialogTitle>Credenciais da API V8</DialogTitle>
                                <DialogDescription>
                                    Para consulta de saldo FGTS e Crédito Privado CLT (V8).
                                </DialogDescription>
                            </DialogHeader>
                            <Form {...v8Form}>
                              <form onSubmit={v8Form.handleSubmit((values) => handleSave(values, 'v8'))} className="space-y-4 pt-4">
                                  <FormField
                                    control={v8Form.control}
                                    name="v8_username"
                                    render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>V8 Username</FormLabel>
                                        <FormControl>
                                        <Input placeholder="seu_usuario_v8" {...field} disabled={isV8Submitting}/>
                                        </FormControl>
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
                                        <FormMessage />
                                    </FormItem>
                                    )}
                                  />
                                  <DialogFooter className="pt-4">
                                      <Button type="button" variant="outline" onClick={() => setIsV8ModalOpen(false)}>Cancelar</Button>
                                      <Button type="submit" disabled={isV8Submitting}>
                                          {isV8Submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                          Salvar
                                      </Button>
                                  </DialogFooter>
                              </form>
                            </Form>
                        </DialogContent>
                     </Dialog>

                     {/* Facta Dialog Trigger */}
                     <Dialog open={isFactaModalOpen} onOpenChange={setIsFactaModalOpen}>
                        <DialogTrigger asChild>
                             <button className="flex flex-col items-center justify-center gap-4 text-center p-6 border-2 border-dashed rounded-lg hover:border-primary hover:bg-primary/5 transition-colors">
                                <SlidersHorizontal className="h-10 w-10 text-primary" />
                                <h3 className="text-xl font-bold tracking-tight">
                                    API Facta
                                </h3>
                                <div className="text-sm text-muted-foreground">
                                    Credenciais para consulta de Crédito Privado CLT.
                                </div>
                            </button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                                <DialogTitle>Credenciais da API Facta</DialogTitle>
                                <DialogDescription>
                                    Para consulta de Crédito Privado CLT (Facta).
                                </DialogDescription>
                            </DialogHeader>
                            <Form {...factaForm}>
                                <form onSubmit={factaForm.handleSubmit((values) => handleSave(values, 'facta'))} className="space-y-4 pt-4">
                                   <FormField
                                      control={factaForm.control}
                                      name="facta_username"
                                      render={({ field }) => (
                                      <FormItem>
                                          <FormLabel>Facta Username</FormLabel>
                                          <FormControl>
                                          <Input placeholder="seu_usuario_facta" {...field} disabled={isFactaSubmitting}/>
                                          </FormControl>
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
                                          <FormMessage />
                                      </FormItem>
                                      )}
                                   />
                                   <DialogFooter className="pt-4">
                                        <Button type="button" variant="outline" onClick={() => setIsFactaModalOpen(false)}>Cancelar</Button>
                                        <Button type="submit" disabled={isFactaSubmitting}>
                                            {isFactaSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                            Salvar
                                        </Button>
                                   </DialogFooter>
                                </form>
                            </Form>
                        </DialogContent>
                     </Dialog>

                      {/* C6 Dialog Trigger */}
                     <Dialog open={isC6ModalOpen} onOpenChange={setIsC6ModalOpen}>
                        <DialogTrigger asChild>
                             <button className="flex flex-col items-center justify-center gap-4 text-center p-6 border-2 border-dashed rounded-lg hover:border-primary hover:bg-primary/5 transition-colors">
                                <SlidersHorizontal className="h-10 w-10 text-primary" />
                                <h3 className="text-xl font-bold tracking-tight">
                                    API C6
                                </h3>
                                <div className="text-sm text-muted-foreground">
                                    Credenciais para consulta de Crédito Privado CLT.
                                </div>
                            </button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                                <DialogTitle>Credenciais da API C6</DialogTitle>
                                <DialogDescription>
                                    Para consulta de Crédito Privado CLT (C6).
                                </DialogDescription>
                            </DialogHeader>
                            <Form {...c6Form}>
                                <form onSubmit={c6Form.handleSubmit((values) => handleSave(values, 'c6'))} className="space-y-4 pt-4">
                                   <FormField
                                      control={c6Form.control}
                                      name="c6_username"
                                      render={({ field }) => (
                                      <FormItem>
                                          <FormLabel>C6 Username</FormLabel>
                                          <FormControl>
                                          <Input placeholder="seu_usuario_c6" {...field} disabled={isC6Submitting}/>
                                          </FormControl>
                                          <FormMessage />
                                      </FormItem>
                                      )}
                                   />
                                   <FormField
                                      control={c6Form.control}
                                      name="c6_password"
                                      render={({ field }) => (
                                      <FormItem>
                                          <FormLabel>C6 Password</FormLabel>
                                          <FormControl>
                                          <Input type="password" placeholder="********" {...field} disabled={isC6Submitting} />
                                          </FormControl>
                                          <FormMessage />
                                      </FormItem>
                                      )}
                                   />
                                   <DialogFooter className="pt-4">
                                        <Button type="button" variant="outline" onClick={() => setIsC6ModalOpen(false)}>Cancelar</Button>
                                        <Button type="submit" disabled={isC6Submitting}>
                                            {isC6Submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                            Salvar
                                        </Button>
                                   </DialogFooter>
                                </form>
                            </Form>
                        </DialogContent>
                     </Dialog>

                  </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
