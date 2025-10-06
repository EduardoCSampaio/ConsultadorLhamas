
"use client"

import * as React from 'react';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import {
  Cog,
  Home,
  LogOut,
  Search,
  Users,
} from "lucide-react";
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth, useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { doc } from 'firebase/firestore';

const baseMenuItems = [
  { href: "/dashboard", icon: Home, label: "Dashboard", tooltip: "Dashboard" },
  { href: "/fgts", icon: Search, label: "Consulta FGTS", tooltip: "Consulta Saldo FGTS" },
];

const adminMenuItems = [
    { href: "/admin/users", icon: Users, label: "Gerenciar Usuários", tooltip: "Gerenciar Usuários" },
];

const bottomMenuItems = [
    { href: "/configuracoes", icon: Cog, label: "Configurações", tooltip: "Configurações" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const auth = useAuth();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const router = useRouter();

  const userProfileRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);

  const { data: userProfile, isLoading: isProfileLoading } = useDoc(userProfileRef);

  const handleLogout = async () => {
    if (auth) {
      await signOut(auth);
    }
    router.push('/');
  };

  React.useEffect(() => {
    const isLoading = isUserLoading || isProfileLoading;
    if (isLoading) return; 

    if (!user) {
      router.push('/');
      return;
    }

    if (userProfile?.status !== 'active') {
      if (auth) {
        signOut(auth); 
      }
      router.push(`/?status=${userProfile?.status || 'pending'}`);
    }

  }, [user, userProfile, isUserLoading, isProfileLoading, router, auth]);


  const getInitials = (email = '') => {
    return email.substring(0, 2).toUpperCase();
  }

  if (isUserLoading || isProfileLoading) {
    return (
        <div className="flex min-h-screen items-center justify-center bg-background">
            <Logo />
        </div>
    );
  }

  const menuItems = [
      ...baseMenuItems,
      ...(userProfile?.role === 'admin' ? adminMenuItems : []),
      ...bottomMenuItems
  ];

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <Logo />
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {menuItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith(item.href)}
                  tooltip={item.tooltip}
                >
                  <Link href={item.href}>
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          {user ? (
            <div className="flex items-center gap-3">
              <Avatar className="size-8">
                {user.photoURL && <AvatarImage src={user.photoURL} alt="User Avatar" />}
                <AvatarFallback>{getInitials(user.email || '??')}</AvatarFallback>
              </Avatar>
              <span className="font-medium text-sm truncate">{user.email}</span>
              <Button variant="ghost" size="icon" className="ml-auto size-7" onClick={handleLogout}>
                <LogOut />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
                <Avatar className="size-8">
                    <AvatarFallback>??</AvatarFallback>
                </Avatar>
                <span className="font-medium text-sm truncate">Não autenticado</span>
                <Button variant="ghost" size="icon" className="ml-auto size-7" asChild>
                    <Link href="/">
                        <LogOut />
                    </Link>
                </Button>
            </div>
          )}
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6">
          <SidebarTrigger className="md:hidden"/>
          <div className="flex-1">
            {/* We can add breadcrumbs here */}
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
