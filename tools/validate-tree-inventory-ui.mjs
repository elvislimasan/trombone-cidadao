// QA isolado: componentes reais, banco em memória e nenhum dado de produção.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import loadConfig from 'tailwindcss/loadConfig.js';

const root = process.cwd();
const out = path.join(root, '.tmp/tree-inventory-validation');
await fs.mkdir(out, { recursive: true });
const photoPath = path.join(out, 'tree-photo.png');
await fs.writeFile(photoPath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64'));
const stubs = {
  '@/contexts/CityContext': `import React,{useState,createContext,useContext} from 'react';
    const cities=[{id:64,name:'Floresta',state:{uf:'PE'}},{id:65,name:'Recife',state:{uf:'PE'}}];const Context=createContext();
    export function CityViewProvider({children}){const [cityId,setCityId]=useState(64);const city=cities.find(c=>c.id===cityId);return <Context.Provider value={{cityId,city,cityName:city?.name,cities,setCityId,loadingCities:false}}>{children}</Context.Provider>}
    export const useCityView=()=>useContext(Context);export const useCity=()=>({cities,loadingCities:false});`,
  '@/hooks/useCanManagePavement': `import {useCityView} from '@/contexts/CityContext';export function useCanManagePavement(){const {cityId}=useCityView();return {canManage:!location.search.includes('public')&&cityId===64,loading:false}}`,
  '@/design-system/theme/ThemeProvider': `export const useTheme=()=>({resolved:location.search.includes('dark')?'dark':'light'});`,
  '@/lib/geocodeCity': `export const geocodeCity=async()=>({lat:-8.598,lng:-38.57});`,
  '@/lib/reverseGeocodePin': `export async function reverseGeocodePin(point){
    window.addressRequests=window.addressRequests||[];window.addressRequests.push(point);
    const delay=window.nextAddressDelay||20;window.nextAddressDelay=0;const fail=window.failAddress;
    await new Promise(resolve=>setTimeout(resolve,delay));
    return fail?null:{address:point.lat < -8.6005?'Rua Nova':'Rua Joaquim Marques de Sá',suburb:point.lat < -8.6005?'Três Marias':'Centro'};
  }`,
  '@/lib/nativeDownload': `export const salvarDocumento=async()=>{};`,
  '@/lib/customSupabaseClient': `
    window.writes=[];window.failSave=false;
    const species=[{id:'s1',city_id:64,common_name:'Ipê-amarelo',scientific_name:'Handroanthus albus',origin:'nativa'},{id:'s2',city_id:64,common_name:'Nim',scientific_name:'Azadirachta indica',origin:'exotica'}];
    const neighborhoods=[{id:'b1',city_id:64,name:'Centro'},{id:'b2',city_id:64,name:'Três Marias'},{id:'b3',city_id:64,name:'Bela Vista'}];
    let rows=[{id:'t1',city_id:64,species_id:'s1',bairro_id:'b1',common_name:'Ipê-amarelo',scientific_name:'Handroanthus albus',origin:'nativa',status:'saudavel',address:'Praça São José',neighborhood:'Centro',latitude:-8.597,longitude:-38.574,height_m:6,crown_diameter_m:4,maintenance_action:'nenhuma',created_at:'2026-10-15T12:00:00Z',updated_at:'2026-10-15T12:00:00Z',planted_by:'prefeitura',planted_at:'2025-02-03',estimated_birth_year:1920,is_historic_site:true},
      {id:'t2',city_id:64,species_id:'s2',bairro_id:'b3',common_name:'Nim',scientific_name:'Azadirachta indica',origin:'exotica',status:'risco',address:'Rua das Flores',neighborhood:'Bela Vista',latitude:-8.6,longitude:-38.57,maintenance_action:'vistoria',maintenance_due_at:'2026-10-20',created_at:'2026-10-15T12:00:00Z',updated_at:'2026-10-15T12:00:00Z',planted_by:'nao_informado'}];
    let care=[];const reports=[{id:'r1',city_id:64,tree_id:'t1',title:'Poda solicitada',tree_service:'poda',status:'pending',created_at:'2026-10-16T12:00:00Z'}];
    export const supabase={auth:{async getUser(){return {data:{user:{id:'u1'}}}}},storage:{from(){return {async upload(){return {error:null}},getPublicUrl(path){return {data:{publicUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='}}},async remove(){return {error:null}}}}},
      rpc(name){const result={data:name==='city_tree_request_counts'?[{tree_id:'t1',total:1,poda:1,remocao:0}]:name==='nearby_report_trees'?[rows[0]]:[],error:null};const q={order(){return q},range(){return q},then(ok,fail){return Promise.resolve(result).then(ok,fail)}};return q},
      from(table){let payload,operation,one=false;const filters=[];const q={select(){return q},order(){return q},range(){return q},limit(){return q},eq(k,v){filters.push(r=>String(r[k])===String(v));return q},neq(k,v){filters.push(r=>String(r[k])!==String(v));return q},in(k,v){filters.push(r=>v.includes(r[k]));return q},single(){one=true;return q},maybeSingle(){one=true;return q},insert(p){operation='insert';payload=p;return q},update(p){operation='update';payload=p;return q},delete(){operation='delete';return q},then(ok,fail){
      if(operation&&window.failSave)return Promise.resolve({error:{message:'offline'}}).then(ok,fail);
      if(operation){window.writes.push({table,operation,payload});if(table==='city_trees'){if(operation==='insert')rows.unshift({...payload,id:'new'+rows.length,created_at:new Date().toISOString(),updated_at:new Date().toISOString()});if(operation==='update')rows=rows.map(r=>filters.every(f=>f(r))?{...r,...payload}:r);}if(table==='city_tree_care')care.push({...payload,id:'c'+care.length});if(table==='city_tree_species')species.unshift({...payload,id:'s-new'});}
      let source=table==='city_trees'?rows:table==='city_tree_species'?species:table==='bairros'?neighborhoods:table==='cities'?[{id:64,name:'Floresta'}]:table==='city_tree_care'?care:table==='reports'?reports:[];
      const data=source.filter(r=>filters.every(f=>f(r)));if(operation==='delete'&&table==='city_trees')rows=rows.filter(r=>!filters.every(f=>f(r)));
      return Promise.resolve({data:one?(operation==='insert'?source[0]:data[0]):data,error:null}).then(ok,fail);
    }};return q;}};`,
};
if (!process.argv.includes('--reuse-assets')) {
await build({
  stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter,Routes,Route} from 'react-router-dom';import TreePage from '@/pages/TreePage';import ReportTreePicker,{useNearbyReportTrees} from '@/components/report/ReportTreePicker';import {CityViewProvider} from '@/contexts/CityContext';import L from 'leaflet';import ArborizationMapPage from '@/pages/ArborizationMapPage';function ReportHarness(){const [value,setValue]=React.useState({category:'poda',location:{lat:-8.597,lng:-38.574},city_id:64,address:'Praça São José'});const nearby=useNearbyReportTrees(value.category,value.location,value.city_id);window.reportValue=value;return <div className='page-shell-fluid'><ReportTreePicker value={value} onChange={changes=>setValue(v=>({...v,...changes}))} nearby={nearby} onSelect={tree=>setValue(v=>({...v,tree_id:tree.id,tree_label:tree.common_name}))} resolveCity={async()=>64} authenticated /></div>}const maps=[];L.Map.addInitHook(function(){maps.push(this);window.testMap=this;this.on('unload',()=>{maps.splice(maps.indexOf(this),1);window.testMap=maps.at(-1)})});if(location.search.includes('dark'))document.documentElement.classList.add('dark');createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={[location.search.includes('detail')?'/arborizacao/arvore/t1':location.search.includes('report')?'/report':'/']}><CityViewProvider><Routes><Route path="/" element={<ArborizationMapPage/>}/><Route path="/arborizacao/arvore/:id" element={<TreePage/>}/><Route path="/report" element={<ReportHarness/>}/></Routes></CityViewProvider></MemoryRouter>);`, resolveDir: root, loader: 'jsx' },
  bundle: true, jsx: 'automatic', loader: { '.png': 'dataurl' }, outfile: path.join(out, 'preview.js'),
  define: { 'process.env.NODE_ENV': '"production"' }, alias: { '@': path.join(root, 'src') },
  plugins: [{ name: 'fixtures', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => stubs[args.path] ? { path: args.path, namespace: 'fixture' } : undefined);
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'jsx', resolveDir: root }));
  } }],
});
let sourceCss = await fs.readFile('src/index.css', 'utf8');
for (const token of ['primitives', 'semantic', 'typography', 'motion']) sourceCss = sourceCss.replace(`@import './design-system/tokens/${token}.css';`, await fs.readFile(`src/design-system/tokens/${token}.css`, 'utf8'));
const config = loadConfig(path.join(root, 'tailwind.config.js'));
const css = await postcss([tailwind({ ...config, content: ['src/pages/ArborizationMapPage.jsx', 'src/pages/TreePage.jsx', 'src/components/report/ReportTreePicker.jsx', 'src/components/arborization/*.jsx', 'src/components/map/FullscreenMapPanel.jsx', 'src/components/map/MapDisplayControls.jsx', 'src/components/CitySelector.jsx', 'src/components/ui/*.jsx'] })]).process(sourceCss, { from: path.join(root, 'src/index.css') });
await fs.writeFile(path.join(out, 'preview.css'), css.css + '\n' + await fs.readFile('node_modules/leaflet/dist/leaflet.css', 'utf8'));
}
const server = http.createServer(async (req, res) => {
  const file = req.url.split('?')[0];
  if (file === '/preview.js' || file === '/preview.css') {
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'text/css'); res.end(await fs.readFile(path.join(out, file.slice(1))));
  } else { res.setHeader('Content-Type', 'text/html'); res.end('<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/preview.css"></head><body><div id="root"></div><script src="/preview.js"></script></body></html>'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = path.join(out, `chrome-${Date.now()}`);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--disable-extensions', '--no-first-run', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws;
try {
  chrome.on('error', error => { throw error; });
  let endpoint;
  for (let attempt = 0; attempt < 200 && !endpoint; attempt++) {
    try { const [port, route] = (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).trim().split(/\r?\n/); endpoint = `ws://127.0.0.1:${port}${route}`; } catch { await pause(100); }
  }
  assert.ok(endpoint, 'Chrome não abriu a depuração local');
  ws = new WebSocket(endpoint); await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let id = 0; const pending = new Map(), errors = [];
  ws.addEventListener('message', event => { const message = JSON.parse(event.data); if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails); if (message.id) { const task = pending.get(message.id); pending.delete(message.id); message.error ? task.reject(Error(message.error.message)) : task.resolve(message.result); } });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const next = ++id; pending.set(next, { resolve, reject }); ws.send(JSON.stringify({ id: next, method, params, sessionId })); });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Runtime.enable', {}, sessionId); await send('Page.enable', {}, sessionId);
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok){ok({coords:{latitude:-8.599,longitude:-38.571}});}}});` }, sessionId);
  const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId); if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
  const waitFor = async expression => { for (let i = 0; i < 100; i++) { if (await evaluate(`Boolean(${expression})`)) return; await pause(100); } throw Error(`Timeout: ${expression}\n${await evaluate('document.body.innerText')}\n${JSON.stringify(errors)}`); };
  const click = label => evaluate(`(()=>{const scope=document.querySelector('[role=alertdialog]')||[...document.querySelectorAll('[role=dialog]')].at(-1)||document;const button=[...scope.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!button)throw Error('Botão ausente: '+${JSON.stringify(label)});button.click()})()`);
  const clickMapControl = label => evaluate(`(()=>{const scope=[...document.querySelectorAll('[role=dialog]')].at(-1)||document;scope.querySelector('button[aria-label=${JSON.stringify(label)}]').click()})()`);
  const hasSatellite = 'Object.values(window.testMap._layers).some(layer=>layer._url?.includes("World_Imagery"))';
  const zoomInsideMap = `(()=>{const map=window.testMap.getContainer();const bounds=map.getBoundingClientRect();const zoom=map.querySelector('.leaflet-control-zoom').getBoundingClientRect();return zoom.top>=bounds.top&&zoom.bottom<=bounds.bottom&&zoom.left>=bounds.left&&zoom.right<=bounds.right})()`;
  const input = (label, value) => evaluate(`(()=>{const scope=[...document.querySelectorAll('[role=dialog]')].at(-1)||document;const element=[...scope.querySelectorAll('label')].find(e=>e.firstChild.textContent===${JSON.stringify(label)}).querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(element,${JSON.stringify(value)});element.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  const addressValue = () => evaluate(`document.querySelector('[role=dialog] input[placeholder="Rua, número ou praça"]').value`);
  const waitForAddress = () => waitFor('document.querySelector("[role=dialog] [role=status]").textContent.includes("Rua e bairro preenchidos")');
  const select = (label, value) => evaluate(`(()=>{const element=[...document.querySelectorAll('label')].find(e=>e.firstChild.textContent===${JSON.stringify(label)}).querySelector('select');element.value=${JSON.stringify(value)};element.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  const navigate = query => send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/${query || ''}` }, sessionId);
  const capture = async name => { await pause(300); const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId); await fs.writeFile(path.join(out, `${name}.png`), Buffer.from(shot.data, 'base64')); };
  const closeDetails = async () => { await evaluate('document.querySelector("[data-testid=tree-details-dialog] button.absolute").click()'); await waitFor('!document.querySelector("[data-testid=tree-details-dialog]")'); };
  const fieldValue = label => evaluate(`(()=>{const scope=[...document.querySelectorAll('[role=dialog]')].at(-1)||document;return [...scope.querySelectorAll('label')].find(e=>e.firstChild.textContent===${JSON.stringify(label)}).querySelector('select,input').value})()`);
  const choose = (label,value) => evaluate(`(()=>{const scope=[...document.querySelectorAll('[role=dialog]')].at(-1)||document;const el=[...scope.querySelectorAll('label')].find(e=>e.firstChild.textContent===${JSON.stringify(label)}).querySelector('select,input');Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}))})()`);
  const results=[];
  for(const [width,height] of [[390,844],[800,900],[1440,900],[1920,1080]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);
    await navigate();await waitFor('document.querySelectorAll(".tree-map-pin").length===2');
    await waitFor('document.body.innerText.includes("Solicitações de poda")');
    assert.ok(await evaluate('!document.body.innerText.includes("Árvores em risco")'));
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
    const margins=await evaluate('(()=>{const r=document.querySelector("main").getBoundingClientRect();const p=getComputedStyle(document.querySelector("main"));return [r.left+parseFloat(p.paddingLeft),document.documentElement.clientWidth-r.right+parseFloat(p.paddingRight)]})()');
    if(width>=1200)assert.ok(margins.every(v=>v<=64),JSON.stringify({width,margins}));
    await capture('map-'+width);
    assert.ok(await evaluate('document.querySelector("#arborization-filters").getBoundingClientRect().height>100'), 'Filtros básicos sempre visíveis');
    assert.ok(await evaluate('(()=>{const map=document.querySelector("[data-testid=tree-map]").getBoundingClientRect();const toggle=document.querySelector(".arborization-map-toolbar").getBoundingClientRect();return toggle.left>=map.left&&toggle.right<=map.right&&toggle.top>=map.top})()'), 'Alternância de visualização dentro do mapa');
    if(width<980){
      assert.ok(await evaluate('getComputedStyle(document.querySelector(".arborization-filter-advanced")).display==="none"'));
      await click('Mais filtros');
    }else{
      assert.ok(await evaluate('(()=>{const filters=document.querySelector("#arborization-filters").getBoundingClientRect();const map=document.querySelector("[data-testid=tree-map]").getBoundingClientRect();const summary=document.querySelector(".arborization-neighborhoods").getBoundingClientRect();return map.left>filters.right&&Math.abs(map.top-filters.top)<2&&Math.abs(map.left-summary.left)<2})()'), 'Desktop com filtros ao lado do mapa e resumo na coluna do mapa');
      assert.equal(await evaluate('new Set([...document.querySelectorAll(".arborization-stat")].map(el=>el.getBoundingClientRect().top)).size'),1,'Quatro indicadores na mesma linha');
    }
    await click('Lista');await waitFor('document.querySelectorAll("article").length===2');
    await click('Mapa');await waitFor('document.querySelectorAll(".tree-map-pin").length===2');
    await evaluate('document.querySelector(".arborization-additional-filters").open=true');
    await choose('Responsável pelo plantio','prefeitura');await choose('Ano do plantio','2025');
    assert.equal(await evaluate('document.querySelectorAll(".tree-map-pin").length'),2,'Filtros aguardam a aplicação');
    await evaluate('document.querySelector(".arborization-apply").click()');
    await waitFor('document.querySelectorAll(".tree-map-pin").length===1');
    await evaluate('document.querySelector(".arborization-filter-heading button").click()');
    await waitFor('document.querySelectorAll(".tree-map-pin").length===2');
    await evaluate(`(()=>{const input=document.querySelector('[aria-label="Idade mínima"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'100');input.dispatchEvent(new Event('input',{bubbles:true}))})()`);
    await evaluate('document.querySelector(".arborization-apply").click()');
    await waitFor('document.querySelectorAll(".tree-map-pin").length===1');
    await evaluate('document.querySelector(".arborization-filter-heading button").click()');
    await waitFor('document.querySelectorAll(".tree-map-pin").length===2');
    await clickMapControl('Usar mapa de satélite');await waitFor(hasSatellite);
    await click('Tela cheia');await waitFor('document.querySelector("[role=dialog] .leaflet-container")');
    assert.ok(await evaluate(hasSatellite),'Tela cheia mantém a camada');
    assert.ok(await evaluate(zoomInsideMap),'Zoom dentro do mapa em tela cheia');
    await click('Sair da tela cheia');await waitFor('!document.querySelector("[role=dialog]")');
    await clickMapControl('Usar mapa padrão');await waitFor(`!(${hasSatellite})`);
    await click('Cadastrar árvore');
    await waitFor('document.querySelector("[role=dialog] select option[value=s1]")');
    assert.ok(await evaluate('![...document.querySelectorAll("[role=dialog] label")].some(el=>el.firstChild.textContent==="Nome científico"||el.firstChild.textContent==="Origem")'));
    const footerVisible = '(()=>{const r=document.querySelector("[data-testid=tree-form-footer]").getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()';
    assert.ok(await evaluate(footerVisible),'Ações visíveis ao abrir o formulário');
    await capture('form-initial-'+width);
    await choose('Nome popular','s1');
    await waitFor('document.querySelector("[data-testid=selected-species-info]").textContent.includes("Handroanthus albus")');
    await choose('Nome popular','__new_species__');
    await waitFor('document.querySelectorAll("[role=dialog]").length===2');
    await capture('new-species-'+width);
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
    await click('Cancelar inclusão');await waitFor('document.querySelectorAll("[role=dialog]").length===1');
    assert.equal(await fieldValue('Nome popular'),'s1','Cancelar mantém a seleção anterior');
    if(width===1440){
      await choose('Nome popular','__new_species__');await waitFor('document.querySelectorAll("[role=dialog]").length===2');
      await input('Nome popular da espécie','Nova espécie');await input('Nome científico da espécie','Species test');await choose('Origem da espécie','nativa');
      await click('Adicionar ao catálogo');await waitFor('document.querySelectorAll("[role=dialog]").length===1');
      assert.equal(await fieldValue('Nome popular'),'s-new');
      assert.ok(await evaluate('document.querySelector("[data-testid=selected-species-info]").textContent.includes("Species test")'));
      assert.equal(await evaluate('window.writes.filter(row=>row.table==="city_trees").length'),0,'Salvar espécie não envia o cadastro da árvore');
    }
    await choose('Nome popular','s2');
    await evaluate('document.querySelector("[data-testid=tree-extra-fields]").open=true');
    await click('Usar GPS');await waitForAddress();assert.equal(await fieldValue('Bairro'),'b1');
    await choose('Bairro','b2');await choose('Responsável pelo plantio','prefeitura');
    await input('Ano de nascimento estimado','1910');
    if(width===1440){
      const {root:doc}=await send('DOM.getDocument',{},sessionId);
      const {nodeId}=await send('DOM.querySelector',{nodeId:doc.nodeId,selector:'[role=dialog] input[type=file]'},sessionId);
      await send('DOM.setFileInputFiles',{nodeId,files:[photoPath]},sessionId);
      await waitFor('document.querySelector("[role=dialog] img")');
    }
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
    await capture('form-'+width);
    if(width===1920){await evaluate('window.failSave=true');await click('Salvar árvore');await waitFor('document.querySelector("[role=dialog] [role=alert]")');assert.equal(await fieldValue('Nome popular'),'s2');await evaluate('window.failSave=false');}
    await click('Salvar árvore');await waitFor('document.body.innerText.includes("Árvore cadastrada.")');
    assert.ok(await evaluate('(()=>{const payload=window.writes.find(row=>row.table==="city_trees").payload;return payload.species_id==="s2"&&payload.scientific_name==="Azadirachta indica"&&payload.bairro_id==="b2"&&payload.neighborhood==="Três Marias"})()'));
    if(width===1440)assert.ok(await evaluate('Boolean(window.writes.find(row=>row.table==="city_trees").payload.photo_url)'));
    await navigate('?detail');await waitFor('document.querySelector("[data-testid=tree-page]")');
    await waitFor('document.body.innerText.includes("Solicitação de Poda")');
    assert.ok(await evaluate('document.body.innerText.includes("15/10/2026")&&document.body.innerText.includes("106 anos")'));
    await choose('Serviço','poda');await input('Data de realização','2026-10-10');
    await click('Registrar no histórico');await waitFor('document.body.innerText.includes("Poda: serviço realizado")');
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
    await capture('detail-'+width);
    await navigate('?report');await waitFor('document.querySelector("button[aria-pressed=false]")');
    await evaluate('document.querySelector("button[aria-pressed=false]").click()');
    await waitFor('window.reportValue.tree_id==="t1"');await waitFor('document.body.innerText.includes("Já existem solicitações abertas")');
    await click('Desvincular');await click('Cadastrar árvore e vincular à bronca');
    await waitFor('document.querySelector("[role=dialog] select option[value=s1]")');
    assert.ok(await evaluate('!document.querySelector("[role=dialog]").innerText.includes("Responsável pelo plantio")'));
    await choose('Nome popular','s1');await choose('Bairro','b1');await click('Usar esta árvore na bronca');
    await waitFor('window.reportValue.tree_registration?.species_id==="s1"');
    assert.equal(await evaluate('window.writes.length'),0,'Cadastro é rascunho até enviar a bronca');
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
    await capture('report-'+width);
    results.push({width,margins,linkedSpecies:true,registeredNeighborhood:true,history:true,reportLink:true});
  }
  await navigate('?dark');await waitFor('document.querySelectorAll(".tree-map-pin").length===2');await capture('map-dark-1920');
  await navigate('?detail&public');await waitFor('document.querySelector("[data-testid=tree-page]")');
  assert.ok(await evaluate('!document.body.innerText.includes("Registrar serviço realizado")&&!document.body.innerText.includes("Editar árvore")'));
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({results,publicReadOnly:true,runtimeErrors:errors.length},null,2));
} finally {ws?.close();chrome.kill();server.close();}
