import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ArrowUpRight, DollarSign, Users, Calendar } from "lucide-react";
import Link from "next/link";

const chartData = [
  { month: "Janeiro", total: Math.floor(Math.random() * 5000) + 1000 },
  { month: "Fevereiro", total: Math.floor(Math.random() * 5000) + 1000 },
  { month: "Março", total: Math.floor(Math.random() * 5000) + 1000 },
  { month: "Abril", total: Math.floor(Math.random() * 5000) + 1000 },
  { month: "Maio", total: Math.floor(Math.random() * 5000) + 1000 },
  { month: "Junho", total: Math.floor(Math.random() * 5000) + 1000 },
];

const chartConfig = {
  total: {
    label: "Total",
    color: "hsl(var(--primary))",
  },
};

const appointments = [
    { id: '1', client: 'Camila Silva', service: 'Corte e Escova', time: '10:00', status: 'Confirmado' },
    { id: '2', client: 'Juliana Costa', service: 'Manicure', time: '11:30', status: 'Confirmado' },
    { id: '3', client: 'Fernanda Lima', service: 'Coloração', time: '14:00', status: 'Pendente' },
    { id: '4', client: 'Beatriz Almeida', service: 'Pedicure', time: '16:00', status: 'Cancelado' },
];

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader 
        title="Dashboard" 
        description="Bem-vinda! Aqui está um resumo do seu negócio."
      >
        <Button>Novo Agendamento</Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Receita Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">R$ 45.231,89</div>
            <p className="text-xs text-muted-foreground">+20.1% em relação ao mês passado</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Novos Clientes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">+23</div>
            <p className="text-xs text-muted-foreground">+12.2% em relação ao mês passado</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Agendamentos (Hoje)</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">12</div>
            <p className="text-xs text-muted-foreground">4 confirmados, 1 pendente</p>
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
            <CardTitle>Agendamentos Recentes</CardTitle>
             <p className="text-sm text-muted-foreground">
              Você tem {appointments.length} agendamentos hoje.
            </p>
          </CardHeader>
          <CardContent>
             <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Serviço</TableHead>
                        <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {appointments.slice(0,4).map((appt) => (
                        <TableRow key={appt.id}>
                            <TableCell>
                                <div className="font-medium">{appt.client}</div>
                                <div className="text-sm text-muted-foreground">{appt.time}</div>
                            </TableCell>
                            <TableCell>{appt.service}</TableCell>
                            <TableCell className="text-right">
                                <Badge variant={
                                    appt.status === 'Confirmado' ? 'default' :
                                    appt.status === 'Pendente' ? 'secondary' :
                                    'destructive'
                                } className="capitalize">{appt.status}</Badge>
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
