import { ArrowLeft } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

// O botão de voltar, e o plano B dele.
//
// `navigate(-1)` sozinho falha justamente onde mais se precisa dele: quando a
// página foi aberta direto — link compartilhado, notificação, atalho da tela
// inicial, ou o app restaurado nessa rota. Aí não existe entrada anterior no
// histórico, e o toque não faz nada.
//
// `location.key === 'default'` é como o React Router marca a primeira entrada
// da sessão: não há para onde voltar, então vamos para `paraOnde` — o lugar de
// onde a tela normalmente é alcançada.
//
// POR QUE ISTO SAIU DO PageHeader
//
// A regra nasceu lá dentro, quando só as telas com cabeçalho próprio
// precisavam dela. A tela de uma patrulha compartilhada não tem cabeçalho —
// ela é um card centralizado, com o título dentro — e ficou sem voltar
// nenhum: quem abre pelo link cai numa tela sem saída.
//
// Copiar as quatro linhas para lá teria funcionado até alguém corrigir um lado
// só. Vive aqui, e o PageHeader é o primeiro cliente.

export default function BackButton({ paraOnde = '/', className = '' }) {
  const navigate = useNavigate();
  const location = useLocation();

  const voltar = () => {
    if (location.key === 'default') navigate(paraOnde, { replace: true });
    else navigate(-1);
  };

  return (
    <button
      type="button"
      onClick={voltar}
      aria-label="Voltar"
      className={`shrink-0 w-11 h-11 inline-flex items-center justify-center rounded-full text-content-secondary hover:bg-surface-subtle active:bg-surface-subtleHover transition-colors ${className}`}
    >
      <ArrowLeft size={22} />
    </button>
  );
}
