import React from 'react';

/**
 * Captura exceções de renderização para que uma falha em uma página não derrube
 * o app inteiro (tela branca). Sem isso, qualquer erro em qualquer componente
 * desmonta toda a árvore React e o usuário fica sem nenhuma informação.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    // Mantém o stack no console para diagnóstico em produção.
    console.error('[ErrorBoundary] Erro ao renderizar:', error, errorInfo?.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;

    if (!error) return this.props.children;

    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <h1 className="text-2xl font-bold">Algo deu errado</h1>
          <p className="text-muted-foreground">
            Não foi possível carregar esta página. Tente novamente ou volte para a página inicial.
          </p>

          {/* Em dev, mostrar a mensagem real acelera o diagnóstico.
              Em produção o stack completo fica apenas no console. */}
          {import.meta.env.DEV && (
            <pre className="text-left text-xs bg-muted p-3 rounded overflow-auto max-h-48 whitespace-pre-wrap">
              {error?.message || String(error)}
            </pre>
          )}

          <div className="flex gap-3 justify-center pt-2">
            <button
              onClick={this.handleReset}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-semibold"
            >
              Tentar novamente
            </button>
            <button
              onClick={() => { window.location.href = '/'; }}
              className="px-4 py-2 rounded-md border font-semibold"
            >
              Ir para o início
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
