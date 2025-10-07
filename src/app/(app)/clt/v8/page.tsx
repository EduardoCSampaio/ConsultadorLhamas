
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Construction } from "lucide-react";

export default function V8Page() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader 
        title="Crédito Privado CLT - V8" 
        description="Integração com o provedor V8."
      />
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center gap-4 text-center h-96 border-2 border-dashed rounded-lg">
              <Construction className="h-12 w-12 text-muted-foreground" />
              <h3 className="text-2xl font-bold tracking-tight">
                  Em Breve
              </h3>
              <p className="text-sm text-muted-foreground">
                  A integração com o provedor V8 estará disponível em breve.
              </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
