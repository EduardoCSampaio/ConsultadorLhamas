'use client';

import { useState, useEffect } from "react";
import Link from 'next/link';
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, PlusCircle, Inbox, AlertCircle, MessageSquare } from 'lucide-react';
import { getTicketsForUser, createTicket, type Ticket } from '@/app/actions/tickets';
import { useUser, useDoc, useFirestore, useMemoFirebase } from "@/firebase";
import { doc } from 'firebase/firestore';
import type { UserProfile } from '@/app/actions/users';
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const newTicketSchema = z.object({
  title: z.string().min(5, "O título deve ter pelo menos 5 caracteres.").max(100, "O título deve ter no máximo 100 caracteres."),
  message: z.string().min(10, "A mensagem deve ter pelo menos 10 caracteres.").max(1000, "A mensagem deve ter no máximo 1000 caracteres."),
});

export default function ChamadosPage() {
    const { toast } = useToast();
    const { user } = useUser();
    const firestore = useFirestore();

    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const userProfileRef = useMemoFirebase(() => {
        if (!firestore || !user) return null;
        return doc(firestore, 'users', user.uid);
    }, [firestore, user]);
    const { data: userProfile } = useDoc<UserProfile>(userProfileRef);

    const form = useForm<z.infer<typeof newTicketSchema>>({
        resolver: zodResolver(newTicketSchema),
        defaultValues: {
            title: "",
            message: "",
        },
    });

    const fetchTickets = async () => {
        if (!user) return;
        setIsLoading(true);
        setError(null);
        const { tickets: fetchedTickets, error: fetchError } = await getTicketsForUser({ userId: user.uid });
        if (fetchError) {
            setError(fetchError);
        } else {
            setTickets(fetchedTickets || []);
        }
        setIsLoading(false);
    };

    useEffect(() => {
        if (user) {
            fetchTickets();
        }
    }, [user]);

    const handleCreateTicket = async (values: z.infer<typeof newTicketSchema>) => {
        if (!user || !user.email) {
            toast({ variant: 'destructive', title: 'Erro de autenticação' });
            return;
        }

        setIsSubmitting(true);
        const result = await createTicket({
            userId: user.uid,
            userEmail: user.email,
            title: values.title,
            initialMessage: values.message,
        });

        if (result.success) {
            toast({ title: 'Chamado aberto com sucesso!', description: `Seu chamado ${result.ticket?.ticketNumber} foi criado.` });
            setIsModalOpen(false);
            form.reset();
            await fetchTickets();
        } else {
            toast({ variant: 'destructive', title: 'Erro ao abrir chamado', description: result.message });
        }
        setIsSubmitting(false);
    };
    
     const getStatusVariant = (status: Ticket['status']) => {
        switch (status) {
            case 'aberto': return 'secondary';
            case 'em_atendimento': return 'default';
            case 'resolvido': return 'destructive';
            default: return 'outline';
        }
    };
    
    const getStatusText = (status: Ticket['status']) => {
        switch (status) {
            case 'aberto': return 'Aberto';
            case 'em_atendimento': return 'Em Atendimento';
            case 'resolvido': return 'Resolvido';
            default: return status;
        }
    };
    
    const isAdmin = userProfile?.role === 'admin';

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title={isAdmin ? "Gerenciar Chamados de Suporte" : "Meus Chamados de Suporte"}
                description={isAdmin ? "Visualize e gerencie todos os chamados dos usuários." : "Visualize seus chamados abertos ou crie uma nova solicitação."}
            >
                {!isAdmin && (
                    <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                        <DialogTrigger asChild>
                            <Button>
                                <PlusCircle className="mr-2 h-4 w-4" />
                                Abrir Novo Chamado
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-lg">
                            <DialogHeader>
                                <DialogTitle>Abrir Novo Chamado</DialogTitle>
                                <DialogDescription>
                                    Descreva seu problema ou dúvida. Nossa equipe responderá em breve.
                                </DialogDescription>
                            </DialogHeader>
                            <Form {...form}>
                                <form onSubmit={form.handleSubmit(handleCreateTicket)} className="space-y-4">
                                    <FormField
                                        control={form.control}
                                        name="title"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Assunto</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Ex: Dúvida sobre consulta FGTS" {...field} disabled={isSubmitting} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="message"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Mensagem</FormLabel>
                                                <FormControl>
                                                    <Textarea placeholder="Detalhe sua solicitação aqui..." {...field} disabled={isSubmitting} rows={6} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <DialogFooter>
                                        <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} disabled={isSubmitting}>Cancelar</Button>
                                        <Button type="submit" disabled={isSubmitting}>
                                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            Enviar Chamado
                                        </Button>
                                    </DialogFooter>
                                </form>
                            </Form>
                        </DialogContent>
                    </Dialog>
                )}
            </PageHeader>

            {error && (
                 <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Erro ao Carregar Chamados</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                 </Alert>
            )}

            <Card>
                <CardContent className="pt-6">
                     {isLoading ? (
                        <div className="space-y-3">
                            {Array.from({ length: 3 }).map((_, i) => (
                                <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                                    <div className="space-y-2">
                                        <Skeleton className="h-5 w-40" />
                                        <Skeleton className="h-4 w-60" />
                                    </div>
                                    <Skeleton className="h-6 w-24" />
                                </div>
                            ))}
                        </div>
                    ) : tickets.length === 0 && !error ? (
                        <div className="flex flex-col items-center justify-center gap-4 text-center h-60 border-2 border-dashed rounded-lg">
                            <Inbox className="h-12 w-12 text-muted-foreground" />
                            <h3 className="text-2xl font-bold tracking-tight">
                                Nenhum Chamado Encontrado
                            </h3>
                            <p className="text-sm text-muted-foreground">
                               {isAdmin ? "Ainda não há chamados de suporte abertos." : "Você ainda não abriu nenhum chamado de suporte."}
                            </p>
                        </div>
                    ) : (
                       <div className="space-y-3">
                           {tickets.map(ticket => (
                               <div key={ticket.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                                   <div className="flex-1 mb-4 sm:mb-0">
                                       <div className="flex items-center gap-3 mb-2">
                                            <span className="font-mono text-sm text-muted-foreground">{ticket.ticketNumber}</span>
                                            <Badge variant={getStatusVariant(ticket.status)}>{getStatusText(ticket.status)}</Badge>
                                       </div>
                                       <h3 className="font-semibold text-lg">{ticket.title}</h3>
                                        {isAdmin && (
                                            <p className="text-sm font-medium text-muted-foreground">{ticket.userEmail}</p>
                                        )}
                                       <p className="text-sm text-muted-foreground mt-1">
                                            Última atualização: {new Date(ticket.updatedAt).toLocaleString('pt-BR')}
                                       </p>
                                        <p className="text-sm text-muted-foreground line-clamp-1 flex items-center gap-2 mt-1">
                                            <MessageSquare className="h-3.5 w-3.5" />
                                            {ticket.lastMessage}
                                        </p>
                                   </div>
                                   <Button variant="outline" size="sm" asChild>
                                        <Link href={`/chamados/${ticket.id}`}>Ver Chamado</Link>
                                   </Button>
                               </div>
                           ))}
                       </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
