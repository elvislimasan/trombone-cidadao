// Navegador real, componentes reais e dados simulados. Não usa .env nem produção.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import loadConfig from 'tailwindcss/loadConfig.js';

const root = process.cwd(), out = path.join(root, '.tmp/tree-adoption-ui');
await fs.mkdir(out, { recursive: true });
const stubs = {
  '@/contexts/SupabaseAuthContext': `export const useAuth=()=>({user:location.search.includes('visitor')?null:{id:'citizen',name:'Maria da Silva',phone:'87999999999',email:'maria@example.test'},signOut:async()=>{}});`,
  '@/hooks/usePermissions': `export const usePermissions=()=>({loading:false,error:false,isMaster:false,municipalities:[{city_id:64}],planningCityIds:[],treeAssignments:[{city_id:64}],canWrite:()=>location.search.includes('manager')});`,
  '@/components/Notifications': `export default function Notifications(){return null;}`,
  '@/contexts/CityContext': `import React,{useState,createContext,useContext} from 'react';
    const cities=[{id:64,name:'Floresta',state:{uf:'PE'}},{id:65,name:'Recife',state:{uf:'PE'}}];const Context=createContext();
    export function CityViewProvider({children,value}){const [cityId,setCityId]=useState(64);const city=cities.find(c=>c.id===cityId);return <Context.Provider value={value||{cityId,city,cityName:city?.name,cities,setCityId,loadingCities:false}}>{children}</Context.Provider>}
    export const useCityView=()=>useContext(Context);export const useCity=()=>({cities:location.search.includes('no-city-metadata')?cities.slice(1):cities,activeCity:cities[0],loadingCities:false});`,
  '@/design-system/theme/ThemeProvider': `export const useTheme=()=>({resolved:'light',setPreference(){}});`,
  '@/lib/reverseGeocodePin': `export async function reverseGeocodePin(){const wrong=window.wrongCity;const delay=window.geoDelay||0;await new Promise(resolve=>setTimeout(resolve,delay));return {address:'Rua do Plantio, 20',suburb:'Centro',city:wrong?'Floresta':'Floresta',state_uf:wrong?'PR':'PE'}}`,
  '@/lib/customSupabaseClient': `
    const baseSpecies={id:'species1',city_id:64,common_name:'Ipê-amarelo',scientific_name:'Handroanthus albus',sidewalk_suitability:'com_restricoes',summary:'Espécie do catálogo municipal.',planting_guidance:'Avaliar o espaço e a rede aérea.'};
    const species=[baseSpecies,...Array.from({length:24},(_,i)=>({...baseSpecies,id:'extra'+i,common_name:'Muda teste '+String(i+1).padStart(2,'0')})),...['unregistered','consultation','unavailable'].map(id=>({...baseSpecies,id,common_name:id}))];
    let nurseries=location.search.includes('nursery-audit')?[{id:'nursery1',city_id:64,name:'Viveiro municipal',provider:'viveiro_municipal',pickup_details:{address:'Rua do Viveiro, 20',latitude:-8.6,longitude:-38.57,schedule:[{days:[1],from:'08:00',to:'12:00'}],notes:''}}]:[];
    let availability=[...species.filter(s=>!['unregistered','consultation','unavailable'].includes(s.id)).map(s=>({species_id:s.id,provider:'viveiro_municipal',status:'disponivel'})),{species_id:'species1',provider:'instituto_florestar',status:'indisponivel'},{species_id:'consultation',provider:'viveiro_municipal',status:'sob_consulta'},{species_id:'unavailable',provider:'viveiro_municipal',status:'indisponivel'}];
    availability[0].instructions='Orientação anterior: confirme a retirada com a equipe.';
    if(location.search.includes('nursery-audit'))availability.forEach(row=>row.nursery_id='nursery1');const initialAvailability=structuredClone(availability);
    window.clearAvailability=()=>{availability=[]};window.restoreAvailability=()=>{availability=structuredClone(initialAvailability)};
    window.requests=/(manager|attendant|details-audit)/.test(location.search)?[{id:'12345678-0000-0000-0000-000000000001',city_id:64,author_id:'citizen',species_id:'species1',request_type:'plantio',zone:'urbana',planting_place:'calcada',purpose:'sombra',overhead_wiring:'sim',provider:'viveiro_municipal',address:'Rua do Plantio, 20',neighborhood:'Centro',latitude:-8.6,longitude:-38.57,status:'solicitada',created_at:new Date().toISOString(),species:species[0]}]:[];
    if(location.search.includes('many-manager')){const base=window.requests[0];window.requests=Array.from({length:18},(_,i)=>({...base,id:'12345678-0000-0000-0000-'+String(i+1).padStart(12,'0'),status:['solicitada','em_analise','aguardando_informacao','aprovada'][i%4],address:'Rua de teste '+(i+1)+', Centro',request_type:i%2?'muda':'plantio'}));}
    if(location.search.includes('details-audit'))window.requests.forEach(r=>Object.assign(r,{requester_name:'Pessoa de teste',requester_phone:'87999999999',requester_email:'pessoa@example.test',notes:'Detalhes importantes do local. '.repeat(20),status:location.search.includes('terminal')?'concluida':location.search.includes('pickup')?'pronta_retirada':'solicitada',request_type:location.search.includes('pickup')?'muda':'plantio'}));window.events=[];window.calls=[];window.alerts=[];window.mapQueries=[];window.availabilitySaves=[];
    export const supabase={auth:{getSession:async()=>({data:{session:window.missingSession?null:{access_token:'fixture',user:{id:'citizen'}}}}),refreshSession:async()=>{window.sessionRefreshes=(window.sessionRefreshes||0)+1;return {data:{session:window.missingSession?null:{access_token:'renewed-fixture',user:{id:'citizen'}}}};}},functions:{invoke:async()=>({data:{}})},rpc:async(name,args)=>{
      window.calls.push({name,args});
      if(name==='municipal_execution_workspace')return {data:{actor_user_id:'citizen',access_contract:2,execution_contract:1,memberships:[{papel:location.search.includes('manager')&&!location.search.includes('inventory')?'administrador':'colaborador',prefeitura:{id:'pref64',city_id:64,nome:'Prefeitura de Floresta',categorias_habilitadas:['poda'],cidade:location.search.includes('missing-city')||location.search.includes('no-city-metadata')?{}:{name:'Floresta',states:{uf:'PE'}}}}],channels:[{id:'agri',city_id:64,nome:'Meio ambiente'}],accesses:[{city_id:64,canal_id:'agri',atendimento:location.search.includes('inventory')?'nenhum':location.search.includes('reader')?'leitura':'atendente',especialidades_execucao:[]}],category_channels:[{city_id:64,canal_id:'agri',category_id:'poda'}],inventories:location.search.includes('manager')?[{city_id:64,canal_id:'agri',module:'arborization'}]:[],inventory_views:[]}};
      if(name==='can_manage_tree_adoption')return {data:/(manager|attendant)/.test(location.search)};
      if(name==='can_dispatch_tree_adoption')return {data:location.search.includes('manager')};
      if(name==='set_tree_adoption_availability_alert'){if(window.failAlertSave)return {error:{message:'offline'}};window.alerts=window.alerts.filter(row=>row.city_id!==args.p_city);if(args.p_enabled)window.alerts.push({city_id:args.p_city,user_id:'citizen',notified_at:null});return {data:{enabled:args.p_enabled,available:false}};}
      if(name==='submit_tree_adoption'&&(window.denySubmitAlways||window.denySubmitOnce)){window.denySubmitOnce=false;return {error:{code:'42501',message:'permission denied for function submit_tree_adoption'}};}
      if(window.failSave)return {error:{message:'Falha simulada. Os dados foram mantidos.'}};
      if(name==='submit_tree_adoption'){let row=window.requests.find(r=>r.id===args.p_request.id);if(!row){row={...args.p_request,author_id:'citizen',status:'solicitada',created_at:new Date().toISOString(),species:species[0]};window.requests.push(row);window.events.push({id:'e1',request_id:row.id,status:row.status,message:'Solicitação recebida pela equipe.',created_at:row.created_at});}return {data:row};}
      if(name==='update_tree_adoption'){const row=window.requests.find(r=>r.id===args.p_id);if(row.status!==args.p_expected_status)return {error:{message:'Pedido atualizado por outra pessoa.'}};Object.assign(row,{status:args.p_status,approved_species_id:args.p_details.species_id,confirmed_provider:args.p_details.provider});window.events.push({id:crypto.randomUUID(),request_id:row.id,status:row.status,message:args.p_message,created_at:new Date().toISOString()});return {data:row};}
      return {data:[]};
    },from(table){const filters=[],excludes=[];let start=0,end=999,payload,newSpecies,one=false;const q={select(){return q},eq(k,v){filters.push([k,v]);return q},in(){return q},single(){one=true;return q},maybeSingle(){one=true;return q},not(k,op,v){excludes.push([k,v===null?[null,undefined]:v.slice(1,-1).split(',')]);return q},order(){return q},limit(n){end=n-1;return q},range(a,b){start=a;end=b;return q},insert(v){newSpecies=v;return q},upsert(v){payload=v;return q},then(ok,fail){
      if(newSpecies){const row={id:'created-species',...newSpecies};species.push(row);return Promise.resolve({data:row,error:null}).then(ok,fail);}
      if(payload){if(window.failAvailabilitySave)return Promise.resolve({error:{message:'offline'}}).then(ok,fail);window.availabilitySaves.push(payload);for(const row of Array.isArray(payload)?payload:[payload]){availability=availability.filter(r=>r.species_id!==row.species_id||r.provider!==row.provider);availability.push({...row,updated_at:new Date().toISOString()});}return Promise.resolve({data:payload}).then(ok,fail);}
      if(table==='tree_species_availability'&&window.failAvailabilityLoad)return Promise.resolve({error:{message:'offline'}}).then(ok,fail);
      if(table==='bairros'){
        if(window.failNeighborhoodLoad)return Promise.resolve({error:{message:'offline'}}).then(ok,fail);
        const rows=(window.emptyNeighborhoods?[]:[{id:'bairro-centro',name:'Centro',city_id:64},{id:'bairro-sao-jose',name:'São José',city_id:64},{id:'bairro-outra-cidade',name:'Bairro de outra cidade',city_id:65}]).filter(row=>filters.every(([key,value])=>String(row[key])===String(value)));
        return Promise.resolve({data:rows.slice(start,end+1),error:null}).then(ok,fail);
      }
      if(['city_trees','poles'].includes(table))window.mapQueries.push({table,filters});
      let rows=table==='city_trees'&&!location.search.includes('empty-map')?[{city_id:65,latitude:-8.05,longitude:-34.9},{city_id:64,latitude:-8.612345,longitude:-38.591234}]:table==='tree_nurseries'?nurseries:table==='city_tree_species'?species:table==='tree_species_availability'?availability:table==='tree_adoption_availability_alerts'?window.alerts:table==='tree_adoption_requests'?window.requests:table==='tree_adoption_events'?window.events:table==='categories'?[{id:'poda',name:'Arborização'}]:[];
      rows=rows.filter(r=>filters.every(([k,v])=>k==='species.city_id'?String(v)==='64':String(r[k])===String(v))&&excludes.every(([k,vs])=>!vs.includes(r[k])));
      return Promise.resolve({data:one?rows[0]||null:rows.slice(start,end+1),count:rows.length,error:null}).then(ok,fail);
    }};return q;}};`,
};
await build({
  stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route,useLocation}from'react-router-dom';import L from 'leaflet';import AdoptTreePage from '@/pages/AdoptTreePage';import{TreeAdoptionHomeSection}from'@/components/arborization/TreeAdoptionIntroduction';import Management from '@/pages/TreeAdoptionManagementPage';import Layout from '@/components/municipality/MunicipalityLayout';
    if(location.search.includes('dark'))document.documentElement.classList.add('dark');L.Map.addInitHook(function(){window.testMap=this;});
    const desktop=matchMedia('(min-width:980px)').matches,management=/(manager|attendant|reader)/.test(location.search);
    function CitizenShell(){const route=useLocation(),params=new URLSearchParams(route.search),bounded=desktop&&['solicitar','minhas'].includes(params.get('aba'));if(route.pathname==='/login')return <pre data-testid="login-return">{JSON.stringify(route.state?.from)}</pre>;return <div className={'qa-app-root'+(bounded?' tree-adoption-app':'')}><header className="qa-site-header">Trombone Cidadão</header><main className={'qa-app-main'+(bounded?' tree-adoption-app-main':'')} style={{paddingTop:56,paddingBottom:bounded?0:80}}><div className="qa-route-outlet">{params.has('home-preview')?<div className="page-shell-fluid" style={{padding:'24px clamp(16px,2vw,32px)'}}><TreeAdoptionHomeSection cityId={64}/></div>:<AdoptTreePage/>}</div></main></div>}
    createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={management?[location.search.includes('nursery-audit')?'/prefeitura/adote-uma-arvore/viveiros?cidade=64&secretaria=agri':'/prefeitura/adote-uma-arvore?cidade=64&secretaria=agri']:['/'+location.search]}>{management?<Routes><Route element={<Layout/>}><Route path="/prefeitura/adote-uma-arvore" element={<Management/>}/><Route path="/prefeitura/adote-uma-arvore/viveiros" element={<Management section="nurseries"/>}/><Route path="/prefeitura/broncas" element={<h1>Solicitações da cidade</h1>}/><Route path="/prefeitura/gestao-territorial/arborizacao" element={<h1>Inventário de árvores</h1>}/></Route></Routes>:<CitizenShell/>}</MemoryRouter>);`, resolveDir: root, loader: 'jsx' },
  bundle: true, jsx: 'automatic', loader: { '.png': 'dataurl' }, outfile: path.join(out, 'preview.js'),
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' }, alias: { '@': path.join(root, 'src') },
  plugins: [{ name: 'fixtures', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => stubs[args.path] ? { path: args.path, namespace: 'fixture' } : undefined);
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'jsx', resolveDir: root }));
  } }],
});
let sourceCss = await fs.readFile('src/index.css', 'utf8');
for (const token of ['primitives', 'semantic', 'typography', 'motion']) sourceCss = sourceCss.replace(`@import './design-system/tokens/${token}.css';`, await fs.readFile(`src/design-system/tokens/${token}.css`, 'utf8'));
for (const match of [...sourceCss.matchAll(/@import '(.+?)';/g)]) sourceCss = sourceCss.replace(match[0], await fs.readFile(path.join(root, 'src', match[1]), 'utf8'));
// Use every stylesheet imported by the real components, in application order.
sourceCss += '\n' + await fs.readFile(path.join(out, 'preview.css'), 'utf8');
// Mesma geometria do App real: header fixo de 56 px, main flexível e sem a
// reserva inferior/rodapé institucional na rota desktop de adoção.
sourceCss += '\n.qa-app-root{display:flex;flex-direction:column;min-height:100vh}.qa-app-main,.qa-route-outlet{display:flex;flex-direction:column;flex:1;min-height:0}.qa-site-header{position:fixed;inset:0 0 auto;height:56px;z-index:1001;display:flex;align-items:center;padding-inline:32px;background:rgb(var(--brand));color:rgb(var(--text-on-brand));font-weight:700}';
const config = loadConfig(path.join(root, 'tailwind.config.js'));
const css = await postcss([tailwind({ ...config, content: ['src/pages/AdoptTreePage.jsx', 'src/pages/TreeAdoptionManagementPage.jsx', 'src/components/municipality/MunicipalityLayout.jsx', 'src/components/arborization/*.jsx', 'src/components/municipality/MunicipalDemandLocation.jsx', 'src/components/LocationPickerMap.jsx', 'src/components/CitySelector.jsx', 'src/components/ui/*.jsx'] })]).process(sourceCss, { from: path.join(root, 'src/index.css') });
await fs.writeFile(path.join(out, 'preview.css'), css.css + '\n' + await fs.readFile('node_modules/leaflet/dist/leaflet.css', 'utf8'));
const server = http.createServer(async (req, res) => {
  const file = req.url.split('?')[0];
  if (file === '/preview.js' || file === '/preview.css') { res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'text/css'); res.end(await fs.readFile(path.join(out, file.slice(1)))); }
  else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/preview.css"></head><body><div id="root"></div><script src="/preview.js"></script></body></html>'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = path.join(out, `chrome-${Date.now()}`);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--disable-extensions', '--no-first-run', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws;
try {
  let endpoint;
  for (let attempt = 0; attempt < 150 && !endpoint; attempt++) {
    try { const [port, route] = (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).trim().split(/\r?\n/); endpoint = `ws://127.0.0.1:${port}${route}`; } catch { await pause(100); }
  }
  assert.ok(endpoint, 'Chrome não abriu');
  ws = new WebSocket(endpoint); await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let id = 0; const pending = new Map(), errors = [];
  ws.addEventListener('message', event => { const message = JSON.parse(event.data); if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails); if (message.id) { const task = pending.get(message.id); pending.delete(message.id); message.error ? task.reject(Error(message.error.message)) : task.resolve(message.result); } });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const next = ++id; pending.set(next, { resolve, reject }); ws.send(JSON.stringify({ id: next, method, params, sessionId })); });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Runtime.enable', {}, sessionId); await send('Page.enable', {}, sessionId);
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('tc_citygeo_floresta|',JSON.stringify({lat:-23.6,lng:-52.08}));localStorage.setItem('tc_citygeo_floresta|pe',JSON.stringify({lat:-23.6,lng:-52.08}));` }, sessionId);
  const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId); if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
  const waitFor = async expression => { for (let i = 0; i < 100; i++) { if (await evaluate(`Boolean(${expression})`)) return; await pause(100); } throw Error(`Timeout: ${expression}\n${await evaluate('document.body.innerText')}\n${JSON.stringify(errors)}`); };
  const click = label => evaluate(`(()=>{const scope=[...document.querySelectorAll('[role=dialog]')].at(-1)||document;const el=[...scope.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!el)throw Error('Botão ausente: '+${JSON.stringify(label)});el.click()})()`);
  const select = async (label, value) => {
    if(label==='Espécie'){
      await evaluate('document.querySelector(".tree-availability-editor [role=combobox]").click()');await waitFor(`document.querySelector('[data-species-id="${value}"]')`);await evaluate(`document.querySelector('[data-species-id="${value}"]').click()`);await waitFor('!document.querySelector("[cmdk-root]")');return;
    }
    return evaluate(`(()=>{const el=[...document.querySelectorAll('label')].find(e=>e.textContent.startsWith(${JSON.stringify(label)})).querySelector('select');el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  };
  const radio = value => evaluate(`document.querySelector('input[type=radio][value=${JSON.stringify(value)}]').click()`);
  const input = (placeholder, value) => evaluate(`(()=>{const el=[...document.querySelectorAll('input')].find(el=>el.placeholder===${JSON.stringify(placeholder)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  const timeInput = (label,value) => evaluate(`(()=>{const el=document.querySelector('input[aria-label="'+${JSON.stringify(label)}+'"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  const textArea = value => evaluate(`(()=>{const el=document.querySelector('[role=dialog] textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  const navigate = query => {
    const params = new URLSearchParams(query || '');
    if (!/(manager|attendant|reader|overview|home-preview)/.test(query || '')) params.set('aba', 'solicitar');
    return send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/?${params}` }, sessionId);
  };
  const capture = async name => { await pause(200); const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId); await fs.writeFile(path.join(out, `${name}.png`), Buffer.from(shot.data, 'base64')); };
  const frame = async (stage,width,height) => {
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'), `overflow horizontal ${stage} em ${width}x${height}`);
    if(width<980)return;
    const dimensions=await evaluate(`(()=>{const form=document.querySelector('.adoption-form'),footer=form.querySelector('.adoption-form-footer').getBoundingClientRect(),body=form.querySelector('.adoption-form-body');return {scroll:document.scrollingElement.scrollHeight,height:innerHeight,footerBottom:footer.bottom,footerTop:footer.top,bodyScroll:body.scrollHeight,bodyHeight:body.clientHeight}})()`);
    assert.ok(dimensions.scroll<=height+1,`rolagem da página ${stage} em ${width}x${height}: ${JSON.stringify(dimensions)}`);
    assert.ok(dimensions.footerBottom<=height&&dimensions.footerTop>=56,`ações fora da tela ${stage}: ${JSON.stringify(dimensions)}`);
    assert.ok(dimensions.bodyScroll<=dimensions.bodyHeight+1,`formulário não compacto ${stage}: ${JSON.stringify(dimensions)}`);
    const shell = await evaluate(`(()=>{const panel=document.querySelector('.adoption-welcome'),form=document.querySelector('.adoption-form'),p=panel.getBoundingClientRect(),f=form.getBoundingClientRect();window.initialWelcome ||= panel;return {outside:panel.parentElement===form.parentElement&&!form.contains(panel),persistent:window.initialWelcome===panel,leftRight:p.right,rightLeft:f.left,panelTop:p.top,formTop:f.top,panelBottom:p.bottom,formBottom:f.bottom,panelWidth:p.width,panelScroll:panel.scrollHeight,panelHeight:panel.clientHeight,artHeight:panel.querySelector('.adoption-welcome-art > svg').getBoundingClientRect().height}})()`);
    assert.ok(shell.outside && shell.persistent, `Coluna lateral externa deve persistir nas quatro etapas: ${JSON.stringify(shell)}`);
    assert.ok(shell.leftRight<shell.rightLeft && Math.abs(shell.panelTop-shell.formTop)<=1 && Math.abs(shell.panelBottom-shell.formBottom)<=1, `Coluna lateral deve ficar fora e ao lado do formulário: ${JSON.stringify(shell)}`);
    assert.ok(shell.panelWidth<=320 && shell.panelScroll<=shell.panelHeight+1 && shell.artHeight>=70, `Coluna lateral precisa preservar o espaço do formulário: ${JSON.stringify(shell)}`);
    if (await evaluate('document.querySelector(".adoption-location-layout")!==null')) {
      const ratio = await evaluate('(()=>{const root=document.querySelector(".adoption-location-layout"),fields=root.querySelector(".adoption-location-fields").getBoundingClientRect(),map=root.querySelector(".adoption-location-map").getBoundingClientRect();return map.width/(map.width+fields.width)})()');
      assert.ok(ratio>=.59&&ratio<=.61, `Mapa deve ocupar 60% das colunas: ${ratio}`);
      assert.ok(await evaluate('[...document.querySelectorAll(".adoption-location-fields select,.adoption-location-fields input:not([type=radio])")].every(el=>el.getBoundingClientRect().height>=40)'), 'Campos do local precisam ter altura confortável');
      if (height>=900) assert.ok(await evaluate('(()=>{const fields=document.querySelector(".adoption-location-fields");return fields.scrollHeight<=fields.clientHeight+1})()'), 'Campos do local devem caber sem rolagem interna');
    }
    if (stage==='revisao' && height>=900) assert.ok(await evaluate('[...document.querySelectorAll(".adoption-review-column")].every(el=>el.scrollHeight<=el.clientHeight+1)'), 'Revisão resumida deve caber sem rolagem interna');
    if (await evaluate('document.querySelector(".adoption-form").dataset.step==="0"')) assert.ok(await evaluate(`(()=>{const fields=document.querySelector('.adoption-request-form'),body=document.querySelector('.adoption-form-body'),f=fields.getBoundingClientRect(),b=body.getBoundingClientRect();return f.top>=b.top&&f.bottom<=b.bottom&&fields.scrollHeight<=fields.clientHeight+1})()`), 'Campos iniciais precisam caber na área do formulário');
  };
  if (process.argv.includes('--nursery-audit')) {
    let scenarios=0;
    for(const [width,height] of [[390,844],[844,390],[1440,900],[1920,1080]]) for(const theme of ['light','dark']) {
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);
      await navigate('?manager&nursery-audit');await waitFor('document.querySelector(".tree-nursery-card")');
      await evaluate(`document.documentElement.classList.toggle('dark',${theme==='dark'})`);
      const check = async name => {
        await waitFor('document.querySelector(".nursery-task-dialog")');await pause(100);
        assert.ok(await evaluate(`(()=>{const d=document.querySelector('.nursery-task-dialog'),r=d.getBoundingClientRect(),f=d.querySelector('.tree-availability-footer').getBoundingClientRect();return r.top>=-1&&r.bottom<=innerHeight+1&&r.width<=innerWidth&&d.scrollWidth<=d.clientWidth+1&&f.bottom<=r.bottom+1})()`),name+' fora da tela');
        await evaluate(`(()=>{const d=document.querySelector('.nursery-task-dialog'),s=d.querySelector('[data-task-scroll]');s.scrollTop=s.scrollHeight})()`);
        await capture(`nursery-${name}-${width}-${theme}`);scenarios++;
      };
      await click('Cadastrar viveiro');await check('novo');await click('Cancelar');await waitFor('!document.querySelector("[role=dialog]")');
      await evaluate('document.querySelector("button[aria-label^=\\"Editar viveiro\\"]").click()');await check('editar');
      await click('Continuar');await waitFor('document.body.innerText.includes("Quando o cidadão pode retirar?")');await check('horarios');
      await click('Cancelar');await waitFor('!document.querySelector("[role=dialog]")');
      await click('Adicionar espécies');await check('especies');
      await evaluate('document.querySelector(".tree-nursery-species-options input[type=checkbox]").click()');
      await evaluate('window.failAvailabilitySave=true');await click('Adicionar 1 espécie');await waitFor('document.querySelector(".nursery-task-dialog [role=alert]")');
      assert.ok(await evaluate('document.querySelector(".tree-nursery-species-options input[type=checkbox]").checked'));
      await evaluate('window.failAvailabilitySave=false');await click('Adicionar 1 espécie');await waitFor('!document.querySelector(".nursery-task-dialog")');
      assert.ok(await evaluate('window.availabilitySaves.length===1'));
    }
    console.log(JSON.stringify({scenarios,modalForms:true,speciesRetry:true}));
  } else

  if (process.argv.includes('--details-audit')) {
    let scenarios=0;
    for (const [width,height] of [[360,800],[390,844],[430,900],[844,390],[1440,900],[1920,1080]]) for (const theme of ['light','dark']) for (const actor of ['citizen','manager','attendant','terminal','pickup']) {
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<1000},sessionId);await send('Emulation.setTouchEmulationEnabled',{enabled:width<1000},sessionId);
      await navigate(`?details-audit&${actor==='manager'||actor==='attendant'?actor:'overview'}&${actor==='terminal'?'terminal':actor==='pickup'?'pickup':''}&aba=minhas`);
      await waitFor('document.querySelector(".adoption-request-card")');
      await evaluate(`document.documentElement.classList.toggle('dark',${theme==='dark'});window.events=Array.from({length:12},(_,i)=>({id:'audit-'+i,request_id:window.requests[0].id,status:'em_analise',message:'Orientação detalhada da equipe. '.repeat(8),created_at:new Date().toISOString()}));`);
      await evaluate('window.auditTrigger=document.querySelector(".adoption-request-card button[aria-label]")||document.querySelector(".adoption-request-open");window.auditTrigger.focus();window.auditTrigger.click()');
      await waitFor('document.querySelector(".adoption-detail-scroll")&&document.querySelector(".adoption-timeline li")');
      await pause(250);
      await waitFor('document.querySelector(".adoption-request-dialog").getAnimations().every(animation=>animation.playState==="finished")');
      const contact = await evaluate(`(()=>{const link=document.querySelector('a[href^="https://wa.me/"]');return link?{href:link.href,label:link.getAttribute('aria-label'),nearPhone:link.closest('dd')?.previousElementSibling?.textContent}:null})()`);
      if(actor==='manager'||actor==='attendant') {
        assert.equal(contact?.href,'https://wa.me/5587999999999');
        assert.equal(contact?.nearPhone,'Telefone / WhatsApp');
        assert.equal(contact?.label,'Abrir WhatsApp de Pessoa de teste');
      } else assert.equal(contact,null);
      if(actor==='manager'||actor==='attendant')assert.ok(await evaluate('document.querySelector(".adoption-detail-layout").firstElementChild.matches("form.adoption-detail-action")'),'Atendimento deve vir primeiro');
      const bounds=await evaluate(`(()=>{const dialog=document.querySelector('.adoption-request-dialog'),body=dialog.querySelector('[data-task-scroll]'),r=dialog.getBoundingClientRect(),s=body.getBoundingClientRect(),footer=dialog.querySelector('footer').getBoundingClientRect();return {top:r.top,bottom:r.bottom,width:r.width,scrollWidth:dialog.scrollWidth,height:r.height,bodyHeight:s.height,scrollHeight:body.scrollHeight,footerTop:footer.top,footerBottom:footer.bottom,x:s.x+s.width/2,y:s.y+s.height/2};})()`);
      assert.ok(bounds.top>=-1&&bounds.bottom<=height+1&&bounds.width<=width&&bounds.scrollWidth<=bounds.width+1,JSON.stringify(bounds));
      assert.ok(bounds.bodyHeight>35&&bounds.scrollHeight>bounds.bodyHeight&&bounds.footerBottom<=height+1,JSON.stringify(bounds));
      if(process.argv.includes('--debug-details')){await capture('debug-detail');console.log(JSON.stringify({width,height,bounds,computed:await evaluate('(()=>{const s=document.querySelector(".adoption-detail-scroll"),r=s.getBoundingClientRect(),h=document.elementFromPoint(r.x+r.width/2,r.y+100);return {overflow:getComputedStyle(s).overflowY,touch:getComputedStyle(s).touchAction,hit:h?.outerHTML.slice(0,250),bodyPointer:getComputedStyle(document.body).pointerEvents,root:getComputedStyle(s.closest("[role=dialog]")).overflow,scroll:s.scrollTop}})()')}));}
      await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:bounds.x,y:bounds.y,deltaX:0,deltaY:250},sessionId);
      await waitFor('document.querySelector(".adoption-detail-scroll").scrollTop>10');
      if(width<1000){
        await evaluate('document.querySelector(".adoption-detail-scroll").scrollTop=0');await pause(100);
        await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:bounds.x,y:bounds.y}]},sessionId);
        for(let step=1;step<=8;step++){await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:bounds.x,y:bounds.y-step*Math.min(20,bounds.bodyHeight/24)}]},sessionId);await pause(20);}
        await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]},sessionId);
        await waitFor('document.querySelector(".adoption-detail-scroll").scrollTop>5');
      }
      await evaluate('const s=document.querySelector(".adoption-detail-scroll");s.scrollTop=s.scrollHeight');
      await evaluate('(()=>{const b=document.querySelector(".adoption-detail-scroll"),last=b.querySelector("form textarea")||b.querySelector(".adoption-detail-action");if(last.matches("textarea"))last.focus();else last.scrollIntoView({block:"center"})})()');await pause(100);
      assert.ok(await evaluate('(()=>{const b=document.querySelector(".adoption-detail-scroll"),last=b.querySelector("form textarea")||b.querySelector(".adoption-detail-action");const r=last.getBoundingClientRect(),v=b.getBoundingClientRect();return r.top<v.bottom&&r.bottom>v.top})()'),'Última seção inacessível');
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
      if(width===390&&actor==='citizen') {
        await evaluate('document.documentElement.style.fontSize="200%"');
        assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
        await evaluate('document.querySelector(".adoption-detail-scroll").scrollTop=0');
        await capture(`detail-${actor}-${width}-${theme}-font200`);
      } else if(actor==='manager'||actor==='citizen') await capture(`detail-${actor}-${width}-${theme}`);
      await click('Fechar');await waitFor('!document.querySelector("[role=dialog]")');
      await waitFor('document.activeElement===window.auditTrigger');
      scenarios++;
    }
    await navigate('?manager&details-audit');await waitFor('document.querySelector(".adoption-request-card")');await evaluate('window.auditTrigger=document.querySelector(".adoption-request-card button[aria-label]")||document.querySelector(".adoption-request-open");window.auditTrigger.focus();window.auditTrigger.click()');
    await select('Status da solicitação','em_analise');await textArea('Orientação preservada após falha no atendimento.');
    await evaluate('window.failSave=true');await click('Registrar atualização');await waitFor('document.querySelector(".adoption-detail-action [role=alert]")');
    assert.ok(await evaluate('document.querySelector(".adoption-detail-action textarea").value.includes("preservada")'));
    await evaluate('window.failSave=false');await click('Registrar atualização');await waitFor('!document.querySelector("[role=dialog]")');
    assert.equal(await evaluate('window.requests[0].status'),'em_analise');
    console.log(JSON.stringify({scenarios,touchAndWheelScroll:true,lastSection:true,focusReturn:true,retry:true}));
  } else

  if (process.argv.includes('--species-layout')) {
    const draft = { requestId: '95000000-0000-0000-0000-000000000001', step: 2, form: { request_type: 'muda', purpose: 'sombra', zone: 'urbana', planting_place: 'quintal', overhead_wiring: 'nao', address: 'Rua do Plantio, 20', neighborhood: 'Centro', latitude: -8.6, longitude: -38.57, requester_name: 'Maria da Silva', requester_phone: '87999999999', items: [], commitment: false } };
    for (const [width, height] of [[360, 640], [390, 844], [844, 390], [1440, 900], [1920, 1080]]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 }, sessionId);
      await navigate(); await waitFor('document.querySelector(".adoption-form")');
      await evaluate(`sessionStorage.setItem('tc_tree_adoption_draft:64:citizen',${JSON.stringify(JSON.stringify(draft))})`);
      await navigate('?resume'); await waitFor('document.querySelector(".tree-seedling-card")'); await pause(250);
      const check = async stage => {
        const geometry = await evaluate(`(()=>{const dialog=document.querySelector('.adoption-create-dialog'),body=dialog.querySelector('.adoption-form-body'),footer=dialog.querySelector('.adoption-form-footer'),layout=dialog.querySelector('.adoption-form-layout'),form=dialog.querySelector('form'),d=dialog.getBoundingClientRect(),b=body.getBoundingClientRect(),f=footer.getBoundingClientRect();return {dialogTop:d.top,dialogBottom:d.bottom,bodyTop:b.top,bodyHeight:b.height,footerTop:f.top,footerBottom:f.bottom,dialogScroll:dialog.scrollTop,layoutScroll:layout.scrollTop,formScroll:form.scrollTop,overflow:document.documentElement.scrollWidth>innerWidth}})()`);
        assert.ok(!geometry.overflow && geometry.dialogTop >= -1 && geometry.dialogBottom <= height + 1, 'Diálogo dentro da tela');
        assert.ok(geometry.bodyHeight >= (height >= 600 ? height * .35 : 60), `Catálogo deve aproveitar a altura disponível: ${width}x${height}/${stage}`);
        assert.ok(Math.abs(geometry.footerBottom - geometry.dialogBottom) <= 2, `Sem espaço em branco abaixo das ações: ${JSON.stringify(geometry)}`);
        assert.equal(geometry.dialogScroll + geometry.layoutScroll + geometry.formScroll, 0, `Somente o corpo do formulário deve rolar: ${width}x${height}/${stage}`);
      };
      await check('abertura');
      for (const id of ['species1', 'extra0', 'extra3']) {
        await evaluate(`document.querySelector('[data-species-id="${id}"] .tree-seedling-select').scrollIntoView({block:'center'})`);
        const point = await evaluate(`(()=>{const r=document.querySelector('[data-species-id="${id}"] .tree-seedling-select').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 }, sessionId);
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 }, sessionId);
        await waitFor(`document.querySelector('[data-species-id="${id}"] input').checked`);
        await check(`seleção-${id}`);
        await evaluate(`document.querySelector('[data-species-id="${id}"] input[type=number]').focus()`);
        await check(`quantidade-${id}`);
      }
      await capture(`species-layout-${width}`);
      await click('Revisar pedido'); await waitFor('document.querySelector(".tree-review-summary")');
      await click('Voltar'); await waitFor('document.querySelector(".tree-seedling-card")'); await check('retorno');
      console.log(`${width}x${height}: seleção de três espécies, foco na quantidade e retorno sem deslocar o diálogo ou deixar espaço abaixo das ações OK.`);
    }
  } else if (process.argv.includes('--consistent-forms')) {
    const draft = { requestId: '95000000-0000-0000-0000-000000000001', step: 0, form: { request_type: 'muda', purpose: 'sombra', zone: 'urbana', planting_place: 'quintal', overhead_wiring: 'nao', address: 'Rua do Plantio, 20', neighborhood: 'Centro', latitude: -8.6, longitude: -38.57, requester_name: 'Maria da Silva', requester_phone: '87999999999', requester_email: 'maria@example.test', items: [{ species_id: 'species1', quantity: 2, provider: 'viveiro_municipal' }], commitment: false } };
    for (const width of [360, 390, 430, 1440, 1920]) for (const theme of ['light', 'dark']) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
      await navigate(); await waitFor('document.querySelector(".adoption-form")');
      await evaluate(`sessionStorage.clear();sessionStorage.setItem('tc_tree_adoption_draft:64:citizen',${JSON.stringify(JSON.stringify(draft))})`);
      await navigate(theme === 'dark' ? '?dark' : ''); await waitFor('document.querySelector(".wizard-progress")');
      if (width < 980) await evaluate(`document.documentElement.style.setProperty('--bottom-nav-occupied-height','92px');const nav=document.createElement('div');nav.id='qa-bottom-nav';nav.style.cssText='position:fixed;bottom:0;height:80px;width:100%;z-index:40;background:rgb(var(--surface-subtle))';document.body.append(nav)`);
      const check = async step => {
        await waitFor(`document.querySelector('.adoption-form').dataset.step==='${step}'`);
        await pause(250); // Wait for the desktop dialog's opening animation.
        assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'), `Sem overflow: ${width}/${theme}/${step}`);
        assert.equal(await evaluate('document.querySelectorAll(".wizard-progress > li").length'), 4);
        assert.equal(await evaluate('document.querySelectorAll(".wizard-progress [aria-current=step]").length'), 1);
        assert.ok(await evaluate(`[...document.querySelectorAll('.wizard-progress li')].every(el=>el.getClientRects().length)`), 'Todas as etapas visíveis no celular');
        assert.ok(await evaluate(`[...document.querySelectorAll('.wizard-actions button')].every(el=>el.getBoundingClientRect().height>=48)`), 'Ações com 48px');
        assert.ok(await evaluate(`(()=>{const group=document.querySelector('.wizard-actions'),buttons=group.querySelectorAll('button');return Math.abs(buttons[0].getBoundingClientRect().width-buttons[1].getBoundingClientRect().width)<=1&&group.clientWidth>=group.parentElement.clientWidth-50})()`), 'Ações usam duas colunas iguais e largura disponível');
        await evaluate('window.scrollTo(0,0)'); await pause(50);
        const footer = await evaluate(`(()=>{const el=document.querySelector('.adoption-form-footer'),r=el.getBoundingClientRect(),parents=[];let p=el.parentElement;while(p){parents.push({tag:p.className||p.tagName,overflow:getComputedStyle(p).overflow,height:p.getBoundingClientRect().height});p=p.parentElement}return {top:r.top,bottom:r.bottom,position:getComputedStyle(el).position,offset:getComputedStyle(el).bottom,parents}})()`);
        assert.ok(footer.top>=0&&footer.bottom<=900, `Rodapé dentro do diálogo: ${width}/${step}: ${JSON.stringify(footer)}`);
        assert.ok(await evaluate(`(()=>{const dialog=document.querySelector('.adoption-create-dialog'),r=dialog.getBoundingClientRect();return dialog.getAttribute('aria-modal')==='true'&&r.top>=-1&&r.bottom<=901&&r.left>=-1&&r.right<=innerWidth+1&&${width < 768 ? 'r.height>=899&&r.width>=innerWidth-1' : 'Math.abs(r.width-Math.min(1024,innerWidth-48))<=1&&Math.abs(r.left-(innerWidth-r.width)/2)<=1'}})()`), 'Tela cheia no celular; diálogo moderado e central no desktop');
        if (width >= 1200 && step === 1) assert.ok(await evaluate(`(()=>{const map=document.querySelector('.adoption-location-map')?.getBoundingClientRect(),fields=document.querySelector('.adoption-location-fields')?.getBoundingClientRect();return map&&fields&&map.width>fields.width&&map.width>=500})()`), 'Mapa deve ter mais espaço que o formulário no desktop');
        assert.equal(await evaluate('document.querySelectorAll(".tree-journey-nav,.adoption-page-tabs").length'), 0, 'Sem abas entre programa, pedidos e árvores');
        assert.ok(await evaluate('document.querySelector("#root").getAttribute("aria-hidden")==="true"'), 'Página ao fundo fica fora do foco');
        if (width >= 1200) assert.ok(await evaluate(`(()=>{const el=document.querySelector('.tree-adoption-page'),r=el.getBoundingClientRect(),p=getComputedStyle(el);return r.left+parseFloat(p.paddingLeft)<=64&&innerWidth-r.right+parseFloat(p.paddingRight)<=64})()`), 'Margens fluidas');
        await capture(`padrao-${step}-${width}-${theme}`);
      };
      await check(0);
      await input('000.000.000-00', '529.982.247-25');
      await click('Continuar'); await check(1);
      assert.ok(await evaluate('document.activeElement===document.querySelector(".adoption-form-intro h2")'), 'Foco no título da etapa');
      await waitFor('document.querySelector("select[name=neighborhood] option[value=Centro]")');
      assert.deepEqual(await evaluate('[...document.querySelector("select[name=neighborhood]").options].map(option=>option.value)'), ['', 'Centro', 'São José'], 'Bairros ordenados e limitados à cidade do pedido');
      assert.equal(await evaluate('document.querySelector("select[name=neighborhood]").value'), 'Centro', 'Bairro do rascunho mantido');
      await select('Bairro ou localidade','São José');
      if (width === 390 && theme === 'light') {
        await click('Voltar'); await evaluate('window.failNeighborhoodLoad=true'); await click('Continuar');
        await waitFor('document.querySelector(".adoption-address-fields [role=alert]")');
        await evaluate('window.failNeighborhoodLoad=false'); await click('Tentar novamente');
        await waitFor('!document.querySelector("select[name=neighborhood]").disabled');
        assert.equal(await evaluate('document.querySelector("select[name=neighborhood]").value'), 'São José', 'Falha e retomada preservam bairro');
      }
      await click('Voltar'); await check(0);
      await click('Continuar'); await check(1);
      await waitFor('!document.querySelector("select[name=neighborhood]").disabled');
      assert.equal(await evaluate('document.querySelector("select[name=neighborhood]").value'), 'São José', 'Voltar preserva seleção');
      await click('Continuar'); await check(2);
      await waitFor('document.querySelector(".tree-seedling-card")');
      await navigate(theme === 'dark' ? '?dark' : ''); await waitFor('document.querySelector(".tree-seedling-card")');
      assert.equal(await evaluate('document.querySelector(".adoption-form").dataset.step'), '2', 'Reabrir retoma etapa e seleção');
      if (width < 980) await evaluate(`document.documentElement.style.setProperty('--bottom-nav-occupied-height','92px')`);
      await click('Revisar pedido'); await check(3);
      await click('Enviar solicitação'); await waitFor('document.querySelector(".adoption-form-error")');
      await waitFor('document.activeElement===document.querySelector(".adoption-commitment input")');
      const commitmentVisible = `(()=>{const label=document.querySelector('.adoption-commitment').getBoundingClientRect(),body=document.querySelector('.adoption-form-body').getBoundingClientRect();return label.top>=body.top&&label.bottom<=body.bottom})()`;
      await waitFor(commitmentVisible);
      assert.equal(await evaluate('document.querySelector(".adoption-commitment input").getAttribute("aria-invalid")'), 'true', 'Caixa pendente recebe foco e indicação de erro');
      assert.ok(await evaluate('document.getElementById(document.querySelector(".adoption-commitment input").getAttribute("aria-describedby"))?.textContent.includes("Confirme o compromisso")'), 'Erro associado à caixa');
      await evaluate('document.querySelector(".adoption-form-body").scrollTo({top:0,behavior:"instant"})');
      await click('Enviar solicitação'); await waitFor(commitmentVisible);
      assert.ok(await evaluate('document.activeElement===document.querySelector(".adoption-commitment input")'), 'Repetir envio também revela a caixa pendente');
      assert.equal(await evaluate('window.calls.filter(c=>c.name==="submit_tree_adoption").length'), 0, 'Compromisso exigido antes do envio');
      await evaluate('document.querySelector(".wizard-progress button").click()'); await check(0);
      await evaluate('document.querySelector(".wizard-actions button:last-child").focus()');
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }, sessionId);
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }, sessionId);
      assert.ok(await evaluate('document.activeElement===document.querySelector(".adoption-dialog-heading > button")'), 'Tab permanece no diálogo');
      await click('Sair'); await waitFor('!document.querySelector(".adoption-create-dialog")');
      assert.ok(await evaluate(`(()=>{const [start,requests]=document.querySelectorAll('.adoption-program-request-actions > button'),s=start.getBoundingClientRect(),r=requests.getBoundingClientRect();return r.top>=s.bottom&&Math.abs(r.left-s.left)<=1})()`), 'Meus pedidos fica logo abaixo de Solicitar uma muda');
      await capture(`programa-acoes-${width}-${theme}`);
      await click('Meus pedidos'); await waitFor('document.querySelector(".tree-requests-page")');
      await click('Sobre o programa'); await waitFor('document.querySelector(".adoption-program-request-actions")');
      await click('Solicitar uma muda'); await waitFor('document.querySelector(".adoption-create-dialog")');
      assert.ok(await evaluate('document.querySelector("input[autocomplete=name]").value==="Maria da Silva"'), 'Sair mantém preenchimento');
      await input('000.000.000-00', '529.982.247-25');
      await click('Continuar'); await click('Continuar'); await click('Revisar pedido'); await check(3);
      if (width === 390) {
        await evaluate('document.documentElement.style.fontSize="200%"');
        assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'), 'Fonte a 200% sem overflow');
        await pause(100); await evaluate('const body=document.querySelector(".adoption-form-body");body.scrollTo(0,body.scrollHeight)'); await pause(100);
        await capture(`padrao-fonte200-${theme}`);
        const lastField = await evaluate(`(()=>{const field=document.querySelector('.adoption-commitment'),footer=document.querySelector('.adoption-form-footer');return {fieldBottom:field.getBoundingClientRect().bottom,footerTop:footer.getBoundingClientRect().top,footerHeight:footer.getBoundingClientRect().height,reserve:getComputedStyle(field.closest('form')).paddingBottom,margin:getComputedStyle(field).scrollMarginBottom,scroll:scrollY,height:document.scrollingElement.scrollHeight}})()`);
        assert.ok(lastField.fieldBottom<=lastField.footerTop, 'Compromisso alcançável acima das ações com fonte ampliada: '+JSON.stringify(lastField));
        await evaluate('document.documentElement.style.fontSize=""');
      }
      await evaluate('document.querySelector(".adoption-commitment input").click();window.failSave=true');
      await click('Enviar solicitação'); await waitFor('document.querySelector(".adoption-form-error")');
      assert.ok(await evaluate('JSON.parse(sessionStorage.getItem("tc_tree_adoption_draft:64:citizen")).form.items.length===1'), 'Falha mantém rascunho');
      await evaluate('window.failSave=false'); await click('Enviar solicitação'); await waitFor('document.querySelector(".adoption-success-panel")');
      assert.equal(await evaluate('window.requests.length'), 1, 'Reenvio não duplica pedido');
      assert.equal(await evaluate('window.requests[0].neighborhood'), 'São José', 'Pedido envia o nome do bairro cadastrado');
      assert.equal(await evaluate('sessionStorage.getItem("tc_tree_adoption_draft:64:citizen")'), null, 'Sucesso limpa rascunho');
      await click('Acompanhar solicitação'); await waitFor('!document.querySelector(".adoption-create-dialog")');
      await click('Solicitar muda'); await waitFor('document.querySelector(".adoption-form")');
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sessionId);
      await waitFor('!document.querySelector(".adoption-create-dialog")');
      assert.ok(await evaluate('document.querySelector(".tree-requests-page")!==null'), 'Fechar retorna a Meus pedidos quando o pedido partiu dali');
      console.log(`${width}px/${theme}: quatro etapas, foco, ações, rascunho, erro e reenvio OK.`);
    }
  } else {
  const layoutOnly = process.argv.includes('--layout-only');
  if (layoutOnly) {
    for (const [width,height] of [[390,844],[1366,768],[1440,768],[1440,900],[1920,1080],[1920,921]]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
      await evaluate('try { sessionStorage.clear(); } catch {}');
      await navigate();await waitFor('document.querySelector(".adoption-request-layout")');
      await capture(`duas-colunas-${width}-${height}`);await frame('pedido',width,height);
      if (width >= 1200) assert.ok(await evaluate('(()=>{const el=document.querySelector(".tree-adoption-page"),r=el.getBoundingClientRect(),p=getComputedStyle(el);return r.left+parseFloat(p.paddingLeft)<=64&&innerWidth-r.right+parseFloat(p.paddingRight)<=64})()'));
      await click('Continuar');await waitFor('document.querySelector(".adoption-form-error")');await frame('erro',width,height);
      await radio('muda');await radio('sombra');await click('Continuar');await waitFor('document.querySelector(".adoption-location-layout")');await frame('local',width,height);
      await capture(`coluna-externa-local-${width}-${height}`);
      await radio('urbana');await select('Onde a árvore será plantada?','quintal');await select('Há fiação aérea acima do local?','nao');
      await waitFor('window.testMap&&document.querySelector(".adoption-map-canvas .leaflet-container")');
      await evaluate('void window.testMap.fire("click",{latlng:{lat:-8.6,lng:-38.57}})');await waitFor('[...document.querySelectorAll("input")].some(el=>el.value.includes("Rua do Plantio"))');
      await click('Continuar');await waitFor('document.querySelector("[data-species-id=species1]")');await frame('catalogo',width,height);
      await evaluate('document.querySelector("[data-species-id=species1] input").click()');await radio('viveiro_municipal');await capture(`coluna-externa-especies-${width}-${height}`);
      await input('Busque pelo nome popular, regional ou científico','ipe');await waitFor('document.querySelector(".adoption-species-grid[data-single]")');
      assert.ok(await evaluate('document.querySelector(".adoption-order-image")!==null'), 'Resumo deve mostrar a imagem da espécie');
      await frame('especie-unica',width,height);await capture(`especie-card-horizontal-${width}-${height}`);
      await click('Continuar');await waitFor('document.querySelector(".adoption-review-layout")');await frame('revisao',width,height);await capture(`coluna-externa-revisao-${width}-${height}`);
      console.log(`${width}x${height}: coluna lateral externa nas quatro etapas, mapa 40/60, campos e ações visíveis OK.`);
    }
    await evaluate('sessionStorage.clear()');await navigate('?dark');await waitFor('document.querySelector(".adoption-request-layout")');await capture('duas-colunas-dark');
  }
  if (!process.argv.includes('--new-flows') && !layoutOnly) {
  for (const [width,height] of [[320,844],[390,844],[1440,900],[1920,1080]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
    await navigate('?overview&visitor&cidade=64');await waitFor('document.querySelector("[data-testid=adoption-program]")');
    assert.ok(await evaluate('!document.querySelector(".adoption-form")&&!document.body.innerText.includes("Entrar para solicitar")'),'Apresentação pública sem exigir login');
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Apresentação sem rolagem horizontal');
    assert.ok(await evaluate('document.scrollingElement.scrollHeight>innerHeight'),'Seções podem rolar normalmente');
    await evaluate('document.querySelector(".adoption-program-faq summary").click()');
    assert.ok(await evaluate('document.querySelector(".adoption-program-faq details").open'),'Dúvidas acessíveis');
    await capture(`programa-${width}`);
    await click('Quero participar');await waitFor('document.body.innerText.includes("Entrar para solicitar")');
    await evaluate('[...document.querySelectorAll("a")].find(a=>a.textContent==="Entrar para solicitar").click()');await waitFor('document.querySelector("[data-testid=login-return]")');
    const login=await evaluate('JSON.parse(document.querySelector("[data-testid=login-return]").textContent)');
    assert.equal(login.pathname,'/adoteumaarvore');assert.equal(new URLSearchParams(login.search).get('aba'),'solicitar');assert.equal(new URLSearchParams(login.search).get('cidade'),'64');
    await navigate('?overview&cidade=64');await waitFor('document.querySelector("[data-testid=adoption-program]")');
    await click('Começar minha solicitação');await waitFor('document.querySelector(".adoption-request-layout")');
    await radio('muda');await evaluate('document.querySelector("button.adoption-back-link").click()');
    await waitFor('document.querySelector("[data-testid=adoption-program]")');await click('Quero participar');
    assert.ok(await evaluate('document.querySelector("input[type=radio][value=muda]").checked'),'Voltar à apresentação preserva o preenchimento');
    await evaluate('sessionStorage.clear()');
    await navigate('?home-preview&visitor');await waitFor('document.querySelector(".adoption-home-section")');
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Chamada da home sem rolagem horizontal');
    assert.ok(await evaluate('[...document.querySelectorAll(".adoption-home-section a")].every(a=>new URL(a.href).searchParams.get("cidade")==="64")'),'Chamada preserva a cidade');
    await capture(`home-adote-${width}`);
    await evaluate('[...document.querySelectorAll(".adoption-home-section a")].find(a=>a.textContent.includes("Conhecer o programa")).click()');await waitFor('document.querySelector("[data-testid=adoption-program]")');
    console.log(`${width}px: apresentação pública, FAQ, acesso ao formulário, rascunho preservado e chamada da home OK`);
  }
  for (const [width,height] of [[320,844],[390,844],[1366,768],[1440,768],[1440,900],[1920,1080],[1920,921]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
    await navigate(); await waitFor('document.querySelector(".adoption-request-layout")');
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'), `overflow em ${width}`);
    const margins = await evaluate('(()=>{const el=document.querySelector(".tree-adoption-page"),r=el.getBoundingClientRect(),p=getComputedStyle(el);return [r.left+parseFloat(p.paddingLeft),innerWidth-r.right+parseFloat(p.paddingRight)]})()');
    if (width >= 1200) assert.ok(margins.every(value => value <= 64), `margens em ${width}: ${margins}`);
    await frame('pedido',width,height);
    assert.ok(await evaluate('!document.body.innerText.includes("Uma muda para você plantar ou um plantio com apoio da equipe.")'));
    const colors=await evaluate('(()=>{const e=document.querySelector(".tree-adoption-page");return [getComputedStyle(e).getPropertyValue("--primary").trim(),getComputedStyle(document.documentElement).getPropertyValue("--primary").trim()]})()');
    assert.equal(colors[0],colors[1],'A página deve herdar a cor do sistema');
    await capture(`pedido-${width}`);
    if(width>=980){
      const header=await evaluate('(()=>{const root=document.querySelector(".adoption-page-header"),parts=[".adoption-heading",".adoption-header-engagement",".adoption-page-tabs",".adoption-header-actions"].map(s=>root.querySelector(s)).filter(e=>getComputedStyle(e).display!=="none").map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right}}),title=root.querySelector("h1");return {height:root.getBoundingClientRect().height,parts,titleWidth:title.clientWidth,titleScroll:title.scrollWidth}})()');
      assert.ok(header.height<=72,'Cabeçalho ocupou altura excessiva: '+JSON.stringify(header));
      assert.ok(header.parts.every((part,i)=>!i||part.left>=header.parts[i-1].right-1),'Cabeçalho sobrepôs ações: '+JSON.stringify(header));
      assert.ok(header.titleScroll<=header.titleWidth+1,'Título cortado no cabeçalho');
      assert.ok(await evaluate('document.querySelector(".adoption-heading-invitation").textContent.includes("Floresta")'));
      await capture(`header-${width}`);
      await evaluate('Object.defineProperty(navigator,"share",{configurable:true,value:undefined});Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async value=>{window.copiedAdoptionLink=value}}});document.querySelector(".adoption-invite-button").click()');
      await waitFor('document.querySelector(".adoption-invite-button").textContent.includes("Link copiado")');
      assert.ok(await evaluate('(()=>{const u=new URL(window.copiedAdoptionLink);return u.pathname==="/adoteumaarvore"&&u.searchParams.get("cidade")==="64"&&[...u.searchParams.keys()].length===1})()'),'Convite não preservou apenas a cidade pública');
      if(width===1920&&height===1080){
        await evaluate('Object.defineProperty(navigator,"share",{configurable:true,value:async data=>{window.adoptionInvitation=data}});document.querySelector(".adoption-invite-button").click()');
        await waitFor('document.querySelector(".adoption-invite-button").textContent.includes("Convite compartilhado")');
        assert.ok(await evaluate('window.adoptionInvitation.text.includes("Floresta")'));
        await evaluate('Object.defineProperty(navigator,"share",{configurable:true,value:async()=>{throw new DOMException("Cancelado","AbortError")}});document.querySelector(".adoption-invite-button").click()');
        await waitFor('!document.querySelector(".adoption-invite-button").disabled');assert.ok(await evaluate('!document.querySelector(".adoption-share-fallback")'));
        await evaluate('Object.defineProperty(navigator,"share",{configurable:true,value:undefined});Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async()=>{throw Error("Bloqueado")}}});document.querySelector(".adoption-invite-button").click()');
        await waitFor('document.querySelector(".adoption-share-fallback input")');
        assert.ok(await evaluate('document.querySelector(".adoption-share-fallback input").value.endsWith("?cidade=64")'));await frame('convite',width,height);
        await evaluate(`document.querySelector('[aria-label="Fechar link de convite"]').click()`);
      }
    }else assert.ok(await evaluate('getComputedStyle(document.querySelector(".adoption-header-share")).display==="none"'),'Engajamento desktop apareceu no celular');
    await click('Continuar'); await waitFor('document.querySelector("[role=alert]")');
    await radio('plantio'); await radio('frutifera'); await click('Continuar');
    await waitFor('window.testMap&&document.querySelector(".adoption-map-canvas")');
    await waitFor('window.testMap.getCenter().distanceTo([-8.597031,-38.574217])<10');
    assert.ok(await evaluate('document.body.innerText.includes("Floresta · PE")'));
    assert.ok(await evaluate(`document.querySelector('.adoption-map-canvas').getBoundingClientRect().height>=${width>=980?190:340}`));
    await radio('rural'); await select('Onde a árvore será plantada?', 'quintal'); await select('Há fiação aérea acima do local?', 'nao_sei');
    await evaluate('window.wrongCity=true;void window.testMap.fire("click",{latlng:{lat:-23.6,lng:-52.08}})');
    await waitFor('document.body.innerText.includes("fora de Floresta · PE")');
    await click('Continuar'); await waitFor('document.querySelector(".adoption-form-body>[role=alert]")');
    assert.ok(await evaluate('document.querySelector(".adoption-location-layout")!==null'));
    await evaluate('window.wrongCity=false');
    await evaluate('void window.testMap.fire("click",{latlng:{lat:-8.6,lng:-38.57}})');
    await waitFor('[...document.querySelectorAll("input")].some(el=>el.value.includes("Rua do Plantio"))');
    await click('Minhas solicitações'); await click('Nova solicitação');
    await waitFor('document.querySelector(".adoption-map-canvas").offsetWidth>0&&window.testMap.getBounds().contains([-8.6,-38.57])');
    if (width===1920) {
      await evaluate('window.geoDelay=400;void window.testMap.fire("click",{latlng:{lat:-8.6001,lng:-38.57}})');
      await input('Ex.: Sítio, comunidade e estrada de acesso', 'Endereço conferido manualmente');
      await pause(500);
      assert.ok(await evaluate('[...document.querySelectorAll("input")].some(el=>el.value==="Endereço conferido manualmente")'));
    }
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'), `overflow no mapa em ${width}`);
    await frame('local',width,height);
    await capture(`local-${width}`);
    await click('Continuar'); await waitFor('document.querySelector("[data-species-id=species1]")');
    assert.equal(await evaluate('document.querySelectorAll("[data-species-id]").length'),6);
    assert.ok(await evaluate('document.body.innerText.includes("25 espécies no catálogo")'),'Espécies sem oferta entraram nas sugestões');
    if (width===1920 && height===1080) {
      await evaluate('window.clearAvailability();window.dispatchEvent(new Event("focus"))');
      await waitFor('document.body.innerText.includes("Nenhuma espécie com disponibilidade confirmada")');
      assert.equal(await evaluate('document.querySelectorAll("[data-species-id]").length'),0);
      assert.ok(await evaluate('document.querySelector(".adoption-form-footer button[type=submit]").disabled'));
      await click('Atualizar catálogo');await waitFor('document.body.innerText.includes("Nenhuma espécie com disponibilidade confirmada")');
      await click('Avise-me quando tiver disponibilidade');await waitFor('document.body.innerText.includes("Aviso ativado")');
      assert.equal(await evaluate('window.alerts.length'),1);
      await click('Atualizar catálogo');await waitFor('document.body.innerText.includes("Aviso ativado")');
      await click('Cancelar aviso');await waitFor('document.body.innerText.includes("Avise-me quando tiver disponibilidade")');assert.equal(await evaluate('window.alerts.length'),0);
      await evaluate('window.failAlertSave=true');await click('Avise-me quando tiver disponibilidade');await waitFor('document.body.innerText.includes("Não foi possível atualizar seu aviso")');assert.equal(await evaluate('window.alerts.length'),0);await evaluate('window.failAlertSave=false');
      await capture('catalogo-sem-disponibilidade');
      await evaluate('window.restoreAvailability();window.dispatchEvent(new Event("focus"))');
      await waitFor('document.querySelector("[data-species-id=species1]")');
    }
    for (const term of ['unregistered','consultation','unavailable']) {
      await input('Busque pelo nome popular, regional ou científico', term);await waitFor('document.body.innerText.includes("Nenhuma espécie encontrada")');
      assert.equal(await evaluate('document.querySelectorAll("[data-species-id]").length'),0);
    }
    await input('Busque pelo nome popular, regional ou científico', '');
    await frame('catalogo',width,height);
    await click('Próximas'); await waitFor('document.body.innerText.includes("Página 2 de")');
    await click('Anteriores'); await waitFor('document.querySelector("[data-species-id=species1]")');
    await input('Busque pelo nome popular, regional ou científico', 'inexistente'); await waitFor('document.body.innerText.includes("Nenhuma espécie encontrada")');
    await input('Busque pelo nome popular, regional ou científico', 'ipe'); await waitFor('document.querySelector("[data-species-id=species1]")');
    await evaluate('document.querySelector("[data-species-id=species1]").click()');
    assert.equal(await evaluate('document.querySelector("input[value=instituto_florestar]")'),null,'Fornecedor indisponível continuou como sugestão');
    await evaluate('document.querySelector("input[value=viveiro_municipal]").click()');
    await frame('fornecedor',width,height);
    await capture(`especie-${width}`); await click('Continuar');
    await waitFor('document.body.innerText.includes("Tudo certo para enviar?")');
    assert.ok(await evaluate('document.body.innerText.includes("Zona rural")&&document.body.innerText.includes("Frutífera")&&document.body.innerText.includes("Não sei informar")'));
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'), `overflow na revisão em ${width}`);
    await waitFor('document.querySelector(".adoption-review-map .leaflet-container")');
    assert.ok(await evaluate('window.testMap.getCenter().distanceTo([-8.6,-38.57])<100'),'Revisão não exibiu o ponto escolhido');
    if(width>=980)assert.ok(await evaluate('document.querySelector(".adoption-review-map-canvas").getBoundingClientRect().height>=190'),'Mapa de revisão ficou pequeno');
    await frame('revisao',width,height);
    await capture(`revisao-${width}`);
    await click('Enviar solicitação'); await waitFor('document.querySelector("[role=alert]")');
    await evaluate('document.querySelector("input[type=checkbox]").click();window.failSave=true');
    await click('Enviar solicitação'); await waitFor('document.body.innerText.includes("Falha simulada")');
    await evaluate('window.failSave=false');
    if(width===1920&&height===1080){
      await navigate('?resume');await waitFor(`document.querySelector('.adoption-form[data-step="3"]')`);await waitFor('document.body.innerText.includes("Ipê-amarelo")');
      assert.ok(await evaluate('document.querySelector("input[type=checkbox]").checked'),'Recarregar perdeu o compromisso preenchido');
      await evaluate('window.missingSession=true');await click('Enviar solicitação');await waitFor('document.body.innerText.includes("Sua sessão precisa ser renovada")');
      assert.ok(await evaluate('[...document.querySelectorAll("a")].some(a=>a.textContent==="Entrar novamente")'));
      assert.equal(await evaluate('window.requests.length'),0);
      await evaluate('window.missingSession=false;window.denySubmitAlways=true');await click('Enviar solicitação');
      await waitFor('document.body.innerText.includes("O serviço de adoção não autorizou o envio")');
      assert.ok(await evaluate('!document.body.innerText.includes("permission denied")'));
      assert.equal(await evaluate('window.sessionRefreshes'),1);assert.equal(await evaluate('window.requests.length'),0);
      await capture('revisao-erro-envio');
      await evaluate('window.denySubmitAlways=false;window.denySubmitOnce=true');
    }
    await click('Enviar solicitação');
    await waitFor('document.body.innerText.includes("Sua solicitação foi enviada")');
    assert.equal(await evaluate('window.requests.length'), 1);
    assert.equal(await evaluate('sessionStorage.getItem("tc_tree_adoption_draft:64:citizen")'),null,'Sucesso não removeu o rascunho');
    assert.equal(await evaluate('window.requests[0].zone'), 'rural');
    await click('Minhas solicitações'); await waitFor('document.querySelector("article")');
    await click('Ver pedido e histórico'); await waitFor('document.querySelector("[role=dialog]")');
    assert.ok(await evaluate('document.querySelector("[role=dialog]").innerText.includes("Solicitação recebida pela equipe")'));
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
    await capture(`historico-${width}`);
    await navigate('?manager'); await waitFor('document.querySelector("article")');
    assert.ok(await evaluate('(()=>{const row=document.querySelector(".adoption-request-card").getBoundingClientRect(),list=document.querySelector(".adoption-request-list").getBoundingClientRect();return row.width>=list.width-2})()'),'Pedido isolado ficou restrito à metade da tela');
    await capture(`fila-${width}`);
    assert.ok(await evaluate('document.querySelector(".municipality-shell")&&document.querySelector("h1")?.textContent.includes("Atendimento")'),'Tela exclusiva dentro do painel municipal');
    assert.ok(await evaluate('!document.body.innerText.includes("Solicitar muda ou plantio")&&!document.querySelector(".arborization-stats")'),'Atendimento separado do formulário cidadão e do inventário');
    assert.ok(await evaluate('[...document.querySelectorAll("nav a")].some(a=>a.textContent.trim()==="Adote uma árvore"&&new URL(a.href).searchParams.get("cidade")==="64"&&a.getAttribute("aria-current")==="page")'),'Menu de atendimento com cidade e estado ativo');
    await click('Ver pedido e histórico'); await waitFor('document.querySelector("[role=dialog]")');await capture(`atendimento-${width}`);
    assert.ok(await evaluate('document.querySelector("[role=dialog]").getBoundingClientRect().width<=innerWidth'),'Detalhe fora da tela');
    await select('Status da solicitação', 'em_analise'); await textArea('Análise do local iniciada pela equipe de arborização.'); await click('Registrar atualização');
    await waitFor('!document.querySelector("[role=dialog]")&&document.querySelector("article")?.innerText.includes("Em análise técnica")');
    await click('Ver pedido e histórico'); await select('Status da solicitação', 'aprovada'); await textArea('Espécie e fornecedor confirmados após avaliação do local.'); await click('Registrar atualização');
    await waitFor('!document.querySelector("[role=dialog]")&&document.querySelector("article")?.innerText.includes("Aprovada")');
    await click('Disponibilidade de mudas'); await waitFor('document.querySelector(".tree-availability-table tbody tr")');
    assert.ok(await evaluate('!document.querySelector(".tree-availability-editor")'),'A aba deve começar pela consulta');
    assert.ok(await evaluate('document.querySelectorAll(".tree-availability-table tbody tr").length<=8'),'Disponibilidades sem paginação');
    await capture(`disponibilidades-${width}`);
    await click('Próxima');await waitFor('document.querySelector(".tree-availability-pagination").innerText.includes("9–16")');
    await input('Buscar espécie, fornecedor ou endereço','Ipê');
    await evaluate(`(()=>{const e=document.querySelector('select[aria-label="Situação da disponibilidade"]');e.value="indisponivel";e.dispatchEvent(new Event("change",{bubbles:true}))})()`);
    await waitFor('document.querySelectorAll(".tree-availability-table tbody tr").length===1');
    assert.ok(await evaluate('document.querySelector(".tree-availability-table tbody tr").dataset.provider==="instituto_florestar"'));
    await evaluate(`(()=>{const e=document.querySelector('select[aria-label="Fornecedor da disponibilidade"]');e.value="viveiro_municipal";e.dispatchEvent(new Event("change",{bubbles:true}))})()`);
    await waitFor('document.body.innerText.includes("Nenhuma disponibilidade corresponde aos filtros")');await click('Limpar filtros');
    await input('Buscar espécie, fornecedor ou endereço','Ipê');
    await waitFor(`document.querySelector('[data-species-id="species1"][data-provider="viveiro_municipal"]')`);
    await evaluate(`document.querySelector('[data-species-id="species1"][data-provider="viveiro_municipal"] button').click()`);
    await waitFor(`document.querySelector('form[aria-label="Editar disponibilidade"]')`);
    assert.ok(await evaluate('document.querySelector(".tree-availability-editor [role=combobox]").disabled'),'Edição não deve criar outro vínculo por acidente');
    assert.equal(await evaluate('document.querySelector("textarea").value'),'Orientação anterior: confirme a retirada com a equipe.','Orientação anterior não foi preservada');
    await waitFor('document.querySelector("[data-testid=pickup-map] .leaflet-container")');
    await waitFor('window.testMap.getCenter().distanceTo([-8.612345,-38.591234])<10');
    assert.ok(await evaluate('window.mapQueries.some(q=>q.table==="city_trees"&&q.filters.some(([k,v])=>k==="city_id"&&v===64))'),'Retirada não usou o city_id da prefeitura');
    await evaluate('void window.testMap.fire("click",{latlng:{lat:-8.6,lng:-38.57}})');await waitFor('document.body.innerText.includes("Endereço encontrado")');
    await input('Rua, número, bairro e referência de acesso','Rua das Flores, 120, Centro');
    await evaluate('document.querySelector("input[aria-label=Segunda-feira]").click()');await timeInput('Início do período 1','08:00');await timeInput('Fim do período 1','12:00');
    await click('Adicionar período');await evaluate('document.querySelectorAll("input[aria-label=Segunda-feira]")[1].click()');await timeInput('Início do período 2','14:00');await timeInput('Fim do período 2','17:00');
    await evaluate('(()=>{const el=document.querySelector("textarea");Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value").set.call(el,"Leve documento com foto.\\nTraga uma caixa para transportar a muda.");el.dispatchEvent(new Event("input",{bubbles:true}))})()');
    if(width===1920&&height===1080){await evaluate('window.failAvailabilitySave=true');await click('Salvar disponibilidade');await waitFor('document.body.innerText.includes("Seus dados foram mantidos")');assert.ok(await evaluate('document.querySelector("textarea").value.includes("Leve documento")'));await evaluate('window.failAvailabilitySave=false');}
    await click('Salvar disponibilidade');
    await waitFor('document.body.innerText.includes("Disponibilidade atualizada.")&&!document.querySelector(".tree-availability-editor")');
    await waitFor('document.querySelector(".tree-availability-table tbody tr")');
    await input('Buscar espécie, fornecedor ou endereço','Rua das Flores');
    await waitFor('document.querySelectorAll(".tree-availability-table tbody tr").length===1');
    assert.ok(await evaluate('document.querySelector(".tree-availability-table tbody tr").innerText.includes("08:00 às 12:00")&&document.querySelector(".tree-availability-table tbody tr").innerText.includes("Leve documento")'),'Dados salvos não apareceram na consulta');
    assert.ok(await evaluate('document.querySelector(".tree-availability-table a").href.includes("query=-8.6,-38.57")'));
    await capture(`disponibilidade-atualizada-${width}`);
    await evaluate('document.querySelector(".tree-availability-table tbody tr button").click()');
    await waitFor('document.querySelector("textarea")?.value.includes("Leve documento")');
    assert.equal(await evaluate('document.querySelector("input[placeholder=\\"Rua, número, bairro e referência de acesso\\"]").value'),'Rua das Flores, 120, Centro');
    assert.equal(await evaluate('document.querySelector("input[aria-label=\\"Início do período 1\\"]").value'),'08:00');
    assert.equal(await evaluate('document.querySelector("input[aria-label=\\"Fim do período 2\\"]").value'),'17:00');
    assert.equal(await evaluate('document.querySelector("textarea").value'),'Leve documento com foto.\nTraga uma caixa para transportar a muda.');
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
    if(width>=980){
      await capture(`retirada-campos-${width}`);
      const geometry=await evaluate('(()=>{const page=document.querySelector(".tree-adoption-management-page"),parent=page.parentElement,save=document.querySelector(".tree-availability-footer").getBoundingClientRect(),map=document.querySelector("[data-testid=pickup-map]").getBoundingClientRect();return {parentScroll:parent.scrollHeight,parentHeight:parent.clientHeight,saveBottom:save.bottom,mapHeight:map.height,mapBottom:map.bottom}})()');
      assert.ok(geometry.parentScroll<=geometry.parentHeight+1,'Área municipal ganhou scroll: '+JSON.stringify(geometry));
      assert.ok(geometry.saveBottom<=height,'Salvar saiu da tela: '+JSON.stringify(geometry));
      assert.ok(geometry.mapHeight>=160,'Mapa ficou pequeno: '+JSON.stringify(geometry));
      assert.ok(await evaluate('(()=>{const map=document.querySelector("[data-testid=pickup-map]").getBoundingClientRect(),panel=document.querySelector(".tree-pickup-location").getBoundingClientRect();return map.bottom<=panel.bottom})()'),'Mapa ficou cortado na coluna');
    }
    await capture(`retirada-campos-${width}`);
    await waitFor('window.calls.some(c=>c.name==="update_tree_adoption"&&c.args.p_status==="aprovada")');
    await click('Voltar à lista');await click('Nova disponibilidade');await select('Espécie', 'unregistered');await select('Disponibilidade', 'disponivel');await click('Salvar disponibilidade');
    await waitFor('document.body.innerText.includes("Disponibilidade atualizada.")');
    await waitFor('document.querySelector(".tree-availability-table")');await click('Nova disponibilidade');await select('Espécie','consultation');assert.ok(await evaluate('document.querySelector(".tree-availability-editor [role=combobox]").innerText.includes("consultation")'),'Equipe perdeu o catálogo completo');
    await click('Nova espécie');await waitFor('document.querySelector("[data-testid=tree-species-editor]")');await input('Ex.: Nim','Espécie criada na disponibilidade');await click('Adicionar ao catálogo');await waitFor('!document.querySelector("[data-testid=tree-species-editor]")');
    await waitFor('document.querySelector(".tree-availability-editor [role=combobox]").innerText.includes("Espécie criada na disponibilidade")');
    await select('Disponibilidade','disponivel');await click('Salvar disponibilidade');await waitFor('document.body.innerText.includes("Disponibilidade atualizada.")');
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
    await capture(`gestao-${width}`);
    console.log(`${width}x${height}: quatro etapas, header do app, cores do sistema, catálogo paginado, ações visíveis e desktop sem rolagem OK; margens ${margins.join('/')}`);
  }
  await navigate('?many-manager');await waitFor('document.querySelectorAll(".adoption-request-card").length===10');
  await capture('fila-muitos-1920');await click('Próxima');await waitFor('document.querySelectorAll(".adoption-request-card").length===8');
  assert.ok(await evaluate('document.body.innerText.includes("Página 2 de 2")'));
  await navigate('?dark-manager');await waitFor('document.querySelector(".adoption-request-card")');await capture('fila-dark-1920');
  await click('Disponibilidade de mudas');await waitFor('document.querySelector(".tree-availability-table")');await capture('disponibilidade-dark-1920');
  await navigate('?missing-city-manager');await waitFor('document.querySelector("article")');await click('Disponibilidade de mudas');await waitFor('document.querySelector(".tree-availability-table")');await click('Nova disponibilidade');
  await waitFor('document.querySelector("[data-testid=pickup-map] .leaflet-container")');
  await waitFor('window.testMap.getCenter().distanceTo([-8.612345,-38.591234])<10');
  assert.ok(await evaluate('document.querySelector(".tree-pickup-location h4").textContent.includes("Floresta")'),'city_id não recuperou o nome no catálogo');
  await navigate('?empty-map-no-city-metadata-manager');await waitFor('document.querySelector("article")');await click('Disponibilidade de mudas');await waitFor('document.querySelector(".tree-availability-table")');await click('Nova disponibilidade');
  await waitFor('document.querySelector("[data-testid=pickup-map] .leaflet-container")');
  assert.ok(await evaluate('window.testMap.getZoom()===4&&window.testMap.getCenter().distanceTo([-14.2,-51.9])<50000'), 'Alternativa sem dados usou outra cidade: '+JSON.stringify(await evaluate('({center:window.testMap.getCenter(),zoom:window.testMap.getZoom()})')));
  assert.ok(await evaluate('!document.body.innerText.includes("Não foi possível localizar a cidade")'),'Ausência de dados bloqueou o mapa');
  console.log('Retirada: centralização pelo city_id, metadados incompletos e abertura sem pontos ou geocodificação OK.');
  await navigate('?manager');await waitFor('document.querySelector("article")');await click('Disponibilidade de mudas');await waitFor('document.querySelector(".tree-availability-table")');
  await evaluate('window.failAvailabilityLoad=true');await click('Atualizar');await waitFor('document.querySelector("[role=alert]")');
  assert.ok(await evaluate('!document.body.innerText.includes("Nenhuma disponibilidade cadastrada")'),'Falha de consulta apareceu como ausência de cadastros');
  await evaluate('window.failAvailabilityLoad=false;window.clearAvailability()');await click('Tentar novamente');
  await waitFor('document.body.innerText.includes("Nenhuma disponibilidade cadastrada nesta cidade")');
  await capture('disponibilidades-vazio');await click('Nova disponibilidade');await waitFor('document.querySelector(".tree-availability-editor")');await click('Voltar à lista');
  assert.ok(await evaluate('document.body.innerText.includes("Nenhuma disponibilidade cadastrada nesta cidade")'),'Voltar à consulta vazia falhou');
  console.log('Disponibilidades: consulta, filtros, paginação, edição, inclusão, falha ao salvar, erro de carregamento e lista vazia OK.');
  await navigate('?attendant'); await waitFor('document.querySelector("article")'); await click('Ver pedido e histórico');
  assert.ok(await evaluate('![...document.querySelectorAll("[role=dialog] select option")].some(el=>["aprovada","concluida","recusada"].includes(el.value))'));
  await select('Status da solicitação', 'em_analise'); await textArea('Atendente iniciou a avaliação do local.'); await click('Registrar atualização');
  await waitFor('!document.querySelector("[role=dialog]")&&document.querySelector("article")?.innerText.includes("Em análise técnica")');
  await navigate('?inventory-manager'); await waitFor('document.querySelector("article")');
  assert.ok(await evaluate('![...document.querySelectorAll("nav a")].some(a=>a.textContent.includes("Ordens de serviço"))'),'Gestor do inventário não recebe atendimento genérico');
  await navigate('?reader'); await waitFor('document.querySelector("h1")?.textContent==="Solicitações da cidade"');
  assert.ok(await evaluate('![...document.querySelectorAll("nav a")].some(a=>a.textContent.trim()==="Adote uma árvore")'),'Somente leitura não recebe atendimento de árvores');
  await navigate(); await waitFor('document.querySelector(".adoption-request-layout")'); await radio('muda');
  await evaluate(`document.querySelector('button[aria-label="Selecionar cidade"]').click()`); await waitFor('document.querySelector("[role=option]")');
  await evaluate('[...document.querySelectorAll("[role=option]")].find(el=>el.textContent.includes("Recife")).click()');
  await waitFor('document.body.innerText.includes("Recife")');
  await waitFor('document.body.innerText.includes("ainda não tem convênio")');
  assert.ok(await evaluate('!document.querySelector(".adoption-form")'));
  await navigate('?dark'); await waitFor('document.querySelector(".adoption-request-layout")'); await capture('pedido-dark-1920');
  await navigate('?cidade=65');await waitFor('document.querySelector(".adoption-city-selector")?.innerText.includes("Recife")');
  await navigate('?visitor'); await waitFor('document.body.innerText.includes("Entrar para solicitar")');
  assert.ok(await evaluate('!document.querySelector("form")'));
  }
  for (const [width,height] of layoutOnly ? [] : [[390,844],[1440,900],[1920,1080]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
    await navigate('?multi');await waitFor('document.querySelector(".adoption-form")?.dataset.step==="0"');
    await evaluate(`sessionStorage.setItem('tc_tree_adoption_draft:64:citizen',JSON.stringify({requestId:'95000000-0000-0000-0000-000000000001',step:2,form:{request_type:'plantio',purpose:'sombra',zone:'urbana',planting_place:'quintal',overhead_wiring:'nao',address:'Rua do Plantio, 20',latitude:-8.6,longitude:-38.57,requester_name:'Maria da Silva',requester_phone:'87999999999',requester_email:'maria@example.test',items:[],commitment:false}}))`);
    await navigate('?resume-multi');await waitFor('document.querySelector("[data-species-id=species1]")');
    await evaluate('document.querySelector("[data-species-id=species1] input").click()');
    await timeInput('Quantidade de Ipê-amarelo','3');
    await evaluate(`document.querySelector('button[aria-label="Aumentar quantidade de Ipê-amarelo"]').click()`);
    assert.equal(await evaluate(`document.querySelector('input[aria-label="Quantidade de Ipê-amarelo"]').value`),'4');
    await evaluate(`document.querySelector('button[aria-label="Diminuir quantidade de Ipê-amarelo"]').click()`);
    assert.equal(await evaluate(`document.querySelector('input[aria-label="Quantidade de Ipê-amarelo"]').value`),'3');
    await radio('viveiro_municipal');
    await evaluate('document.querySelector("[data-species-id=extra0] input").click()');
    await timeInput('Quantidade de Muda teste 01','0');await radio('viveiro_municipal');
    await click('Continuar');await waitFor('document.querySelector(".adoption-form-error")');
    await timeInput('Quantidade de Muda teste 01','2');await frame('multiplas-especies',width,height);await capture(`multiplas-especies-${width}`);
    await navigate('?resume-multi');await waitFor(`document.querySelector('input[aria-label="Quantidade de Muda teste 01"]')`);
    assert.equal(await evaluate(`document.querySelector('input[aria-label="Quantidade de Ipê-amarelo"]').value`),'3');
    assert.equal(await evaluate(`document.querySelector('input[aria-label="Quantidade de Muda teste 01"]').value`),'2');
    await click('Continuar');await waitFor('document.querySelector(".adoption-review-layout")');
    assert.ok(await evaluate('document.querySelector(".adoption-review-layout").innerText.includes("Maria da Silva")&&document.querySelector(".adoption-review-layout").innerText.includes("3 × Ipê-amarelo")'));
    await evaluate('document.querySelector(".adoption-commitment input").click()');await click('Enviar solicitação');await waitFor('window.requests.length===1');
    assert.deepEqual(await evaluate('window.requests[0].items.map(item=>item.quantity)'),[3,2]);
    assert.equal(await evaluate('window.requests[0].requester_phone'),'87999999999');
    await navigate('?manager');await waitFor('document.querySelector("article")');
    await evaluate(`Object.assign(window.requests[0],{requester_name:'Maria da Silva',requester_phone:'87999999999',items:[{species_id:'species1',quantity:3,provider:'viveiro_municipal'},{species_id:'extra0',quantity:2,provider:'viveiro_municipal'}]})`);
    await click('Atualizar');await waitFor('document.querySelector("article").innerText.includes("Maria da Silva")');
    await click('Ver pedido e histórico');await waitFor('document.querySelector("[role=dialog] select")');
    assert.ok(await evaluate('![...document.querySelectorAll("button")].some(button=>button.textContent.trim()==="Solicitação atendida")'));
    assert.deepEqual((await evaluate('[...document.querySelector("[role=dialog] select").options].map(option=>option.value).filter(Boolean)')).sort(), ['solicitada','em_analise','aguardando_informacao','aguardando_disponibilidade','aprovada','agendada','concluida','recusada','cancelada'].sort());
    await select('Status da solicitação','agendada');
    assert.ok(await evaluate('!!document.querySelector("[role=dialog] input[type=datetime-local]")'));
    await select('Status da solicitação','concluida');
    assert.ok(await evaluate('document.querySelector("[role=dialog]").innerText.includes("5")&&document.querySelector("[role=dialog]").innerText.includes("87999999999")'));
    await textArea('Cinco árvores plantadas e conferidas pela equipe.');await capture(`conclusao-direta-${width}`);await click('Registrar atualização');
    await waitFor('!document.querySelector("[role=dialog]")&&window.requests[0].status==="concluida"');
    assert.ok(await evaluate('window.calls.some(c=>c.name==="update_tree_adoption"&&c.args.p_expected_status==="solicitada"&&c.args.p_status==="concluida")'));
    await click('Disponibilidade de mudas');await waitFor('document.querySelector(".tree-availability-table")');await click('Nova disponibilidade');
    await select('Fornecedor','instituto_florestar');
    await evaluate('[...document.querySelectorAll("label")].find(el=>el.textContent.includes("Adicionar várias espécies deste viveiro")).querySelector("input").click()');
    await evaluate('[...document.querySelectorAll(".tree-availability-batch-options input")].slice(0,2).forEach(el=>el.click())');
    await select('Disponibilidade','disponivel');
    await input('Rua, número, bairro e referência de acesso','Rua do Viveiro, 10');
    await evaluate('window.failAvailabilitySave=true');await click('Salvar disponibilidade');await waitFor('document.querySelector(".tree-availability-footer [role=alert]")');
    assert.equal(await evaluate('document.querySelectorAll(".tree-availability-batch-options input:checked").length'),2);
    await evaluate('window.failAvailabilitySave=false');await capture(`viveiro-lote-${width}`);await click('Salvar disponibilidade');
    await waitFor('!document.querySelector(".tree-availability-editor")&&window.availabilitySaves.length===1');
    assert.equal(await evaluate('window.availabilitySaves[0].length'),2);
    assert.ok(await evaluate('window.availabilitySaves[0].every(row=>row.provider==="instituto_florestar"&&row.pickup_details.address==="Rua do Viveiro, 10")'));
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
    console.log(`${width}px: múltiplas espécies/quantidades, contato, rascunho, conclusão direta e disponibilidade em lote OK.`);
  }
  }
  assert.deepEqual(errors, []);
  if(!process.argv.includes('--details-audit')&&!process.argv.includes('--nursery-audit')&&!process.argv.includes('--species-layout')) console.log(process.argv.includes('--consistent-forms') ? 'Padronização: 10 combinações de largura/tema, quatro etapas e erros de execução: 0.' : 'Atendente: análise sem aprovação. Troca de cidade: rascunho limpo. Visitante: login antes do formulário. Erros de execução: 0.');
} finally { ws?.close(); chrome.kill(); server.close(); }
