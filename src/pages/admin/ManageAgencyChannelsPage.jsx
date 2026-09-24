import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import {
  PlusCircle, Power, PowerOff, Loader2, CheckCircle2, Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import MunicipalDrawer from '@/components/municipality/MunicipalDrawer';
import MunicipalTable from '@/components/municipality/MunicipalTable';
import { loadMunicipalRows } from '@/lib/municipalTable';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/ui/combobox';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { showAppError, showAppNotice } from '@/lib/appError';
import { CATEGORIAS_BRONCA } from '@/lib/reportCategories';
import {
  estadoDoEnvio,
  listaDeEmails,
  problemasDoCanal,
  categoriasOcupadas,
  periodoPorExtenso,
} from '@/lib/canalDoOrgao';

// Canais do órgão: quem recebe o relatório de cada categoria.
//
// POR QUE CADASTRAR AQUI E ATIVAR EM OUTRO PASSO
//
// O administrador municipal cadastra e ativa suas secretarias. O canal nasce
// desligado para que o e-mail seja conferido antes do primeiro envio.
//
// A TELA MOSTRA O QUE FOI ENVIADO, NÃO SÓ O CADASTRO
//
// Um cadastro sem histórico de entrega é um formulário que promete. O que
// responde "a prefeitura está recebendo?" é a coluna de estado dos envios — e
// especialmente a distinção entre "aceito pelo provedor" e "entregue", porque
// só o segundo virou etapa na linha do tempo das broncas.

const TOM = {
  ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  atencao: 'bg-amber-50 text-amber-700 border-amber-200',
  erro: 'bg-red-50 text-red-700 border-red-200',
  neutro: 'bg-gray-50 text-gray-600 border-gray-200',
};

const vazio = {
  id: null,
  nome: '',
  email: '',
  copias: '',
  reply_to: '',
  categorias: [],
  city_id: '',
};

const CanalForm = ({ aberto, canal, cidades, canaisDaCidade, salvando, onSalvar, onFechar, onAlternar, podeAtivar }) => {
  const [form, setForm] = useState(vazio);

  useEffect(() => {
    if (!aberto) return;
    setForm(canal ? { ...vazio, ...canal } : vazio);
  }, [aberto, canal?.id]);

  const ocupadas = useMemo(
    () => categoriasOcupadas(canaisDaCidade.filter((c) => String(c.city_id) === String(form.city_id)), form.id),
    [canaisDaCidade, form.city_id, form.id]
  );

  const copias = listaDeEmails(form.copias);
  const erros = problemasDoCanal({
    nome: form.nome,
    email: form.email,
    replyTo: form.reply_to,
    copias,
    categorias: form.categorias,
  });
  const semCidade = !form.city_id;

  const alternarCategoria = (id) => {
    setForm((f) => ({
      ...f,
      categorias: f.categorias.includes(id)
        ? f.categorias.filter((c) => c !== id)
        : [...f.categorias, id],
    }));
  };

  return (
    <MunicipalDrawer open={aberto} onClose={onFechar} busy={salvando} title={canal ? canal.nome : 'Nova secretaria'} description="Dados institucionais, categorias e recebimento de relatórios."
      footer={<div className="flex justify-end gap-2"><Button variant="outline" disabled={salvando} onClick={onFechar}>Cancelar</Button><Button disabled={erros.length > 0 || semCidade || salvando} onClick={() => onSalvar({ ...form, copias })}>{salvando ? 'Salvando…' : 'Salvar alterações'}</Button></div>}>
        <div className="space-y-4 py-2">
          {/* Combobox e não `select`: são 5.570 cidades, e um `select` nativo
              obriga a rolar de "Abadia de Goiás" até a sua. A busca do
              Combobox ignora acento (`accentFilter`), então "acail" acha
              "Açailândia". `modal` é necessário por estar dentro de um Dialog:
              sem ele o Popover do Radix disputa o foco com o modal. */}
          <div>
            <Label htmlFor="canal-cidade">Cidade</Label>
            <div className="mt-1">
              <Combobox
                modal
                options={cidades}
                value={form.city_id}
                onChange={(value) => setForm((f) => ({ ...f, city_id: value, categorias: [] }))}
                placeholder="Selecione a cidade…"
                searchPlaceholder="Buscar cidade..."
                notFoundText="Nenhuma cidade encontrada."
                disabled={!!canal}
              />
            </div>
            {canal && (
              <p className="text-xs text-muted-foreground mt-1">
                A cidade não muda depois de criada — as categorias já estão reservadas nela.
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="canal-nome">Nome da secretaria ou órgão</Label>
            <Input
              id="canal-nome"
              value={form.nome}
              maxLength={120}
              placeholder="Secretaria Municipal de Obras"
              onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
            />
          </div>

          <div>
            <Label htmlFor="canal-email">E-mail que recebe o relatório</Label>
            <Input
              id="canal-email"
              type="email"
              value={form.email}
              placeholder="obras@prefeitura.pe.gov.br"
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>

          <div>
            <Label htmlFor="canal-copias">Em cópia (opcional)</Label>
            <textarea
              id="canal-copias"
              value={form.copias}
              rows={2}
              placeholder="gabinete@prefeitura.pe.gov.br, ouvidoria@prefeitura.pe.gov.br"
              onChange={(e) => setForm((f) => ({ ...f, copias: e.target.value }))}
              className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Separe por vírgula ou quebra de linha. É aqui que entram gabinete e ouvidoria
              quando mais de um órgão precisa ver a mesma lista.
            </p>
          </div>

          <div>
            <Label htmlFor="canal-reply">E-mail de resposta</Label>
            <Input
              id="canal-reply"
              type="email"
              value={form.reply_to}
              placeholder="seu@email.com"
              onChange={(e) => setForm((f) => ({ ...f, reply_to: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Quando a secretaria responder "isso é da companhia de água" ou "já está na
              programação", a resposta cai aqui. Precisa ser de alguém que possa registrar a
              etapa na bronca.
            </p>
          </div>

          <div>
            <Label>Categorias sob responsabilidade deste órgão</Label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {CATEGORIAS_BRONCA.map((cat) => {
                const dono = ocupadas.get(cat.id);
                const marcada = form.categorias.includes(cat.id);
                return (
                  <button
                    key={cat.id}
                    type="button"
                    disabled={!!dono || semCidade}
                    onClick={() => alternarCategoria(cat.id)}
                    title={dono ? `Já é de ${dono}` : undefined}
                    className={`text-left text-xs px-3 py-2 rounded-lg border transition-colors ${
                      marcada
                        ? 'bg-tc-red text-white border-tc-red'
                        : 'bg-background border-input text-foreground'
                    } ${dono || semCidade ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <span className="mr-1">{cat.icon}</span>
                    {cat.name}
                    {dono && <span className="block text-[10px] mt-0.5">já é de {dono}</span>}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Cada categoria tem um único responsável por cidade. As que já pertencem a outro
              órgão aparecem desabilitadas.
            </p>
          </div>

          {erros.length > 0 && (
            <ul className="text-xs text-red-600 list-disc pl-4 space-y-0.5">
              {erros.map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}

          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
            <p className="text-xs text-amber-800">
              O recebimento começa <strong>desligado</strong>. Confira o endereço antes de ativá-lo.
            </p>
          </div>
        </div>

        {canal && <section className="mt-5 space-y-3 border-t border-edge-subtle pt-4"><h3 className="font-bold">Recebimento de relatórios</h3><p className="text-sm text-content-secondary">{canal.ativo ? 'Ativado' : 'Desligado'}</p>
          {canal.desativado_motivo && <p className="rounded-xl bg-brand-subtleBg p-3 text-xs text-content-secondary">{canal.desativado_motivo}</p>}
          {podeAtivar && <Button variant="outline" disabled={salvando} onClick={() => onAlternar(canal)}>{canal.ativo ? <PowerOff className="mr-2 h-4 w-4" /> : <Power className="mr-2 h-4 w-4" />}{canal.ativo ? 'Desligar recebimento' : 'Ativar recebimento'}</Button>}
          <p className="text-xs text-content-secondary">Esta ação é aplicada imediatamente, usando o endereço já salvo.</p>
          <h3 className="pt-3 font-bold">Histórico de envios</h3><HistoricoDeEnvios canalId={canal.id} />
        </section>}
    </MunicipalDrawer>
  );
};

const HistoricoDeEnvios = ({ canalId }) => {
  const [envios, setEnvios] = useState(null);

  useEffect(() => {
    let vivo = true;
    supabase
      .rpc('envios_do_canal', { p_canal: canalId, p_limite: 12 })
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) { setEnvios([]); return; }
        setEnvios(data || []);
      });
    return () => { vivo = false; };
  }, [canalId]);

  if (envios === null) {
    return <p className="text-xs text-muted-foreground mt-3">Carregando envios…</p>;
  }
  if (envios.length === 0) {
    return (
      <p className="text-xs text-muted-foreground mt-3">
        Nenhum relatório enviado ainda.
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      {envios.map((e) => {
        const estado = estadoDoEnvio(e.status);
        return (
          <div key={e.id} className="flex items-start justify-between gap-3 text-xs border-t pt-2">
            <div className="min-w-0">
              <p className="font-semibold text-foreground">
                {e.periodo === 'semanal' ? 'Semanal' : 'Mensal'} · {periodoPorExtenso(e.periodo, e.referencia)}
              </p>
              <p className="text-muted-foreground">
                {e.total_broncas} bronca{e.total_broncas === 1 ? '' : 's'}
                {e.etapas_geradas > 0 && ` · ${e.etapas_geradas} marcada${e.etapas_geradas === 1 ? '' : 's'} como encaminhada`}
              </p>
              {e.confirmado_em && (
                <p className="text-emerald-700 flex items-center gap-1 mt-0.5">
                  <CheckCircle2 className="w-3 h-3" />
                  Recebimento confirmado pelo órgão
                  {e.protocolo_informado && ` · protocolo ${e.protocolo_informado}`}
                </p>
              )}
              {e.falha_motivo && (
                <p className="text-red-600 mt-0.5">{e.falha_motivo}</p>
              )}
            </div>
            <span className={`flex-shrink-0 px-2 py-0.5 rounded-full border ${TOM[estado.tom]}`}>
              {estado.rotulo}
            </span>
          </div>
        );
      })}
    </div>
  );
};

const ManageAgencyChannelsPage = () => {
  const { user } = useAuth();

  const [cidadesDoEscopo, setCidadesDoEscopo] = useState([]);
  const [cidadesAdministradas, setCidadesAdministradas] = useState([]);
  const [escopoCarregado, setEscopoCarregado] = useState(false);

  const [canais, setCanais] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [editando, setEditando] = useState(undefined); // undefined = fechado

  const carregar = useCallback(async () => {
    setCarregando(true);
    // Sem filtro de cidade: a policy de select da 222 já devolve só o que este
    // usuário pode gerir. Repetir a regra aqui criaria uma segunda redação dela.
    const { data, error } = await loadMunicipalRows(() => supabase
      .from('orgao_canais')
      .select('*, categorias:orgao_categorias(category_id), cidade:cities(name, states(uf))')
      .eq('canal_triagem', false)
      .order('created_at', { ascending: false }).order('id'));

    if (error) {
      showAppError({ title: 'Erro ao carregar canais', description: error.message, variant: 'destructive' });
      setCanais([]);
    } else {
      setCanais(
        (data || []).map((c) => ({
          ...c,
          categorias: (c.categorias || []).map((x) => x.category_id),
          copias: (c.emails_copia || []).join(', '),
          cidadeNome: c.cidade?.name
            ? `${c.cidade.name}${c.cidade?.states?.uf ? ` - ${c.cidade.states.uf}` : ''}`
            : '—',
        }))
      );
    }
    setCarregando(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Esta tela pertence ao administrador municipal. Admin/master da plataforma
  // analisa cadastros em /admin/prefeituras e não entra na operação da cidade.
  useEffect(() => {
    if (!user?.id) return;
    setEscopoCarregado(false);
    supabase
      .from('prefeitura_membros')
      .select('prefeitura:prefeituras!prefeitura_membros_prefeitura_id_fkey(city_id, nome, cidade:cities(name, states(uf)))')
      .eq('user_id', user.id)
      .eq('papel', 'administrador')
      .eq('ativo', true)
      .then(({ data }) => {
        const managed = (data || [])
          .map((row) => ({
            id: row.prefeitura?.city_id,
            name: row.prefeitura?.cidade?.name,
            uf: row.prefeitura?.cidade?.states?.uf,
          }))
          .filter((city) => city.id && city.name);
        setCidadesDoEscopo(managed);
        setCidadesAdministradas(managed.map((city) => String(city.id)));
        setEscopoCarregado(true);
      });
  }, [user?.id]);

  // `value` como String porque `cities.id` é bigint e chega do PostgREST como
  // string — comparar com número daria sempre falso na seleção.
  const cidades = useMemo(() => {
    return cidadesDoEscopo.map((c) => ({
      value: String(c.id),
      label: `${c.name}${c.uf ? ` - ${c.uf}` : ''}`,
    }));
  }, [cidadesDoEscopo]);

  const podeAtivarCanal = (canal) => cidadesAdministradas.includes(String(canal.city_id));
  const semAcesso = escopoCarregado && cidades.length === 0;

  const salvar = async (form) => {
    setSalvando(true);
    try {
      const campos = {
        city_id: Number(form.city_id),
        nome: form.nome.trim(),
        email: form.email.trim().toLowerCase(),
        emails_copia: form.copias.map((c) => c.toLowerCase()),
        reply_to: form.reply_to.trim().toLowerCase(),
      };

      let canalId = form.id;
      if (canalId) {
        const { error } = await supabase.from('orgao_canais').update(campos).eq('id', canalId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('orgao_canais')
          .insert({ ...campos, criado_por: user.id, ativo: false })
          .select('id')
          .single();
        if (error) throw error;
        canalId = data.id;
      }

      // O mapeamento é reescrito inteiro: apagar e inserir é mais simples que
      // calcular diferença, e a tabela é de 7 linhas no pior caso.
      const { error: delError } = await supabase
        .from('orgao_categorias')
        .delete()
        .eq('canal_id', canalId);
      if (delError) throw delError;

      if (form.categorias.length > 0) {
        const { error: insError } = await supabase
          .from('orgao_categorias')
          .insert(form.categorias.map((category_id) => ({
            canal_id: canalId,
            city_id: Number(form.city_id),
            category_id,
          })));
        if (insError) throw insError;
      }

      showAppNotice({
        title: form.id ? 'Secretaria atualizada' : 'Secretaria cadastrada',
        description: form.id ? undefined : 'Ele começa desligado para você conferir o endereço antes de ativar.',
      });
      setEditando(undefined);
      carregar();
    } catch (error) {
      showAppError({
        title: 'Não foi possível salvar',
        description: error?.message,
        variant: 'destructive',
      });
    } finally {
      setSalvando(false);
    }
  };

  const alternarAtivo = async (canal) => {
    if (salvando) return;
    setSalvando(true);
    try {
      const { data, error } = await supabase.from('orgao_canais').update({ ativo: !canal.ativo }).eq('id', canal.id).select('id').single();
      if (error || !data) throw error || new Error('Não foi possível atualizar esta secretaria.');
      setCanais((items) => items.map((item) => item.id === canal.id ? { ...item, ativo: !canal.ativo } : item));
      setEditando((item) => item?.id === canal.id ? { ...item, ativo: !canal.ativo } : item);
      showAppNotice({ title: canal.ativo ? 'Recebimento desligado' : 'Recebimento ativado' });
    } catch (error) {
      showAppError({ title: 'Não foi possível alterar', description: error.message, variant: 'destructive' });
    } finally { setSalvando(false); }
  };

  if (!escopoCarregado) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-brand" /></div>;
  }

  if (semAcesso) {
    return <div className="page-shell-fluid py-12"><div className="mx-auto max-w-xl rounded-3xl border bg-card p-8 text-center shadow-sm"><Building2 className="mx-auto h-10 w-10 text-muted-foreground" /><h1 className="mt-4 text-2xl font-black">Acesso municipal necessário</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Somente o administrador aprovado da prefeitura pode cadastrar secretarias. Administradores da plataforma fazem a aprovação em seu painel próprio.</p><Button asChild className="mt-5"><Link to="/prefeitura/acesso">Solicitar cadastro</Link></Button></div></div>;
  }

  return (
    <>
      <Helmet>
        <title>Secretarias | Painel da Prefeitura</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="page-shell-fluid py-8">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-red-600">Administração municipal</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight">Secretarias</h1>
            <p className="text-muted-foreground text-sm mt-1 max-w-xl">
              Defina qual secretaria recebe cada categoria de bronca e mantenha os endereços
              institucionais usados nos relatórios oficiais.
            </p>
          </div>
          <Button onClick={() => setEditando(null)}><PlusCircle className="w-4 h-4 mr-2" /> Nova secretaria</Button>
        </div>

        <div className="rounded-xl border bg-muted/40 px-4 py-3 mb-6">
          <p className="text-xs text-muted-foreground leading-relaxed">
            A etapa <strong>“Encaminhada ao órgão”</strong> na linha do tempo da bronca não é
            gravada no envio: ela é gravada quando o provedor de e-mail confirma a entrega na
            caixa do destinatário. Um relatório que voltou não encaminha nada — e derruba o
            recebimento automaticamente.
          </p>
        </div>

        <MunicipalTable title="Secretarias cadastradas" loading={carregando}
          rows={canais.filter((canal) => (statusFilter === 'all' || canal.ativo === (statusFilter === 'active')) && (categoryFilter === 'all' || canal.categorias.includes(categoryFilter)) && (cityFilter === 'all' || String(canal.city_id) === cityFilter))}
          filterKey={statusFilter + categoryFilter + cityFilter} onOpen={setEditando}
          searchPlaceholder="Nome, e-mail, cidade ou categoria"
          searchText={(canal) => [canal.nome, canal.email, canal.cidadeNome, ...canal.categorias.map((id) => CATEGORIAS_BRONCA.find((cat) => cat.id === id)?.name || id)].join(' ')}
          filters={<>
            <label className="text-xs font-semibold text-content-secondary">Situação<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="mt-1 block h-10 rounded-md border border-edge-subtle bg-surface-raised px-3"><option value="all">Todas</option><option value="active">Ativas</option><option value="inactive">Desligadas</option></select></label>
            <label className="text-xs font-semibold text-content-secondary">Categoria<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="mt-1 block h-10 max-w-full rounded-md border border-edge-subtle bg-surface-raised px-3"><option value="all">Todas</option>{CATEGORIAS_BRONCA.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}</select></label>
            {cidades.length > 1 && <label className="text-xs font-semibold text-content-secondary">Cidade<select value={cityFilter} onChange={(event) => setCityFilter(event.target.value)} className="mt-1 block h-10 rounded-md border border-edge-subtle bg-surface-raised px-3"><option value="all">Todas</option>{cidades.map((city) => <option key={city.value} value={city.value}>{city.label}</option>)}</select></label>}
          </>}
          columns={[
            { key: 'nome', label: 'Secretaria', width: '23%', value: (canal) => canal.nome, render: (canal) => <span className="font-bold text-content-primary">{canal.nome}</span> },
            { key: 'email', label: 'E-mail', width: '24%', value: (canal) => canal.email, render: (canal) => <span className="break-all">{canal.email}</span> },
            { key: 'city', label: 'Cidade', value: (canal) => canal.cidadeNome },
            { key: 'categories', label: 'Categorias', value: (canal) => canal.categorias.length, render: (canal) => canal.categorias.length ? canal.categorias.map((id) => CATEGORIAS_BRONCA.find((cat) => cat.id === id)?.name || id).join(', ') : 'Sem categoria' },
            { key: 'status', label: 'Situação', value: (canal) => canal.ativo ? 'Ativa' : 'Desligada', render: (canal) => <span className={`rounded-full px-2 py-1 text-xs font-semibold ${canal.ativo ? 'bg-success-bg text-success-fg' : 'bg-surface-subtle text-content-secondary'}`}>{canal.ativo ? 'Ativa' : 'Desligada'}</span> },
            { key: 'date', label: 'Cadastro', value: (canal) => canal.created_at || '', render: (canal) => canal.created_at ? new Date(canal.created_at).toLocaleDateString('pt-BR') : '—' },
          ]} />

      </div>

      <CanalForm
        aberto={editando !== undefined}
        canal={editando}
        cidades={cidades}
        canaisDaCidade={canais}
        salvando={salvando}
        onSalvar={salvar}
        onAlternar={alternarAtivo}
        podeAtivar={editando ? podeAtivarCanal(editando) : false}
        onFechar={() => setEditando(undefined)}
      />
    </>
  );
};

export default ManageAgencyChannelsPage;
