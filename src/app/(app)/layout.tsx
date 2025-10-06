
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
import { PlaceHolderImages } from "@/lib/placeholder-images";
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

const menuItems = [
  { href: "/dashboard", icon: Home, label: "Dashboard", tooltip: "Dashboard" },
  { href: "/credito", icon: Landmark, label: "Crédito", tooltip: "Análise de Crédito" },
  { href: "/clientes", icon: Users, label: "Clientes", tooltip: "Clientes" },
  { href: "/contas", icon: Wallet, label: "Contas", tooltip: "Contas a Pagar/Receber" },
  { href: "/configuracoes", icon: Cog, label: "Configurações", tooltip: "Configurações" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const avatarImage = PlaceHolderImages.find(p => p.id === "user-avatar");

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
          <div className="flex items-center gap-3">
             <Avatar className="size-8">
              {avatarImage && <AvatarImage src={avatarImage.imageUrl} alt="User Avatar" />}
              <AvatarFallback>AD</AvatarFallback>
            </Avatar>
            <span className="font-medium text-sm truncate">Ana de Armas</span>
            <Button variant="ghost" size="icon" className="ml-auto size-7" asChild>
                <Link href="/login">
                    <LogOut />
                </Link>
            </Button>
          </div>
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
