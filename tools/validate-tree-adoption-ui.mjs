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
  '@/contexts/SupabaseAuthContext': `export const useAuth=()=>({user:location.search.includes('visitor')?null:{id:'citizen',name:'Cidadã'},signOut:async()=>{}});`,
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
    let availability=[...species.filter(s=>!['unregistered','consultation','unavailable'].includes(s.id)).map(s=>({species_id:s.id,provider:'viveiro_municipal',status:'disponivel'})),{species_id:'species1',provider:'instituto_florestar',status:'indisponivel'},{species_id:'consultation',provider:'viveiro_municipal',status:'sob_consulta'},{species_id:'unavailable',provider:'viveiro_municipal',status:'indisponivel'}];
    availability[0].instructions='Orientação anterior: confirme a retirada com a equipe.';
    const initialAvailability=structuredClone(availability);
    window.clearAvailability=()=>{availability=[]};window.restoreAvailability=()=>{availability=structuredClone(initialAvailability)};
    window.requests=/(manager|attendant)/.test(location.search)?[{id:'12345678-0000-0000-0000-000000000001',city_id:64,author_id:'citizen',species_id:'species1',request_type:'plantio',zone:'urbana',planting_place:'calcada',purpose:'sombra',overhead_wiring:'sim',provider:'viveiro_municipal',address:'Rua do Plantio, 20',neighborhood:'Centro',latitude:-8.6,longitude:-38.57,status:'solicitada',created_at:new Date().toISOString(),species:species[0]}]:[];
    if(location.search.includes('many-manager')){const base=window.requests[0];window.requests=Array.from({length:18},(_,i)=>({...base,id:'12345678-0000-0000-0000-'+String(i+1).padStart(12,'0'),status:['solicitada','em_analise','aguardando_informacao','aprovada'][i%4],address:'Rua de teste '+(i+1)+', Centro',request_type:i%2?'muda':'plantio'}));}
    window.events=[];window.calls=[];window.alerts=[];window.mapQueries=[];
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
      if(payload){if(window.failAvailabilitySave)return Promise.resolve({error:{message:'offline'}}).then(ok,fail);availability=availability.filter(r=>r.species_id!==payload.species_id||r.provider!==payload.provider);availability.push({...payload,updated_at:new Date().toISOString()});return Promise.resolve({data:payload}).then(ok,fail);}
      if(table==='tree_species_availability'&&window.failAvailabilityLoad)return Promise.resolve({error:{message:'offline'}}).then(ok,fail);
      if(['city_trees','poles'].includes(table))window.mapQueries.push({table,filters});
      let rows=table==='city_trees'&&!location.search.includes('empty-map')?[{city_id:65,latitude:-8.05,longitude:-34.9},{city_id:64,latitude:-8.612345,longitude:-38.591234}]:table==='city_tree_species'?species:table==='tree_species_availability'?availability:table==='tree_adoption_availability_alerts'?window.alerts:table==='tree_adoption_requests'?window.requests:table==='tree_adoption_events'?window.events:table==='categories'?[{id:'poda',name:'Arborização'}]:[];
      rows=rows.filter(r=>filters.every(([k,v])=>k==='species.city_id'?String(v)==='64':String(r[k])===String(v))&&excludes.every(([k,vs])=>!vs.includes(r[k])));
      return Promise.resolve({data:one?rows[0]||null:rows.slice(start,end+1),count:rows.length,error:null}).then(ok,fail);
    }};return q;}};`,
};
await build({
  stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route}from'react-router-dom';import L from 'leaflet';import AdoptTreePage from '@/pages/AdoptTreePage';import Management from '@/pages/TreeAdoptionManagementPage';import Layout from '@/components/municipality/MunicipalityLayout';if(location.search.includes('dark'))document.documentElement.classList.add('dark');L.Map.addInitHook(function(){window.testMap=this;});const desktop=matchMedia('(min-width:980px)').matches,management=/(manager|attendant|reader)/.test(location.search);createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={management?['/prefeitura/adote-uma-arvore?cidade=64&secretaria=agri']:['/'+location.search]}>{management?<Routes><Route element={<Layout/>}><Route path="/prefeitura/adote-uma-arvore" element={<Management/>}/><Route path="/prefeitura/broncas" element={<h1>Solicitações da cidade</h1>}/><Route path="/prefeitura/gestao-territorial/arborizacao" element={<h1>Inventário de árvores</h1>}/></Route></Routes>:<div className={'qa-app-root'+(desktop?' tree-adoption-app':'')}><header className="qa-site-header">Trombone Cidadão</header><main className={'qa-app-main'+(desktop?' tree-adoption-app-main':'')} style={{paddingTop:56,paddingBottom:desktop?0:80}}><div className="qa-route-outlet"><AdoptTreePage/></div></main></div>}</MemoryRouter>);`, resolveDir: root, loader: 'jsx' },
  bundle: true, jsx: 'automatic', loader: { '.png': 'dataurl' }, outfile: path.join(out, 'preview.js'),
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' }, alias: { '@': path.join(root, 'src') },
  plugins: [{ name: 'fixtures', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => stubs[args.path] ? { path: args.path, namespace: 'fixture' } : undefined);
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'jsx', resolveDir: root }));
  } }],
});
let sourceCss = await fs.readFile('src/index.css', 'utf8');
for (const token of ['primitives', 'semantic', 'typography', 'motion']) sourceCss = sourceCss.replace(`@import './design-system/tokens/${token}.css';`, await fs.readFile(`src/design-system/tokens/${token}.css`, 'utf8'));
sourceCss += '\n' + await fs.readFile('src/components/arborization/treeAdoption.css', 'utf8');
sourceCss += '\n' + await fs.readFile('src/components/arborization/treeAdoptionManagement.css', 'utf8');
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
  const navigate = query => send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/${query || ''}` }, sessionId);
  const capture = async name => { await pause(200); const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId); await fs.writeFile(path.join(out, `${name}.png`), Buffer.from(shot.data, 'base64')); };
  const frame = async (stage,width,height) => {
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'), `overflow horizontal ${stage} em ${width}x${height}`);
    if(width<980)return;
    const dimensions=await evaluate(`(()=>{const form=document.querySelector('.adoption-form'),footer=form.querySelector('.adoption-form-footer').getBoundingClientRect(),body=form.querySelector('.adoption-form-body');return {scroll:document.scrollingElement.scrollHeight,height:innerHeight,footerBottom:footer.bottom,footerTop:footer.top,bodyScroll:body.scrollHeight,bodyHeight:body.clientHeight}})()`);
    assert.ok(dimensions.scroll<=height+1,`rolagem da página ${stage} em ${width}x${height}: ${JSON.stringify(dimensions)}`);
    assert.ok(dimensions.footerBottom<=height&&dimensions.footerTop>=56,`ações fora da tela ${stage}: ${JSON.stringify(dimensions)}`);
    assert.ok(dimensions.bodyScroll<=dimensions.bodyHeight+1,`formulário não compacto ${stage}: ${JSON.stringify(dimensions)}`);
  };
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
      assert.ok(await evaluate('(()=>{const u=new URL(window.copiedAdoptionLink);return u.pathname==="/adote-uma-arvore"&&u.searchParams.get("cidade")==="64"&&[...u.searchParams.keys()].length===1})()'),'Convite não preservou apenas a cidade pública');
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
    await select('Próxima ação', 'em_analise'); await textArea('Análise do local iniciada pela equipe de arborização.'); await click('Registrar atualização');
    await waitFor('!document.querySelector("[role=dialog]")&&document.querySelector("article")?.innerText.includes("Em análise técnica")');
    await click('Ver pedido e histórico'); await select('Próxima ação', 'aprovada'); await textArea('Espécie e fornecedor confirmados após avaliação do local.'); await click('Registrar atualização');
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
  await select('Próxima ação', 'em_analise'); await textArea('Atendente iniciou a avaliação do local.'); await click('Registrar atualização');
  await waitFor('!document.querySelector("[role=dialog]")&&document.querySelector("article")?.innerText.includes("Em análise técnica")');
  await navigate('?inventory-manager'); await waitFor('document.querySelector("article")');
  assert.ok(await evaluate('![...document.querySelectorAll("nav a")].some(a=>a.textContent.includes("Ordens de serviço"))'),'Gestor do inventário não recebe atendimento genérico');
  await navigate('?reader'); await waitFor('document.querySelector("h1")?.textContent==="Solicitações da cidade"');
  assert.ok(await evaluate('![...document.querySelectorAll("nav a")].some(a=>a.textContent.trim()==="Adote uma árvore")'),'Somente leitura não recebe atendimento de árvores');
  await navigate(); await waitFor('document.querySelector(".adoption-request-layout")'); await radio('muda');
  await evaluate(`document.querySelector('button[aria-label="Selecionar cidade"]').click()`); await waitFor('document.querySelector("[role=option]")');
  await evaluate('[...document.querySelectorAll("[role=option]")].find(el=>el.textContent.includes("Recife")).click()');
  await waitFor('document.body.innerText.includes("Recife")');
  assert.ok(await evaluate('!document.querySelector("input[type=radio]:checked")'));
  await navigate('?dark'); await waitFor('document.querySelector(".adoption-request-layout")'); await capture('pedido-dark-1920');
  await navigate('?cidade=65');await waitFor('document.querySelector(".adoption-city-selector")?.innerText.includes("Recife")');
  await navigate('?visitor'); await waitFor('document.body.innerText.includes("Entrar para solicitar")');
  assert.ok(await evaluate('!document.querySelector("form")'));
  assert.deepEqual(errors, []);
  console.log('Atendente: análise sem aprovação. Troca de cidade: rascunho limpo. Visitante: login antes do formulário. Erros de execução: 0.');
} finally { ws?.close(); chrome.kill(); server.close(); }
