import { Building2, Layers } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DivisoesSetores from '@/components/configuracao/DivisoesSetores';
import ModulosIndicadores from '@/components/configuracao/ModulosIndicadores';
import CriarPerfil from '@/components/configuracao/CriarPerfil';

export default function Configuracao() {
  return (
    <div className="p-4 md:p-6 max-w-screen-xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-jakarta font-bold">Configuração</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Gerencie setores, módulos, indicadores e metas</p>
      </div>

      <Tabs defaultValue="setores" className="space-y-4">
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="setores" className="text-xs"><Building2 className="w-3 h-3 mr-1" />Setores</TabsTrigger>
          <TabsTrigger value="modulos" className="text-xs"><Layers className="w-3 h-3 mr-1" />Módulos</TabsTrigger>
          <TabsTrigger value="perfis" className="text-xs">👤 Perfis</TabsTrigger>
        </TabsList>

        <TabsContent value="setores">
          <Card>
            <CardContent className="pt-5">
              <DivisoesSetores />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="modulos">
          <Card>
            <CardContent className="pt-5">
              <ModulosIndicadores />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="perfis">
          <Card>
            <CardContent className="pt-5">
              <CriarPerfil />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
