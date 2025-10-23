
'use client';

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from 'next/link';
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Send, ArrowLeft, AlertCircle } from 'lucide-react';
import { addMessageToTicket, markTicketAsRead, updateTicketStatus, type Ticket, type TicketMessage } from '@/app/actions/tickets';
import { useUser, useDoc, useFirestore, useMemoFirebase } from "@/firebase";
import { doc, collection, orderBy, query, getDoc, getDocs, type Timestamp } from 'firebase/firestore';
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

const statusColors: Record<Ticket['status'], string> = {
    aberto: "bg-red-500 text-white",
    em_atendimento: "bg-primary text-primary-foreground",
    em_desenvolvimento: "bg-cyan-500 text-white",
    testando: "bg-yellow-400 text-black",
    liberado: "bg-pink-500 text-white",
    resolvido: "bg-green-500 text-white",
};



export default function ChamadoDetalhePage() {
    const { toast } = useToast();
    const { user } = useUser();
    const firestore = useFirestore();
    const params = useParams();
    const router = useRouter();
    const ticketId = params.ticketId as string;
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const [ticket, setTicket] = useState<Ticket | null>(null);
    const [messages, setMessages] = useState<TicketMessage[]>([]);
    const [pageLoading, setPageLoading] = useState(true);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [newMessage, setNewMessage] = useState("");
    const [participantProfiles, setParticipantProfiles] = useState<Record<string, UserProfile | null>>({});

    
    const userProfileRef = useMemoFirebase(() => {
        if (!firestore || !user) return null;
        return doc(firestore, 'users', user.uid);
    }, [firestore, user]);
    const { data: userProfile, isLoading: isProfileLoading } = useDoc<UserProfile>(userProfileRef);

    const isAdmin = userProfile?.role === 'super_admin' || userProfile?.role === 'manager';

    const fetchTicketAndMessages = useCallback(async () => {
        if (!firestore || !user || !userProfile) return;

        setPageLoading(true);
        setError(null);
        try {
            const ticketRef = doc(firestore, 'tickets', ticketId);
            const ticketSnap = await getDoc(ticketRef);

            if (!ticketSnap.exists()) {
                throw new Error("Chamado não encontrado.");
            }
            
            const ticketData = ticketSnap.data() as Omit<Ticket, 'id' | 'createdAt' | 'updatedAt'> & { createdAt: Timestamp, updatedAt: Timestamp};
            
            const hasPermission = isAdmin || ticketData.userId === user.uid;

            if (!hasPermission) {
                throw new Error("Você não tem permissão para visualizar este chamado.");
            }
            
            const fetchedTicket = {
                ...ticketData,
                id: ticketSnap.id,
                createdAt: ticketData.createdAt.toDate().toISOString(),
                updatedAt: ticketData.updatedAt.toDate().toISOString(),
            };
            setTicket(fetchedTicket);

            // Now that we have permission and the ticket, fetch messages
            const messagesQuery = query(collection(firestore, `tickets/${ticketId}/messages`), orderBy('createdAt', 'asc'));
            const messagesSnap = await getDocs(messagesQuery);
            const fetchedMessages = messagesSnap.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                createdAt: (doc.data().createdAt as Timestamp).toDate().toISOString()
            } as TicketMessage));
            setMessages(fetchedMessages);

            // Mark as read after fetching
            await markTicketAsRead({ ticketId, userId: user.uid });

            // Fetch participant profiles
            const senderIds = fetchedMessages.map(m => m.senderId);
            const allParticipantIds = Array.from(new Set([fetchedTicket.userId, ...senderIds]));
            
            const profilesToFetch = allParticipantIds.filter(id => id && !participantProfiles[id]);
            if (profilesToFetch.length > 0) {
                const newProfiles: Record<string, UserProfile | null> = {};
                for (const id of profilesToFetch) {
                     try {
                        const userDoc = await getDoc(doc(firestore, 'users', id));
                        newProfiles[id] = userDoc.exists() ? (userDoc.data() as UserProfile) : null;
                    } catch (e) {
                         newProfiles[id] = null;
                         console.error(`Failed to fetch profile for user ${id}:`, e);
                    }
                }
                 setParticipantProfiles(prev => ({ ...prev, ...newProfiles }));
            }

        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : "Ocorreu um erro ao buscar o chamado.";
            setError(errorMessage);
            toast({ variant: 'destructive', title: 'Erro ao carregar chamado', description: errorMessage });
        } finally {
            setPageLoading(false);
        }
    }, [firestore, user, userProfile, ticketId, isAdmin, toast, participantProfiles]);


    useEffect(() => {
        if (!isProfileLoading && userProfile) {
            fetchTicketAndMessages();
        }
         else if (!isProfileLoading && !userProfile && !user) {
            router.push('/login');
        }
    }, [isProfileLoading, userProfile, fetchTicketAndMessages, user, router]);


    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSendMessage = async () => {
        if (!user || !userProfile || !newMessage.trim() || !ticket) return;
        
        setIsSubmitting(true);
        const result = await addMessageToTicket({
            ticketId,
            userId: user.uid,
            userEmail: user.email!,
            isAdmin: isAdmin,
            content: newMessage,
        });

        if (result.success) {
            setNewMessage("");
            // Optimistic update
            const optimisticMessage: TicketMessage = {
                id: new Date().toISOString(),
                senderId: user.uid,
                senderEmail: user.email!,
                content: newMessage,
                createdAt: new Date().toISOString(),
            };
            setMessages(prev => [...prev, optimisticMessage]);

            if (isAdmin && ticket.status === 'aberto') {
                setTicket(prev => prev ? { ...prev, status: 'em_atendimento' } : null);
            }
        } else {
            toast({ variant: 'destructive', title: 'Erro ao enviar mensagem', description: result.message });
        }
        setIsSubmitting(false);
    };

    const handleStatusChange = async (newStatus: Ticket['status']) => {
        const result = await updateTicketStatus({ ticketId, status: newStatus });
        if(result.success) {
            toast({ title: "Status do chamado atualizado!"});
            setTicket(prev => prev ? { ...prev, status: newStatus } : null);
        } else {
            toast({ variant: 'destructive', title: "Erro ao atualizar status", description: result.message });
        }
    };

    const getInitials = (email = '') => {
        return email.substring(0, 2).toUpperCase();
    };

    if (pageLoading) {
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
        return (
            <div className="flex flex-col items-center justify-center h-full">
                <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Chamado não encontrado</AlertTitle>
                    <AlertDescription>O chamado que você está procurando não existe ou foi removido.</AlertDescription>
                     <Button variant="outline" size="sm" asChild className="mt-4">
                        <Link href="/chamados">Voltar</Link>
                    </Button>
                </Alert>
            </div>
        )
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
                         <Badge className={cn(statusColors[ticket.status])}>{statusLabels[ticket.status]}</Badge>
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
                   {messages.map(message => {
                        const senderProfile = participantProfiles[message.senderId];
                        const isProfileLoading = senderProfile === undefined;
                        
                        const renderAvatar = (profile: UserProfile | null | undefined, email: string) => (
                           <Avatar className="h-8 w-8">
                                {isProfileLoading ? (
                                    <Skeleton className="h-full w-full rounded-full" />
                                ) : (
                                    <>
                                       <AvatarImage src={profile?.photoURL ?? undefined} />
                                       <AvatarFallback>{getInitials(email)}</AvatarFallback>
                                    </>
                                )}
                           </Avatar>
                        );

                        return (
                           <div 
                            key={message.id} 
                            className={cn("flex items-end gap-3", user?.uid === message.senderId ? "justify-end" : "justify-start")}
                           >
                               {user?.uid !== message.senderId && renderAvatar(senderProfile, message.senderEmail)}
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
                                {user?.uid === message.senderId && renderAvatar(senderProfile, message.senderEmail)}
                           </div>
                        );
                   })}
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
                            disabled={isSubmitting || ticket.status === 'resolvido'}
                        />
                        <Button onClick={handleSendMessage} disabled={isSubmitting || !newMessage.trim() || ticket.status === 'resolvido'}>
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            <span className="sr-only">Enviar</span>
                        </Button>
                    </div>
                </CardFooter>
            </Card>
        </div>
    );
}

