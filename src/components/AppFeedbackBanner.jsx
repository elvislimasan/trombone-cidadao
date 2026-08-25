import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { APP_FEEDBACK_EVENT } from '@/lib/appError';

/**
 * Card do fluxo atual. Ele ocupa espaço no layout e nunca cobre a barra
 * inferior. Confirmações fecham sozinhas; erros ficam até serem lidos.
 */
export default function AppFeedbackBanner() {
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    const handleFeedback = (event) => setFeedback(event.detail || null);
    window.addEventListener(APP_FEEDBACK_EVENT, handleFeedback);
    return () => window.removeEventListener(APP_FEEDBACK_EVENT, handleFeedback);
  }, []);

  useEffect(() => {
    if (!feedback || feedback.kind === 'error') return undefined;

    const timer = window.setTimeout(() => {
      setFeedback((current) => current?.id === feedback.id ? null : current);
    }, 6500);

    return () => window.clearTimeout(timer);
  }, [feedback]);

  if (!feedback) return null;

  const isError = feedback.kind === 'error';
  const isSuccess = feedback.kind === 'success';
  const Icon = isError ? AlertTriangle : isSuccess ? CheckCircle2 : Info;
  const feedbackClassName = isError
    ? 'pointer-events-auto mx-auto max-w-2xl bg-surface-overlay shadow-elevation-2 pr-12'
    : isSuccess
      ? 'pointer-events-auto mx-auto max-w-2xl border-success-border bg-success-bg text-success-fg shadow-elevation-2 pr-12 [&>svg]:text-success-fg'
      : 'pointer-events-auto mx-auto max-w-2xl border-status-pendingBorder bg-status-pendingBg text-status-pendingFg shadow-elevation-2 pr-12 [&>svg]:text-status-pendingFg';

  return (
    <div className="sticky top-0 z-[4000] w-full px-3 pt-3 pointer-events-none">
      <Alert
        variant={isError ? 'destructive' : 'default'}
        role={isError ? 'alert' : 'status'}
        className={feedbackClassName}
      >
        <Icon className="h-4 w-4" />
        <AlertTitle>{feedback.title}</AlertTitle>
        {feedback.description ? (
          <AlertDescription>{feedback.description}</AlertDescription>
        ) : null}
        <button
          type="button"
          onClick={() => setFeedback(null)}
          className="absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/5"
          aria-label="Fechar mensagem"
        >
          <X size={18} />
        </button>
      </Alert>
    </div>
  );
}
