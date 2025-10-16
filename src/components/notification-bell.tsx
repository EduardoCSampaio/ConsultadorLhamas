'use client';

import { useState, useEffect } from 'react';
import { Bell, BellDot, Inbox, Check, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  useFirestore,
  useCollection,
  useMemoFirebase,
} from '@/firebase';
import { collection, query, orderBy, limit, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { Skeleton } from './ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { deleteNotification, markNotificationAsRead } from '@/app/actions/notifications';
import { useToast } from '@/hooks/use-toast';
import { Separator } from './ui/separator';

type Notification = {
  id: string;
  title: string;
  message: string;
  link?: string;
  isRead: boolean;
  createdAt: string; // ISO string
};

export function NotificationBell({ userId }: { userId: string }) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const [isOpen, setIsOpen] = useState(false);

  const notificationsQuery = useMemoFirebase(() => {
    if (!firestore || !userId) return null;
    return query(
        collection(firestore, `users/${userId}/notifications`), 
        orderBy('createdAt', 'desc'),
        limit(15) // Increased limit to show more history
    );
  }, [firestore, userId]);
  
  const { data: notifications, isLoading } = useCollection<Notification>(notificationsQuery);
  
  const unreadCount = notifications?.filter(n => !n.isRead).length || 0;

  const handleClearAll = async () => {
    if (!notifications || notifications.length === 0 || !firestore) return;

    const batch = writeBatch(firestore);
    notifications.forEach(n => {
        const notifRef = doc(firestore, `users/${userId}/notifications`, n.id);
        batch.delete(notifRef);
    });

    try {
      await batch.commit();
      toast({ title: "Notificações limpas", description: "Todas as suas notificações foram excluídas." });
      setIsOpen(false);
    } catch (error) {
       console.error("Failed to clear notifications:", error);
       toast({ variant: 'destructive', title: "Erro", description: "Não foi possível limpar as notificações." });
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          {unreadCount > 0 ? (
            <>
              <BellDot className="h-5 w-5" />
              <span className="absolute top-1 right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-primary/80"></span>
              </span>
            </>
          ) : (
            <Bell className="h-5 w-5" />
          )}
          <span className="sr-only">Notificações</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex flex-col">
          <div className="p-4 space-y-1">
            <h4 className="font-medium leading-none">Notificações</h4>
            <p className="text-sm text-muted-foreground">
              As suas atualizações mais recentes.
            </p>
          </div>
          <div className="grid gap-2 max-h-96 overflow-y-auto px-4 pb-4">
            {isLoading ? (
                Array.from({length: 3}).map((_, i) => (
                    <div key={i} className="flex items-start gap-4 p-2">
                        <Skeleton className="h-8 w-8 rounded-full"/>
                        <div className="space-y-2 flex-1">
                            <Skeleton className="h-4 w-full"/>
                            <Skeleton className="h-4 w-2/3"/>
                        </div>
                    </div>
                ))
            ) : !notifications || notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 text-center p-8">
                    <Inbox className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Você não tem nenhuma notificação.</p>
                </div>
            ) : (
                notifications.map(n => (
                    <NotificationItem 
                        key={n.id} 
                        userId={userId}
                        notification={n} 
                        onSelect={() => setIsOpen(false)} 
                    />
                ))
            )}
          </div>
          {notifications && notifications.length > 0 && (
             <>
                <Separator />
                <div className="p-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-muted-foreground"
                        onClick={handleClearAll}
                    >
                        Limpar Todas
                    </Button>
                </div>
             </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}


function NotificationItem({ notification, userId, onSelect }: { notification: Notification, userId: string, onSelect: () => void }) {
    const { toast } = useToast();

    const handleMarkAsRead = async (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        const result = await markNotificationAsRead({ userId, notificationId: notification.id });
        if (!result.success) {
            toast({ variant: 'destructive', title: 'Erro', description: result.message });
        }
    };

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        const result = await deleteNotification({ userId, notificationId: notification.id });
        if (result.success) {
            toast({ title: 'Notificação excluída' });
        } else {
             toast({ variant: 'destructive', title: 'Erro', description: result.message });
        }
    };

    const content = (
        <div className="group relative grid grid-cols-[25px_1fr] items-start pb-4 last:mb-0 last:pb-0">
            <span className="flex h-2 w-2 translate-y-1 rounded-full bg-primary data-[read=true]:bg-muted-foreground" data-read={notification.isRead} />
            <div className="grid gap-1">
                <p className="text-sm font-medium leading-none">{notification.title}</p>
                <p className="text-sm text-muted-foreground">{notification.message}</p>
                <p className="text-xs text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true, locale: ptBR })}
                </p>
            </div>
            <div className="absolute top-0 right-0 flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                {!notification.isRead && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleMarkAsRead} title="Marcar como lida">
                        <Check className="h-4 w-4" />
                    </Button>
                )}
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDelete} title="Excluir notificação">
                    <X className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );

    if (notification.link) {
        return (
            <Link href={notification.link} onClick={onSelect} className="rounded-md hover:bg-muted -m-2 p-2 block">
                {content}
            </Link>
        )
    }

    return <div className="p-2">{content}</div>;
}