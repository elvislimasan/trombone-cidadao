-- 184_patrol_signal_address.sql
--
-- O sinal passa a gravar `address`, e por dois motivos.
--
-- O PRIMEIRO E QUE ELE PODE SER OBRIGATORIO
--
-- A tabela `reports` nasceu antes das migracoes versionadas, e sua definicao
-- nao esta no git. Todo caminho de cadastro que existia — o formulario comum,
-- o fluxo anonimo — sempre preencheu `address`; a create_patrol_signal da 173
-- foi o primeiro insert a omitir a coluna. Se ela for NOT NULL no banco, o
-- sinal falha SEMPRE, e falha com uma mensagem que o app engolia num toast
-- generico ("Tente de novo em instantes").
--
-- Preencher e barato e resolve o caso independentemente de qual seja a
-- resposta: se a coluna for opcional, ganhamos a informacao; se for
-- obrigatoria, deixa de quebrar.
--
-- O SEGUNDO E QUE A MISSAO FICA MELHOR
--
-- Quem sinaliza passa e segue. Quem cumpre a missao precisa CHEGAR ali. O nome
-- da rua no card ("Rua Dois de Julho") diz muito mais que um pino no mapa para
-- quem esta decidindo se vale o desvio — e o app ja tem esse nome em maos: o
-- painel da patrulha mostra a rua atual o tempo todo, vinda do reverse-geocode.
--
-- Recria em vez de substituir: a lista de argumentos muda, e `create or
-- replace` nao altera assinatura.

drop function if exists public.create_patrol_signal(
  double precision, double precision, text, bigint, text
);

create function public.create_patrol_signal(
  p_lat double precision,
  p_lng double precision,
  p_category_id text,
  p_city_id bigint default null,
  p_neighborhood text default null,
  p_address text default null
)
returns table (id uuid, duplicado boolean, existente_id uuid)
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  v_ponto extensions.geometry;
  v_existente uuid;
  v_nome_categoria text;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'sem sessao' using errcode = '42501';
  end if;
  if p_lat is null or p_lng is null then
    raise exception 'sem coordenada' using errcode = '22023';
  end if;

  v_ponto := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326);

  -- Mesmo buraco, quinze sinais: sem este freio, o primeiro quarteirao ruim
  -- vira uma fila de missoes identicas e o mapa fica ilegivel. 30 m e a ordem
  -- de grandeza de um poste ao outro.
  select r.id into v_existente
  from public.reports r
  where r.origin = 'signal'
    and r.signal_status = 'open'
    and r.category_id is not distinct from p_category_id
    and r.location is not null
    and extensions.st_dwithin(
          r.location::extensions.geography,
          v_ponto::extensions.geography,
          30
        )
  limit 1;

  if v_existente is not null then
    return query select null::uuid, true, v_existente;
    return;
  end if;

  select c.name into v_nome_categoria
  from public.categories c where c.id = p_category_id;

  insert into public.reports (
    title, description, address, category_id, location, author_id, protocol,
    status, moderation_status, city_id, is_anonymous,
    origin, signal_status, neighborhood
  ) values (
    coalesce(v_nome_categoria, 'Problema') || ' sinalizado',
    'Sinalizado em campo. Aguarda registro completo com foto.',
    -- Nunca nulo, nunca vazio: e a coluna que pode estar sob NOT NULL, e o
    -- texto de reserva descreve honestamente o que se sabe do lugar.
    coalesce(
      nullif(btrim(p_address), ''),
      nullif(btrim(p_neighborhood), ''),
      'Local sinalizado em patrulha'
    ),
    p_category_id,
    v_ponto,
    auth.uid(),
    'TROMB-' || (extract(epoch from clock_timestamp()) * 1000)::bigint::text,
    'pending',
    -- Fora de tudo que filtra por 'approved', que e o feed inteiro.
    'pending_approval',
    p_city_id,
    false,
    'signal',
    'open',
    nullif(btrim(p_neighborhood), '')
  )
  returning reports.id into v_id;

  return query select v_id, false, null::uuid;
end $$;

grant execute on function public.create_patrol_signal(
  double precision, double precision, text, bigint, text, text
) to authenticated;
