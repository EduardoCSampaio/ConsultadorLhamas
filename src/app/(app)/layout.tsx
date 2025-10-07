

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
  Search,
  Users,
  Briefcase,
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
import { ChevronDown, Circle } from "lucide-react";
import { cn } from '@/lib/utils';

const baseMenuItems = [
  { href: "/dashboard", icon: Home, label: "Dashboard", tooltip: "Dashboard" },
  { href: "/clt", icon: Briefcase, label: "CLT", tooltip: "CLT" },
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
    if (isLoading) return; // Wait for user and profile to load

    if (!user) {
      router.push('/');
      return;
    }

    // If user is logged in, but profile isn't loaded yet, do nothing.
    if (!userProfile) return;

    // Once profile is loaded, check status
    if (userProfile.status !== 'active') {
        if (auth) {
            signOut(auth);
        }
        router.push(`/?status=${userProfile.status || 'pending'}`);
        return; // Important to stop execution
    }

    // Also check for custom claim for admin role as a fallback/primary truth source
    getIdTokenResult(user).then((idTokenResult) => {
        const isAdminClaim = idTokenResult.claims.admin === true;

        // If the profile role is admin but the claim isn't there, something is wrong.
        // For now, we trust the claim more. If claim is missing, and they try to access admin,
        // Firestore rules will block them anyway.
        // This effect mainly handles logging out non-active users.
    });


  }, [user, userProfile, isUserLoading, isProfileLoading, router, auth]);


  const getInitials = (email = '') => {
    return email.substring(0, 2).toUpperCase();
  }

  // Show a loading state while user or profile are being loaded.
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
  ];

  return (
    <SidebarProvider>
      <Sidebar variant="floating" collapsible="icon">
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
        <SidebarFooter className="flex-col !gap-1">
            <SidebarMenu>
                 {bottomMenuItems.map((item) => (
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
             <div className="flex items-center gap-3 p-2">
              <Avatar className="size-8">
                {user?.photoURL && <AvatarImage src={user.photoURL} alt="User Avatar" />}
                <AvatarFallback>{getInitials(user?.email || '??')}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col text-sm overflow-hidden">
                <span className="font-medium truncate">{user?.email}</span>
                <span className="text-xs text-sidebar-foreground/70">{userProfile?.role === 'admin' ? 'Administrador' : 'Usuário'}</span>
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
          <ThemeToggle />
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
