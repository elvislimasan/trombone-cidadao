import { useState } from 'react';
import { CheckCircle2, Clock, MessageSquarePlus, Pencil, RotateCcw, XOctagon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PRECISAO_PREVISAO, estadoDaPrevisao, estaAberto, instanteDaPrevisao, precisaoDoEvento, previsaoLegivel } from '@/lib/cityEvents';

// O painel de quem responde pelo acontecimento.
//
// A PERGUNTA VEM ANTES DOS BOTÕES
//
// As seções 12 a 14 do plano descrevem uma decisão binária — "o problema já foi
// resolvido? [Sim] [Ainda não]" — e não um menu de operações. Quando a previsão
// vence, é essa pergunta que aparece primeiro e ocupa a largura toda; prorrogar
// e resolver são as duas respostas dela, não dois itens de uma lista.
//
// O resto (atualizar, editar, cancelar) fica abaixo, em botões menores. São
// ações que existem sempre e que ninguém precisa ser cobrado a fazer.

const agoraMais = (horas) => {
  const d = new Date(Date.now() + horas * 3600000);
  return {
    data: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    hora: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
  };
};

const CityEventManageBar = ({ evento, acoes, aoEditar }) => {
  const [modal, setModal] = useState(null); // 'prorrogar' | 'resolver' | 'atualizar' | 'reabrir' | 'cancelar'
  const [mensagem, setMensagem] = useState('');
  const [avisar, setAvisar] = useState(false);

  const inicial = agoraMais(2);
  const [dataPrevisao, setDataPrevisao] = useState(inicial.data);
  const [horaPrevisao, setHoraPrevisao] = useState(inicial.hora);
  // Prorrogar e onde "so sei o dia" e "nao sei quando" mais aparecem: a
  // segunda previsao quase sempre vem como "agora so amanha" — ou sem data.
  const [precisao, setPrecisao] = useState(precisaoDoEvento(evento) === 'nenhuma' ? 'hora' : precisaoDoEvento(evento));

  const previsao = estadoDaPrevisao(evento);
  const aberto = estaAberto(evento);
  const precisaVerificar = aberto && (previsao.vencida || evento.status === 'awaiting_confirmation');

  const fechar = () => { setModal(null); setMensagem(''); setAvisar(false); };

  const confirmar = async () => {
    const { instante: nova, soDia } = instanteDaPrevisao({ precisao, data: dataPrevisao, hora: horaPrevisao });
    let ok = false;

    if (modal === 'prorrogar') ok = await acoes.prorrogar(evento.id, nova, mensagem, soDia);
    if (modal === 'resolver') ok = await acoes.resolver(evento.id, mensagem);
    if (modal === 'atualizar') ok = await acoes.adicionarAtualizacao(evento.id, mensagem, avisar);
    if (modal === 'reabrir') ok = await acoes.reabrir(evento.id, nova, mensagem);
    if (modal === 'cancelar') ok = await acoes.cancelar(evento.id, mensagem);

    if (ok) fechar();
  };

  const CAMPOS_DE_PREVISAO = modal === 'prorrogar' || modal === 'reabrir';

  const TEXTOS = {
    prorrogar: {
      titulo: 'Ainda não normalizou',
      descricao: 'Informe a nova previsão — ou diga que ainda não há. Quem acompanha recebe o aviso.',
      acao: 'Prorrogar',
      exemplo: 'O reparo exigiu intervenção adicional.',
    },
    resolver: {
      titulo: 'Sim, normalizou',
      descricao: 'O acontecimento é encerrado e a comunidade passa a poder confirmar se voltou na rua dela.',
      acao: 'Marcar como normalizado',
      exemplo: 'Abastecimento restabelecido em toda a área afetada.',
    },
    atualizar: {
      titulo: 'Nova atualização',
      descricao: 'Entra na linha do tempo. O aviso por notificação é opcional.',
      acao: 'Publicar atualização',
      exemplo: 'Equipe segue trabalhando no reparo.',
    },
    reabrir: {
      titulo: 'Reabrir acontecimento',
      descricao: 'Volta ao ar e a enquete da comunidade recomeça. As respostas anteriores ficam guardadas.',
      acao: 'Reabrir',
      exemplo: 'A normalização não se confirmou em parte da área.',
    },
    cancelar: {
      titulo: 'Cancelar acontecimento',
      descricao: 'Quem foi avisado recebe o cancelamento. A história não é apagada.',
      acao: 'Cancelar acontecimento',
      exemplo: 'Alerta publicado por engano.',
    },
  };

  const texto = TEXTOS[modal] || {};

  return (
    <>
      <section className="overflow-hidden rounded-3xl border border-edge-subtle bg-surface-raised shadow-elevation-1">
        {precisaVerificar && (
          <div className="border-b border-edge-subtle bg-status-pendingBg p-4 sm:p-5">
            <p className="text-sm font-extrabold text-status-pendingFg">
              A previsão {previsao.tem ? `de ${previsaoLegivel(previsao.quando)} ` : ''}terminou
            </p>
            <p className="mt-0.5 text-sm text-status-pendingFg/80">O problema já foi resolvido?</p>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Button className="flex-1 gap-2" onClick={() => setModal('resolver')}>
                <CheckCircle2 className="h-4 w-4" /> Sim, normalizou
              </Button>
              <Button variant="outline" className="flex-1 gap-2 bg-surface-raised" onClick={() => setModal('prorrogar')}>
                <Clock className="h-4 w-4" /> Ainda não
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 p-4 sm:p-5">
          {aberto && !precisaVerificar && (
            <>
              <Button size="sm" className="gap-1.5" onClick={() => setModal('resolver')}>
                <CheckCircle2 className="h-4 w-4" /> Marcar normalizado
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setModal('prorrogar')}>
                <Clock className="h-4 w-4" /> Nova previsão
              </Button>
            </>
          )}

          {aberto && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setModal('atualizar')}>
              <MessageSquarePlus className="h-4 w-4" /> Atualização
            </Button>
          )}

          {evento.status === 'resolved' && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setModal('reabrir')}>
              <RotateCcw className="h-4 w-4" /> Reabrir
            </Button>
          )}

          {aoEditar && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={aoEditar}>
              <Pencil className="h-4 w-4" /> Editar
            </Button>
          )}

          {evento.status !== 'cancelled' && (
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-danger hover:bg-danger-subtleBg hover:text-danger"
              onClick={() => setModal('cancelar')}
            >
              <XOctagon className="h-4 w-4" /> Cancelar
            </Button>
          )}
        </div>
      </section>

      <Dialog open={Boolean(modal)} onOpenChange={(v) => !v && fechar()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{texto.titulo}</DialogTitle>
            <DialogDescription>{texto.descricao}</DialogDescription>
          </DialogHeader>

          {CAMPOS_DE_PREVISAO && (
            <div className="space-y-1.5">
              <Label className="text-sm font-bold">
                Nova previsão {modal === 'reabrir' && <span className="font-normal text-content-tertiary">(opcional)</span>}
              </Label>
              {/* "SEM PREVISÃO" É A RESPOSTA CERTA COM MAIS FREQUÊNCIA DO QUE
                  SE GOSTARIA
                  A previsão venceu, o responsável abre o aviso e muitas vezes
                  não sabe quando termina. Sem esta opção, as saídas eram
                  inventar um horário ou não responder — e o horário inventado é
                  pior: vence de novo, cobra de novo, e a cidade lê uma promessa
                  que ninguém fez. */}
              <div className="flex gap-1 rounded-2xl bg-surface-sunken p-1">
                {PRECISAO_PREVISAO.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPrecisao(p.id)}
                    className={`flex-1 rounded-xl px-2 py-2 text-xs font-bold transition-colors ${
                      precisao === p.id
                        ? 'bg-surface-raised text-content-primary shadow-elevation-1'
                        : 'text-content-tertiary'
                    }`}
                  >
                    {p.rotulo}
                  </button>
                ))}
              </div>

              {precisao !== 'nenhuma' && (
                <div className="flex gap-2 pt-1">
                  <Input type="date" value={dataPrevisao} onChange={(e) => setDataPrevisao(e.target.value)} className="flex-1" />
                  {precisao === 'hora' && (
                    <Input type="time" value={horaPrevisao} onChange={(e) => setHoraPrevisao(e.target.value)} className="w-28" />
                  )}
                </div>
              )}

              {precisao === 'nenhuma' && modal === 'prorrogar' && (
                <p className="pt-1 text-xs text-content-tertiary">
                  O alerta continua ativo e quem acompanha é avisado de que ainda não há previsão.
                  Depois de um dia sem novidade, o sistema pergunta a você de novo.
                </p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-sm font-bold">
              Atualização {modal !== 'atualizar' && <span className="font-normal text-content-tertiary">(opcional)</span>}
            </Label>
            <Textarea
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              placeholder={texto.exemplo}
              rows={3}
            />
          </div>

          {modal === 'atualizar' && (
            <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-edge-subtle bg-surface-subtle px-4 py-3">
              <Checkbox checked={avisar} onCheckedChange={(v) => setAvisar(v === true)} />
              <span className="min-w-0 text-sm text-content-secondary">
                <span className="block font-semibold text-content-primary">Notificar quem acompanha</span>
                {/* O padrão é NÃO notificar. "Equipe segue trabalhando" três
                    vezes num dia é o que faz a pessoa desligar o alerta e
                    perder o que importava. */}
                Use quando a atualização mudar o que a pessoa precisa fazer.
              </span>
            </label>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={fechar}>Voltar</Button>
            <Button
              className="flex-1"
              disabled={acoes.salvando || (modal === 'atualizar' && !mensagem.trim()) || (modal === 'prorrogar' && precisao !== 'nenhuma' && !dataPrevisao)}
              onClick={confirmar}
            >
              {texto.acao}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CityEventManageBar;
