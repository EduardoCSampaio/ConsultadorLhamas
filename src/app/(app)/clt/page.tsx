
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PlusCircle } from "lucide-react";

export default function CltPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader 
        title="Consultas CLT" 
        description="Realize consultas e gerencie informações de trabalhadores CLT."
      >
      </PageHeader>
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center gap-4 text-center h-96 border-2 border-dashed rounded-lg">
              <h3 className="text-2xl font-bold tracking-tight">
                  Funcionalidade em Construção
              </h3>
              <p className="text-sm text-muted-foreground">
                  A interface para consultas CLT será implementada aqui.
              </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
