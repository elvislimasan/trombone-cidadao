# Hierarquia Master → Admin → Embaixador

## Problema

O sistema de papéis hoje é 3 booleans independentes (`is_admin`, `is_master`, `is_ambassador`) combinados de forma ad-hoc em cada tela/policy, sem uma hierarquia declarada centralmente. Isso produziu inconsistências reais, confirmadas por inspeção do código e do banco DEV:

1. **Master é inoperante para moderação.** Nenhuma policy de RLS em `reports`/`report_updates` referencia `is_master` — todas usam só `is_admin(auth.uid())` ou `is_ambassador_of(...)`. O helper `can_moderate_report()` (criado em `121_create_master_and_ambassadors.sql`, documentado como "usado nas RLS") existe no banco mas não é chamado por nenhuma policy real. Confirmado via inspeção direta: `select polname, polcmd, pg_get_expr(polqual, polrelid) from pg_policy where polrelid = 'public.reports'::regclass` não retorna nenhuma referência a `is_master`.
2. **Rota `/admin/embaixadores` exige `is_admin`**, mas o guard interno do componente checa `is_master || is_admin` — um master sem `is_admin` é barrado pela rota antes de chegar ao componente.
3. **`AmbassadorPage.jsx`** (tela de moderação) só busca `ambassador_cities` do próprio usuário — um master/admin sem linha nessa tabela não vê nenhuma pendência, mesmo que devesse poder moderar tudo.
4. **`get_invite_preview`** (RPC chamada por `AcceptInvitePage.jsx` para mostrar o preview do convite) **não existe no banco** — confirmado via `pg_proc`/`pg_namespace`, zero resultados. É a causa do erro "Convite inválido, expirado ou já utilizado" visto pelo usuário ao testar um link de convite real.
5. Nenhum caminho no app para criar o primeiro master (não há seed nem tela) — **decisão do usuário: isso é intencional**, master é setado manualmente no banco por ele.
6. Texto desatualizado em `AdminPage.jsx` menciona "promoções de masters", funcionalidade já removida.

## Decisões (travadas pelo usuário)

- **Hierarquia:** Master (topo) → Admin → Embaixador. Não é mutuamente exclusivo — um usuário pode acumular papéis (ex: Admin também ser Embaixador de uma cidade), mas o alcance de moderação de cada tela reflete o maior papel que a pessoa tiver.
- **Master:** só 1 no sistema inteiro (o usuário/dono). Sem tela de promoção — sempre `UPDATE profiles SET is_master = true` manual no banco. Modera qualquer cidade. Único papel que gerencia convites/embaixadores (criar convite, suspender, revogar).
- **Admin:** modera qualquer cidade (mesmo alcance de moderação que Master), mas **não** gerencia convites nem embaixadores — isso é exclusivo do Master.
- **Embaixador:** modera só a(s) cidade(s) onde tem uma linha `ambassador_cities` com `status = 'active'`.

## Mudanças necessárias

### Banco (RLS)

- Adicionar policies de `UPDATE`/`DELETE` em `reports` e `report_updates` que cubram `is_master(auth.uid())` como alcance global — hoje só `is_admin` tem esse alcance via a policy `cmd = '*'` existente ("Admins can perform any action on reports"). A forma mais simples e consistente com o padrão já existente no schema: estender essa mesma policy (ou criar uma irmã) para `is_admin(auth.uid()) OR is_master(auth.uid())`.
- Criar a função `get_invite_preview(p_token uuid)` — hoje ausente do controle de versão. Precisa devolver `city_name`, `city_uf`, `invited_by_name`, `expires_at` para um token de `ambassador_invites` (ver `AcceptInvitePage.jsx:33-47` para o shape exato esperado pelo frontend), respeitando que a chamada é feita **sem autenticação** (RLS deve permitir leitura anônima só do necessário, não expor a tabela toda).

### Frontend

- **Guard de rota** (`App.jsx`, rota `/admin/embaixadores`): trocar `AdminRoute` (que exige `is_admin`) por um guard que exige `is_master`, já que só Master gerencia convites/embaixadores agora.
- **`ManageMastersPage.jsx`**: guard interno vira só `is_master` (remover `|| is_admin`). Renomear referências visuais de "Masters" para refletir que a página não gerencia masters (é gestão de embaixadores).
- **`AmbassadorPage.jsx`**: se o usuário é `is_master` ou `is_admin`, buscar reports/updates pendentes de **todas** as cidades (sem filtrar por `ambassador_cities`); se só `is_ambassador`, manter o filtro atual por `ambassador_cities` do próprio usuário.
- **`Header.jsx`**: incluir `is_admin` na condição que mostra o link "Painel Embaixador" no menu (hoje só `is_ambassador || is_master`).
- **`AdminPage.jsx`**: remover/corrigir o texto "Convites, embaixadores ativos e promoções de masters" (já parcialmente corrigido no commit `8895cf9`, restam verificar se há outras menções).

## Fora de escopo (YAGNI por agora)

- Tela de gestão/promoção de masters (decisão: sempre manual no banco).
- Papel/hierarquia configurável ou tabela de roles genérica — mantém os 3 booleans existentes, só corrige onde cada um é checado.
- Validação de `invited_email` no aceite de convite (hoje qualquer usuário autenticado com o token aceita, independente do e-mail) — não foi mencionado como problema pelo usuário, não mexer.
