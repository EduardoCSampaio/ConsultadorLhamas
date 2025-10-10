'use client';

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from 'next/link';
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Send, ArrowLeft, AlertCircle } from 'lucide-react';
import { getTicketById, addMessageToTicket, markTicketAsRead, updateTicketStatus, type Ticket, type TicketMessage } from '@/app/actions/tickets';
import { useUser, useDoc, useFirestore, useMemoFirebase, useCollection } from "@/firebase";
import { doc, collection, orderBy, query } from 'firebase/firestore';
import type { UserProfile } from '@/app/actions/users';
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


const statusOptions: Ticket['status'][] = ["aberto", "em_atendimento", "em_desenvolvimento", "testando", "liberado", "resolvido"];
const statusLabels: Record<Ticket['status'], string> = {
    aberto: "Aberto",
    em_atendimento: "Em Atendimento",
    em_desenvolvimento: "Em Desenvolvimento",
    testando: "Testando com Parceiro",
    liberado: "Liberação",
    resolvido: "Resolvido",
};

const getStatusVariant = (status: Ticket['status']) => {
    switch (status) {
        case 'aberto': return 'secondary';
        case 'em_atendimento':
        case 'em_desenvolvimento':
            return 'default';
        case 'resolvido': return 'destructive';
        case 'testando':
        case 'liberado':
             return 'outline';
        default: return 'outline';
    }
};


export default function ChamadoDetalhePage() {
    const { toast } = useToast();
    const { user } = useUser();
    const firestore = useFirestore();
    const params = useParams();
    const router = useRouter();
    const ticketId = params.ticketId as string;
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [newMessage, setNewMessage] = useState("");

    const ticketRef = useMemoFirebase(() => {
        if (!firestore || !ticketId) return null;
        return doc(firestore, 'tickets', ticketId);
    }, [firestore, ticketId]);
    const { data: ticket, isLoading: ticketLoading } = useDoc<Ticket>(ticketRef);
    
    const userProfileRef = useMemoFirebase(() => {
        if (!firestore || !user) return null;
        return doc(firestore, 'users', user.uid);
    }, [firestore, user]);
    const { data: userProfile } = useDoc<UserProfile>(userProfileRef);

    const messagesQuery = useMemoFirebase(() => {
        if (!firestore || !ticketId) return null;
        return query(collection(firestore, `tickets/${ticketId}/messages`), orderBy('createdAt', 'asc'));
    }, [firestore, ticketId]);
    const { data: messages, isLoading: messagesLoading } = useCollection<TicketMessage>(messagesQuery);
    
    const pageIsLoading = ticketLoading || messagesLoading;
    const isAdmin = userProfile?.role === 'admin';

    useEffect(() => {
       async function checkAccessAndMarkRead() {
           if (pageIsLoading || !ticket || !user) return;
           
            // Security check
            if (!isAdmin && user?.uid !== ticket.userId) {
                toast({ variant: 'destructive', title: 'Acesso Negado' });
                router.push('/chamados');
                return;
            }
            
            // Mark as read after fetching and confirming access
            await markTicketAsRead({ ticketId, userId: user.uid });
       }
       checkAccessAndMarkRead();
    }, [ticket, user, isAdmin, pageIsLoading, ticketId, router, toast]);


    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSendMessage = async () => {
        if (!user || !userProfile || !newMessage.trim()) return;
        
        setIsSubmitting(true);
        const result = await addMessageToTicket({
            ticketId,
            userId: user.uid,
            userEmail: user.email!,
            isAdmin: userProfile.role === 'admin',
            content: newMessage,
        });

        if (result.success) {
            setNewMessage("");
        } else {
            toast({ variant: 'destructive', title: 'Erro ao enviar mensagem', description: result.message });
        }
        setIsSubmitting(false);
    };

    const handleStatusChange = async (newStatus: Ticket['status']) => {
        const result = await updateTicketStatus({ ticketId, status: newStatus });
        if(result.success) {
            toast({ title: "Status do chamado atualizado!"});
        } else {
            toast({ variant: 'destructive', title: "Erro ao atualizar status", description: result.message });
        }
    };

    const getInitials = (email = '') => {
        return email.substring(0, 2).toUpperCase();
    };

    if (pageIsLoading) {
        return (
            <div className="flex flex-col gap-6">
                 <PageHeader title={<Skeleton className="h-8 w-64" />} description={<Skeleton className="h-5 w-80" />} />
                 <Card><CardContent className="pt-6"><Skeleton className="h-[65vh] w-full" /></CardContent></Card>
            </div>
        )
    }
    
    if (error) {
        return (
             <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Erro ao Carregar Chamado</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
                <Button variant="outline" size="sm" asChild className="mt-4">
                    <Link href="/chamados">Voltar</Link>
                </Button>
             </Alert>
        )
    }
    
    if (!ticket) {
        return <div>Chamado não encontrado.</div>
    }

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title={
                    <div className="flex items-center gap-3">
                         <Button variant="ghost" size="icon" className="h-8 w-8 mr-2" asChild>
                            <Link href="/chamados"><ArrowLeft /></Link>
                        </Button>
                        <span className="truncate">{ticket.title}</span>
                         <Badge variant="secondary">{ticket.ticketNumber}</Badge>
                         <Badge variant={getStatusVariant(ticket.status)}>{statusLabels[ticket.status]}</Badge>
                    </div>
                }
                description={
                    <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4">
                        <span>Aberto por {ticket.userEmail}</span>
                        <span className="hidden sm:inline-block">•</span>
                        <span>Última atualização em {new Date(ticket.updatedAt).toLocaleString('pt-BR')}</span>
                    </div>
                }
            >
                {isAdmin && (
                    <Select value={ticket.status} onValueChange={handleStatusChange}>
                        <SelectTrigger className="w-[240px]">
                            <SelectValue placeholder="Mudar status..." />
                        </SelectTrigger>
                        <SelectContent>
                            {statusOptions.map(status => (
                                <SelectItem key={status} value={status}>
                                    {statusLabels[status]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
            </PageHeader>
            
            <Card className="flex flex-col h-[65vh]">
                <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
                   {messagesLoading && !messages && (
                       <div className="flex items-center justify-center h-full">
                           <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                       </div>
                   )}
                   {messages?.map(message => (
                       <div 
                        key={message.id} 
                        className={cn("flex items-end gap-3", user?.uid === message.senderId ? "justify-end" : "justify-start")}
                       >
                           {user?.uid !== message.senderId && (
                               <Avatar className="h-8 w-8">
                                   <AvatarFallback>{getInitials(message.senderEmail)}</AvatarFallback>
                               </Avatar>
                           )}
                           <div 
                            className={cn(
                                "max-w-md p-3 rounded-lg",
                                user?.uid === message.senderId 
                                ? "bg-primary text-primary-foreground" 
                                : "bg-muted"
                                )}
                            >
                               <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                               <p className={cn("text-xs mt-2 opacity-70", user?.uid === message.senderId ? 'text-right' : 'text-left')}>
                                   {new Date(message.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                               </p>
                           </div>
                             {user?.uid === message.senderId && (
                               <Avatar className="h-8 w-8">
                                   <AvatarImage src={userProfile?.photoURL ?? undefined} />
                                   <AvatarFallback>{getInitials(message.senderEmail)}</AvatarFallback>
                               </Avatar>
                           )}
                       </div>
                   ))}
                   <div ref={messagesEndRef} />
                </CardContent>
                <CardFooter className="p-4 border-t">
                    <div className="flex w-full items-center gap-2">
                        <Textarea
                            placeholder="Digite sua mensagem..."
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSendMessage();
                                }
                            }}
                            rows={1}
                            className="min-h-[40px] max-h-24 resize-y"
                            disabled={isSubmitting}
                        />
                        <Button onClick={handleSendMessage} disabled={isSubmitting || !newMessage.trim()}>
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            <span className="sr-only">Enviar</span>
                        </Button>
                    </div>
                </CardFooter>
            </Card>
        </div>
    );
}
    