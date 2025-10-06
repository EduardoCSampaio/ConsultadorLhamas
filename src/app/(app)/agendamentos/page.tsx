import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PlusCircle } from "lucide-react";

export default function AgendamentosPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader 
        title="Agendamentos" 
        description="Gerencie seus compromissos, visualize sua agenda e evite conflitos."
      >
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Novo Agendamento
        </Button>
      </PageHeader>
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center gap-4 text-center h-96 border-2 border-dashed rounded-lg">
              <h3 className="text-2xl font-bold tracking-tight">
                  Calendário de agendamentos
              </h3>
              <p className="text-sm text-muted-foreground">
                  A funcionalidade do calendário será implementada aqui.
              </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
