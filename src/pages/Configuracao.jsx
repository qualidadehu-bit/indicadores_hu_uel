import { Building2, Layers } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DivisoesSetores from '@/components/configuracao/DivisoesSetores';
import ModulosIndicadores from '@/components/configuracao/ModulosIndicadores';
import CriarPerfil from '@/components/configuracao/CriarPerfil';
import { useAuth } from '@/lib/AuthContext';
import { gestorPodeAcessarConfiguracao } from '@/lib/gestorNivelAcesso';

export default function Configuracao() {
  const { user } = useAuth();
  const isGestor = String(user?.tipo) === 'gestor';

  if (isGestor && !gestorPodeAcessarConfiguracao(user)) {
    return <Navigate to="/lancamento" replace />;
  }

  return (
    <div className="p-4 md:p-6 max-w-screen-xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-jakarta font-bold">Configuração</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          {isGestor
            ? 'Módulos, indicadores e metas do âmbito da sua divisão (definido pelo escritório).'
            : 'Gerencie setores, módulos, indicadores e metas'}
        </p>
      </div>

      <Tabs key={isGestor ? 'gestor' : 'escritorio'} defaultValue={isGestor ? 'modulos' : 'setores'} className="space-y-4">
        <TabsList className={`grid w-full max-w-md ${isGestor ? 'grid-cols-1' : 'grid-cols-3'}`}>
          {!isGestor ? (
            <TabsTrigger value="setores" className="text-xs">
              <Building2 className="w-3 h-3 mr-1" />
              Setores
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="modulos" className="text-xs">
            <Layers className="w-3 h-3 mr-1" />
            Módulos
          </TabsTrigger>
          {!isGestor ? (
            <TabsTrigger value="perfis" className="text-xs">
              👤 Perfis
            </TabsTrigger>
          ) : null}
        </TabsList>

        {!isGestor ? (
          <TabsContent value="setores">
            <Card>
              <CardContent className="pt-5">
                <DivisoesSetores />
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}

        <TabsContent value="modulos">
          <Card>
            <CardContent className="pt-5">
              <ModulosIndicadores />
            </CardContent>
          </Card>
        </TabsContent>

        {!isGestor ? (
          <TabsContent value="perfis">
            <Card>
              <CardContent className="pt-5">
                <CriarPerfil />
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
