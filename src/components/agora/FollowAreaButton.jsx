import { useState } from 'react';
import { Bell, BellRing, Loader2, SlidersHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useAreaFollow } from '@/hooks/useCityEvents';
import { PREFERENCIAS, PREFERENCIAS_PADRAO, tiposDaPreferencia } from '@/lib/cityEvents';

// "🔔 Acompanhar esta rua" — a seção 3 do plano.
//
// POR QUE O PRIMEIRO TOQUE NÃO ABRE PREFERÊNCIA NENHUMA
//
// Acompanhar é uma decisão de um segundo: "quero saber o que acontece aqui".
// Abrir sete interruptores nesse momento transforma a decisão em formulário, e
// formulário é o que faz a pessoa desistir do gesto.
//
// Então o primeiro toque liga tudo e pronto. O ajuste fino fica atrás do ícone
// ao lado, para quem já acompanha e quer podar — que é quando a pergunta "você
// quer saber de feira livre?" finalmente faz sentido para quem lê.

const rotuloDaArea = {
  street: 'esta rua',
  neighborhood: 'este bairro',
  city: 'esta cidade',
};

// O QUE CADA ASSINATURA REALMENTE ALCANCA
//
// Tem que bater com `city_event_audience` (migração 206), palavra por palavra.
// Um botão que promete mais do que a consulta entrega produz a pior falha
// possível deste módulo: a pessoa acha que está coberta e perde o aviso.
//
// A da cidade é a mais estreita das três, e não a mais ampla — de propósito.
// Ela pega o que vale para a cidade toda; a falta d'água de um bairro chega a
// quem acompanha AQUELE bairro ou uma rua dele.
const ALCANCE = {
  street: 'Você recebe o que acontecer nesta rua, no bairro dela, e o que valer para a cidade toda.',
  neighborhood: 'Você recebe o que acontecer neste bairro e o que valer para a cidade toda.',
  city: 'Você recebe só o que valer para a cidade inteira. Para saber de um bairro específico, acompanhe o bairro ou a sua rua.',
};

const FollowAreaButton = ({
  areaType,
  areaId,
  cityId,
  nome,
  tamanho = 'default',
  className = '',
}) => {
  const { user } = useAuth();
  const [abrirPreferencias, setAbrirPreferencias] = useState(false);

  const {
    follow, acompanhando, carregando, salvando,
    acompanhar, deixarDeAcompanhar, atualizarPreferencias,
  } = useAreaFollow({ areaType, areaId, cityId });

  if (!user) {
    return (
      <Button asChild variant="outline" size={tamanho} className={`gap-1.5 rounded-full ${className}`}>
        <Link to="/login">
          <Bell className="h-4 w-4" /> Acompanhar
        </Link>
      </Button>
    );
  }

  if (carregando) {
    return (
      <Button variant="outline" size={tamanho} disabled className={`gap-1.5 rounded-full ${className}`}>
        <Loader2 className="h-4 w-4 animate-spin" />
      </Button>
    );
  }

  const preferencias = { ...PREFERENCIAS_PADRAO, ...(follow || {}) };
  const desligadas = PREFERENCIAS.filter((p) => preferencias[p.chave] === false).length;

  return (
    <>
      <div className={`flex items-center gap-2 ${className}`}>
        <Button
          variant={acompanhando ? 'default' : 'outline'}
          size={tamanho}
          disabled={salvando}
          className="gap-1.5 rounded-full"
          onClick={() => (acompanhando ? deixarDeAcompanhar() : acompanhar())}
        >
          {salvando
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : acompanhando ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
          {acompanhando ? 'Acompanhando' : `Acompanhar ${rotuloDaArea[areaType] || ''}`}
        </Button>

        {acompanhando && (
          <Button
            variant="outline"
            size="icon"
            className="relative h-9 w-9 shrink-0 rounded-full"
            aria-label="Escolher quais avisos receber"
            onClick={() => setAbrirPreferencias(true)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {/* Um ponto quando há coisa desligada. Sem ele, quem silenciou
                energia há três meses não tem como lembrar disso ao estranhar
                que "nunca chega aviso de falta de luz". */}
            {desligadas > 0 && (
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-brand ring-2 ring-surface-raised" />
            )}
          </Button>
        )}
      </div>

      <Dialog open={abrirPreferencias} onOpenChange={setAbrirPreferencias}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Avisos de {nome || rotuloDaArea[areaType]}</DialogTitle>
            <DialogDescription>
              {ALCANCE[areaType]} Desligue abaixo o que não interessa.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1">
            {PREFERENCIAS.map((pref) => {
              const ligado = preferencias[pref.chave] !== false;
              const tipos = tiposDaPreferencia(pref.chave);

              return (
                <label
                  key={pref.chave}
                  className="flex cursor-pointer items-center gap-3 rounded-2xl px-2 py-3 transition-colors hover:bg-surface-subtle"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-content-primary">{pref.rotulo}</span>
                    <span className="block text-xs text-content-tertiary">
                      {pref.descricao}
                      {tipos.length > 1 && ` · ${tipos.length} tipos`}
                    </span>
                  </span>
                  <Switch
                    checked={ligado}
                    onCheckedChange={(valor) => atualizarPreferencias({ [pref.chave]: valor })}
                  />
                </label>
              );
            })}
          </div>

          <button
            type="button"
            className="mt-2 w-full rounded-2xl border border-danger/40 px-4 py-2.5 text-sm font-bold text-danger transition-colors hover:bg-danger-subtleBg"
            onClick={async () => {
              const ok = await deixarDeAcompanhar();
              if (ok) setAbrirPreferencias(false);
            }}
          >
            Deixar de acompanhar
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default FollowAreaButton;
