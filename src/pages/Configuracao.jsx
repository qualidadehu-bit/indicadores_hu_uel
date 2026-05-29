import { Building2, Layers } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DivisoesSetores from '@/components/configuracao/DivisoesSetores';
import ModulosIndicadores from '@/components/configuracao/ModulosIndicadores';
import CriarPerfil from '@/components/configuracao/CriarPerfil';
import { useAuth } from '@/lib/AuthContext';
import { gestorPodeAcessarConfiguracao } from '@/lib/gestorNivelAcesso';
import { ENTITY_TYPE_CLINICA, ENTITY_TYPE_COMISSAO, ENTITY_TYPE_SETOR } from '@/lib/entityType';

export default function Configuracao() {
  const { user } = useAuth();
  const isGestor = String(user?.tipo) === 'gestor';

  if (isGestor && !gestorPodeAcessarConfiguracao(user)) {
    return <Navigate to="/lancamento-setores" replace />;
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

      <Tabs key={isGestor ? 'gestor' : 'escritorio'} defaultValue={isGestor ? 'modulos-setores' : 'setores'} className="space-y-4">
        <div className="w-full overflow-x-auto pb-1">
          <TabsList className={`w-max min-w-full ${isGestor ? 'max-w-5xl justify-start' : 'max-w-6xl justify-start'}`}>
            {!isGestor ? (
              <TabsTrigger value="setores" className="text-xs">
                <Building2 className="w-3 h-3 mr-1" />
                Novos Setores
              </TabsTrigger>
            ) : null}
            {!isGestor ? (
              <TabsTrigger value="comissoes" className="text-xs">
                <Building2 className="w-3 h-3 mr-1" />
                Novas Comissões
              </TabsTrigger>
            ) : null}
            {!isGestor ? (
              <TabsTrigger value="praticas-medicas" className="text-xs">
                <Building2 className="w-3 h-3 mr-1" />
                Gestão de Práticas Médicas
              </TabsTrigger>
            ) : null}
            <TabsTrigger value="modulos-setores" className="text-xs">
              <Layers className="w-3 h-3 mr-1" />
              Módulos Setores
            </TabsTrigger>
            <TabsTrigger value="modulos-comissoes" className="text-xs">
              <Layers className="w-3 h-3 mr-1" />
              Módulos Comissões
            </TabsTrigger>
            <TabsTrigger value="modulos-praticas-medicas" className="text-xs">
              <Layers className="w-3 h-3 mr-1" />
              Módulos Clínicas
            </TabsTrigger>
            {!isGestor ? (
              <TabsTrigger value="perfis" className="text-xs">
                👤 Novos Perfis
              </TabsTrigger>
            ) : null}
          </TabsList>
        </div>

        {!isGestor ? (
          <TabsContent value="setores">
            <Card>
              <CardContent className="pt-5">
                <DivisoesSetores entityType={ENTITY_TYPE_SETOR} title="Novos Setores (lógica hospitalar atual)" />
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}

        {!isGestor ? (
          <TabsContent value="comissoes">
            <Card>
              <CardContent className="pt-5">
                <DivisoesSetores entityType={ENTITY_TYPE_COMISSAO} title="Novas Comissões" />
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}
        {!isGestor ? (
          <TabsContent value="praticas-medicas">
            <Card>
              <CardContent className="pt-5">
                <DivisoesSetores entityType={ENTITY_TYPE_CLINICA} title="Gestão de Práticas Médicas" />
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}

        <TabsContent value="modulos-setores">
          <Card>
            <CardContent className="pt-5">
              <ModulosIndicadores entityType={ENTITY_TYPE_SETOR} title="Módulos Setores" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="modulos-comissoes">
          <Card>
            <CardContent className="pt-5">
              <ModulosIndicadores entityType={ENTITY_TYPE_COMISSAO} title="Módulos Comissões" />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="modulos-praticas-medicas">
          <Card>
            <CardContent className="pt-5">
              <ModulosIndicadores entityType={ENTITY_TYPE_CLINICA} title="Módulos Clínicas" />
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
