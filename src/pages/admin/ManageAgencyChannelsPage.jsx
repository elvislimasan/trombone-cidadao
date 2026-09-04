import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import {
  ArrowLeft, PlusCircle, Mail, Power, PowerOff, Send, Loader2, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, FormDialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/ui/combobox';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useCity } from '@/contexts/CityContext';
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
// O embaixador é quem conhece a prefeitura e é quem tem o endereço certo. Mas o
// custo de errar o endereço não recai sobre a cidade dele: um e-mail errado faz
// o app mandar dezenas de broncas para o lugar errado e, quando a entrega for
// confirmada, gravar "encaminhada" numa tabela que não tem delete (207). Por
// isso o canal nasce inativo e só um admin liga — a regra está no gatilho
// `orgao_canal_so_admin_ativa` da 222, e este botão só reflete o que o banco já
// recusa.
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

const CanalForm = ({ aberto, canal, cidades, canaisDaCidade, salvando, onSalvar, onFechar }) => {
  const [form, setForm] = useState(vazio);

  useEffect(() => {
    if (!aberto) return;
    setForm(canal ? { ...vazio, ...canal } : vazio);
  }, [aberto, canal]);

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
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <FormDialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{canal ? 'Editar canal' : 'Novo canal do órgão'}</DialogTitle>
        </DialogHeader>

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
            <Label htmlFor="canal-nome">Nome do órgão</Label>
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
              O canal é salvo <strong>desligado</strong>. Nenhum e-mail sai antes de um
              administrador conferir o endereço e ativá-lo.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button
            disabled={erros.length > 0 || semCidade || salvando}
            onClick={() => onSalvar({ ...form, copias })}
          >
            {salvando ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </FormDialogContent>
    </Dialog>
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
  const podeAtivar = !!user && (user.is_admin || user.is_master);
  const escopoEmbaixador = !!user && !user.is_admin && !user.is_master && !!user.is_ambassador;

  // A lista completa vem do CityContext, que já a carrega paginada de 1000 em
  // 1000. Buscar `cities` aqui com um `.order('name')` simples devolveria só as
  // primeiras 1000 linhas — o limite padrão do PostgREST — e cidades do "D" em
  // diante sumiriam do cadastro sem nenhum erro aparecer.
  const { cities: todasAsCidades } = useCity();
  const [cidadesDoEmbaixador, setCidadesDoEmbaixador] = useState([]);

  const [canais, setCanais] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [gerando, setGerando] = useState(null);
  const [editando, setEditando] = useState(undefined); // undefined = fechado

  const carregar = useCallback(async () => {
    setCarregando(true);
    // Sem filtro de cidade: a policy de select da 222 já devolve só o que este
    // usuário pode gerir. Repetir a regra aqui criaria uma segunda redação dela.
    const { data, error } = await supabase
      .from('orgao_canais')
      .select('*, categorias:orgao_categorias(category_id), cidade:cities(name, states(uf))')
      .order('created_at', { ascending: false });

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

  // O embaixador só pode cadastrar canal nas cidades dele, e essa lista é curta
  // — vale a consulta própria. Admin e master usam a lista inteira do contexto.
  useEffect(() => {
    if (!escopoEmbaixador || !user?.id) return;
    supabase
      .from('ambassador_cities')
      .select('city_id, cities(id, name, states(uf))')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .then(({ data }) => {
        setCidadesDoEmbaixador((data || [])
          .map((r) => ({ id: r.city_id, name: r.cities?.name, uf: r.cities?.states?.uf }))
          .filter((c) => c.name));
      });
  }, [escopoEmbaixador, user?.id]);

  // `value` como String porque `cities.id` é bigint e chega do PostgREST como
  // string — comparar com número daria sempre falso na seleção.
  const cidades = useMemo(() => {
    const base = escopoEmbaixador
      ? cidadesDoEmbaixador
      : (todasAsCidades || []).map((c) => ({ id: c.id, name: c.name, uf: c.state?.uf }));
    return base.map((c) => ({
      value: String(c.id),
      label: `${c.name}${c.uf ? ` - ${c.uf}` : ''}`,
    }));
  }, [escopoEmbaixador, cidadesDoEmbaixador, todasAsCidades]);

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
        title: form.id ? 'Canal atualizado' : 'Canal cadastrado',
        description: form.id ? undefined : 'Ele começa desligado — um administrador precisa ativar.',
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
    const { error } = await supabase
      .from('orgao_canais')
      .update({ ativo: !canal.ativo })
      .eq('id', canal.id);
    if (error) {
      showAppError({ title: 'Não foi possível alterar', description: error.message, variant: 'destructive' });
      return;
    }
    showAppNotice({
      title: canal.ativo ? 'Canal desligado' : 'Canal ativado',
      description: canal.ativo
        ? 'Nenhum relatório novo será enviado para este endereço.'
        : 'O próximo relatório do período já sai para este endereço.',
    });
    carregar();
  };

  const gerarAgora = async (periodo) => {
    setGerando(periodo);
    try {
      const { data, error } = await supabase.rpc('enviar_relatorios_do_orgao', { p_periodo: periodo });
      if (error) throw error;
      showAppNotice({
        title: data > 0 ? `${data} relatório(s) na fila` : 'Nada novo para enviar',
        description: data > 0
          ? 'O envio acontece em segundos. Recarregue para ver o estado.'
          : 'Ou o período já foi enviado, ou nenhum canal ativo tem bronca pendente.',
      });
    } catch (error) {
      showAppError({ title: 'Falha ao gerar', description: error?.message, variant: 'destructive' });
    } finally {
      setGerando(null);
    }
  };

  return (
    <>
      <Helmet>
        <title>Canais do órgão - Trombone Cidadão</title>
      </Helmet>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Link to="/admin" className="inline-flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <ArrowLeft className="w-4 h-4" /> Voltar ao painel
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
          <div>
            <h1 className="text-3xl font-bold text-tc-red">Canais do órgão</h1>
            <p className="text-muted-foreground text-sm mt-1 max-w-xl">
              Um e-mail por secretaria e as categorias que ela responde. Toda segunda sai o
              relatório do que aquela secretaria ainda não recebeu; no dia 1º, o de tudo que
              continua aberto.
            </p>
          </div>
          <Button onClick={() => setEditando(null)}>
            <PlusCircle className="w-4 h-4 mr-2" /> Novo canal
          </Button>
        </div>

        <div className="rounded-xl border bg-muted/40 px-4 py-3 mb-6">
          <p className="text-xs text-muted-foreground leading-relaxed">
            A etapa <strong>“Encaminhada ao órgão”</strong> na linha do tempo da bronca não é
            gravada no envio: ela é gravada quando o provedor de e-mail confirma a entrega na
            caixa do destinatário. Um relatório que voltou não encaminha nada — e derruba o
            canal automaticamente.
          </p>
          {podeAtivar && (
            <div className="flex flex-wrap gap-2 mt-3">
              <Button size="sm" variant="outline" disabled={!!gerando} onClick={() => gerarAgora('semanal')}>
                {gerando === 'semanal'
                  ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  : <Send className="w-3.5 h-3.5 mr-1.5" />}
                Gerar semanal agora
              </Button>
              <Button size="sm" variant="outline" disabled={!!gerando} onClick={() => gerarAgora('mensal')}>
                {gerando === 'mensal'
                  ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  : <Send className="w-3.5 h-3.5 mr-1.5" />}
                Gerar mensal agora
              </Button>
              <span className="text-[11px] text-muted-foreground self-center">
                Gerar duas vezes o mesmo período não manda o e-mail duas vezes.
              </span>
            </div>
          )}
        </div>

        {carregando && <p className="text-sm text-muted-foreground">Carregando…</p>}

        {!carregando && canais.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center">
              <Mail className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                Nenhum canal cadastrado ainda. Enquanto não houver, o encaminhamento continua
                sendo registrado à mão dentro de cada bronca.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="space-y-4">
          {canais.map((canal) => (
            <Card key={canal.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-lg">{canal.nome}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {canal.cidadeNome} · {canal.email}
                    </p>
                    {canal.emails_copia?.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Em cópia: {canal.emails_copia.join(', ')}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Respostas vão para {canal.reply_to}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded-full border ${canal.ativo ? TOM.ok : TOM.neutro}`}>
                      {canal.ativo ? 'Ativo' : 'Desligado'}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => setEditando(canal)}>
                      Editar
                    </Button>
                    {podeAtivar && (
                      <Button
                        variant={canal.ativo ? 'outline' : 'default'}
                        size="sm"
                        onClick={() => alternarAtivo(canal)}
                      >
                        {canal.ativo
                          ? <><PowerOff className="w-3.5 h-3.5 mr-1.5" /> Desligar</>
                          : <><Power className="w-3.5 h-3.5 mr-1.5" /> Ativar</>}
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-1.5">
                  {canal.categorias.length === 0 && (
                    <span className="text-xs text-red-600">
                      Sem categoria — este canal nunca receberá nada.
                    </span>
                  )}
                  {canal.categorias.map((id) => {
                    const cat = CATEGORIAS_BRONCA.find((c) => c.id === id);
                    return (
                      <span key={id} className="text-xs px-2 py-1 rounded-full bg-muted">
                        {cat ? `${cat.icon} ${cat.name}` : id}
                      </span>
                    );
                  })}
                </div>

                {canal.desativado_motivo && (
                  <div className="mt-3 flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <span>Desligado automaticamente: {canal.desativado_motivo}</span>
                  </div>
                )}

                {!podeAtivar && !canal.ativo && !canal.desativado_motivo && (
                  <p className="text-xs text-amber-700 mt-3">
                    Aguardando um administrador conferir o endereço e ativar.
                  </p>
                )}

                {podeAtivar && <HistoricoDeEnvios canalId={canal.id} />}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <CanalForm
        aberto={editando !== undefined}
        canal={editando}
        cidades={cidades}
        canaisDaCidade={canais}
        salvando={salvando}
        onSalvar={salvar}
        onFechar={() => setEditando(undefined)}
      />
    </>
  );
};

export default ManageAgencyChannelsPage;
