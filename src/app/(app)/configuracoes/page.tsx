import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

export default function ConfiguracoesPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader 
        title="Configurações"
        description="Ajuste as preferências da sua conta e do sistema."
      />
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center gap-4 text-center h-96 border-2 border-dashed rounded-lg">
              <h3 className="text-2xl font-bold tracking-tight">
                  Opções de Configuração
              </h3>
              <p className="text-sm text-muted-foreground">
                  Os formulários de configuração do sistema serão implementados aqui.
              </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
