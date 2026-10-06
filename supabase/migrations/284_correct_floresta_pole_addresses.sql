-- O geocodificador escolheu ruas vizinhas para dois postes próximos de
-- cruzamentos. As ruas abaixo foram conferidas na planta vetorial municipal.
update public.poles
set address = 'Avenida Afonso de Souza Leal - Três Marias - Floresta - Pernambuco'
where city_id = 64
  and identifier = '13 - X171793'
  and abs(latitude - (-8.596682)) < 0.00003
  and abs(longitude - (-38.589821)) < 0.00003
  and address like 'Rua Alice Maria de Menezes%';

update public.poles
set address = 'Rua Rosalvo Martins - Três Marias - Floresta - Pernambuco'
where city_id = 64
  and identifier = '18 - X171777'
  and abs(latitude - (-8.597546)) < 0.00003
  and abs(longitude - (-38.589228)) < 0.00003
  and address like 'Rua Rusivânia Valéria Torres Martins%';
