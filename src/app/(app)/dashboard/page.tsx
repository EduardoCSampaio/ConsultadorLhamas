
'use client';

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { DollarSign, Users, Landmark } from "lucide-react";
import React from "react";

const chartConfig = {
  total: {
    label: "Total",
    color: "hsl(var(--primary))",
  },
};

const recentProposals = [
    { id: '1', client: 'Carlos Pereira', value: 'R$ 5.000,00', status: 'Aprovado' },
    { id: '2', client: 'Mariana Oliveira', value: 'R$ 12.000,00', status: 'Aprovado' },
    { id: '3', client: 'Rafael Santos', value: 'R$ 7.500,00', status: 'Em Análise' },
    { id: '4', client: 'Lucia Fernandes', value: 'R$ 3.000,00', status: 'Recusado' },
];

export default function DashboardPage() {
  const [chartData, setChartData] = React.useState([
    { month: "Janeiro", total: 0 },
    { month: "Fevereiro", total: 0 },
    { month: "Março", total: 0 },
    { month: "Abril", total: 0 },
    { month: "Maio", total: 0 },
    { month: "Junho", total: 0 },
  ]);

  React.useEffect(() => {
    setChartData([
      { month: "Janeiro", total: Math.floor(Math.random() * 20000) + 5000 },
      { month: "Fevereiro", total: Math.floor(Math.random() * 20000) + 5000 },
      { month: "Março", total: Math.floor(Math.random() * 20000) + 5000 },
      { month: "Abril", total: Math.floor(Math.random() * 20000) + 5000 },
      { month: "Maio", total: Math.floor(Math.random() * 20000) + 5000 },
      { month: "Junho", total: Math.floor(Math.random() * 20000) + 5000 },
    ]);
  }, []);


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
