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
const out = path.join(root, '.tmp/arborization-validation');
await fs.mkdir(out, { recursive: true });
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
    let rows=[{id:'t1',city_id:64,common_name:'Ipê-amarelo',scientific_name:'Handroanthus albus',origin:'nativa',status:'saudavel',address:'Praça São José',neighborhood:'Centro',latitude:-8.597,longitude:-38.574,height_m:6,crown_diameter_m:4,maintenance_action:'nenhuma',updated_at:'2026-10-15T12:00:00Z'},
      {id:'t2',city_id:64,common_name:'Nim',origin:'exotica',status:'risco',address:'Rua das Flores',neighborhood:'Bela Vista',latitude:-8.6,longitude:-38.57,maintenance_action:'vistoria',maintenance_due_at:'2026-10-20',updated_at:'2026-10-15T12:00:00Z'}];
    export const supabase={from(){let payload,operation,one=false;const filters={};const q={select(){return q},order(){return q},range(){return q},eq(k,v){filters[k]=v;return q},single(){one=true;return q},insert(p){operation='insert';payload=p;return q},update(p){operation='update';payload=p;return q},delete(){operation='delete';return q},then(ok,fail){
      if(operation&&window.failSave)return Promise.resolve({error:{message:'offline'}}).then(ok,fail);
      if(operation){window.writes.push({operation,payload});if(operation==='insert')rows.unshift({...payload,id:'new'+rows.length,updated_at:new Date().toISOString()});if(operation==='update')rows=rows.map(r=>r.id===filters.id?{...r,...payload}:r);}
      const data=rows.filter(r=>Object.entries(filters).every(([k,v])=>String(r[k])===String(v)));if(operation==='delete')rows=rows.filter(r=>r.id!==filters.id);
      return Promise.resolve({data:one?(operation==='insert'?rows[0]:data[0]):data,error:null}).then(ok,fail);
    }};return q;}};`,
};
if (!process.argv.includes('--reuse-assets')) {
await build({
  stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import L from 'leaflet';import ArborizationMapPage from '@/pages/ArborizationMapPage';const maps=[];L.Map.addInitHook(function(){maps.push(this);window.testMap=this;this.on('unload',()=>{maps.splice(maps.indexOf(this),1);window.testMap=maps.at(-1)})});if(location.search.includes('dark'))document.documentElement.classList.add('dark');createRoot(document.getElementById('root')).render(<MemoryRouter><ArborizationMapPage/></MemoryRouter>);`, resolveDir: root, loader: 'jsx' },
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
const css = await postcss([tailwind({ ...config, content: ['src/pages/ArborizationMapPage.jsx', 'src/components/arborization/*.jsx', 'src/components/map/FullscreenMapPanel.jsx', 'src/components/map/MapDisplayControls.jsx', 'src/components/CitySelector.jsx', 'src/components/ui/*.jsx'] })]).process(sourceCss, { from: path.join(root, 'src/index.css') });
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
  const results = [];
  for (const [width, height] of [[390, 844], [1440, 900], [1920, 1080]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
    await navigate(); await waitFor('document.querySelectorAll(".tree-map-pin").length===2');
    await waitFor('window.testMap.getBounds().contains([-8.597,-38.574])&&window.testMap.getBounds().contains([-8.6,-38.57])');
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'), `overflow em ${width}`);
    const margins = await evaluate('(()=>{const r=document.querySelector("main").getBoundingClientRect();const p=getComputedStyle(document.querySelector("main"));return [r.left+parseFloat(p.paddingLeft),innerWidth-r.right+parseFloat(p.paddingRight)]})()');
    if (width >= 1200) assert.ok(margins.every(value => value <= 64), `gutters em ${width}: ${margins}`);
    await capture(`map-${width}`);
    assert.ok(await evaluate(zoomInsideMap), `Zoom deve ficar visível dentro do mapa em ${width}px`);
    await evaluate('void window.testMap.setView([-8.597,-38.574],19,{animate:false})');
    await clickMapControl('Usar mapa de satélite'); await waitFor(hasSatellite);
    assert.equal(await evaluate('window.testMap.getZoom()'), 19, 'Satélite preserva o zoom máximo');
    await capture(`satellite-${width}`);
    await clickMapControl('Ir para minha localização');
    await waitFor('window.testMap.getCenter().distanceTo([-8.599,-38.571])<2');
    await clickMapControl('Reenquadrar árvores no mapa');
    await waitFor('window.testMap.getBounds().contains([-8.597,-38.574])&&window.testMap.getBounds().contains([-8.6,-38.57])');
    await clickMapControl('Usar mapa padrão'); await waitFor(`!(${hasSatellite})`);
    assert.ok(await evaluate('document.querySelector(".leaflet-control-scale-line").textContent.includes("m")'));
    await evaluate('document.querySelector(".tree-map-pin").click()');
    await waitFor('document.querySelector("[data-testid=tree-details-dialog]")');
    assert.ok(await evaluate('document.querySelector("[data-testid=tree-details-dialog]").innerText.includes("Manejo necessário")&&document.querySelector("[data-testid=tree-details-dialog]").innerText.includes("Coordenadas:")'));
    assert.equal(await evaluate('document.querySelectorAll("article").length'), 0, 'Detalhes devem abrir no modal do mapa');
    await capture(`details-${width}`);
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
    await closeDetails();
    if (width < 980) await click('Filtros');
    await click('Lista'); await waitFor('document.querySelectorAll("article").length===2');
    await click('Ver detalhes'); await waitFor('document.querySelector("[data-testid=tree-details-dialog]")');
    assert.equal(await evaluate('document.querySelectorAll("article").length'), 0);
    await closeDetails();
    await click('Lista'); await waitFor('document.querySelectorAll("article").length===2');
    await input('Buscar árvore', 'sao jose'); await waitFor('document.querySelectorAll("article").length===1');
    await click('Limpar filtros'); await select('Manejo', 'pending'); await waitFor('document.querySelectorAll("article").length===1');
    assert.ok(await evaluate('document.querySelector("article").innerText.includes("Nim")'));
    await click('Limpar filtros'); await click('Cadastrar árvore'); await waitFor('document.querySelector("[role=dialog]")');
    await input('Nome popular / identificação *', 'Oiti de teste');
    assert.ok(await evaluate(zoomInsideMap), 'Zoom deve ficar visível no mapa do formulário');
    await clickMapControl('Usar mapa de satélite'); await waitFor(hasSatellite);
    assert.equal(await evaluate('(window.addressRequests||[]).length'), 0, 'Trocar camada não seleciona uma posição no formulário');
    await clickMapControl('Usar mapa padrão'); await waitFor(`!(${hasSatellite})`);
    await click('Usar GPS');
    await waitFor('[...document.querySelectorAll("label")].find(e=>e.firstChild.textContent==="Latitude").querySelector("input").value==="-8.5990000"');
    await waitForAddress();
    assert.equal(await addressValue(), 'Rua Joaquim Marques de Sá');
    assert.ok(await evaluate(`(()=>{const dialog=document.querySelector('[role=dialog]');const map=dialog.querySelector('.leaflet-container');return ['Endereço / referência','Bairro'].every(label=>{const field=[...dialog.querySelectorAll('label')].find(e=>e.firstChild.textContent===label);return Boolean(map.compareDocumentPosition(field)&Node.DOCUMENT_POSITION_FOLLOWING)})})()`));
    await select('Manejo necessário', 'poda');
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
    await capture(`form-${width}`);
    await click('Salvar árvore'); await waitFor('document.body.innerText.includes("Árvore cadastrada.")');
    await waitFor('!document.querySelector("[role=dialog] form")');
    await waitFor('document.querySelector("[data-testid=tree-details-dialog]")?.innerText.includes("Oiti de teste")');
    assert.ok(await evaluate('window.writes[0].payload.city_id===64&&window.writes[0].payload.maintenance_action==="poda"'));
    assert.ok(await evaluate('window.writes[0].payload.address==="Rua Joaquim Marques de Sá"&&window.writes[0].payload.neighborhood==="Centro"'));
    await click('Editar árvore'); await waitFor('document.querySelector("[role=dialog] form")');
    await input('Nome popular / identificação *', 'Oiti atualizado'); await click('Salvar árvore'); await waitFor('document.body.innerText.includes("Árvore atualizada.")');
    await waitFor('!document.querySelector("[role=dialog] form")');
    await waitFor('document.querySelector("[data-testid=tree-details-dialog]")?.innerText.includes("Oiti atualizado")');
    await click('Excluir cadastro'); await waitFor('document.querySelector("[role=alertdialog]")');
    await click('Excluir cadastro'); await waitFor('document.body.innerText.includes("Cadastro excluído.")');
    await waitFor('!document.querySelector("[role=alertdialog]")');
    assert.equal(await evaluate('window.writes.filter(w=>w.operation==="delete").length'), 1);
    await click('Mapa'); await waitFor('document.querySelectorAll(".tree-map-pin").length===2');
    await clickMapControl('Usar mapa de satélite'); await waitFor(hasSatellite);
    await click('Tela cheia'); await waitFor('document.querySelector("[role=dialog] .leaflet-container")');
    assert.ok(await evaluate(hasSatellite), 'Tela cheia preserva a camada de satélite');
    await evaluate('document.querySelector("[role=dialog] .tree-map-pin").click()');
    await waitFor('document.querySelector("[data-testid=tree-details-dialog]")');
    await click('Editar árvore'); await waitFor('document.querySelector("[role=dialog] form")');
    await click('Cancelar'); await waitFor('document.querySelectorAll("[role=dialog]").length===1');
    await evaluate('document.querySelector("[role=dialog] .tree-map-pin").click()');
    await waitFor('document.querySelector("[data-testid=tree-details-dialog]")');
    await click('Excluir cadastro'); await waitFor('document.querySelector("[role=alertdialog]")');
    await click('Cancelar'); await waitFor('!document.querySelector("[role=alertdialog]")');
    assert.ok(await evaluate('document.querySelector("[role=dialog] .leaflet-container")!==null'));
    await click('Sair da tela cheia'); await waitFor('!document.querySelector("[role=dialog]")');
    assert.ok(await evaluate('document.querySelectorAll(".tree-map-pin").length===2'));
    assert.ok(await evaluate(hasSatellite), 'Sair da tela cheia preserva a camada de satélite');
    await navigate('?public'); await waitFor('document.querySelectorAll(".tree-map-pin").length===2');
    assert.ok(await evaluate('![...document.querySelectorAll("button")].some(b=>b.textContent.includes("Cadastrar árvore"))'));
    await evaluate('document.querySelector(".tree-map-pin").click()');
    await waitFor('document.querySelector("[data-testid=tree-details-dialog]")');
    assert.ok(await evaluate('![...document.querySelectorAll("[data-testid=tree-details-dialog] button")].some(b=>/Editar|Excluir/.test(b.textContent))'));
    await navigate(); await waitFor('document.querySelectorAll(".tree-map-pin").length===2');
    await evaluate(`document.querySelector('button[aria-label="Selecionar cidade"]').click()`);
    await waitFor('document.querySelector("[role=option]")'); await evaluate('[...document.querySelectorAll("[role=option]")].find(e=>e.textContent.includes("Recife")).click()');
    await waitFor('document.querySelector("h1").parentElement.textContent.includes("Recife")&&!document.body.innerText.includes("Carregando árvores")&&document.querySelectorAll(".tree-map-pin").length===0');
    assert.ok(await evaluate('!document.body.innerText.includes("O inventário está começando")&&!document.body.innerText.includes("Cadastrar primeira árvore")'));
    assert.ok(await evaluate('!document.body.innerText.includes("Ipê-amarelo")&&![...document.querySelectorAll("button")].some(b=>b.textContent.includes("Cadastrar árvore"))'));
    results.push({ width, overflow: false, margins, mapControls: 'satélite, zoom 19, localização, reenquadramento, escala e camada preservada em tela cheia OK', filters: 'OK', createEditDelete: 'OK', modalDetailsAndList: 'OK', fullscreen: 'modal, edição e exclusão OK', publicAndCityScope: 'OK' });
    console.log(`Navegador ${width}px: CRUD, filtros, tela cheia e acesso por cidade OK`);
  }
  await navigate('?dark'); await waitFor('document.querySelectorAll(".tree-map-pin").length===2'); await capture('map-dark-1920');
  await evaluate('document.querySelector(".tree-map-pin").click()');
  await waitFor('document.querySelector("[data-testid=tree-details-dialog]")');
  await capture('details-dark-1920'); await closeDetails();
  await click('Cadastrar árvore'); await waitFor('document.querySelector("[role=dialog]")');
  await input('Nome popular / identificação *', 'Falha de conexão'); await click('Usar GPS');
  await waitForAddress();
  // Correções feitas durante a consulta não podem ser sobrescritas.
  await evaluate('window.nextAddressDelay=700;void testMap.fire("click",{latlng:{lat:-8.5991,lng:-38.571}})');
  await waitFor('window.addressRequests.length===2');
  await input('Endereço / referência', 'Endereço conferido manualmente');
  await input('Bairro', 'Bairro revisado');
  await waitForAddress();
  assert.equal(await addressValue(), 'Endereço conferido manualmente');
  assert.ok(await evaluate(`document.querySelector('[role=dialog]').innerText.includes('Rua e bairro preenchidos')&&[...document.querySelectorAll('[role=dialog] label')].find(e=>e.firstChild.textContent==='Bairro').querySelector('input').value==='Bairro revisado'`));
  // Arrastar o marcador inicia uma nova consulta para a nova localização.
  await evaluate('void testMap.eachLayer(layer=>{if(layer.options.draggable&&layer.setLatLng){layer.setLatLng([-8.6015,-38.572]);layer.fire("dragend")}})');
  await waitFor(`document.querySelector('[role=dialog] input[placeholder="Rua, número ou praça"]').value==="Rua Nova"`);
  await waitForAddress();
  // A resposta de um ponto anterior chega depois da resposta do ponto atual.
  await evaluate('window.nextAddressDelay=1100;void testMap.fire("click",{latlng:{lat:-8.5992,lng:-38.571}})');
  await waitFor('window.addressRequests.length===4');
  await evaluate('void testMap.fire("click",{latlng:{lat:-8.602,lng:-38.573}})');
  await waitFor('window.addressRequests.length===5'); await waitForAddress(); await pause(1200);
  assert.equal(await addressValue(), 'Rua Nova');
  // Uma falha mantém o ponto e permite informar o endereço manualmente.
  await evaluate('window.failAddress=true;void testMap.fire("click",{latlng:{lat:-8.604,lng:-38.574}})');
  await waitFor('document.querySelector("[role=dialog] [role=status]").textContent.includes("Não foi possível identificar")');
  await input('Endereço / referência', 'Rua informada manualmente'); await input('Bairro', 'Centro');
  await evaluate('window.failSave=true'); await click('Salvar árvore'); await waitFor('document.querySelector("[role=dialog] [role=alert]")');
  assert.ok(await evaluate('document.querySelector("[role=dialog]")!==null&&window.writes.length===0'));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ results, addressLookup: 'GPS, clique, arraste, campos abaixo do mapa, correção manual, respostas fora de ordem e falha OK', errorKeepsDraft: 'OK', runtimeErrors: errors.length }, null, 2));
} finally { ws?.close(); chrome.kill(); server.close(); }
