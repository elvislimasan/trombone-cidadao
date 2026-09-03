import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import * as LucideIcons from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/lib/customSupabaseClient';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import UserDashboardPage from '@/pages/UserDashboardPage';

// `module`: quando presente, o card só aparece se o usuário puder alterar
// aquele módulo (painel /admin/permissoes). Sem `module`, aparece sempre.
// `masterOnly`: restrito a master.
const adminLinks = [
  { to: '/admin/moderacao/broncas', icon: 'ShieldCheck', title: 'Moderação de Broncas', description: 'Aprove ou rejeite novas broncas.', module: 'moderation' },
  { to: '/admin/moderacao/atualizacoes', icon: 'Megaphone', title: 'Moderar Atualizações', description: 'Revise atualizações de bronca antes de publicar.', module: 'moderation' },
  { to: '/admin/auditorias', icon: 'AlertTriangle', title: 'Auditoria de Cadastro', description: 'Pontos errados, categorias trocadas e relatos de risco.', module: 'moderation' },
  { to: '/admin/metas', icon: 'Target', title: 'Metas Comunitárias', description: 'Cobertura de ruas por área, ciclos e relatório público.', module: 'moderation' },
  { to: '/admin/campanhas', icon: 'Megaphone', title: 'Campanhas', description: 'Sazonais e editoriais: alguém escreve, assina e define o período.', module: 'moderation' },
  { to: '/admin/assistente', icon: 'Sparkles', title: 'Assistente de Categoria', description: 'Acerto por categoria — a sugestão só aparece onde foi medida.', module: 'moderation' },
  { to: '/admin/moderacao/resolucoes', icon: 'ShieldCheck', title: 'Moderar resoluções', description: 'Aprove ou rejeite provas de resolução', module: 'moderation' },
  // Comentário publica na hora (migração 193); esta fila só recebe o que 3
  // denúncias tiraram do ar. É a única moderação de comentário que existe — e,
  // ao contrário da anterior, tem porta de entrada.
  { to: '/admin/moderacao/comentarios', icon: 'Flag', title: 'Comentários Denunciados', description: 'Veja o que foi denunciado, antes e depois de sair do ar.', module: 'moderation' },
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
  { to: '/admin/canais-do-orgao', icon: 'Mail', title: 'Canais do Órgão', description: 'E-mail de cada secretaria, categorias e relatórios automáticos.' },
  { to: '/admin/embaixadores', icon: 'ShieldCheck', title: 'Gestão de Embaixadores', description: 'Convites, embaixadores ativos e promoções de masters.' },
  { to: '/admin/permissoes', icon: 'ShieldCheck', title: 'Permissões', description: 'Defina quem pode alterar cada módulo.', masterOnly: true },
  { to: '/admin/configuracoes', icon: 'Settings', title: 'Configurações do Site', description: 'Personalize a aparência do site.' },
  { to: '/admin/lixeira', icon: 'Trash2', title: 'Lixeira', description: 'Gerencie broncas rejeitadas.' },
];

const GRUPOS = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'moderacao', rotulo: 'Moderação' },
  { id: 'conteudo', rotulo: 'Conteúdo e cidade' },
  { id: 'pessoas', rotulo: 'Pessoas e acessos' },
  { id: 'sistema', rotulo: 'Sistema' },
];

const grupoDoLink = ({ to }) => {
  if (/moderacao|auditorias|lixeira|assistente/.test(to)) return 'moderacao';
  if (/usuarios|embaixadores|permissoes/.test(to)) return 'pessoas';
  if (/configuracoes|canais-do-orgao/.test(to)) return 'sistema';
  return 'conteudo';
};

const normalizar = (valor) => String(valor || '')
  .normalize('NFD')
  .replace(/\p{Mn}/gu, '')
  .toLowerCase();

const criarConsultasPendentes = () => ({
  '/admin/moderacao/broncas': () => supabase
    .from('reports')
    .select('id', { count: 'exact', head: true })
    .eq('moderation_status', 'pending_approval')
    .or('signal_status.is.null,signal_status.in.(done,empty)'),
  '/admin/moderacao/atualizacoes': () => supabase
    .from('report_updates')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending_moderation'),
  '/admin/auditorias': () => supabase
    .from('report_audit_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'aberta'),
  '/admin/moderacao/resolucoes': () => supabase
    .from('reports')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending_resolution')
    .not('resolution_submission', 'is', null),
  '/admin/moderacao/comentarios': () => supabase
    .from('comments')
    .select('id, denuncias:comment_reports!inner(id)', { count: 'exact', head: true })
    .is('denuncias.resolved_at', null)
    .not('report_id', 'is', null),
  '/admin/moderacao/peticoes': () => supabase
    .from('petitions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending_moderation'),
  '/admin/moderacao/obras-midias': () => supabase
    .from('public_work_media')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending'),
  '/admin/servicos': () => supabase
    .from('directory')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending'),
  '/admin/embaixadores': () => supabase
    .from('ambassador_applications')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending'),
});

const AdminPage = () => {
  const { user } = useAuth();
  const { canWrite } = usePermissions();
  const [area, setArea] = useState('administracao');
  const [busca, setBusca] = useState('');
  const [grupo, setGrupo] = useState('todos');
  const [pendencias, setPendencias] = useState({});

  const visibleLinks = adminLinks.filter((link) => {
    if (link.masterOnly && !user?.is_master) return false;
    if (link.module && !canWrite(link.module)) return false;
    return true;
  });

  const linksFiltrados = useMemo(() => {
    const termo = normalizar(busca.trim());
    return visibleLinks.filter((link) => {
      const combinaGrupo = grupo === 'todos' || grupoDoLink(link) === grupo;
      const combinaBusca = !termo || normalizar(`${link.title} ${link.description}`).includes(termo);
      return combinaGrupo && combinaBusca;
    });
  }, [visibleLinks, busca, grupo]);

  const primeiroNome = String(user?.name || 'Administrador').trim().split(/\s+/)[0];
  const modulosLiberados = new Set(visibleLinks.map((link) => link.module).filter(Boolean)).size;

  const carregarPendencias = useCallback(async () => {
    const consultas = criarConsultasPendentes();
    const resultados = await Promise.all(Object.entries(consultas).map(async ([caminho, consultar]) => {
      const { count, error } = await consultar();
      return { caminho, count: count || 0, error };
    }));

    const proximasPendencias = {};
    resultados.forEach(({ caminho, count, error }) => {
      if (error) {
        console.error(`Erro ao contar pendências de ${caminho}:`, error);
        return;
      }
      proximasPendencias[caminho] = count;
    });

    setPendencias(proximasPendencias);
  }, []);

  useEffect(() => {
    carregarPendencias();
  }, [carregarPendencias]);

  const seletorDeArea = (
    <TabsList className="grid h-auto w-full max-w-lg grid-cols-2 rounded-xl bg-surface-sunken p-1">
      <TabsTrigger value="administracao" className="gap-2 rounded-lg py-2.5"><LucideIcons.Shield className="h-4 w-4" /> Administração</TabsTrigger>
      <TabsTrigger value="atividade" className="gap-2 rounded-lg py-2.5"><LucideIcons.LayoutDashboard className="h-4 w-4" /> Minha atividade</TabsTrigger>
    </TabsList>
  );

  return (
    <>
      <Helmet>
        <title>Painel Administrativo - Trombone Cidadão</title>
        <meta name="description" content="Painel de controle para administradores." />
      </Helmet>
      <div className="mx-auto w-full max-w-[112rem] px-3 py-8 sm:px-5 lg:px-8">
        {area === 'administracao' && (
          <motion.header
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            className="overflow-hidden rounded-3xl bg-gradient-to-r from-[#171717] via-[#26070b] to-[#7f1220] p-6 text-white shadow-elevation-2 md:p-8 lg:flex lg:h-56 lg:items-center"
          >
            <div className="grid items-center gap-7 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div className="flex items-start gap-4">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand text-content-onBrand">
                  <LucideIcons.ShieldCheck className="h-7 w-7" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-amber-300">Central administrativa</p>
                  <h1 className="mt-1 text-2xl font-extrabold md:text-3xl">Olá, {primeiroNome}. Gerencie a plataforma.</h1>
                  <p className="mt-2 max-w-2xl text-sm text-white/70">Modere publicações, atualize os módulos da cidade e acompanhe também sua atividade cidadã em um só lugar.</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"><strong className="block text-xl tabular-nums">{visibleLinks.length}</strong><span className="text-[10px] text-white/60">ferramentas</span></div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"><strong className="block text-xl tabular-nums">{modulosLiberados}</strong><span className="text-[10px] text-white/60">módulos</span></div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"><strong className="block text-sm leading-7">{user?.is_master ? 'Master' : 'Admin'}</strong><span className="text-[10px] text-white/60">perfil</span></div>
              </div>
            </div>
          </motion.header>
        )}

        <Tabs value={area} onValueChange={setArea} className={area === 'administracao' ? 'mt-6' : ''}>
          {area === 'administracao' && seletorDeArea}

          <TabsContent value="administracao" className="mt-6">
            <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <h2 className="text-xl font-extrabold text-content-primary">Ferramentas administrativas</h2>
                <p className="mt-0.5 text-sm text-content-secondary">Somente as áreas permitidas para o seu perfil são exibidas.</p>
              </div>
              <label className="relative w-full xl:max-w-sm">
                <span className="sr-only">Buscar ferramenta administrativa</span>
                <LucideIcons.Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-tertiary" />
                <Input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar ferramenta" className="h-10 bg-surface-raised pl-9" />
              </label>
            </div>

            <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filtrar ferramentas por área">
              {GRUPOS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setGrupo(item.id)}
                  aria-pressed={grupo === item.id}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors ${grupo === item.id ? 'border-brand bg-brand text-content-onBrand' : 'border-edge-subtle bg-surface-raised text-content-secondary hover:bg-surface-subtle'}`}
                >
                  {item.rotulo}
                </button>
              ))}
            </div>

            {linksFiltrados.length ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {linksFiltrados.map((link, index) => {
                  const Icon = LucideIcons[link.icon] || LucideIcons.HelpCircle;
                  const quantidadePendente = pendencias[link.to] || 0;
                  return (
                    <motion.div key={link.to} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 8) * 0.035 }}>
                      <Link to={link.to} className={`group flex h-full items-start gap-4 rounded-2xl border bg-surface-raised p-4 shadow-sm transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:shadow-elevation-2 ${quantidadePendente > 0 ? 'border-status-pendingBorder ring-1 ring-status-pendingBorder/40' : 'border-edge-subtle hover:border-brand/35'}`}>
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-subtleBg text-brand"><Icon className="h-5 w-5" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-2">
                            <strong className="block text-sm text-content-primary">{link.title}</strong>
                            {quantidadePendente > 0 && <span className="shrink-0 rounded-full bg-status-pendingBg px-2 py-0.5 text-[10px] font-extrabold tabular-nums text-status-pendingFg">{quantidadePendente} pendente{quantidadePendente === 1 ? '' : 's'}</span>}
                          </span>
                          <small className="mt-1 block leading-relaxed text-content-tertiary">{link.description}</small>
                        </span>
                        <LucideIcons.ChevronRight className="mt-1 h-4 w-4 shrink-0 text-content-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
                      </Link>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-edge-default bg-surface-raised py-12 text-center">
                <LucideIcons.SearchX className="mx-auto h-7 w-7 text-content-tertiary" />
                <p className="mt-2 text-sm font-bold text-content-primary">Nenhuma ferramenta encontrada</p>
                <button type="button" className="mt-1 text-xs font-bold text-brand hover:underline" onClick={() => { setBusca(''); setGrupo('todos'); }}>Limpar busca e filtros</button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="atividade" className="mt-0">
            <UserDashboardPage embedded impactFirst navigationAfterImpact={seletorDeArea} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
};

export default AdminPage;
