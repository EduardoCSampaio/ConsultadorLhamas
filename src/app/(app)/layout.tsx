
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
  Landmark,
  LogOut,
  Users,
  Wallet,
} from "lucide-react";
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth, useUser } from '@/firebase';
import { signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';

const menuItems = [
  { href: "/dashboard", icon: Home, label: "Dashboard", tooltip: "Dashboard" },
  { href: "/credito", icon: Landmark, label: "Crédito", tooltip: "Análise de Crédito" },
  { href: "/clientes", icon: Users, label: "Clientes", tooltip: "Clientes" },
  { href: "/contas", icon: Wallet, label: "Contas", tooltip: "Contas a Pagar/Receber" },
  { href: "/configuracoes", icon: Cog, label: "Configurações", tooltip: "Configurações" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const router = useRouter();

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/');
  };

  React.useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/');
    }
  }, [user, isUserLoading, router]);

  const getInitials = (email = '') => {
    return email.substring(0, 2).toUpperCase();
  }

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
          {isUserLoading ? (
             <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-4 w-24" />
            </div>
          ) : user ? (
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
