'use client';

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from 'next/link';
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Send, ArrowLeft, AlertCircle, User, MessageSquare } from 'lucide-react';
import { getTicketById, addMessageToTicket, type Ticket, type TicketMessage } from '@/app/actions/tickets';
import { useUser, useDoc, useFirestore, useMemoFirebase, useCollection } from "@/firebase";
import { doc, collection, orderBy, query } from 'firebase/firestore';
import type { UserProfile } from '@/app/actions/users';
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";


export default function ChamadoDetalhePage() {
    const { toast } = useToast();
    const { user } = useUser();
    const firestore = useFirestore();
    const params = useParams();
    const router = useRouter();
    const ticketId = params.ticketId as string;
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const [ticket, setTicket] = useState<Ticket | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [newMessage, setNewMessage] = useState("");

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
    
    useEffect(() => {
        async function fetchTicket() {
            setIsLoading(true);
            const { ticket: fetchedTicket, error: fetchError } = await getTicketById({ ticketId });
            if (fetchError) {
                setError(fetchError);
            } else if (fetchedTicket) {
                // Security check: if user is not admin and ticket doesn't belong to them, redirect
                if (userProfile?.role !== 'admin' && user?.uid !== fetchedTicket.userId) {
                    toast({ variant: 'destructive', title: 'Acesso Negado' });
                    router.push('/chamados');
                    return;
                }
                setTicket(fetchedTicket);
            }
            setIsLoading(false);
        }
        if (ticketId && user && userProfile) {
            fetchTicket();
        }
    }, [ticketId, user, userProfile, router, toast]);

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

    const getInitials = (email = '') => {
        return email.substring(0, 2).toUpperCase();
    };

    if (isLoading) {
        return (
            <div className="flex flex-col gap-6">
                 <PageHeader title={<Skeleton className="h-8 w-64" />} description={<Skeleton className="h-5 w-80" />} />
                 <Card><CardContent className="pt-6"><Skeleton className="h-64 w-full" /></CardContent></Card>
                 <Card><CardContent className="pt-6"><Skeleton className="h-20 w-full" /></CardContent></Card>
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
                        <span>{ticket.title}</span>
                         <Badge variant="secondary">{ticket.ticketNumber}</Badge>
                    </div>
                }
                description={`Aberto por ${ticket.userEmail} em ${new Date(ticket.createdAt).toLocaleDateString('pt-BR')}`}
            />
            
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
                                   <AvatarImage src={userProfile?.photoURL} />
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
