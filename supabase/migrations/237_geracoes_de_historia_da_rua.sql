-- Auditoria de uso da geracao assistida da historia das ruas.
-- A tabela nao e exposta ao aplicativo: somente a Edge Function, usando a
-- service role, escreve e consulta estes registros.

create table if not exists public.street_history_ai_generations (
  id uuid primary key default gen_random_uuid(),
  street_id uuid not null references public.pavement_streets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'started'
    check (status in ('started', 'completed', 'failed')),
  model text not null,
  document_count integer not null default 0 check (document_count >= 0),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists street_history_ai_generations_user_created_idx
  on public.street_history_ai_generations (user_id, created_at desc);

alter table public.street_history_ai_generations enable row level security;

comment on table public.street_history_ai_generations is
  'Auditoria server-side das geracoes de biografia e curiosidades a partir dos documentos da rua.';
