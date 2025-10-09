
"use client"

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Users, UserCheck, UserPlus, ArrowRight, Activity, TrendingUp, Settings, Search, CheckCircle, XCircle } from "lucide-react";
import React from "react";
import { useFirestore, useMemoFirebase, useUser } from "@/firebase";
import { doc } from "firebase/firestore";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import type { UserProfile } from "@/app/actions/users";
import { getUsers, getActivityLogs, getUserActivityLogs, ActivityLog } from "@/app/actions/users";
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
            <div className="text-xs text-muted-foreground">Consultas na plataforma</div>
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
            <CardDescription>As últimas 5 atividades registradas na plataforma.</CardDescription>
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

function UserDashboard({ userProfile }: { userProfile: UserProfile }) {
  const [activity, setActivity] = React.useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function loadActivity() {
      setIsLoading(true);
      const { logs, error: fetchError } = await getUserActivityLogs({ userId: userProfile.uid });
      if (fetchError) {
        setError(fetchError);
      } else {
        setActivity(logs || []);
      }
      setIsLoading(false);
    }
    loadActivity();
  }, [userProfile.uid]);

  const hasV8Creds = userProfile.v8_username && userProfile.v8_password && userProfile.v8_audience && userProfile.v8_client_id;
  const hasFactaCreds = userProfile.facta_username && userProfile.facta_password;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Bem-vindo, ${userProfile.email.split('@')[0]}!`}
        description="Aqui está um resumo rápido de sua atividade e configurações."
      >
        <Button asChild>
            <Link href="/fgts">
                Nova Consulta
                <Search className="ml-2 h-4 w-4" />
            </Link>
        </Button>
      </PageHeader>
      
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
            <Card>
                <CardHeader>
                    <CardTitle>Sua Atividade Recente</CardTitle>
                    <CardDescription>Suas últimas 5 atividades registradas.</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                         <div className="space-y-2">
                            {Array.from({length: 5}).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                         </div>
                    ) : error ? (
                        <div className="text-red-500">{error}</div>
                    ) : activity.length === 0 ? (
                        <div className="text-center p-8 text-muted-foreground">
                            Nenhuma atividade registrada ainda.
                        </div>
                    ) : (
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Ação</TableHead>
                                        <TableHead>Detalhes</TableHead>
                                        <TableHead className="text-right">Data</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {activity.map(log => (
                                        <TableRow key={log.id}>
                                            <TableCell>{log.action}</TableCell>
                                            <TableCell className="font-mono text-xs">{log.details || log.documentNumber || 'N/A'}</TableCell>
                                            <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                                                {new Date(log.createdAt).toLocaleString('pt-BR')}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>

        <div>
            <Card>
                <CardHeader>
                    <CardTitle>Configurações de API</CardTitle>
                    <CardDescription>Status das suas credenciais.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                     <div className="flex items-center justify-between rounded-lg border p-3">
                        <span className="font-semibold">API V8</span>
                        {hasV8Creds ? (
                            <Badge variant="default"><CheckCircle className="mr-1 h-3 w-3"/>Configurada</Badge>
                        ) : (
                            <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3"/>Pendente</Badge>
                        )}
                    </div>
                     <div className="flex items-center justify-between rounded-lg border p-3">
                        <span className="font-semibold">API Facta</span>
                        {hasFactaCreds ? (
                            <Badge variant="default"><CheckCircle className="mr-1 h-3 w-3"/>Configurada</Badge>
                        ) : (
                            <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3"/>Pendente</Badge>
                        )}
                    </div>
                    <Button asChild className="w-full">
                        <Link href="/configuracoes">
                           <Settings className="mr-2 h-4 w-4" />
                           Gerenciar Credenciais
                        </Link>
                    </Button>
                </CardContent>
            </Card>
        </div>

      </div>
    </div>
  )
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
                    <CardHeader>
                        <CardTitle><Skeleton className="h-6 w-48"/></CardTitle>
                        <CardDescription><Skeleton className="h-4 w-72"/></CardDescription>
                    </CardHeader>
                    <CardContent><Skeleton className="h-40 w-full"/></CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle><Skeleton className="h-6 w-48"/></CardTitle>
                        <CardDescription><Skeleton className="h-4 w-72"/></CardDescription>
                    </CardHeader>
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

  if (userProfile) {
    return <UserDashboard userProfile={userProfile} />;
  }

  // Fallback or loading state if userProfile is not available for some reason.
  return <AdminDashboardLoader />;
}

    