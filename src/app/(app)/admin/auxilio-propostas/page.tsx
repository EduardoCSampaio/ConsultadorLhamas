'use client';

import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useUser } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Download, CalendarIcon, AlertCircle } from "lucide-react";
import { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getFactaProposalsReport } from "@/app/actions/proposals";

export default function AuxilioPropostasPage() {
    const { user } = useUser();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dateRange, setDateRange] = useState<DateRange | undefined>();

    const handleGenerateReport = async () => {
        if (!user) {
            setError("Você precisa estar logado para gerar o relatório.");
            return;
        }
        if (!dateRange || !dateRange.from || !dateRange.to) {
            setError("Por favor, selecione um período de datas válido.");
            return;
        }

        setIsLoading(true);
        setError(null);
        toast({ title: "Gerando relatório...", description: "Buscando propostas na API da Facta. Isso pode levar um momento." });

        const response = await getFactaProposalsReport({
            userId: user.uid,
            dateFrom: format(dateRange.from, "dd/MM/yyyy"),
            dateTo: format(dateRange.to, "dd/MM/yyyy"),
        });

        if (response.success && response.fileContent && response.fileName) {
            const link = document.createElement("a");
            link.href = response.fileContent;
            link.download = response.fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            toast({ title: "Download iniciado!", description: `O arquivo ${response.fileName} está sendo baixado.` });
        } else {
            setError(response.message);
            toast({ variant: "destructive", title: "Erro ao gerar relatório", description: response.message });
        }

        setIsLoading(false);
    };

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title="Auxílio Propostas - Facta"
                description="Consulte o andamento de propostas em um período e exporte o resultado em Excel."
            />
            <Card>
                <CardHeader>
                    <CardTitle>Gerar Relatório de Propostas</CardTitle>
                    <CardDescription>Selecione o período desejado para a consulta.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid gap-2">
                        <Label htmlFor="date">Período da Consulta</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    id="date"
                                    variant={"outline"}
                                    className={cn(
                                        "w-full justify-start text-left font-normal md:w-[300px]",
                                        !dateRange && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {dateRange?.from ? (
                                        dateRange.to ? (
                                            <>
                                                {format(dateRange.from, "dd/MM/y")} - {format(dateRange.to, "dd/MM/y")}
                                            </>
                                        ) : (
                                            format(dateRange.from, "dd/MM/y")
                                        )
                                    ) : (
                                        <span>Selecione o período</span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    initialFocus
                                    mode="range"
                                    defaultMonth={dateRange?.from}
                                    selected={dateRange}
                                    onSelect={setDateRange}
                                    numberOfMonths={2}
                                />
                            </PopoverContent>
                        </Popover>
                    </div>

                    <Button onClick={handleGenerateReport} disabled={isLoading || !dateRange?.from || !dateRange?.to}>
                        {isLoading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Download className="mr-2 h-4 w-4" />
                        )}
                        {isLoading ? "Gerando..." : "Gerar e Baixar Relatório"}
                    </Button>
                </CardContent>
            </Card>

            {error && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Erro na Consulta</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
        </div>
    );
}
