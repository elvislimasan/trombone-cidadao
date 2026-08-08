# Painel de Permissões — Design

**Data:** 2026-08-07
**Status:** Aprovado para implementação

## Objetivo

Permitir que o **master** revogue o acesso de escrita a módulos de gestão,
tanto para um cargo inteiro ("nenhum embaixador gerencia Obras") quanto para um
usuário específico ("este embaixador não gerencia Obras").

## Problema

Hoje os papéis são fixos e binários: quem é embaixador de uma cidade gerencia
**todos** os módulos daquela cidade (obras, imóveis, pavimentação, serviços,
moderação). Não há como limitar um embaixador a um subconjunto de módulos, nem
desativar um módulo para a categoria inteira.

## Modelo de permissão

### Bloqueio sobre o padrão liberado

O papel continua definindo o acesso padrão. As regras cadastradas são
**exceções** sobre ele. Consequência importante: ao ativar a feature, com a
tabela vazia, **nada muda** para ninguém.

### Duas camadas, com o usuário vencendo o cargo

Ordem de resolução para `can_write(user, module)`:

1. **Regra do usuário** (se existir) — decide, ponto final
2. **Regra do cargo** (se existir) — decide
3. **Padrão** — liberado

Isso cobre os dois casos pedidos e mais um terceiro:

| Cenário | Regra de cargo | Regra de usuário | Resultado |
|---|---|---|---|
| Padrão atual | — | — | Pode |
| Bloquear a categoria | `ambassador/works = false` | — | Não pode |
| Bloquear só um usuário | — | `joão/works = false` | Não pode |
| Exceção: liberar um usuário | `ambassador/works = false` | `joão/works = true` | Pode |

## Escopo

### Módulos (5)

`works` (Obras), `rentals` (Imóveis Alugados), `pavement` (Pavimentação),
`services` (Serviços), `moderation` (Moderação).

Um interruptor por módulo, controlando **apenas escrita** (criar, editar,
excluir). Leitura nunca é bloqueada por esse sistema.

### Cargos alvo

`ambassador` e `admin`.

**Master nunca é afetado** — `can_write` retorna `true` para master antes de
consultar qualquer regra. O painel também impede que o master altere as
próprias permissões ou as de outro master (protege contra auto-bloqueio, já que
só o master administra esse painel).

## Efeito na interface

Sem permissão de escrita num módulo, o usuário perde:

- a **página de gestão** (`/obras/gerenciar` etc.) — redireciona ao tentar
  acessar direto;
- o **link do módulo** no painel do embaixador;
- os **botões "Adicionar"** nas páginas públicas.

As páginas públicas de consulta (`/obras-publicas`, `/imoveis-alugados`, …)
continuam idênticas — o bloqueio é de escrita, não de leitura.

## Banco de dados

### Tabela `permission_rules`

```sql
create table public.permission_rules (
  id          bigint generated always as identity primary key,
  scope       text not null check (scope in ('role','user')),
  role_name   text check (role_name in ('ambassador','admin')),
  user_id     uuid references auth.users(id) on delete cascade,
  module      text not null check (module in
                ('works','rentals','pavement','services','moderation')),
  allowed     boolean not null,
  created_at  timestamptz not null default now(),
  -- scope='role' exige role_name e proíbe user_id; scope='user' o inverso
  constraint permission_rules_scope_fields check (
    (scope = 'role' and role_name is not null and user_id is null) or
    (scope = 'user' and user_id  is not null and role_name is null)
  )
);

create unique index uq_permission_rules_role on public.permission_rules (role_name, module) where scope = 'role';
create unique index uq_permission_rules_user on public.permission_rules (user_id,  module) where scope = 'user';
```

RLS: leitura para `authenticated` (o frontend precisa saber as próprias
permissões); escrita apenas para master.

### Função `can_write(p_user uuid, p_module text)`

`security definer`, `stable`. Implementa a ordem de resolução descrita acima:
master → regra de usuário → regra de cargo → `true`.

### Integração com as policies existentes

As policies de gestor seguem um padrão consistente
(`is_admin/is_master OR is_ambassador_of(...)`). A alteração é aditiva: cada
policy de **escrita** de gestor/moderador ganha `AND can_write(auth.uid(), '<módulo>')`.

Tabelas e policies afetadas:

| Módulo | Tabela | Policies |
|---|---|---|
| `works` | `public_works` | `works_gestor_{insert,update,delete}` |
| `rentals` | `rental_properties` | `rental_properties_gestor_{insert,update,delete}` |
| `pavement` | `pavement_streets` | `pavement_streets_gestor_{insert,update,delete}` |
| `services` | `transport`, `tourist_spots`, `directory` | `*_gestor_{insert,update,delete}` |
| `moderation` | `reports`, `report_updates` | `ambassadors_can_{update,delete}_*` |

**Não são tocadas** as policies de cidadão comum (`Users can update their own
reports.`, `Users can submit to directory.`, `Author can delete own pending
updates`) — um embaixador sem permissão de moderação continua podendo criar e
editar as próprias broncas como qualquer usuário.

As policies `ALL` de admin (`Admins can perform any action on …`) também
recebem a checagem, senão um admin bloqueado continuaria passando por elas.

## Frontend

- **`usePermissions()`** — carrega as regras aplicáveis ao usuário logado e
  expõe `canWrite(module)`. Master sempre `true`.
- **Guarda de rota** — as rotas de gestão passam a verificar o módulo
  correspondente e redirecionam quem não tem acesso. São duas famílias de
  rotas, ambas precisam da guarda:

  | Módulo | Rotas (`AmbassadorOrAdminRoute`) | Rotas (`AdminRoute`) |
  |---|---|---|
  | `works` | `/obras/gerenciar` | `/admin/obras`, `/admin/obras/opcoes` |
  | `rentals` | `/imoveis-alugados/gerenciar` | `/admin/imoveis-alugados` |
  | `pavement` | `/pavimentacao/gerenciar` | `/admin/pavimentacao` |
  | `services` | `/servicos/gerenciar` | `/admin/servicos` |
  | `moderation` | — | `/admin/moderacao/:type`, `/admin/broncas` |

- **Cards do painel admin** — os cards de `/admin` que levam a esses módulos
  somem para quem não tem a permissão correspondente, evitando levar o usuário
  a uma rota que vai redirecionar.
- **Painel `/admin/permissoes`** — card próprio no painel administrativo.
  Duas seções: regras por cargo (matriz cargo × módulo) e regras por usuário
  (busca de usuário + matriz de módulos, com indicação de qual valor vem do
  cargo e qual é exceção individual).

## Fora de escopo

- Granularidade criar/editar/excluir separada (um interruptor por módulo basta
  para o caso de uso atual).
- Cargos customizados criados pelo master.
- Permissões por cidade (o embaixador já é limitado às cidades dele por
  `is_ambassador_of`; este sistema é ortogonal a isso).
