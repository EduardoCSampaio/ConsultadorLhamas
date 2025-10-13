
'use client';

import { useState, useEffect, useMemo } from "react";
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
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";


const newTicketSchema = z.object({
  title: z.string().min(5, "O título deve ter pelo menos 5 caracteres.").max(100, "O título deve ter no máximo 100 caracteres."),
  message: z.string().min(10, "A mensagem deve ter pelo menos 10 caracteres.").max(1000, "A mensagem deve ter no máximo 1000 caracteres."),
});

const statusLabels: Record<Ticket['status'], string> = {
    aberto: "Aberto",
    em_atendimento: "Em Atendimento",
    em_desenvolvimento: "Em Desenvolvimento",
    testando: "Testando com Parceiro",
    liberado: "Liberação",
    resolvido: "Resolvido",
};

const statusColors: Record<Ticket['status'], string> = {
    aberto: "bg-red-500 text-white",
    em_atendimento: "bg-primary text-primary-foreground",
    em_desenvolvimento: "bg-cyan-500 text-white",
    testando: "bg-yellow-400 text-black",
    liberado: "bg-pink-500 text-white",
    resolvido: "bg-green-500 text-white",
};


export default function ChamadosPage() {
    const { toast } = useToast();
    const { user } = useUser();
    const firestore = useFirestore();

    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    
    // Admin filters
    const [emailFilter, setEmailFilter] = useState('');
    const [ticketNumberFilter, setTicketNumberFilter] = useState('');


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
    
    const isAdmin = userProfile?.role === 'super_admin' || userProfile?.role === 'admin';

    const getUnreadCount = (ticket: Ticket) => {
        if (isAdmin) {
            return ticket.unreadByAdmin || 0;
        }
        return ticket.unreadByUser || 0;
    };
    
    const filteredTickets = useMemo(() => {
        if (!isAdmin) return tickets;
        return tickets.filter(ticket => {
            const emailMatch = ticket.userEmail.toLowerCase().includes(emailFilter.toLowerCase());
            const ticketNumberMatch = ticket.ticketNumber.toLowerCase().includes(ticketNumberFilter.toLowerCase());
            return emailMatch && ticketNumberMatch;
        });
    }, [tickets, emailFilter, ticketNumberFilter, isAdmin]);

    const openTickets = useMemo(() => filteredTickets.filter(t => t.status !== 'resolvido'), [filteredTickets]);
    const resolvedTickets = useMemo(() => filteredTickets.filter(t => t.status === 'resolvido'), [filteredTickets]);


    const TicketList = ({ list }: { list: Ticket[] }) => (
         <div className="space-y-3">
           {list.map(ticket => {
                const unreadCount = getUnreadCount(ticket);
                return (
                   <div key={ticket.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                       <div className="flex-1 mb-4 sm:mb-0">
                           <div className="flex items-center gap-3 mb-2 flex-wrap">
                                <span className="font-mono text-sm text-muted-foreground">{ticket.ticketNumber}</span>
                                <Badge className={cn(statusColors[ticket.status])}>{statusLabels[ticket.status]}</Badge>
                           </div>
                           <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-lg">{ticket.title}</h3>
                                {unreadCount > 0 && (
                                    <Badge className="h-5 w-5 flex items-center justify-center p-0">{unreadCount}</Badge>
                                )}
                           </div>
                            {isAdmin && (
                                <div className="text-sm font-medium text-muted-foreground">{ticket.userEmail}</div>
                            )}
                           <div className="text-sm text-muted-foreground mt-1">
                                Última atualização: {new Date(ticket.updatedAt).toLocaleString('pt-BR')}
                           </div>
                            <div className="text-sm text-muted-foreground line-clamp-1 flex items-center gap-2 mt-1">
                                <MessageSquare className="h-3.5 w-3.5" />
                                {ticket.lastMessage}
                            </div>
                       </div>
                       <Button variant="outline" size="sm" asChild>
                            <Link href={`/chamados/${ticket.id}`}>Ver Chamado</Link>
                       </Button>
                   </div>
                );
           })}
       </div>
    );

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title={isAdmin ? "Gerenciar Chamados de Suporte" : "Meus Chamados de Suporte"}
                description={isAdmin ? "Visualize, filtre e gerencie todos os chamados dos usuários." : "Visualize seus chamados abertos ou crie uma nova solicitação."}
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

            {isAdmin && (
                 <Card>
                    <CardHeader>
                        <CardTitle>Filtros</CardTitle>
                    </CardHeader>
                    <CardContent className="grid sm:grid-cols-2 gap-4">
                         <Input 
                            placeholder="Filtrar por e-mail do usuário..."
                            value={emailFilter}
                            onChange={(e) => setEmailFilter(e.target.value)}
                         />
                         <Input 
                            placeholder="Filtrar por código do chamado..."
                            value={ticketNumberFilter}
                            onChange={(e) => setTicketNumberFilter(e.target.value)}
                         />
                    </CardContent>
                </Card>
            )}

            <Tabs defaultValue="abertos" className="w-full">
                <TabsList className="grid w-full grid-cols-2 max-w-md">
                    <TabsTrigger value="abertos">Abertos</TabsTrigger>
                    <TabsTrigger value="resolvidos">Resolvidos</TabsTrigger>
                </TabsList>
                <TabsContent value="abertos">
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
                            ) : openTickets.length === 0 && !error ? (
                                <div className="flex flex-col items-center justify-center gap-4 text-center h-60 border-2 border-dashed rounded-lg">
                                    <Inbox className="h-12 w-12 text-muted-foreground" />
                                    <h3 className="text-2xl font-bold tracking-tight">
                                        Nenhum Chamado Aberto
                                    </h3>
                                    <div className="text-sm text-muted-foreground">
                                    {isAdmin ? "Nenhum chamado aberto corresponde aos filtros." : "Você não tem chamados em aberto."}
                                    </div>
                                </div>
                            ) : (
                                <TicketList list={openTickets} />
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
                 <TabsContent value="resolvidos">
                    <Card>
                        <CardContent className="pt-6">
                             {isLoading ? (
                                <div className="space-y-3">
                                    {Array.from({ length: 1 }).map((_, i) => (
                                        <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                                            <div className="space-y-2">
                                                <Skeleton className="h-5 w-40" />
                                                <Skeleton className="h-4 w-60" />
                                            </div>
                                            <Skeleton className="h-6 w-24" />
                                        </div>
                                    ))}
                                </div>
                            ) : resolvedTickets.length === 0 && !error ? (
                                <div className="flex flex-col items-center justify-center gap-4 text-center h-60 border-2 border-dashed rounded-lg">
                                    <Inbox className="h-12 w-12 text-muted-foreground" />
                                    <h3 className="text-2xl font-bold tracking-tight">
                                        Nenhum Chamado Resolvido
                                    </h3>
                                     <div className="text-sm text-muted-foreground">
                                       {isAdmin ? "Nenhum chamado resolvido corresponde aos filtros." : "Você não tem chamados resolvidos."}
                                    </div>
                                </div>
                            ) : (
                               <TicketList list={resolvedTickets} />
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
