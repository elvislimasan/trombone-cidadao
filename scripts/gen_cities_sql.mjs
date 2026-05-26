// Gera SQL idempotente com municípios do IBGE para aplicar via psql.
import fs from 'node:fs';
const data = await (await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/municipios')).json();
const esc = (s) => s.replace(/'/g, "''");
const rows = data.map((m) => {
  const uf = m.microrregiao?.mesorregiao?.UF?.sigla ?? m.regiaoImediata?.regiaoIntermediaria?.UF?.sigla;
  return `  ('${esc(m.nome)}','${uf}')`;
});
const sql = `begin;
insert into public.cities (name, state_id)
select v.name, s.id
from (values
${rows.join(',\n')}
) as v(name, uf)
join public.states s on s.uf = v.uf
where not exists (select 1 from public.cities c where c.name = v.name and c.state_id = s.id);
commit;
`;
fs.writeFileSync('scripts/_cities_seed.sql', sql);
console.log(`SQL gerado: ${data.length} municípios`);
