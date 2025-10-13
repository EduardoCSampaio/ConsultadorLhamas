
'use client';

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CircleDashed } from "lucide-react";

export default function V8ComingSoonPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Crédito Privado CLT - V8"
        description="Esta funcionalidade estará disponível em breve."
      />
      <Card>
        <CardHeader>
          <CardTitle>Em Desenvolvimento</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center gap-4 text-center h-60 border-2 border-dashed rounded-lg">
            <CircleDashed className="h-12 w-12 text-muted-foreground" />
            <h3 className="text-2xl font-bold tracking-tight">
              Funcionalidade em Breve
            </h3>
            <div className="text-sm text-muted-foreground">
              Estamos trabalhando para integrar a simulação de crédito privado
              CLT com o provedor V8.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

    
