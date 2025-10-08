
"use client"

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Users, UserCheck, UserPlus, ArrowRight, Activity, TrendingUp } from "lucide-react";
import React from "react";
import { useFirestore, useMemoFirebase, useUser } from "@/firebase";
import { doc } from "firebase/firestore";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import type { UserProfile } from "@/app/actions/users";
import { getUsers, getActivityLogs, ActivityLog } from "@/app/actions/users";
import { useDoc } from "@/firebase/firestore/use-doc";


function AdminDashboard({ 
  initialUsers, 
  activityLogs, 
  error 
}: { 
  initialUsers: UserProfile[] | null, 
  activityLogs: ActivityLog[] | null,
  error?: string 
}) {
  
  const pendingUsers = initialUsers?.filter(u => u.status === 'pending') || [];
  const activeUsers = initialUsers?.filter(u => u.status === 'active') || [];
  const recentUsers = initialUsers?.slice(0, 5) || [];

  const mostActiveUser = React.useMemo(() => {
    if (!activityLogs || activityLogs.length === 0) {
      return { email: 'N/A', count: 0 };
    }
    const counts = activityLogs.reduce((acc, log) => {
      acc[log.userEmail] = (acc[log.userEmail] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(counts).reduce((topUser, [email, count]) => {
      return count > topUser.count ? { email, count } : topUser;
    }, { email: 'N/A', count: 0 });
  }, [activityLogs]);
  
  const getStatusVariant = (status: string) => {
    switch (status) {
        case 'active': return 'default';
        case 'pending': return 'secondary';
        case 'rejected': return 'destructive';
        case 'inactive': return 'destructive';
        default: return 'outline';
    }
  };
  
  const getStatusText = (status: string) => {
    switch (status) {
        case 'active': return 'Ativo';
        case 'pending': return 'Pendente';
        case 'rejected': return 'Rejeitado';
        case 'inactive': return 'Inativo';
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
            <CardTitle className="text-sm font-medium">Usuário Mais Ativo</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold truncate" title={mostActiveUser.email}>{mostActiveUser.email}</div>
            <p className="text-xs text-muted-foreground">{mostActiveUser.count} consultas realizadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Consultas</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activityLogs?.length || 0}</div>
            <p className="text-xs text-muted-foreground">Consultas na plataforma</p>
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
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
                            <TableHead className="text-right w-[100px]">Status</TableHead>
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
         <Card>
          <CardHeader>
            <CardTitle>Atividade Recente</CardTitle>
            <CardDescription>As últimas 5 consultas realizadas na plataforma.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[40%]">Usuário</TableHead>
                            <TableHead>Ação</TableHead>
                            <TableHead className="text-right">Data</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(activityLogs?.slice(0, 5) || []).map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="font-medium truncate">{log.userEmail}</TableCell>
                          <TableCell>{log.action}</TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(log.createdAt).toLocaleString('pt-BR')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                </Table>
            </div>
             {activityLogs?.length === 0 && (
                <div className="text-center p-8 text-muted-foreground">
                  Nenhuma atividade registrada ainda.
                </div>
              )}
          </CardContent>
        </Card>
      </div>
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

function AdminDashboardLoader() {
    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title={<Skeleton className="h-8 w-64"/>}
                description={<Skeleton className="h-5 w-80"/>}
            >
                <Skeleton className="h-10 w-44" />
            </PageHeader>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><Skeleton className="h-5 w-32"/></CardHeader><CardContent><Skeleton className="h-8 w-10"/></CardContent></Card>
                <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><Skeleton className="h-5 w-32"/></CardHeader><CardContent><Skeleton className="h-8 w-10"/></CardContent></Card>
                <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><Skeleton className="h-5 w-40"/></CardHeader><CardContent><Skeleton className="h-8 w-48"/></CardContent></Card>
                <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><Skeleton className="h-5 w-32"/></CardHeader><CardContent><Skeleton className="h-8 w-10"/></CardContent></Card>
            </div>
             <div className="grid gap-6 lg:grid-cols-2">
                 <Card>
                    <CardHeader><CardTitle><Skeleton className="h-6 w-48"/></CardTitle><CardDescription><Skeleton className="h-4 w-72"/></CardDescription></CardHeader>
                    <CardContent><Skeleton className="h-40 w-full"/></CardContent>
                </Card>
                 <Card>
                    <CardHeader><CardTitle><Skeleton className="h-6 w-48"/></CardTitle><CardDescription><Skeleton className="h-4 w-72"/></CardDescription></CardHeader>
                    <CardContent><Skeleton className="h-40 w-full"/></CardContent>
                </Card>
            </div>
        </div>
    );
}

export default function DashboardPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const [adminData, setAdminData] = React.useState<{
    users: UserProfile[] | null, 
    logs: ActivityLog[] | null,
    error?: string
  }>({users: null, logs: null, error: undefined});

  const [isAdminDataLoading, setIsAdminDataLoading] = React.useState(true);

  const userProfileRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);

  const { data: userProfile, isLoading: isProfileLoading } = useDoc<UserProfile>(userProfileRef);

  React.useEffect(() => {
    async function fetchAdminData() {
        if (userProfile?.role === 'admin' && !isProfileLoading) {
            setIsAdminDataLoading(true);
            try {
                const [{ users, error: usersError }, { logs, error: logsError }] = await Promise.all([
                    getUsers(),
                    getActivityLogs()
                ]);

                if (usersError || logsError) {
                   setAdminData({ users: null, logs: null, error: usersError || logsError });
                } else {
                   setAdminData({ users, logs });
                }
            } catch (e) {
                const message = e instanceof Error ? e.message : "Erro ao carregar dados do dashboard."
                setAdminData({ users: null, logs: null, error: message });
            } finally {
                setIsAdminDataLoading(false);
            }
        } else if (!isProfileLoading) {
            setIsAdminDataLoading(false);
        }
    }
    
    fetchAdminData();
  }, [userProfile, isProfileLoading]);
  
  if (isUserLoading || isProfileLoading) {
    return <AdminDashboardLoader />;
  }

  if (userProfile?.role === 'admin') {
    if (isAdminDataLoading) {
        return <AdminDashboardLoader />;
    }
    return <AdminDashboard initialUsers={adminData.users} activityLogs={adminData.logs} error={adminData.error} />;
  }

  return <UserDashboardPlaceholder />;
}

    