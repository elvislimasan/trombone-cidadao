// Ponto de entrada do `--import` no script de teste. Registra o gancho que
// resolve o alias `@/` (ver `test-alias-hooks.mjs`), que roda numa thread
// separada e por isso precisa morar em outro arquivo.

import { register } from 'node:module';

register('./test-alias-hooks.mjs', import.meta.url);
