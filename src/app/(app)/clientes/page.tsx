import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PlusCircle } from "lucide-react";

export default function ClientesPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader 
        title="Clientes"
        description="Visualize e gerencie as informações e o histórico dos seus clientes."
      >
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Novo Cliente
        </Button>
      </PageHeader>
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center gap-4 text-center h-96 border-2 border-dashed rounded-lg">
              <h3 className="text-2xl font-bold tracking-tight">
                  Lista de Clientes
              </h3>
              <p className="text-sm text-muted-foreground">
                  A tabela com a lista de clientes e seus históricos será implementada aqui.
              </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
