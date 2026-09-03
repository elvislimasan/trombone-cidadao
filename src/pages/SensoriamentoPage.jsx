import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Loader2, ShieldAlert } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import {
  RESPOSTAS_DO_CANDIDATO,
  RETENCAO_DIAS,
  SENSORIAMENTO_LIBERADO,
  TERMOS_DO_CONSENTIMENTO,
  candidatosPendentes,
  envioDaConfirmacao,
} from '@/lib/sensoriamento';
import { showAppError, showAppNotice } from '@/lib/appError';

// Consentimento e confirmação do sensoriamento passivo.
//
// POR QUE ESTA TELA EXISTE ANTES DE A FUNCIONALIDADE ESTAR LIBERADA
//
// `SENSORIAMENTO_LIBERADO` é falso: a ANPD recomenda o RIPD antes de iniciar
// tratamento de alto risco (§36.17), e ninguém fez o RIPD ainda. A tela mostra
// isso em vez de esconder.
//
// Ela existe assim mesmo por um motivo prático: o texto do consentimento É o
// artefato que precisa ser revisado juridicamente, e ele não pode ser revisado
// enquanto só existir na cabeça de quem vai escrevê-lo. Aqui ele está redigido,
// versionado e visível — e no dia em que o parecer sair, ligar é mudar uma
// constante.
//
// O TEXTO VEM DE `TERMOS_DO_CONSENTIMENTO`, NÃO DAQUI
//
// Um teste guarda a lista de promessas. Consentimento informado é o que está
// escrito, e é fácil uma refatoração de layout perder uma linha sem ninguém
// notar que perdeu.
//
// A VERSÃO DO TERMO IMPORTA
//
// Consentimento vale para o tratamento descrito num texto específico. Se o texto
// mudar, o "sim" anterior não vale para o novo escopo — por isso a versão vai
// gravada, e mudá-la exige pedir de novo.

/** Muda quando o texto mudar. Consentimento antigo não cobre escopo novo. */
const VERSAO_TERMOS = '2026-08-30';

const Bloco = ({ titulo, itens, tom = 'neutro' }) => (
  <div
    className={`rounded-xl px-3 py-2.5 ${
      tom === 'limite' ? 'bg-surface-subtle' : 'bg-surface-subtle'
    }`}
  >
    <p className="text-2xs font-bold text-content-primary">{titulo}</p>
    <ul className="mt-1 space-y-0.5">
      {itens.map((t) => (
        <li key={t} className="text-2xs text-content-secondary leading-relaxed">
          · {t}
        </li>
      ))}
    </ul>
  </div>
);

const SensoriamentoPage = () => {
  const { user } = useAuth();
  const [consentimento, setConsentimento] = useState(null);
  const [candidatos, setCandidatos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [agindo, setAgindo] = useState(false);

  const carregar = useCallback(async () => {
    if (!user) {
      setCarregando(false);
      return;
    }
    setCarregando(true);

    const [c, cand] = await Promise.all([
      supabase
        .from('sensing_consent')
        .select('*')
        .eq('user_id', user.id)
        .is('revogado_em', null)
        .order('aceito_em', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('sensing_candidates')
        .select('*')
        .eq('user_id', user.id)
        .is('confirmado_em', null)
        .order('ocorreu_em', { ascending: false }),
    ]);

    setConsentimento(c.data || null);
    setCandidatos(candidatosPendentes(cand.data || []));
    setCarregando(false);
  }, [user]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Consentimento de versão antiga não vale para o texto atual.
  const ativo = !!consentimento && consentimento.versao_termos === VERSAO_TERMOS;

  const aceitar = async () => {
    setAgindo(true);
    const { error } = await supabase.from('sensing_consent').insert({
      user_id: user.id,
      versao_termos: VERSAO_TERMOS,
    });
    setAgindo(false);
    if (error) {
      showAppError({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }
    carregar();
  };

  const revogar = async () => {
    setAgindo(true);
    const { error } = await supabase
      .from('sensing_consent')
      .update({ revogado_em: new Date().toISOString() })
      .eq('id', consentimento.id);
    setAgindo(false);
    if (error) {
      showAppError({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }
    showAppNotice({
      title: 'Desligado',
      description: 'Os pontos que você ainda não confirmou foram apagados.',
    });
    carregar();
  };

  const responder = async (candidato, respostaId) => {
    const envio = envioDaConfirmacao({ respostaId, candidato });
    if (!envio) return;

    setAgindo(true);
    const { error } = await supabase
      .from('sensing_candidates')
      .update({
        resposta: envio.confirmacao.resposta,
        confirmado_em: envio.confirmacao.confirmado_em,
      })
      .eq('id', candidato.id);
    setAgindo(false);

    if (error) {
      showAppError({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }

    setCandidatos((atuais) => atuais.filter((c) => c.id !== candidato.id));

    // Rascunho, não bronca: quem cadastra é a pessoa, com foto e no local.
    if (envio.rascunhoDeBronca) {
      showAppNotice({
        title: 'Anotado',
        description:
          'Quando passar por lá de novo, registre a bronca com foto — só assim ela entra no mapa.',
      });
    }
  };

  return (
    <>
      <Helmet>
        <title>Sensoriamento passivo — Trombone Cidadão</title>
      </Helmet>

      <div className="mx-auto w-full max-w-2xl px-4 pt-4 pb-24 lg:max-w-6xl lg:px-8 lg:pt-8 lg:pb-12">
        <PageHeader
          titulo="Detectar solavancos"
          subtitulo="Opcional, durante a patrulha, e nada é publicado sem você confirmar"
          paraOnde="/preferencias"
        />

        {!SENSORIAMENTO_LIBERADO && (
          <div className="rounded-2xl bg-status-pendingBg px-4 py-3 mb-3">
            <p className="text-xs font-bold text-status-pendingFg flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5" />
              Ainda não disponível
            </p>
            <p className="text-2xs text-status-pendingFg/90 mt-1 leading-relaxed">
              Esta função trata dado de localização e só será ligada depois da
              avaliação de impacto à proteção de dados (RIPD) e do parecer do
              encarregado. O texto abaixo é o que você aceitaria — está aqui para
              ser lido e revisado antes, não depois.
            </p>
          </div>
        )}

        {carregando ? (
          <div className="flex items-center gap-2 text-xs text-content-tertiary py-10 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-2 rounded-2xl border border-edge-subtle bg-surface-raised px-4 py-4 lg:grid-cols-2 lg:gap-5">
              <Bloco titulo="O que é coletado" itens={TERMOS_DO_CONSENTIMENTO.oQueColeta} />
              <Bloco
                titulo="O que nunca é coletado"
                itens={TERMOS_DO_CONSENTIMENTO.limite}
                tom="limite"
              />
              <Bloco titulo="O que acontece depois" itens={TERMOS_DO_CONSENTIMENTO.oQueAcontece} />
              <Bloco titulo="Como desligar" itens={TERMOS_DO_CONSENTIMENTO.comoSair} />

              <div className="pt-1 lg:col-span-2">
                {ativo ? (
                  <button
                    type="button"
                    disabled={agindo}
                    onClick={revogar}
                    className="text-2xs font-bold text-danger-subtleFg bg-danger-subtleBg px-3 py-1.5 rounded-full disabled:opacity-50"
                  >
                    Desligar e apagar os pontos pendentes
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={agindo || !SENSORIAMENTO_LIBERADO || !user}
                    onClick={aceitar}
                    className="text-2xs font-bold text-content-onBrand bg-brand px-3 py-1.5 rounded-full disabled:opacity-40"
                  >
                    {SENSORIAMENTO_LIBERADO ? 'Aceitar e ligar' : 'Indisponível por enquanto'}
                  </button>
                )}
              </div>
            </div>

            {candidatos.length > 0 && (
              <div className="bg-surface-raised border border-edge-subtle rounded-2xl px-4 py-4">
                <p className="text-xs font-bold text-content-primary">
                  {candidatos.length} ponto{candidatos.length > 1 ? 's' : ''} para você
                  confirmar
                </p>
                <p className="text-2xs text-content-tertiary mt-0.5 leading-relaxed">
                  Some{candidatos.length > 1 ? 'm' : ''} em até {RETENCAO_DIAS} dias
                  se você não responder. Nada disso está publicado.
                </p>

                <ul className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {candidatos.map((c) => (
                    <li key={c.id} className="rounded-xl bg-surface-subtle px-3 py-2.5">
                      <p className="text-2xs text-content-tertiary">
                        {new Date(c.ocorreu_em).toLocaleString('pt-BR')} · perto de{' '}
                        {c.lat}, {c.lng}
                      </p>
                      {/* Pergunta cega e aberta: "o que havia aqui?", nunca
                          "era um buraco?" — a segunda forma colhe concordância
                          com o palpite do acelerômetro. */}
                      <p className="text-xs font-bold text-content-primary mt-1">
                        O que havia aqui?
                      </p>

                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {RESPOSTAS_DO_CANDIDATO.map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            disabled={agindo}
                            onClick={() => responder(c, r.id)}
                            className="text-2xs font-semibold px-3 py-1.5 rounded-full border border-edge-subtle bg-surface-raised text-content-secondary disabled:opacity-50"
                          >
                            {r.rotulo}
                          </button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default SensoriamentoPage;
