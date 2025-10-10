'use client';

import { useState, useEffect } from 'react';
import { Bell, BellDot, Inbox } from 'lucide-react';
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
import { collection, query, orderBy, limit, doc, updateDoc } from 'firebase/firestore';
import { Skeleton } from './ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Notification = {
  id: string;
  title: string;
  message: string;
  link?: string;
  isRead: boolean;
  createdAt: string; // ISO string
};

export function NotificationBell({ userId }: { userId: string }) {
  const firestore = useFirestore();
  const [isOpen, setIsOpen] = useState(false);

  const notificationsQuery = useMemoFirebase(() => {
    if (!firestore || !userId) return null;
    return query(
        collection(firestore, `users/${userId}/notifications`), 
        orderBy('createdAt', 'desc'),
        limit(10)
    );
  }, [firestore, userId]);
  
  const { data: notifications, isLoading } = useCollection<Notification>(notificationsQuery);
  
  const unreadCount = notifications?.filter(n => !n.isRead).length || 0;

  const handleOpenChange = async (open: boolean) => {
    setIsOpen(open);
    if (open && notifications && unreadCount > 0) {
      // Mark all visible unread notifications as read
      const batch: Promise<void>[] = [];
      notifications.forEach(n => {
        if (!n.isRead) {
          const notifRef = doc(firestore, `users/${userId}/notifications`, n.id);
          batch.push(updateDoc(notifRef, { isRead: true }));
        }
      });
      try {
        await Promise.all(batch);
      } catch (error) {
        console.error("Failed to mark notifications as read:", error);
      }
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
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
      <PopoverContent className="w-80" align="end">
        <div className="grid gap-4">
          <div className="space-y-1">
            <h4 className="font-medium leading-none">Notificações</h4>
            <p className="text-sm text-muted-foreground">
              As suas atualizações mais recentes.
            </p>
          </div>
          <div className="grid gap-2">
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
                    <NotificationItem key={n.id} notification={n} onSelect={() => setIsOpen(false)} />
                ))
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}


function NotificationItem({ notification, onSelect }: { notification: Notification, onSelect: () => void }) {
    const content = (
        <div className="grid grid-cols-[25px_1fr] items-start pb-4 last:mb-0 last:pb-0">
            <span className="flex h-2 w-2 translate-y-1 rounded-full bg-primary data-[read=true]:bg-muted-foreground" data-read={notification.isRead} />
            <div className="grid gap-1">
                <p className="text-sm font-medium leading-none">{notification.title}</p>
                <p className="text-sm text-muted-foreground">{notification.message}</p>
                <p className="text-xs text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true, locale: ptBR })}
                </p>
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
