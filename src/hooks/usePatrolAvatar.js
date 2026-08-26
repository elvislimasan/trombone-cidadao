import { useMemo } from 'react';

import { useAuth } from '@/contexts/SupabaseAuthContext';
import {
  patrolAvatarComSexoPadrao,
  patrolAvatarSexoDoPerfil,
  readRawPatrolAvatar,
} from '@/lib/patrolAvatarConfig';

// O boneco da pessoa, para quem só precisa MOSTRAR.
//
// POR QUE UM HOOK, E NÃO A LEITURA SOLTA EM CADA TELA
//
// O avatar já aparece na preparação, no mapa e na central de missões, e a regra
// que decide qual boneco é sutil: o storage manda quando existe escolha, o
// perfil dá o palpite quando não existe. Repetida em três lugares, ela ia
// divergir em um deles — e o sintoma seria a pessoa vendo um boneco na missão
// e outro na rua.
//
// O PERFIL CHEGA DEPOIS DA PRIMEIRA PINTURA, E ISSO IMPORTA
//
// O contexto de autenticação busca o perfil no Supabase, com timeout. Uma
// leitura só na montagem — `useState(() => ...)` — congelaria o padrão
// masculino antes de a resposta chegar, e quem tem avatar feminino no cadastro
// ficaria com o boneco errado até tocar na folha de escolha.
//
// Por isso o valor é memorizado pelo SEXO DO PERFIL, e não pelo objeto do
// usuário: ele recalcula exatamente quando essa informação aparece, e não a
// cada atualização de perfil que não muda nada aqui.
export const usePatrolAvatar = () => {
  const { user } = useAuth();
  const sexoDoPerfil = patrolAvatarSexoDoPerfil(user);

  return useMemo(() => {
    try {
      return patrolAvatarComSexoPadrao(readRawPatrolAvatar(window.localStorage), sexoDoPerfil);
    } catch {
      // Storage bloqueado (aba privada, WebView restrito): o padrão do perfil
      // ainda é melhor do que uma tela sem boneco.
      return patrolAvatarComSexoPadrao(null, sexoDoPerfil);
    }
  }, [sexoDoPerfil]);
};

export default usePatrolAvatar;
