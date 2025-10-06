
"use client"

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Users, UserCheck, UserPlus, ArrowRight } from "lucide-react";
import React from "react";
import { useFirestore, useMemoFirebase, useUser } from "@/firebase";
import { doc } from "firebase/firestore";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import type { UserProfile } from "@/app/actions/users";
import { getUsers } from "@/app/actions/users";
import { useDoc } from "@/firebase/firestore/use-doc";


async function AdminDashboard({ userProfile }: { userProfile: UserProfile }) {
  const { users, error } = await getUsers();
  
  const pendingUsers = users?.filter(u => u.status === 'pending') || [];
  const activeUsers = users?.filter(u => u.status === 'active') || [];
  const recentUsers = users?.slice(0, 5) || [];
  
  const getStatusVariant = (status: string) => {
    switch (status) {
        case 'active': return 'default';
        case 'pending': return 'secondary';
        case 'rejected': return 'destructive';
        default: return 'outline';
    }
  };
  
  const getStatusText = (status: string) => {
    switch (status) {
        case 'active': return 'Ativo';
        case 'pending': return 'Pendente';
        case 'rejected': return 'Rejeitado';
        default: return status;
    }
  };

  if (error) {
    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title="Dashboard do Administrador"
                description="Ocorreu um erro ao carregar os dados."
            />
            <Card>
                <CardContent className="pt-6">
                    <div className="text-red-500">{error}</div>
                </CardContent>
            </Card>
        </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard do Administrador"
        description="Gerencie usuários e visualize a atividade da plataforma."
      >
        <Button asChild>
            <Link href="/admin/users">
                Gerenciar Usuários
                <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
        </Button>
      </PageHeader>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Usuários Pendentes</CardTitle>
            <UserPlus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingUsers.length}</div>
            <p className="text-xs text-muted-foreground">Aguardando aprovação</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Usuários Ativos</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeUsers.length}</div>
            <p className="text-xs text-muted-foreground">Usuários com acesso liberado</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Usuários</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users?.length || 0}</div>
            <p className="text-xs text-muted-foreground">Total de contas registradas</p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Novos Registros</CardTitle>
          <CardDescription>Os últimos 5 usuários que se registraram na plataforma.</CardDescription>
        </CardHeader>
        <CardContent>
           <div className="rounded-md border">
              <Table>
                  <TableHeader>
                      <TableRow>
                          <TableHead>Email</TableHead>
                          <TableHead className="text-right">Status</TableHead>
                      </TableRow>
                  </TableHeader>
                  <TableBody>
                      {recentUsers.map((user) => (
                          <TableRow key={user.uid}>
                              <TableCell>
                                  <div className="font-medium">{user.email}</div>
                              </TableCell>
                              <TableCell className="text-right">
                                  <Badge variant={getStatusVariant(user.status)} className="capitalize">{getStatusText(user.status)}</Badge>
                              </TableCell>
                          </TableRow>
                      ))}
                  </TableBody>
              </Table>
            </div>
             {recentUsers?.length === 0 && (
              <div className="text-center p-8 text-muted-foreground">
                Nenhum usuário registrado ainda.
              </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
}

function UserDashboardPlaceholder() {
  return (
    <div className="flex flex-col gap-6">
       <PageHeader 
        title="Bem-vindo"
        description="Seu painel está sendo preparado."
      />
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center gap-4 text-center h-96 border-2 border-dashed rounded-lg">
              <h3 className="text-2xl font-bold tracking-tight">
                  Dashboard em Construção
              </h3>
              <p className="text-sm text-muted-foreground">
                  O seu dashboard pessoal será implementado aqui em breve.
              </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function DashboardPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const userProfileRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);

  const { data: userProfile, isLoading: isProfileLoading } = useDoc<UserProfile>(userProfileRef);
  
  if (isUserLoading || isProfileLoading) {
    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title={<Skeleton className="h-8 w-64"/>}
                description={<Skeleton className="h-5 w-80"/>}
            />
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card><CardHeader><Skeleton className="h-5 w-32"/></CardHeader><CardContent><Skeleton className="h-8 w-24"/></CardContent></Card>
                <Card><CardHeader><Skeleton className="h-5 w-32"/></CardHeader><CardContent><Skeleton className="h-8 w-24"/></CardContent></Card>
                <Card><CardHeader><Skeleton className="h-5 w-32"/></CardHeader><CardContent><Skeleton className="h-8 w-24"/></CardContent></Card>
            </div>
             <Card>
                <CardHeader><Skeleton className="h-6 w-48"/></CardHeader>
                <CardContent><Skeleton className="h-40 w-full"/></CardContent>
            </Card>
        </div>
    );
  }

  if (userProfile?.role === 'admin') {
    return <AdminDashboard userProfile={userProfile} />;
  }

  return <UserDashboardPlaceholder />;
}
