import React from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function PublicDetailState({ status, label, backTo, onRetry }) {
  const missing = status === 'missing';
  const failed = status === 'error';
  return (
    <div className="w-full px-4 py-12 text-center" role={failed ? 'alert' : 'status'}>
      <Helmet>
        <title>{missing ? `${label} não disponível` : failed ? `Erro ao carregar ${label.toLowerCase()}` : 'Carregando...'} | Trombone Cidadão</title>
        {missing && <meta name="robots" content="noindex" />}
      </Helmet>
      <h1 className="text-2xl font-bold">
        {missing ? `${label} não disponível` : failed ? `Não foi possível carregar ${label.toLowerCase()}` : 'Carregando...'}
      </h1>
      {(missing || failed) && (
        <>
          <p className="my-4 text-muted-foreground">
            {missing ? 'Este conteúdo não está disponível publicamente.' : 'Ocorreu uma falha ao carregar esta página. Tente novamente.'}
          </p>
          {failed && <Button onClick={onRetry} className="mr-3">Tentar novamente</Button>}
          <Button asChild variant="outline"><Link to={backTo}>Voltar para a lista</Link></Button>
        </>
      )}
    </div>
  );
}
