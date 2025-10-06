import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function FgtsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader 
        title="Consulta de Saldo FGTS" 
        description="Realize consultas de saldo de FGTS de forma manual ou em lote."
      />
      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="manual">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="manual">Consulta Manual</TabsTrigger>
              <TabsTrigger value="lote">Consulta em Lote</TabsTrigger>
            </TabsList>
            <TabsContent value="manual">
              <div className="flex flex-col items-center justify-center gap-4 text-center h-96 border-2 border-dashed rounded-lg mt-4">
                  <h3 className="text-2xl font-bold tracking-tight">
                      Consulta Manual de FGTS
                  </h3>
                  <p className="text-sm text-muted-foreground">
                      O formulário para consulta individual será implementado aqui.
                  </p>
              </div>
            </TabsContent>
            <TabsContent value="lote">
              <div className="flex flex_col items-center justify-center gap-4 text-center h-96 border-2 border-dashed rounded-lg mt-4">
                  <h3 className="text-2xl font-bold tracking-tight">
                      Consulta de FGTS em Lote
                  </h3>
                  <p className="text-sm text-muted-foreground">
                      A funcionalidade para consulta em lote será implementada aqui.
                  </p>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
