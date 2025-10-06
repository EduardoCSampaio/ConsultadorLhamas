
"use client"

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { DollarSign, Users, Landmark, UserCheck, UserPlus, ArrowRight } from "lucide-react";
import React, { useMemo } from "react";
import { useCollection, useFirestore, useMemoFirebase, useUser } from "@/firebase";
import { collection, query, where } from "firebase/firestore";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import type { UserProfile } from "@/app/actions/users";
import { useDoc } from "@/firebase/firestore/use-doc";
import { doc } from "firebase/firestore";

const chartConfig = {
  total: {
    label: "Total",
    color: "hsl(var(--primary))",
  },
};

const generateChartData = () => {
  const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho"];
  return months.map(month => ({
    month,
    total: Math.floor(Math.random() * 20000) + 5000,
  }));
};

function AdminDashboard() {
  const firestore = useFirestore();
  const usersCollectionRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'users');
  }, [firestore]);

  const { data: users, isLoading } = useCollection<UserProfile>(usersCollectionRef);

  const pendingUsers = useMemo(() => users?.filter(u => u.status === 'pending') || [], [users]);
  const activeUsers = useMemo(() => users?.filter(u => u.status === 'active') || [], [users]);
  const recentUsers = useMemo(() => users?.slice(0, 5) || [], [users]);
  
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
            {isLoading ? <Skeleton className="h-8 w-1/4" /> : <div className="text-2xl font-bold">{pendingUsers.length}</div>}
            <p className="text-xs text-muted-foreground">Aguardando aprovação</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Usuários Ativos</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
             {isLoading ? <Skeleton className="h-8 w-1/4" /> : <div className="text-2xl font-bold">{activeUsers.length}</div>}
            <p className="text-xs text-muted-foreground">Usuários com acesso liberado</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Usuários</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-1/4" /> : <div className="text-2xl font-bold">{users?.length || 0}</div>}
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
                      {isLoading ? (
                          Array.from({ length: 5 }).map((_, i) => (
                              <TableRow key={i}>
                                  <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                                  <TableCell className="text-right"><Skeleton className="h-5 w-20 ml-auto" /></TableCell>
                              </TableRow>
                          ))
                      ) : (
                          recentUsers.map((user) => (
                              <TableRow key={user.uid}>
                                  <TableCell>
                                      <div className="font-medium">{user.email}</div>
                                  </TableCell>
                                  <TableCell className="text-right">
                                      <Badge variant={getStatusVariant(user.status)} className="capitalize">{getStatusText(user.status)}</Badge>
                                  </TableCell>
                              </TableRow>
                          ))
                      )}
                  </TableBody>
              </Table>
            </div>
             {recentUsers?.length === 0 && !isLoading && (
              <div className="text-center p-8 text-muted-foreground">
                Nenhum usuário registrado ainda.
              </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
}


function UserDashboard() {
  const chartData = generateChartData();
  const recentProposals = [
    { id: '1', client: 'Carlos Pereira', value: 'R$ 5.000,00', status: 'Aprovado' },
    { id: '2', client: 'Mariana Oliveira', value: 'R$ 12.000,00', status: 'Aprovado' },
    { id: '3', client: 'Rafael Santos', value: 'R$ 7.500,00', status: 'Em Análise' },
    { id: '4', client: 'Lucia Fernandes', value: 'R$ 3.000,00', status: 'Recusado' },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        description="Olá! Aqui está um resumo financeiro do seu negócio."
      >
        <Button>Nova Proposta</Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Receita Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">R$ 145.231,89</div>
            <p className="text-xs text-muted-foreground">+15.3% em relação ao mês passado</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Novos Clientes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">+42</div>
            <p className="text-xs text-muted-foreground">+8.1% em relação ao mês passado</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Crédito Aprovado (Mês)</CardTitle>
            <Landmark className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">R$ 78.500,00</div>
            <p className="text-xs text-muted-foreground">12 propostas aprovadas</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Visão Geral da Receita</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <BarChart accessibilityLayer data={chartData}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  tickMargin={10}
                  axisLine={false}
                  tickFormatter={(value) => value.slice(0, 3)}
                />
                 <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
                  tickFormatter={(value) => `R$${Number(value) / 1000}k`}
                />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent indicator="dot" />}
                />
                <Bar dataKey="total" fill="var(--color-total)" radius={4} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Propostas Recentes</CardTitle>
             <p className="text-sm text-muted-foreground">
              As últimas 4 propostas de crédito recebidas.
            </p>
          </CardHeader>
          <CardContent>
             <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {recentProposals.map((proposal) => (
                        <TableRow key={proposal.id}>
                            <TableCell>
                                <div className="font-medium">{proposal.client}</div>
                            </TableCell>
                            <TableCell>{proposal.value}</TableCell>
                            <TableCell className="text-right">
                                <Badge variant={
                                    proposal.status === 'Aprovado' ? 'default' :
                                    proposal.status === 'Em Análise' ? 'secondary' :
                                    'destructive'
                                } className="capitalize">{proposal.status}</Badge>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
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
    return <AdminDashboard />;
  }

  return <UserDashboard />;
}

    