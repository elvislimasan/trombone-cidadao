# Onboarding do embaixador recém-aceito

## Problema

Ao aceitar um convite de embaixador, `AcceptInvitePage.jsx` mostra a tela de sucesso "Bem-vindo, embaixador!" com um único botão que hoje navega para `/` (feed geral) — não para `/embaixador`, onde a ação de moderação realmente acontece. Além disso, na primeira visita ao painel (`AmbassadorPage.jsx`), as 3 abas (Minhas Cidades / Broncas Pendentes / Atualizações Pendentes) aparecem sem qualquer explicação do que cada uma faz.

Resultado: o usuário pode virar embaixador e nunca descobrir que existe um painel de moderação esperando por ele, a não ser que repare no item "Painel Embaixador" no menu (`Header.jsx:221-223`).

## Contexto confirmado no código

- `AcceptInvitePage.jsx:99-104`: botão de sucesso hoje é `onClick={() => navigate('/', { replace: true })}` com texto "Ver feed".
- `AmbassadorPage.jsx:14-15`: `user` vem de `useAuth()`.
- `SupabaseAuthContext.jsx:60-77`: já faz `supabase.from('profiles').select('*')` e faz merge (`{ ...authUser, ...profile }`) em `setUser`. Qualquer coluna nova em `profiles` chega automaticamente em `user.<coluna>` sem precisar alterar esse contexto.
- Padrão de migrations em `profiles`: `alter table` incremental (ex: `118_profiles_city_fk.sql`, `121_create_master_and_ambassadors.sql`) — próxima migration livre é `126` (ou a seguinte, dependendo da ordem de execução junto com o plano de clustering do mapa, que já reservou `126_reports_map_clusters.sql`).

## Design

### 1. Migration — flag de onboarding visto

- Nova coluna `profiles.has_seen_ambassador_onboarding boolean not null default false`.
- Flag por usuário (não por cidade): o tour é sobre a UI do painel em si, e um embaixador de múltiplas cidades vê o mesmo painel — não faz sentido repetir por `ambassador_cities`.

### 2. `AcceptInvitePage.jsx` — CTA aponta para o painel

- Trocar `navigate('/', { replace: true })` por `navigate('/embaixador', { replace: true })`.
- Trocar o texto do botão de "Ver feed" para "Ir para o Painel".

### 3. `AmbassadorPage.jsx` — banner de boas-vindas dismissable

- Renderizado no topo da página, acima das `Tabs`, só quando `user.has_seen_ambassador_onboarding === false`.
- Conteúdo: explica as 3 abas em uma frase cada — "Bem-vindo ao seu painel! Em **Minhas Cidades** você vê onde atua; em **Broncas Pendentes** e **Atualizações Pendentes** você aprova ou rejeita o que chega da sua cidade."
- Botão de fechar (ícone X): dispara `supabase.from('profiles').update({ has_seen_ambassador_onboarding: true }).eq('id', user.id)` e esconde o banner imediatamente (atualização otimista de estado local, sem esperar a resposta do banco antes de sumir visualmente).
- Uma vez fechado, nunca mais aparece — em qualquer dispositivo, já que o flag é persistido no banco.

## Fora de escopo

- Não altera o conteúdo/comportamento das 3 abas existentes.
- Não usa modal bloqueante — o banner é sempre dispensável e não impede o uso do painel.
- Não mexe na Edge Function `accept-ambassador-invite` — só no destino de navegação pós-sucesso, que é client-side.
