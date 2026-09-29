# Bairro das broncas

`reports.address` e `reports.neighborhood` são campos separados. O painel da
prefeitura, os filtros e as exportações consultam `neighborhood`. Ter endereço
preenchido não garante que o bairro tenha sido gravado.

O filtro da prefeitura lista todos os bairros cadastrados na cidade e mostra a
quantidade de broncas abertas com cada bairro gravado. Um bairro com `(0)`, como
AABB antes da revisão, aparece no filtro, mas selecioná-lo não inclui broncas
cujo endereço apenas menciona esse nome.

O envio anônimo passa a persistir o bairro do reverse geocode detalhado, usando
o bairro enviado pelo app quando a consulta do servidor não o identifica. Para
ativar essa correção no servidor, publique `create-anonymous-report` no projeto
correspondente ao ambiente desejado.

Para preencher registros antigos, primeiro confira o projeto apontado pelo
`.env` e pelo Supabase vinculado e execute uma simulação:

```sh
npm run reports:neighborhoods -- --city-id 64
```

O comando reconhece somente segmentos completos do endereço que correspondam
a bairros cadastrados nessa cidade.

Em Floresta, a migração 279 cadastra “Bomba”. A rotina reconhece “DNER” nos
endereços como abreviação de “São Francisco de Assis (DNER)”, já cadastrado.
Execute a migração antes do preenchimento de Bomba; depois, rode a prévia
novamente para conferir as broncas identificadas.

Também é possível consultar a localização do marcador, confirmando o município
antes de aceitar o bairro:

```sh
npm run reports:neighborhoods -- --city-id 64 --geocode --limit 10
```

Para aplicar após revisar a prévia:

```sh
npm run reports:neighborhoods -- --city-id 64 --geocode --apply
```

Cada execução salva a prévia e os valores anteriores em
`.tmp/report-neighborhoods-<cidade>-<timestamp>.json`. A aplicação preenche
somente bairros vazios em broncas abertas visíveis na consulta da prefeitura.
Endereços e bairros já preenchidos são preservados. Registros cujo endereço,
marcador ou bairro mudaram durante a consulta são ignorados. Quando o provedor
não identifica exatamente um bairro cadastrado, como no retorno composto
“Né Maniçoba - AABB”, o registro permanece pendente para revisão manual.
