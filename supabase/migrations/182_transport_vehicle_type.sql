-- 180_transport_vehicle_type.sql
--
-- Tipo de veiculo nas opcoes de transporte.
--
-- O PROBLEMA
--
-- A lista de transportes so podia ser filtrada por destino. Quem procura
-- "como chego em Recife" resolve com destino; quem procura "tem mototaxi
-- aqui?" nao resolve com nada — precisa abrir cada card ate achar. Numa
-- cidade com 30 lotacoes cadastradas isso e a diferenca entre usar e desistir.
--
-- Texto livre, nao enum: a lista de tipos vive no cliente
-- (src/lib/transportTypes.js) e vai crescer conforme as cidades entram. Um
-- enum obrigaria uma migration a cada tipo novo, e um valor fora da lista
-- degrada bem — cai no rotulo generico, nao quebra a tela.
--
-- Nulo e valido: os transportes ja cadastrados nao tem tipo e continuam
-- aparecendo (o filtro "Todos os tipos" e o padrao). Preencher e trabalho do
-- embaixador, sem prazo.

alter table public.transport
  add column if not exists vehicle_type text;

create index if not exists idx_transport_vehicle_type
  on public.transport (vehicle_type)
  where vehicle_type is not null;

notify pgrst, 'reload schema';
