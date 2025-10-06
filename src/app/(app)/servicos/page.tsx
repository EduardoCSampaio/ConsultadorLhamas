import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PlusCircle } from "lucide-react";

export default function ServicosPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader 
        title="Serviços"
        description="Crie e gerencie seu catálogo de serviços oferecidos."
      >
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Novo Serviço
        </Button>
      </PageHeader>
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center gap-4 text-center h-96 border-2 border-dashed rounded-lg">
              <h3 className="text-2xl font-bold tracking-tight">
                  Catálogo de serviços
              </h3>
              <p className="text-sm text-muted-foreground">
                  A lista de serviços com preços e descrições será implementada aqui.
              </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
