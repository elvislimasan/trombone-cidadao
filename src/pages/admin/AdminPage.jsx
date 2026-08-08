import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import * as LucideIcons from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePermissions } from '@/hooks/usePermissions';

// `module`: quando presente, o card só aparece se o usuário puder alterar
// aquele módulo (painel /admin/permissoes). Sem `module`, aparece sempre.
// `masterOnly`: restrito a master.
const adminLinks = [
  { to: '/admin/moderacao/broncas', icon: 'ShieldCheck', title: 'Moderação de Broncas', description: 'Aprove ou rejeite novas broncas.', module: 'moderation' },
  { to: '/admin/moderacao/atualizacoes', icon: 'Megaphone', title: 'Moderar Atualizações', description: 'Revise atualizações de bronca antes de publicar.', module: 'moderation' },
  { to: '/admin/moderacao/resolucoes', icon: 'ShieldCheck', title: 'Moderar resoluções', description: 'Aprove ou rejeite provas de resolução', module: 'moderation' },
  { to: '/admin/usuarios', icon: 'Users', title: 'Gerenciar Usuários', description: 'Adicione, edite e remova usuários.' },
  { to: '/admin/moderacao/peticoes', icon: 'ShieldCheck', title: 'Moderar Petições', description: 'Aprove ou rejeite petições pendentes.', module: 'moderation' },
  { to: '/admin/assinaturas', icon: 'FileSignature', title: 'Gerenciar Petições', description: 'Acompanhe abaixo-assinados publicados.' },
  { to: '/admin/broncas', icon: 'Megaphone', title: 'Gerenciar Broncas', description: 'Edite ou remova broncas publicadas.', module: 'moderation' },
  { to: '/admin/categorias', icon: 'BookMarked', title: 'Categorias (Broncas)', description: 'Gerencie as categorias das broncas.' },
  { to: '/admin/obras', icon: 'Construction', title: 'Gerenciar Obras', description: 'Adicione e atualize obras públicas.', module: 'works' },
  { to: '/admin/moderacao/obras-midias', icon: 'ShieldCheck', title: 'Moderar Mídias de Obras', description: 'Aprove ou rejeite fotos e vídeos enviados.', module: 'moderation' },
  { to: '/admin/obras/opcoes', icon: 'ListChecks', title: 'Opções de Obras', description: 'Gerencie categorias e áreas das obras.', module: 'works' },
  { to: '/admin/pavimentacao', icon: 'Route', title: 'Gerenciar Pavimentação', description: 'Atualize o status das ruas.', module: 'pavement' },
  { to: '/admin/imoveis-alugados', icon: 'Building', title: 'Gerenciar Imóveis Alugados', description: 'Cadastre imóveis e contratos de aluguel.', module: 'rentals' },
  { to: '/admin/servicos', icon: 'Briefcase', title: 'Gerenciar Serviços', description: 'Adicione e edite serviços e diretórios.', module: 'services' },
  { to: '/admin/noticias', icon: 'Newspaper', title: 'Gerenciar Notícias', description: 'Publique e edite notícias.' },
  { to: '/admin/embaixadores', icon: 'ShieldCheck', title: 'Gestão de Embaixadores', description: 'Convites, embaixadores ativos e promoções de masters.' },
  { to: '/admin/permissoes', icon: 'ShieldCheck', title: 'Permissões', description: 'Defina quem pode alterar cada módulo.', masterOnly: true },
  { to: '/admin/configuracoes', icon: 'Settings', title: 'Configurações do Site', description: 'Personalize a aparência do site.' },
  { to: '/admin/lixeira', icon: 'Trash2', title: 'Lixeira', description: 'Gerencie broncas rejeitadas.' },
];

const AdminPage = () => {
  const { user } = useAuth();
  const { canWrite } = usePermissions();

  const visibleLinks = adminLinks.filter((link) => {
    if (link.masterOnly && !user?.is_master) return false;
    if (link.module && !canWrite(link.module)) return false;
    return true;
  });

  return (
    <>
      <Helmet>
        <title>Painel Administrativo - Trombone Cidadão</title>
        <meta name="description" content="Painel de controle para administradores." />
      </Helmet>
      <div className="container mx-auto px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12"
        >
          <h1 className="text-4xl font-bold text-center text-tc-red">Painel Administrativo</h1>
          <p className="text-center text-muted-foreground mt-2">Gerencie todos os aspectos da plataforma.</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleLinks.map((link, index) => {
            const Icon = LucideIcons[link.icon] || LucideIcons.HelpCircle;
            return (
              <motion.div
                key={link.to}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Link to={link.to} className="block h-full">
                  <Card className="h-full hover:border-primary hover:shadow-lg transition-all duration-300 group">
                    <CardHeader className="flex flex-row items-center gap-4">
                      <div className="bg-primary/10 p-3 rounded-lg">
                        <Icon className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <CardTitle>{link.title}</CardTitle>
                        <CardDescription>{link.description}</CardDescription>
                      </div>
                    </CardHeader>
                  </Card>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </>
  );
};

export default AdminPage;
