
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { CircleSlash } from "lucide-react";

export default function FactaPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader 
        title="Crédito Privado CLT - FACTA" 
        description="Gerencie e simule o crédito privado CLT através do provedor FACTA."
      />
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center gap-4 text-center h-96 border-2 border-dashed rounded-lg">
              <CircleSlash className="h-12 w-12 text-muted-foreground" />
              <h3 className="text-2xl font-bold tracking-tight">
                  Nenhuma Funcionalidade Implementada
              </h3>
              <p className="text-sm text-muted-foreground">
                  A funcionalidade para o provedor FACTA será desenvolvida aqui.
              </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
