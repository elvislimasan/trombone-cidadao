import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Loader2, Megaphone } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useCity } from '@/contexts/CityContext';
import { cidadesParaEscolha } from '@/lib/cidadesParaEscolha';
import { CATEGORIAS_BRONCA } from '@/lib/reportCategories';
import {
  DURACAO_MAXIMA_DIAS,
  diasRestantes,
  podePublicarCampanha,
  vigente,
} from '@/lib/campanhas';
import { showAppError, showAppNotice } from '@/lib/appError';

// O editor de campanhas.
//
// POR QUE ELA PRECISA DE UMA TELA, E NÃO DE UM AGENDADOR
//
// Campanha sazonal é a mecânica que mais facilmente vira automação: bastaria uma
// tabela de temas por mês e um cron. E aí ela deixaria de ser editorial — que é
// a única coisa que a §36.14 pede dela.
//
// Escrever a chamada é o trabalho. "Bueiro entupido agora é rua alagada em
// janeiro" é uma frase que alguém que conhece a cidade escreve; nenhuma regra
// gera. Por isso a tela tem um campo de texto grande e nenhum botão de gerar.
//
// A ASSINATURA É OBRIGATÓRIA E É AUTOMÁTICA
//
// `editor_id` recebe quem está publicando, sem opção de escolher outro nome. Uma
// campanha assinada por alguém que não a escreveu é pior que uma sem assinatura.

const entrada =
  'w-full mt-1 text-xs rounded-xl border border-edge-subtle bg-surface-subtle px-3 py-2 text-content-primary placeholder:text-content-tertiary';

const Campo = ({ label, ajuda, children }) => (
  <label className="block">
    <span className="text-2xs font-bold text-content-secondary">{label}</span>
    {children}
    {ajuda && <span className="block text-2xs text-content-tertiary mt-0.5">{ajuda}</span>}
  </label>
);

const hoje = () => new Date().toISOString().slice(0, 10);

const vazia = {
  titulo: '',
  chamada: '',
  corpo: '',
  categoria_id: '',
  inicio: hoje(),
  fim: '',
};

const ManageCampaignsPage = () => {
  const { user } = useAuth();
  const { cities } = useCity();

  const [campanhas, setCampanhas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [cidadeId, setCidadeId] = useState('');
  const [nova, setNova] = useState(vazia);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const { data } = await supabase
      .from('campaigns')
      .select('*, editor:profiles!campaigns_editor_id_fkey(name)')
      .order('inicio', { ascending: false });
    setCampanhas(data || []);
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const publicar = async () => {
    const candidata = { ...nova, editor_id: user?.id || null };
    const check = podePublicarCampanha(candidata);

    if (!check.ok) {
      showAppError({
        title: 'Ainda não dá para publicar',
        description: `Falta: ${check.faltas.join(', ')}.`,
        variant: 'destructive',
      });
      return;
    }

    setSalvando(true);
    const { error } = await supabase.from('campaigns').insert({
      // Sem cidade = campanha nacional. A da cidade sempre vence a nacional na
      // hora de exibir (ver `campanhaVigente`).
      city_id: cidadeId ? Number(cidadeId) : null,
      titulo: nova.titulo.trim(),
      chamada: nova.chamada.trim(),
      corpo: nova.corpo.trim() || null,
      categoria_id: nova.categoria_id || null,
      inicio: nova.inicio,
      fim: nova.fim,
      status: 'publicada',
      editor_id: user?.id || null,
    });
    setSalvando(false);

    if (error) {
      showAppError({ title: 'Erro ao publicar', description: error.message, variant: 'destructive' });
      return;
    }
    setNova(vazia);
    showAppNotice({
      title: 'Campanha no ar',
      description: 'Ela some sozinha quando o período acabar.',
    });
    carregar();
  };

  const encerrar = async (c) => {
    const { error } = await supabase
      .from('campaigns')
      .update({ status: 'encerrada' })
      .eq('id', c.id);
    if (error) {
      showAppError({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }
    carregar();
  };

  return (
    <>
      <Helmet>
        <title>Campanhas — Trombone Cidadão</title>
      </Helmet>

      <div className="max-w-3xl mx-auto px-4 pt-4 pb-24">
        <PageHeader
          titulo="Campanhas"
          subtitulo="Sazonais e editoriais: alguém escreve, assina e define o período"
          paraOnde="/admin"
        />

        <div className="bg-surface-raised border border-edge-subtle rounded-2xl px-4 py-4 space-y-3">
          <p className="text-xs font-bold text-content-primary flex items-center gap-1.5">
            <Megaphone className="w-3.5 h-3.5 text-brand" /> Nova campanha
          </p>

          <Campo label="Cidade" ajuda="Vazio = vale para todo o país; a da cidade sempre aparece na frente.">
            <select
              value={cidadeId}
              onChange={(e) => setCidadeId(e.target.value)}
              className={entrada}
            >
              <option value="">Nacional</option>
              {cidadesParaEscolha(cities).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.rotulo}
                </option>
              ))}
            </select>
          </Campo>

          <Campo label="Título">
            <input
              value={nova.titulo}
              onChange={(e) => setNova((n) => ({ ...n, titulo: e.target.value }))}
              className={entrada}
              maxLength={80}
              placeholder="Antes da chuva"
            />
          </Campo>

          <Campo
            label="Chamada"
            ajuda="A frase que explica por que isto importa agora. É o trabalho da campanha."
          >
            <textarea
              rows={2}
              value={nova.chamada}
              onChange={(e) => setNova((n) => ({ ...n, chamada: e.target.value }))}
              className={`${entrada} resize-none`}
              maxLength={200}
              placeholder="Bueiro entupido agora é rua alagada em janeiro."
            />
          </Campo>

          <Campo label="Texto (opcional)">
            <textarea
              rows={3}
              value={nova.corpo}
              onChange={(e) => setNova((n) => ({ ...n, corpo: e.target.value }))}
              className={`${entrada} resize-none`}
              maxLength={600}
            />
          </Campo>

          <Campo label="Categoria (opcional)">
            <select
              value={nova.categoria_id}
              onChange={(e) => setNova((n) => ({ ...n, categoria_id: e.target.value }))}
              className={entrada}
            >
              <option value="">Sem categoria</option>
              {CATEGORIAS_BRONCA.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Campo>

          <div className="flex gap-3">
            <Campo label="Início">
              <input
                type="date"
                value={nova.inicio}
                onChange={(e) => setNova((n) => ({ ...n, inicio: e.target.value }))}
                className={entrada}
              />
            </Campo>
            <Campo label="Fim" ajuda={`No máximo ${DURACAO_MAXIMA_DIAS} dias.`}>
              <input
                type="date"
                value={nova.fim}
                onChange={(e) => setNova((n) => ({ ...n, fim: e.target.value }))}
                className={entrada}
              />
            </Campo>
          </div>

          <p className="text-2xs text-content-tertiary leading-relaxed">
            A campanha não paga nada a mais. Ela diz o que é útil agora; o útil
            continua valendo o que sempre valeu.
          </p>

          <button
            type="button"
            disabled={salvando}
            onClick={publicar}
            className="text-2xs font-bold text-content-onBrand bg-brand px-3 py-1.5 rounded-full disabled:opacity-50"
          >
            {salvando ? 'Publicando…' : 'Publicar campanha'}
          </button>
        </div>

        {carregando ? (
          <div className="flex items-center gap-2 text-xs text-content-tertiary py-10 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {campanhas.map((c) => {
              const noAr = vigente(c);
              const dias = diasRestantes(c);

              return (
                <li
                  key={c.id}
                  className="bg-surface-raised border border-edge-subtle rounded-2xl px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-content-primary leading-tight">
                        {c.titulo}
                      </p>
                      <p className="text-2xs text-content-tertiary mt-0.5">
                        {c.inicio} a {c.fim} ·{' '}
                        {noAr ? `no ar · ${dias} dias restantes` : c.status}
                        {c.editor?.name ? ` · por ${c.editor.name}` : ''}
                      </p>
                      {c.chamada && (
                        <p className="text-xs text-content-secondary mt-1 leading-relaxed">
                          {c.chamada}
                        </p>
                      )}
                    </div>

                    {c.status === 'publicada' && (
                      <button
                        type="button"
                        onClick={() => encerrar(c)}
                        className="flex-shrink-0 text-2xs font-semibold text-content-tertiary underline underline-offset-2"
                      >
                        Encerrar
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
};

export default ManageCampaignsPage;
