
'use client';

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
  SidebarMenuSub,
  SidebarMenuSubButton,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import {
  Cog,
  Home,
  LogOut,
  Users,
  Briefcase,
  ChevronDown,
  Search,
  Workflow,
  FileText,
  User,
  BookMarked,
  Landmark,
  CreditCard,
  LifeBuoy,
  ClipboardCheck,
  Shield,
} from "lucide-react";
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth, useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { signOut, getIdTokenResult } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { doc } from 'firebase/firestore';
import { ThemeToggle } from '@/components/theme-toggle';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from '@/lib/utils';
import type { UserProfile } from '@/app/actions/users';
import { NotificationBell } from '@/components/notification-bell';

const allBaseMenuItems = [
  { href: "/dashboard", icon: Home, label: "Dashboard", permission: 'isLoggedIn' as const },
  { href: "/esteira", icon: Workflow, label: "Esteira", permission: 'isSuperAdmin' as const },
  { href: "/admin/history", icon: BookMarked, label: "Histórico", permission: 'isSuperAdmin' as const },
];

const adminBottomMenuItems = [
    { href: "/admin/users", icon: Users, label: "Gerenciar Usuários", permission: 'isSuperAdmin' as const },
    { href: "/admin/auxilio-propostas", icon: ClipboardCheck, label: "Auxílio Propostas", permission: 'isSuperAdmin' as const },
];

const managerMenuItems = [
    { href: "/teams", icon: Shield, label: "Meu Time", permission: 'isManager' as const },
];

const bottomMenuItems = [
    { href: "/chamados", icon: LifeBuoy, label: "Suporte", permission: 'isLoggedIn' as const },
    { href: "/configuracoes", icon: Cog, label: "Configurações", permission: 'isLoggedIn' as const },
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

  const { data: userProfile, isLoading: isProfileLoading } = useDoc<UserProfile>(userProfileRef);

  const handleLogout = async () => {
    if (auth) {
      await signOut(auth);
    }
    router.push('/');
  };

  React.useEffect(() => {
    const isLoading = isUserLoading || isProfileLoading;
    if (isLoading) return; // Wait for user and profile to load

    if (!user) {
      router.push('/');
      return;
    }

    if (!userProfile) return;

    if (userProfile.status !== 'active') {
        if (auth) {
            signOut(auth);
        }
        router.push(`/?status=${userProfile.status || 'pending'}`);
        return;
    }
  }, [user, userProfile, isUserLoading, isProfileLoading, router, auth]);


  const getInitials = (email = '') => {
    return email.substring(0, 2).toUpperCase();
  }

  const hasPermission = React.useCallback((permission: 'isManager' | 'isLoggedIn' | 'isSuperAdmin' | keyof UserProfile['permissions']) => {
    if (!userProfile) return false;
    
    // Super admin has all permissions
    if (userProfile.role === 'super_admin') return true;

    if (permission === 'isLoggedIn') return true;
    if (permission === 'isManager') return userProfile.role === 'manager';
    if (permission === 'isSuperAdmin') return userProfile.role === 'super_admin';

    // For granular permissions, check the user's profile
    return !!userProfile?.permissions?.[permission as keyof UserProfile['permissions']];
  }, [userProfile]);


  if (isUserLoading || isProfileLoading || !user || !userProfile) {
    return (
        <div className="flex min-h-screen items-center justify-center bg-background">
            <Logo />
        </div>
    );
  }
  
  const getRoleText = (role: UserProfile['role'] | undefined) => {
    if (!role) return 'Usuário';
    switch (role) {
        case 'super_admin': return 'Super Admin';
        case 'manager': return 'Gerente';
        case 'user': return 'Usuário';
        default: return 'Usuário';
    }
  }

  const baseMenuItems = allBaseMenuItems.filter(item => hasPermission(item.permission));
  const allBottomMenuItems = [
      ...adminBottomMenuItems.filter(item => hasPermission(item.permission)),
      ...managerMenuItems.filter(item => hasPermission(item.permission)),
      ...bottomMenuItems.filter(item => hasPermission(item.permission)),
  ];
  
  return (
    <SidebarProvider>
      <Sidebar variant="floating" collapsible="icon">
        <SidebarHeader>
          <Logo />
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {baseMenuItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith(item.href)}
                  tooltip={item.label}
                >
                  <Link href={item.href}>
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}

            {hasPermission('canViewFGTS') && (
               <SidebarMenuItem>
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      className="w-full justify-start"
                      isActive={pathname.startsWith('/fgts')}
                      tooltip="Consulta FGTS"
                    >
                      <Search/>
                      <span>FGTS</span>
                      <ChevronDown className="ml-auto size-4 shrink-0 transition-transform ease-in-out group-data-[state=open]:rotate-180" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent asChild>
                    <SidebarMenuSub>
                       <SidebarMenuItem>
                        <SidebarMenuSubButton asChild isActive={pathname === '/fgts/manual'}>
                          <Link href="/fgts/manual">
                            <User className="mr-2"/>
                            <span>Manual</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuSubButton asChild isActive={pathname === '/fgts'}>
                          <Link href="/fgts">
                            <FileText className="mr-2"/>
                            <span>Em Lote</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuItem>
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </Collapsible>
              </SidebarMenuItem>
            )}

            {hasPermission('canViewINSS') && (
                <SidebarMenuItem>
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        className="w-full justify-start"
                        isActive={pathname.startsWith('/inss')}
                        tooltip="Consultas INSS"
                      >
                        <Landmark/>
                        <span>INSS</span>
                        <ChevronDown className="ml-auto size-4 shrink-0 transition-transform ease-in-out group-data-[state=open]:rotate-180" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent asChild>
                      <SidebarMenuSub>
                        <SidebarMenuItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/inss/novo'}>
                            <Link href="/inss/novo">
                              <span>Crédito Novo</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuItem>
                        <SidebarMenuItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/inss/cartao-beneficio'}>
                            <Link href="/inss/cartao-beneficio">
                              <span>Cartão Benefício</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuItem>
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </Collapsible>
                </SidebarMenuItem>
            )}

             {hasPermission('canViewCLT') && (
                <SidebarMenuItem>
                <Collapsible>
                    <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                        className="w-full justify-start"
                        isActive={pathname.startsWith('/clt')}
                        tooltip="Crédito CLT"
                    >
                        <Briefcase/>
                        <span>CLT</span>
                        <ChevronDown className="ml-auto size-4 shrink-0 transition-transform ease-in-out group-data-[state=open]:rotate-180" />
                    </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent asChild>
                    <SidebarMenuSub>
                        <SidebarMenuItem>
                        <SidebarMenuSubButton asChild isActive={pathname === '/clt/v8'}>
                            <Link href="/clt/v8">
                            <span>V8</span>
                            </Link>
                        </SidebarMenuSubButton>
                        </SidebarMenuItem>
                        <SidebarMenuItem>
                        <SidebarMenuSubButton asChild isActive={pathname === '/clt/facta'}>
                            <Link href="/clt/facta">
                            <span>FACTA</span>
                            </Link>
                        </SidebarMenuSubButton>
                        </SidebarMenuItem>
                         <SidebarMenuItem>
                          <SidebarMenuSubButton asChild isActive={pathname === '/clt/c6'}>
                            <Link href="/clt/c6">
                              <span>C6</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuItem>
                    </SidebarMenuSub>
                    </CollapsibleContent>
                </Collapsible>
                </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="flex-col !gap-1">
            <SidebarMenu>
                 {allBottomMenuItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith(item.href)}
                      tooltip={item.label}
                    >
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
            </SidebarMenu>
             <div className="flex items-center gap-3 p-2">
                <Avatar className="size-8">
                    {user?.photoURL && <AvatarImage src={user.photoURL} alt="User Avatar" />}
                    <AvatarFallback>{getInitials(user?.email || '??')}</AvatarFallback>
                </Avatar>
              <div className="flex flex-col text-sm overflow-hidden">
                <span className="font-medium truncate">{user?.email}</span>
                <span className="text-xs text-sidebar-foreground/70">{getRoleText(userProfile?.role)}</span>
              </div>
              <Button variant="ghost" size="icon" className="ml-auto size-7 text-sidebar-foreground/70 hover:text-sidebar-foreground" onClick={handleLogout}>
                <LogOut />
              </Button>
            </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-16 items-center gap-4 border-b bg-card/50 backdrop-blur-sm sticky top-0 px-4 md:px-6 z-10">
          <SidebarTrigger className="md:hidden"/>
          <div className="flex-1">
            {/* We can add breadcrumbs here */}
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell userId={user.uid} />
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
