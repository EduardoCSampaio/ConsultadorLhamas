import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PlusCircle } from "lucide-react";

export default function CreditoPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader 
        title="Análise de Crédito" 
        description="Gerencie e avalie as propostas de crédito dos seus clientes."
      >
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Nova Proposta
        </Button>
      </PageHeader>
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center gap-4 text-center h-96 border-2 border-dashed rounded-lg">
              <h3 className="text-2xl font-bold tracking-tight">
                  Propostas de Crédito
              </h3>
              <p className="text-sm text-muted-foreground">
                  A tabela com a lista de propostas será implementada aqui.
              </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
