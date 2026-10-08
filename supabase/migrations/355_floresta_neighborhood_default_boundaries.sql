-- Contornos padrão de Floresta/PE, consultados em 2026-10-08T16:10:00.153Z.
-- Base OSM: 2026-10-08T16:06:58Z. © OpenStreetMap contributors (ODbL).
-- https://www.openstreetmap.org/copyright
-- Né Maniçoba - AABB corresponde ao bairro AABB, conforme confirmação do usuário.
-- Bomba e Alto da Ermida não têm áreas fechadas na fonte e ficam sem seed.
-- Preserva desenhos e cores personalizadas. Substitui apenas os padrões anteriores pela paleta pastel.
begin;

do $seed$
declare
  v_city_id bigint;
  v_city_count integer;
  v_bairro_id uuid;
  v_matches integer;
  v_record jsonb;
  v_inserted integer;
  v_total integer := 0;
  v_contornos jsonb := $contornos$
[
  {
    "name": "AABB",
    "boundary": "SRID=4326;POLYGON((-38.5957129 -8.5941637,-38.5910569 -8.5954744,-38.5909197 -8.5949475,-38.5905013 -8.595077,-38.5903889 -8.5946865,-38.5907681 -8.5945701,-38.5904494 -8.5936082,-38.5910635 -8.5934431,-38.5905959 -8.5922664,-38.5901619 -8.592381,-38.5895126 -8.5910372,-38.5942114 -8.5903253,-38.5957129 -8.5941637))",
    "color": "#b8a7dc",
    "previous_color": "#8b5cf6",
    "source": {
      "provider": "osm",
      "object_type": "relation",
      "object_id": 20660335,
      "object_updated_at": "2026-05-08T14:19:54Z",
      "base_updated_at": "2026-10-08T16:06:58Z",
      "queried_at": "2026-10-08T16:10:00.153Z",
      "modified": false,
      "source_name": "Né Maniçoba - AABB"
    }
  },
  {
    "name": "Bela Floresta",
    "boundary": "SRID=4326;POLYGON((-38.5741024 -8.5906256,-38.5733461 -8.5915183,-38.5730695 -8.5918926,-38.5724516 -8.5928276,-38.5723408 -8.5930747,-38.5720686 -8.5934295,-38.5720994 -8.5936813,-38.5721541 -8.5941131,-38.5720501 -8.594604,-38.5711711 -8.5937278,-38.5629629 -8.5959707,-38.5623955 -8.5933095,-38.5741024 -8.5906256))",
    "color": "#e5a78f",
    "previous_color": "#f97316",
    "source": {
      "provider": "osm",
      "object_type": "relation",
      "object_id": 20660517,
      "object_updated_at": "2026-05-08T15:00:00Z",
      "base_updated_at": "2026-10-08T16:06:58Z",
      "queried_at": "2026-10-08T16:10:00.153Z",
      "modified": false,
      "source_name": "Bela Floresta"
    }
  },
  {
    "name": "Bela Vista",
    "boundary": "SRID=4326;POLYGON((-38.5876031 -8.6065846,-38.5875697 -8.6060037,-38.5875256 -8.6058046,-38.5873376 -8.6049267,-38.5872206 -8.6045377,-38.5869902 -8.6034738,-38.5865131 -8.6034788,-38.5860302 -8.6034054,-38.5860554 -8.603317,-38.5875785 -8.6030649,-38.5882733 -8.6031252,-38.5888051 -8.603023,-38.5894121 -8.6026639,-38.5896938 -8.6022413,-38.5902982 -8.6021728,-38.5908981 -8.6019505,-38.5910753 -8.6017272,-38.5914173 -8.6015728,-38.5919404 -8.6011444,-38.5923095 -8.6006114,-38.5923615 -8.6003525,-38.5924333 -8.600079,-38.5928318 -8.599821,-38.5933411 -8.6000113,-38.5945589 -8.5994645,-38.5970736 -8.5991836,-38.5975539 -8.6000001,-38.599152 -8.6105343,-38.5927186 -8.6083464,-38.5880267 -8.6067305,-38.5876031 -8.6065846))",
    "color": "#ebc882",
    "previous_color": "#eab308",
    "source": {
      "provider": "osm",
      "object_type": "relation",
      "object_id": 20660161,
      "object_updated_at": "2026-05-08T13:36:33Z",
      "base_updated_at": "2026-10-08T16:06:58Z",
      "queried_at": "2026-10-08T16:10:00.153Z",
      "modified": false,
      "source_name": "Bela Vista"
    }
  },
  {
    "name": "Caetano 1",
    "boundary": "SRID=4326;POLYGON((-38.5809021 -8.6074244,-38.577107 -8.6039911,-38.5752681 -8.6033339,-38.5739929 -8.6030936,-38.5771664 -8.6002679,-38.5775189 -8.600783,-38.5800685 -8.6044938,-38.5804839 -8.6050596,-38.5808922 -8.6058153,-38.5809479 -8.60649,-38.5809021 -8.6074244))",
    "color": "#e9a7bf",
    "previous_color": "#ef4444",
    "source": {
      "provider": "osm",
      "object_type": "relation",
      "object_id": 20660358,
      "object_updated_at": "2026-05-08T14:28:57Z",
      "base_updated_at": "2026-10-08T16:06:58Z",
      "queried_at": "2026-10-08T16:10:00.153Z",
      "modified": false,
      "source_name": "Caetano 1"
    }
  },
  {
    "name": "Caetano 2",
    "boundary": "SRID=4326;POLYGON((-38.586242 -8.5995861,-38.5846342 -8.6000323,-38.5839187 -8.6002936,-38.5831452 -8.600534,-38.5813547 -8.6012008,-38.582079 -8.6032554,-38.5822321 -8.6037468,-38.580069 -8.6044932,-38.5775197 -8.6007829,-38.5812653 -8.5986498,-38.5849242 -8.5972509,-38.5861168 -8.597149,-38.5861656 -8.5985694,-38.586242 -8.5995861))",
    "color": "#ceb4e3",
    "previous_color": "#ec4899",
    "source": {
      "provider": "osm",
      "object_type": "relation",
      "object_id": 20660180,
      "object_updated_at": "2026-05-08T13:50:49Z",
      "base_updated_at": "2026-10-08T16:06:58Z",
      "queried_at": "2026-10-08T16:10:00.153Z",
      "modified": false,
      "source_name": "Caetano 2"
    }
  },
  {
    "name": "Caraibeiras",
    "boundary": "SRID=4326;POLYGON((-38.5809766 -8.598718,-38.5776085 -8.6006717,-38.57665 -8.5992478,-38.5763397 -8.5987989,-38.5762736 -8.5987435,-38.575451 -8.5979731,-38.576025 -8.59713,-38.5774449 -8.5961709,-38.5777068 -8.5959707,-38.5787319 -8.5952759,-38.5791178 -8.5956662,-38.5789152 -8.5958167,-38.5800243 -8.5973843,-38.5804089 -8.5972206,-38.5809766 -8.598718))",
    "color": "#92c9bc",
    "previous_color": "#14b8a6",
    "source": {
      "provider": "osm",
      "object_type": "relation",
      "object_id": 20660193,
      "object_updated_at": "2026-05-08T13:57:03Z",
      "base_updated_at": "2026-10-08T16:06:58Z",
      "queried_at": "2026-10-08T16:10:00.153Z",
      "modified": false,
      "source_name": "Caraibeiras"
    }
  },
  {
    "name": "Centro",
    "boundary": "SRID=4326;POLYGON((-38.5743443 -8.6063711,-38.5705184 -8.6058096,-38.5679765 -8.60484,-38.5650058 -8.5982627,-38.5686827 -8.5955849,-38.5711565 -8.5937618,-38.5721207 -8.5947576,-38.5742023 -8.596987,-38.576345 -8.5990683,-38.577166 -8.6002674,-38.5739922 -8.6030934,-38.5743371 -8.6048651,-38.5743443 -8.6063711))",
    "color": "#a5bfe8",
    "previous_color": "#00b7ff",
    "source": {
      "provider": "osm",
      "object_type": "relation",
      "object_id": 20660512,
      "object_updated_at": "2026-05-08T14:57:22Z",
      "base_updated_at": "2026-10-08T16:06:58Z",
      "queried_at": "2026-10-08T16:10:00.153Z",
      "modified": false,
      "source_name": "Centro"
    }
  },
  {
    "name": "Cohab",
    "boundary": "SRID=4326;POLYGON((-38.584924 -8.5972501,-38.5812644 -8.5986495,-38.5810354 -8.5986911,-38.5806595 -8.5976212,-38.5804666 -8.5970859,-38.5800437 -8.597243,-38.5794435 -8.596349,-38.583975 -8.5946173,-38.584272 -8.5955355,-38.584433 -8.5960183,-38.5845403 -8.5962748,-38.584924 -8.5972501))",
    "color": "#a9cd92",
    "previous_color": "#22c55e",
    "source": {
      "provider": "osm",
      "object_type": "relation",
      "object_id": 20660210,
      "object_updated_at": "2026-05-08T14:03:58Z",
      "base_updated_at": "2026-10-08T16:06:58Z",
      "queried_at": "2026-10-08T16:10:00.153Z",
      "modified": false,
      "source_name": "Cohab"
    }
  },
  {
    "name": "Matadouro",
    "boundary": "SRID=4326;POLYGON((-38.576281 -8.5863174,-38.5623836 -8.5901067,-38.5626908 -8.5929864,-38.5762947 -8.5900316,-38.576281 -8.5863174))",
    "color": "#bac7d0",
    "previous_color": "#64748b",
    "source": {
      "provider": "osm",
      "object_type": "relation",
      "object_id": 20660338,
      "object_updated_at": "2026-05-08T14:21:42Z",
      "base_updated_at": "2026-10-08T16:06:58Z",
      "queried_at": "2026-10-08T16:10:00.153Z",
      "modified": false,
      "source_name": "Matadouro"
    }
  },
  {
    "name": "Morada Nobre",
    "boundary": "SRID=4326;POLYGON((-38.5890393 -8.5937265,-38.5881672 -8.5938624,-38.5874425 -8.59413,-38.5867013 -8.5942939,-38.5859442 -8.5943977,-38.5848126 -8.5948334,-38.5844041 -8.5949718,-38.5841208 -8.594479,-38.5836845 -8.5946238,-38.5835902 -8.594212,-38.5834674 -8.5940206,-38.5810252 -8.5918366,-38.5893815 -8.5910554,-38.5901095 -8.5925386,-38.5905001 -8.5923951,-38.5908448 -8.5933377,-38.5890393 -8.5937265))",
    "color": "#86b9d4",
    "previous_color": "#3b82f6",
    "source": {
      "provider": "osm",
      "object_type": "relation",
      "object_id": 20660248,
      "object_updated_at": "2026-05-08T14:16:53Z",
      "base_updated_at": "2026-10-08T16:06:58Z",
      "queried_at": "2026-10-08T16:10:00.153Z",
      "modified": false,
      "source_name": "Morada Nobre"
    }
  },
  {
    "name": "Parque das Acácias",
    "boundary": "SRID=4326;POLYGON((-38.5897923 -8.6014848,-38.5885959 -8.6022948,-38.5874985 -8.6022429,-38.5824677 -8.6035848,-38.5822793 -8.6030001,-38.5819467 -8.6020703,-38.5815654 -8.6012856,-38.5867246 -8.5995788,-38.5893297 -8.5987018,-38.5897923 -8.6014848))",
    "color": "#c4cc9c",
    "previous_color": "#84cc16",
    "source": {
      "provider": "osm",
      "object_type": "relation",
      "object_id": 20660168,
      "object_updated_at": "2026-05-08T13:40:41Z",
      "base_updated_at": "2026-10-08T16:06:58Z",
      "queried_at": "2026-10-08T16:10:00.153Z",
      "modified": false,
      "source_name": "Parque das Acácias"
    }
  },
  {
    "name": "Santa Rosa",
    "boundary": "SRID=4326;POLYGON((-38.5835123 -8.5944455,-38.5835724 -8.5946713,-38.5793595 -8.5962934,-38.5790453 -8.5958487,-38.5791831 -8.5956406,-38.5787492 -8.5951605,-38.5776725 -8.5958934,-38.5766764 -8.5965422,-38.5758192 -8.5971593,-38.5754221 -8.5978472,-38.5742692 -8.59682,-38.5721214 -8.5947571,-38.572276 -8.5939627,-38.5724419 -8.5934523,-38.5725849 -8.5930467,-38.573139 -8.5919986,-38.5735604 -8.5914156,-38.5741647 -8.5907149,-38.5743012 -8.5907187,-38.5797454 -8.590828,-38.5800371 -8.5911245,-38.5819426 -8.5928352,-38.583422 -8.5940869,-38.5835123 -8.5944455))",
    "color": "#e6b4a1",
    "previous_color": "#d946ef",
    "source": {
      "provider": "osm",
      "object_type": "relation",
      "object_id": 20660239,
      "object_updated_at": "2026-05-08T14:14:42Z",
      "base_updated_at": "2026-10-08T16:06:58Z",
      "queried_at": "2026-10-08T16:10:00.153Z",
      "modified": false,
      "source_name": "Santa Rosa"
    }
  },
  {
    "name": "São Francisco de Assis (DNER)",
    "boundary": "SRID=4326;POLYGON((-38.5809028 -8.6074242,-38.5809485 -8.6064904,-38.5808929 -8.6058151,-38.5804845 -8.605059,-38.5810321 -8.6047444,-38.5825158 -8.6043061,-38.5833213 -8.6040732,-38.5843213 -8.6036941,-38.5847757 -8.6034862,-38.5859759 -8.6034678,-38.5868655 -8.6036315,-38.5870418 -8.6045608,-38.587133 -8.6047648,-38.587389 -8.6058521,-38.5874775 -8.6065567,-38.5866149 -8.6065385,-38.5855648 -8.606563,-38.5809028 -8.6074242))",
    "color": "#d9c19d",
    "previous_color": "#a16207",
    "source": {
      "provider": "osm",
      "object_type": "relation",
      "object_id": 20660059,
      "object_updated_at": "2026-05-08T13:00:48Z",
      "base_updated_at": "2026-10-08T16:06:58Z",
      "queried_at": "2026-10-08T16:10:00.153Z",
      "modified": false,
      "source_name": "São Francisco de Assis - DNER"
    }
  },
  {
    "name": "Três Marias",
    "boundary": "SRID=4326;POLYGON((-38.5917997 -8.6010036,-38.5911663 -8.6011748,-38.5902472 -8.6013858,-38.5898397 -8.6014794,-38.5894298 -8.5985639,-38.586296 -8.5995367,-38.5861661 -8.5985689,-38.5861175 -8.5971485,-38.5852693 -8.5972147,-38.5849536 -8.5972393,-38.5847968 -8.5967262,-38.5845116 -8.5959471,-38.5842291 -8.5951327,-38.5844411 -8.5950644,-38.5845225 -8.5950449,-38.5859759 -8.5946405,-38.5904008 -8.5936336,-38.5906172 -8.5944526,-38.5902451 -8.5945693,-38.5904182 -8.5952603,-38.5908158 -8.5951068,-38.5911399 -8.5963561,-38.5928892 -8.5960618,-38.5934594 -8.5995073,-38.592891 -8.5996205,-38.5922483 -8.5998704,-38.5917997 -8.6010036))",
    "color": "#9db0d9",
    "previous_color": "#4338ca",
    "source": {
      "provider": "osm",
      "object_type": "relation",
      "object_id": 20660217,
      "object_updated_at": "2026-05-08T14:08:56Z",
      "base_updated_at": "2026-10-08T16:06:58Z",
      "queried_at": "2026-10-08T16:10:00.153Z",
      "modified": false,
      "source_name": "Três Marias"
    }
  }
]
$contornos$::jsonb;
begin
  select count(*), min(c.id) into v_city_count, v_city_id
  from public.cities c join public.states s on s.id = c.state_id
  where lower(btrim(c.name)) = 'floresta' and upper(btrim(s.uf)) = 'PE';
  if v_city_count = 0 then
    raise notice 'Floresta/PE não cadastrada; contornos padrão não inseridos.';
    return;
  end if;
  if v_city_count <> 1 then
    raise exception 'Esperado um único município Floresta/PE; encontrados %', v_city_count;
  end if;

  -- Serializa execuções simultâneas deste seed para a mesma cidade.
  perform 1 from public.cities where id = v_city_id for update;
  for v_record in select value from jsonb_array_elements(v_contornos)
  loop
    select count(*), (array_agg(b.id order by b.id))[1] into v_matches, v_bairro_id
    from public.bairros b
    where b.city_id = v_city_id
      and public.report_neighborhood_key(b.name) = public.report_neighborhood_key(v_record ->> 'name');
    if v_matches = 0 then
      insert into public.bairros(name, city_id)
      values (v_record ->> 'name', v_city_id)
      on conflict do nothing;
      select count(*), (array_agg(b.id order by b.id))[1] into v_matches, v_bairro_id
      from public.bairros b
      where b.city_id = v_city_id
        and public.report_neighborhood_key(b.name) = public.report_neighborhood_key(v_record ->> 'name');
    end if;
    if v_matches <> 1 then
      raise notice 'Bairro % com correspondência ambígua; contorno não inserido.', v_record ->> 'name';
      continue;
    end if;

    insert into public.pavement_neighborhood_boundaries(bairro_id, boundary, color, source)
    values (v_bairro_id, extensions.st_geomfromewkt(v_record ->> 'boundary'),
      v_record ->> 'color', v_record -> 'source')
    on conflict (bairro_id) do update set color = excluded.color
    where public.pavement_neighborhood_boundaries.color in ('#bfe1ee', v_record ->> 'previous_color')
      and public.pavement_neighborhood_boundaries.source ->> 'provider' = 'osm'
      and public.pavement_neighborhood_boundaries.source ->> 'modified' = 'false'
      and public.pavement_neighborhood_boundaries.source ->> 'object_type' = excluded.source ->> 'object_type'
      and public.pavement_neighborhood_boundaries.source ->> 'object_id' = excluded.source ->> 'object_id';
    get diagnostics v_inserted = row_count;
    v_total := v_total + v_inserted;
  end loop;
  raise notice '% contornos padrão inseridos ou cores padrão completadas em Floresta/PE; desenhos existentes preservados.', v_total;
end;
$seed$;

notify pgrst, 'reload schema';
commit;
