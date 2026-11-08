// Componentes/clientes reais em Chrome, com Supabase simulado. Sem .env ou rede externa.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import loadConfig from 'tailwindcss/loadConfig.js';

const root = process.cwd(), out = path.join(root, '.tmp/editorial-ui');
await fs.mkdir(out, { recursive: true });
const stubs = {
  '@/contexts/CityContext': `export const useCity=()=>({cities:[{id:64,name:'Floresta',state:{uf:'PE'}},{id:65,name:'Recife',state:{uf:'PE'}}],activeCityId:64,loadingCities:false});`,
  '@/contexts/SupabaseAuthContext': `export const useAuth=()=>({user:{id:'editor',is_admin:true}});`,
  '@/lib/customSupabaseClient': `
    const clone=value=>JSON.parse(JSON.stringify(value));
    const snapshot={city_id:64,city_name:'Floresta',as_of:'2026-11-06',captured_at:'2026-11-06T12:00:00Z',
      facts:[{id:'F1',text:'60 obras com cadastro publicável na plataforma em Floresta.'},{id:'F2',text:'23 obras registradas como paralisadas, equivalentes a 38,3% do total.'},
        {id:'F3',text:'Soma contratual conhecida: R$ 22000,00. Não representa dinheiro perdido.'},{id:'F4',text:'1 obra sem valor informado.'},
        {id:'F5',text:'Datas de paralisação não informadas.'},{id:'F6',text:'Distribuição por bairro: Centro: 23.'},{id:'F7',text:'Exemplos: Escola do Centro; Pavimentação da Rua das Flores.'}],
      sources:Array.from({length:23},(_,i)=>({id:'work-'+i,title:'Obra pública acompanhada '+(i+1)})),limitations:['O levantamento não é um censo municipal.','Confirmar a situação atual antes de publicar.']};
    const candidate={id:'candidate',city_id:64,module:'works',topic_key:'works.stalled',title:'Floresta: 23 obras registradas como paralisadas',reason:'Primeiro levantamento. Confirmar cobertura anterior.',priority:80,status:'proposed',facts_hash:'hash',snapshot,created_at:'2026-11-06T12:00:00Z',assigned_to:null};
    const extra=[['reports','reports.active','Floresta: 5 broncas públicas em acompanhamento','report'],
      ['streets','streets.unpaved','Floresta: 2 ruas cadastradas sem pavimentação','street'],
      ['arborization','arborization.attention','Floresta: 2 árvores sinalizadas para avaliação técnica','tree']].map(([module,topic,title,type])=>({...clone(candidate),id:module,module,topic_key:topic,title,
        snapshot:{...clone(snapshot),module,topic_key:topic,facts:[{id:'F1',text:'Universo: registros públicos da plataforma em Floresta.'},{id:'F2',text:title},
          {id:'F3',text:'Situações cadastradas, sem inferência de execução.'},{id:'F4',text:'Dados pessoais não entram neste levantamento.'},
          {id:'F5',text:'Categoria e espécie conforme o cadastro público.'},{id:'F6',text:'Centro: registros do conjunto.'},{id:'F7',text:'Conferir as fontes antes de publicar.'}],
          sources:[{id:module+'-source',title:module==='reports'?'Bronca pública':module==='streets'?'Rua das Flores':'AR1 · Ipê',source_type:type}]}}));
    const settings={city_id:64,daily_enabled:false,last_analysis_at:'2026-11-06T12:00:00Z'};
    const state=window.fixture={candidate,candidates:[candidate,...extra],versions:[],calls:[],fail:false};
    function read(table,filters){let rows=table==='editorial_candidates'?state.candidates:table==='editorial_contents'?state.versions:[settings];return rows.filter(row=>filters.every(([field,values])=>values.includes(row[field]))).map(clone)}
    export const supabase={from(table){const filters=[];const query={select(){return query},eq(field,v){filters.push([field,[v]]);return query},in(field,v){filters.push([field,v]);return query},order(){return query},limit(){return query},maybeSingle(){return Promise.resolve({data:read(table,filters)[0]||null})},then(ok,fail){return Promise.resolve({data:read(table,filters)}).then(ok,fail)}};return query},
      async rpc(name,args){state.calls.push({name,args});if(state.fail)return {error:{message:'Falha de conexão para teste'}};
        if(name==='editorial_permissions')return {data:{read:args.p_city_id===64,write:args.p_city_id===64,approve:args.p_city_id===64,publish:args.p_city_id===64,configure:args.p_city_id===64}};
        if(name==='editorial_analyze_module')return {data:{created:0,reused:1}};
        if(name==='editorial_set_daily'){settings.daily_enabled=args.p_enabled;return {data:null}};
        const version=state.versions.find(row=>row.id===args.p_content_id);
        const target=state.candidates.find(row=>row.id===(args.p_candidate_id||version?.candidate_id))||candidate;
        if(name==='editorial_candidate_action'){target.assigned_to=args.p_action==='release'?null:'editor';target.status=args.p_action==='dismiss'?'dismissed':args.p_action==='release'?'proposed':'writing';target.decision_reason=args.p_reason;return {data:null}};
        if(name==='editorial_save_content'){const next={...clone(version),id:crypto.randomUUID(),revision:version.revision+1,content:clone(args.p_content),approved_at:null};state.versions.unshift(next);target.status=target.news_id?'published':'writing';return {data:next.id}};
        if(name==='editorial_approve'){version.approved_at=new Date().toISOString();target.status=target.news_id?'published':'approved';return {data:null}};
        if(name==='editorial_publish'){version.news_id='news-'+target.id;target.news_id=version.news_id;target.status='published';return {data:version.news_id}};
        if(name==='editorial_export')return {data:clone(version)};
        throw Error('RPC não prevista: '+name);
      },functions:{async invoke(name,{body}){state.calls.push({name,body});const target=state.candidates.find(row=>row.id===body.candidate_id);target.assigned_to='editor';target.status=target.news_id?'published':'writing';const content={title:target.title,title_fact_ids:['F2'],blocks:[{text:target.snapshot.facts[1].text,fact_ids:['F2']},{text:target.snapshot.facts[0].text,fact_ids:['F1']}]};
        if(body.format!=='news')content.blocks=content.blocks.map((block,index)=>({...block,speaker:body.brief.video_style==='dialogue'?(index%2?'presenter_b':'presenter_a'):body.brief.video_style==='voiceover'?'narrator':'presenter',scene:'Apresentação com mapa dos registros.',screen_text:index?'':'Dados do levantamento'}));
        const version={id:crypto.randomUUID(),candidate_id:target.id,city_id:64,format:body.format,revision:body.base_revision+1,content,brief:clone(body.brief),source_snapshot:clone(target.snapshot),facts_hash:'hash',origin:'ai',approved_at:null,created_at:new Date().toISOString()};state.versions.unshift(version);return {data:{content_id:version.id}};
      }}};
  `,
};
await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter} from 'react-router-dom';import Page from '@/pages/admin/EditorialPage';createRoot(document.getElementById('root')).render(<BrowserRouter><Page/></BrowserRouter>);`, resolveDir: root, loader: 'jsx' },
  bundle: true, jsx: 'automatic', outfile: path.join(out, 'preview.js'), alias: { '@': path.join(root, 'src') },
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
  plugins: [{ name: 'editorial-fixtures', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => Object.hasOwn(stubs, args.path) ? { path: args.path, namespace: 'fixture' } : undefined);
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'jsx', resolveDir: root }));
  } }],
});
let sourceCss = await fs.readFile('src/index.css', 'utf8');
for (const token of ['primitives', 'semantic', 'typography', 'motion']) sourceCss = sourceCss.replace(`@import './design-system/tokens/${token}.css';`, await fs.readFile(`src/design-system/tokens/${token}.css`, 'utf8'));
sourceCss += '\n' + await fs.readFile('src/pages/admin/editorial.css', 'utf8');
const config = loadConfig(path.join(root, 'tailwind.config.js'));
const css = await postcss([tailwind({ ...config, content: ['src/pages/admin/EditorialPage.jsx', 'src/components/ui/button.jsx'] })]).process(sourceCss, { from: path.join(root, 'src/index.css') });
await fs.writeFile(path.join(out, 'preview.css'), css.css);
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/preview.js' || pathname === '/preview.css') {
    res.setHeader('Content-Type', pathname.endsWith('.js') ? 'text/javascript' : 'text/css'); res.end(await fs.readFile(path.join(out, pathname.slice(1))));
  } else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/preview.css"></head><body><div id="root"></div><script src="/preview.js"></script></body></html>'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = path.join(out, `chrome-${Date.now()}`);
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--disable-extensions', '--no-first-run', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true });
let ws;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  let endpoint;
  for (let attempt = 0; attempt < 150 && !endpoint; attempt++) {
    try { const [port, route] = (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).trim().split(/\r?\n/); endpoint = `ws://127.0.0.1:${port}${route}`; } catch { await pause(100); }
  }
  assert.ok(endpoint, 'Chrome não iniciou');
  ws = new WebSocket(endpoint); await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let id = 0; const pending = new Map(), errors = [];
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (message.id) { const task = pending.get(message.id); pending.delete(message.id); message.error ? task.reject(Error(message.error.message)) : task.resolve(message.result); }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const next = ++id; pending.set(next, { resolve, reject }); ws.send(JSON.stringify({ id: next, method, params, sessionId })); });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Runtime.enable', {}, sessionId); await send('Page.enable', {}, sessionId);
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.copied=text}}});` }, sessionId);
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails)); return result.result.value;
  };
  const wait = async expression => { for (let attempt = 0; attempt < 100; attempt++) { if (await evaluate(`Boolean(${expression})`)) return; await pause(75); } throw Error(`Timeout: ${expression}\n${await evaluate('document.body.innerText')}`); };
  const click = text => evaluate(`(()=>{const el=[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===${JSON.stringify(text)});if(!el||el.disabled)throw Error('Botão indisponível: '+${JSON.stringify(text)});el.click()})()`);
  const check = text => evaluate(`(()=>{const label=[...document.querySelectorAll('label')].find(el=>el.textContent.trim()===${JSON.stringify(text)});if(!label)throw Error('Campo ausente');label.querySelector('input').click()})()`);
  const select = (label, value) => evaluate(`(()=>{const el=document.querySelector('select[aria-label='+${JSON.stringify(JSON.stringify(label))}+']');el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  const navigate = () => send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/admin/editorial` }, sessionId);
  const layout = async width => {
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'), `Overflow em ${width}`);
    if (width >= 1200) assert.ok(await evaluate(`(()=>{const el=document.querySelector('.editorial-page'),r=el.getBoundingClientRect(),p=getComputedStyle(el);return r.left+parseFloat(p.paddingLeft)<=64&&innerWidth-r.right+parseFloat(p.paddingRight)<=64&&r.width>=innerWidth-64})()`), 'Gutters desktop fora do padrão');
  };
  const results = [];
  for (const [width, height] of [[1440, 900], [1920, 1080], [390, 844]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
    await navigate(); await wait('document.querySelectorAll(".editorial-candidate").length===4');
    await select('Assunto editorial', 'works'); await wait('document.querySelectorAll(".editorial-candidate").length===1');
    await layout(width);
    await click('Analisar dados'); await wait('document.body.innerText.includes("Sem novas pautas")');
    assert.equal(await evaluate('document.querySelectorAll(".editorial-candidate").length'), 1);
    await select('Tom editorial', 'humorous');
    await select('Abordagem da notícia', 'story');
    await evaluate(`document.querySelector('.editorial-brief details summary').click()`);
    await evaluate(`(()=>{const el=document.querySelector('textarea[aria-label="Orientação de estilo"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'Gancho curto, linguagem próxima e humor leve.');el.dispatchEvent(new Event('input',{bubbles:true}))})()`);
    await evaluate(`document.querySelector('.editorial-brief details summary').click()`);
    await click('Gerar conteúdo'); await wait(`document.querySelector('input[aria-label="Título do conteúdo"]')`);
    assert.equal(await evaluate('window.fixture.versions[0].brief.tone'), 'humorous');
    assert.equal(await evaluate('window.fixture.versions[0].brief.news_style'), 'story');
    assert.equal(await evaluate('window.fixture.versions[0].brief.guidance'), 'Gancho curto, linguagem próxima e humor leve.');
    await evaluate(`(()=>{const el=document.querySelector('input[aria-label="Título do conteúdo"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'Floresta: 23 obras constam como paralisadas');el.dispatchEvent(new Event('input',{bubbles:true}))})()`);
    await wait(`document.querySelector('select[aria-label="Cidade editorial"]').disabled`);
    assert.ok(await evaluate(`document.querySelector('select[aria-label="Assunto editorial"]').disabled`), 'Edição não pode ser perdida ao trocar assunto');
    await click('Salvar versão'); await wait('document.body.innerText.includes("Versão 2")');
    await check('Conferi os fatos, as fontes e o contexto desta versão.');
    await click('Aprovar versão'); await wait('document.body.innerText.includes("Versão aprovada.")');
    await select('Tom editorial', 'informative');
    await wait('document.body.innerText.includes("O texto abaixo ainda usa o estilo anterior")');
    assert.ok(await evaluate(`document.querySelector('.editorial-publication input').disabled`), 'A seleção de estilo não pode publicar o texto anterior como se já estivesse adaptado');
    await click('Aplicar estilo em nova versão'); await wait('document.body.innerText.includes("Versão 3")');
    assert.equal(await evaluate('window.fixture.versions[0].brief.tone'), 'informative');
    assert.equal(await evaluate('window.fixture.versions[0].approved_at'), null);
    assert.equal(await evaluate('document.querySelectorAll(".editorial-candidate").length'), 1, 'Estilo novo não duplica pauta');
    await check('Conferi os fatos, as fontes e o contexto desta versão.');
    await click('Aprovar versão'); await wait('document.body.innerText.includes("Versão aprovada.")');
    await check('Publicar esta versão na área pública de notícias.');
    await click('Publicar notícia'); await wait('document.body.innerText.includes("Ver notícia publicada")');
    assert.equal(await evaluate('window.fixture.calls.filter(c=>c.name==="editorial_publish").length'), 1);
    await select('Formato do conteúdo', 'video_60'); await wait(`!document.querySelector('input[aria-label="Título do conteúdo"]')`);
    await select('Tom editorial', 'humorous');
    await select('Condução do vídeo', 'dialogue');
    await click('Gerar conteúdo'); await wait('document.body.innerText.includes("Fala 1")');
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('select[aria-label^="Quem fala"]')].map(el=>el.value)`), ['presenter_a','presenter_b']);
    await evaluate(`(()=>{const el=document.querySelector('textarea[aria-label="Cena sugerida 1"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'Captar apresentação e mapa dos registros.');el.dispatchEvent(new Event('input',{bubbles:true}))})()`);
    await click('Salvar versão'); await wait('document.body.innerText.includes("Versão 2")');
    assert.equal(await evaluate('window.fixture.versions[0].brief.video_style'), 'dialogue');
    await check('Conferi os fatos, as fontes e o contexto desta versão.');
    await click('Aprovar versão'); await wait('document.body.innerText.includes("Versão aprovada.")');
    await click('Copiar aprovado'); await wait('window.copied?.includes("Referência: Floresta")');
    assert.ok(await evaluate('window.copied.includes("Apresentador A")&&window.copied.includes("Apresentador B")&&window.copied.includes("Cena sugerida:")'));
    await select('Condução do vídeo', 'voiceover');
    await click('Aplicar estilo em nova versão'); await wait('document.body.innerText.includes("Versão 3")');
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('select[aria-label^="Quem fala"]')].map(el=>el.value)`), ['narrator','narrator']);
    await layout(width);
    const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
    await fs.writeFile(path.join(out, `editorial-${width}.png`), Buffer.from(shot.data, 'base64'));
    for (const [subject, prefix] of [['reports','/bronca/'],['streets','/mapa-pavimentacao/rua/'],['arborization','/arborizacao/arvore/']]) {
      await click('Pautas');
      await select('Assunto editorial', subject); await wait('document.querySelectorAll(".editorial-candidate").length===1');
      await wait(`document.querySelector('.editorial-sources li a')?.getAttribute('href').startsWith(${JSON.stringify(prefix)})`);
      await click('Analisar dados'); await wait('document.body.innerText.includes("Sem novas pautas")');
      assert.equal(await evaluate('window.fixture.calls.filter(c=>c.name==="editorial_analyze_module").at(-1).args.p_module'), subject);
      await select('Formato do conteúdo', 'news');
      await click('Gerar conteúdo'); await wait(`document.querySelector('input[aria-label="Título do conteúdo"]')`);
      assert.ok(!(await evaluate(`document.querySelector('input[aria-label="Título do conteúdo"]').value`)).includes('obras'), 'Texto utiliza o assunto selecionado');
      await check('Conferi os fatos, as fontes e o contexto desta versão.');
      await click('Aprovar versão'); await wait('document.body.innerText.includes("Versão aprovada.")');
      await check('Publicar esta versão na área pública de notícias.');
      await click('Publicar notícia'); await wait('document.body.innerText.includes("Ver notícia publicada")');
      await layout(width);
      const subjectShot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
      await fs.writeFile(path.join(out, `editorial-${subject}-${width}.png`), Buffer.from(subjectShot.data, 'base64'));
    }
    await select('Cidade editorial', '65'); await wait('document.body.innerText.includes("Você não possui acesso editorial")');
    assert.equal(await evaluate('document.querySelectorAll(".editorial-candidate").length'), 0);
    results.push({ width, noOverflow: true, editApprovePublish: true, scriptAfterPublication: true, cityIsolation: true, subjectFilters: true, publicationPerSubject: true,
      selectableTone: true, newsApproach: true, structuredDialogue: true, sceneEditing: true, narration: true });
  }
  await navigate(); await wait('document.querySelector(".editorial-candidate")');
  await click('Descartar');
  await evaluate(`(()=>{const el=document.querySelector('.editorial-discard textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'Falta apuração suficiente');el.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await click('Confirmar descarte'); await wait('document.body.innerText.includes("Pauta descartada.")');
  await click('Histórico'); await wait('document.body.innerText.includes("Descartada")');
  await evaluate('window.fixture.fail=true');
  await evaluate(`document.querySelector('button[aria-label="Atualizar editorial"]').click()`);
  await wait('document.querySelector("[role=alert]")');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ results, discard: true, networkErrorVisible: true, runtimeErrors: errors.length }, null, 2));
} finally { ws?.close(); chrome.kill(); server.close(); }
