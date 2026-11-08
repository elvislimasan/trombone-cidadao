// Componentes reais de layout/equipe/secretaria/execução e Leaflet; dados e camadas de tiles simulados.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import loadConfig from 'tailwindcss/loadConfig.js';

const root = process.cwd(), out = path.join(root, '.tmp/municipal-responsibilities-ui');
await fs.mkdir(out, { recursive: true });
const stubs = {
  '@/contexts/SupabaseAuthContext': `export const useAuth=()=>({user:{id:'worker',name:'Servidor municipal',email:'servidor@municipio.gov.br'},signOut:async()=>{}});`,
  '@/design-system/theme/ThemeProvider': `export const useTheme=()=>({resolved:'light',setPreference(){}});`,
  '@/contexts/NativeUIModeContext': `export const useNativeUIMode=()=>({isNative:new URLSearchParams(location.search).get('mode')?.endsWith('-executor')||false});`,
  '@/components/municipality/MunicipalReportCreateDialog': `export default function CreateReport(){return null;}`,
  '@/components/municipality/MunicipalDemandDrawer': `export default function Demand(){return null;}`,
  '@/components/municipality/MunicipalReportDrawer': `export default function Report(){return null;}`,
  '@/components/municipality/MunicipalExportDialog': `export default function Export(){return null;}`,
  '@/components/municipality/MunicipalServiceOrderDialog': `export default function Order(){return null;}`,
  '@/components/Notifications': `export default function Notifications(){return null;}`,
  '@/contexts/CityContext': `import React,{createContext} from 'react';const C=createContext();export const useCity=()=>({cities:[{id:64,name:'Floresta',state:{uf:'PE'}},{id:65,name:'Recife',state:{uf:'PE'}}],loadingCities:false,activeCityId:65});export const CityViewProvider=({children,value})=><C.Provider value={value}>{children}</C.Provider>;`,
  '@/hooks/usePermissions': `export const usePermissions=()=>({loading:false,error:false,municipalities:[{city_id:64,papel:'colaborador'}],planningCityIds:[],treeAssignments:new URLSearchParams(location.search).get('mode')?.endsWith('-executor')?[]:[{city_id:64,canal_id:'agri',secretaria:'Agricultura'}],isMaster:false,canWrite:()=>new URLSearchParams(location.search).get('mode')!=='reader'});`,
  '@/pages/ArborizationMapPage': `export const ArborizationContent=()=> <div data-testid="inventory-content" className="min-h-[65vh] w-full rounded-xl bg-surface-subtle p-4">Inventário de árvores</div>;`,
  '@/pages/PavementMapPage': `export const PavementContent=()=> <div>Inventário de ruas</div>;`,
  '@/components/map/ThemedTileLayer': `export default function Tiles(){return null;}`,
  '@/components/map/SatelliteTileLayer': `export default function Tiles(){return null;}`,
  '@/lib/arborization': `export { treeLabel, treeImage, TREE_STATUS, TREE_ORIGINS, TREE_ACTIONS, TREE_MAP_STATES, treeMapMarkerKey } from '@/lib/arborization.js';export const loadCityTrees=async()=>[{id:'tree',city_id:64,common_name:'Ipê atribuído',status:'saudavel',latitude:-8.6,longitude:-38.5},{id:'tree-available',city_id:64,common_name:'Ipê disponível',status:'saudavel',latitude:-8.6002,longitude:-38.5002},{id:'tree-free',city_id:64,public_code:'AR-003',common_name:'Caraibeira',scientific_name:'Tabebuia aurea',address:'Praça da matriz',status:'saudavel',latitude:-8.6001,longitude:-38.5001}];`,
  '@/lib/pavementMapData': `export const carregarRuasDoMapa=async()=>[{id:'street',name:'Rua A',linhas:[[[-8.601,-38.501],[-8.602,-38.502]]]}];`,
  '@/lib/geocodeCity': `export const geocodeCity=async(name,uf)=>uf==='PE'?{lat:-8.597031,lng:-38.574217}:null;`,
  '@/lib/appConfirm': `export const confirmApp=async()=>true;`,
  '@/lib/appError': `export const showAppError=x=>{window.uiErrors.push(x)};export const showAppNotice=()=>{};`,
  '@/lib/customSupabaseClient': `
    window.rpcCalls=[];window.uiErrors=[];const mode=new URLSearchParams(location.search).get('mode')||'agriculture';
    const admin=mode==='admin';const combined=mode==='combined';const field=mode.endsWith('-executor');const specialty=mode==='tree-executor'?'arborizacao':mode==='road-executor'?'ruas':'servicos_gerais';const executor=mode==='executor'||field;const cargos=mode==='attendant'?['atendente']:executor?['executor']:mode==='inventory'?['inventario']:mode==='reader'?['leitura']:combined?['gestor','executor']:['gestor'];
    const prefeitura={id:'pref64',city_id:64,nome:'Prefeitura de Floresta',status:'ativa',categorias_habilitadas:['poda','iluminacao','buracos','limpeza'],cidade:{name:'Floresta',states:{uf:'PE'}}};
    if(${JSON.stringify(process.argv.includes('--location-map'))})prefeitura.cidade={name:'Floresta',state_id:17};
    const agri={id:'agri',nome:'Agricultura',city_id:64,ativo:true,canal_triagem:false,municipal_modules:['arborization'],execution_specialties:['arborizacao'],execution_categories:{arborizacao:['poda']},access_version:1,email:'agri@municipio.gov.br',emails_copia:[],reply_to:'agri@municipio.gov.br',categorias:[{category_id:'poda'}],cidade:prefeitura.cidade};
    const light={...agri,id:'light',nome:'Iluminação',municipal_modules:['lighting'],execution_specialties:['eletricista'],categorias:[{category_id:'iluminacao'}]};
    const roads={...agri,id:'roads',nome:'Obras',municipal_modules:['urban_planning'],execution_specialties:['ruas'],execution_categories:{ruas:['buracos']},categorias:[{category_id:'buracos'}]};const general={...agri,id:'general',nome:'Serviços urbanos',municipal_modules:[],execution_specialties:['servicos_gerais'],execution_categories:{servicos_gerais:['limpeza']},categorias:[{category_id:'limpeza'}]};
    const channels=field?[specialty==='arborizacao'?agri:specialty==='ruas'?roads:general]:admin?[agri,light]:(combined||executor)?[light]:[agri];const canal=channels[0];
    const access={membro_id:'member1',canal_id:canal.id,city_id:64,cargos,atendimento:(mode==='inventory'||executor)?'nenhum':mode==='reader'?'leitura':mode==='attendant'?'atendente':'gestor',especialidades_execucao:field?[specialty]:(combined||executor)?['eletricista']:[],inventario_iluminacao:combined,versao:1};
    const member={id:'member1',canal_id:'agri',user_id:'worker',ativo:true,papel:'gestor',created_at:'2026-10-01',perfil:{id:'worker',name:'Servidor municipal',phone:'81999999999'}};
    const mappings=[{canal_id:'agri',category_id:'poda'},{canal_id:'light',category_id:'iluminacao'}];
    const workOrder={id:'work-order',prefeitura_id:'pref64',canal_id:canal.id,category_id:canal.categorias[0].category_id,execution_specialty:specialty,titulo:'Serviço de campo da praça',descricao:'Atender os problemas no local indicado.',status:'aberta',versao:1,atribuido_a:'worker',protocolo:'OS-2026-100',latitude:-8.6,longitude:-38.5,endereco:'Praça da matriz',bairro:'Centro'};
    const poles=Array.from({length:3},(_,i)=>({id:i+1,city_id:64,identifier:String(100+i),latitude:i===2?-8.5:-8.597031+i*.0003,longitude:i===2?-38.5:-38.574217+i*.0003,address:'Rua da matriz',lamp_type:'LED',lighting_status:i===0?'apagado':'aceso',is_broken:i===0}));
    const linkedReport={report_id:'work-report',title:'Solicitação da praça',status:'pending'};const executionResults=[];
    const overviewReports=[{id:'r1',city_id:64,category_id:'poda',status:'pending',is_public:true,moderation_status:'approved',created_at:new Date().toISOString()},{id:'r2',city_id:64,category_id:'poda',status:'in-progress',is_public:false,moderation_status:'internal',created_by_municipality:'pref64',created_at:new Date().toISOString()},{id:'r3',city_id:64,category_id:'iluminacao',status:'pending',is_public:true,moderation_status:'approved',created_at:new Date().toISOString()}];overviewReports.forEach((r,i)=>Object.assign(r,{title:'Atendimento da rua '+i,address:'Rua da matriz',neighborhood:'Centro',category:{name:r.category_id}}));window.overviewQueries=[];
    const memberships=[{papel:admin?'administrador':'colaborador',prefeitura}];
    export const supabase={functions:{async invoke(name,{body}){window.rpcCalls.push({name,params:body});return window.inviteFailure?{error:{context:{async json(){return {error:'A secretaria não possui execução de campo habilitada.'}}}}}:{data:{email:body.email,temporary_password:'Senha-temporaria-teste-123!',password_expires_at:new Date(Date.now()+86400000).toISOString()}};}},rpc(name,params){window.rpcCalls.push({name,params});let data=[];
      if(name==='municipal_lighting_map_clusters')data=poles.map(pole=>({cluster_lat:pole.latitude,cluster_lng:pole.longitude,item_count:1,pole}));
      if(name==='municipal_execution_workspace')data={execution_contract:1,execution_activities:field?[{canal_id:canal.id,city_id:64,specialty,category_ids:canal.categorias.map(row=>row.category_id)}]:[],actor_user_id:mode==='wrong-session'?'previous-account':'worker',access_contract:2,category_channels:mappings.map(row=>({...row,city_id:64})),memberships,channels,accesses:admin?[]:[access],inventories:[],inventory_views:canal.id==='agri'&&!field?[{city_id:64,canal_id:'agri',module:'arborization'}]:[],execution_team:[]};
      if(name==='resumo_demandas_municipais')data={total:1,abertas:1,em_andamento:0,concluidas:0,atrasadas:0,sem_responsavel:0};
      if(name==='municipal_team_access')data=[{membro_id:'member1',access:{...access,cargos:['gestor']},asset_modules:[]}];
      if(name==='listar_emails_equipe_prefeitura')data=[{membro_id:'member1',email:'servidor@municipio.gov.br'}];
      if(name==='convidar_funcionario_secretaria')data={token:'invitation'};
      if(name==='salvar_secretaria_execucao')data=params.p_id||'new-channel';
      if(name==='listar_painel_executor')data={items:[{...workOrder,tree_id:specialty==='arborizacao'?(params.p_aba==='disponiveis'?'tree-available':'tree'):null,latitude:params.p_aba==='disponiveis'?-8.6002:-8.6,longitude:params.p_aba==='disponiveis'?-38.5002:-38.5,tipo:params.p_aba==='disponiveis'?'solicitacao':'ordem',atribuido_a:params.p_aba==='disponiveis'?null:'worker'}],total:1,page:1,stage_counts:{fazer:1,execucao:0,conferencia:0,historico:0}};
      if(name==='aceitar_servico_executor'){workOrder.status='em_andamento';data=workOrder.id;}
      if(name==='detalhar_ordem_executor')data={order:{...workOrder},reports:[{...linkedReport}],events:[],attachments:[],results:executionResults};
      if(name==='registrar_execucao_executor'){workOrder.status=params.p_acao==='concluir'?'concluida':'em_andamento';workOrder.versao++;if(params.p_acao==='concluir')linkedReport.status='resolved';executionResults.push({id:params.p_operacao});data={id:workOrder.id,status:workOrder.status,versao:workOrder.versao};}
      if(name==='estatisticas_executor')data={completed:4,impediments:1,assets:2,this_month:3,neighborhoods:1,services:[{service:specialty==='arborizacao'?'poda':specialty==='ruas'?'reparo':'limpeza',total:4}],top_neighborhoods:[{name:'Centro',count:4}],ranking:[{user_id:'worker',nome:'Servidor municipal',servicos:4}],recent:[]};
      const response={data,error:name==='convidar_funcionario_secretaria'&&window.inviteFailure?{message:'A secretaria não possui execução de campo habilitada.'}:null};return {then(resolve,reject){return Promise.resolve(response).then(resolve,reject)},maybeSingle(){return this},order(){return this},range(){return this},abortSignal(){return this}};
    },from(table){let start=0,end=999;let singular=false;const filters=[];const builder={limit(n){end=n-1;return this},neq(key,value){filters.push([key,value,'neq']);return this},is(){return this},not(){return this},lte(){return this},select(){return this},ilike(){return this},gte(){return this},lt(){return this},eq(key,value){filters.push([key,value]);return this},in(key,values){filters.push([key,values]);return this},or(value){if(table==='poles')filters.push(['__or',value]);return this},abortSignal(){return this},order(){return this},range(a,b){start=a;end=b;return this},maybeSingle(){singular=true;return this},single(){singular=true;return this},then(resolve,reject){let data=table==='poles'?poles:table==='demandas_municipais'?[workOrder]:table==='reports'?overviewReports:table==='prefeitura_membros'?memberships:table==='orgao_canais'?channels:table==='categories'?[{id:'poda',name:'Poda'},{id:'iluminacao',name:'Iluminação'},{id:'buracos',name:'Buracos'},{id:'limpeza',name:'Limpeza'}]:table==='orgao_membros'?[member]:table==='orgao_categorias'?mappings:table==='site_config'?[{site_name:'Trombone Cidadão',logo_url:'/logo.png'}]:[];
      for(const [key,value,operator] of filters)if(key==='__or')data=data.filter(row=>value.split(',').some(term=>{const [field,op,raw]=term.split('.');return op==='ilike'?String(row[field]||'').toLowerCase().includes(raw.replaceAll('%','').toLowerCase()):op==='is'?row[field]==null:row[field]===(raw==='true'?true:raw==='false'?false:raw)}));else if(key!=='user_id'&&key!=='papel')data=data.filter(row=>operator==='neq'?row[key]!==value:Array.isArray(value)?value.includes(row[key]):row[key]===value);if(table==='reports')window.overviewQueries.push(filters);const count=data.length;data=data.slice(start,end+1);return Promise.resolve({count,data:singular?data[0]||null:data,error:table==='reports'&&window.failOverview?{message:'Consulta indisponível'}:null}).then(resolve,reject)}};return builder}};`,
};
if(process.argv.includes('--form-audit'))for(const name of ['MunicipalDemandDrawer','MunicipalExportDialog','MunicipalServiceOrderDialog'])delete stubs['@/components/municipality/'+name];
await build({ stdin: { contents: `import L from 'leaflet';L.Map.addInitHook(function(){window.auditLocationMap=this});import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter,Routes,Route,useLocation} from 'react-router-dom';import Layout from '@/components/municipality/MunicipalityLayout';import Executor from '@/pages/ExecutorPanelPage';import ExecutorOrder from '@/pages/ExecutorOrderPage';import ExecutorStats from '@/pages/ExecutorStatsPage';import Inventory from '@/pages/TerritorialPanelPage';import Overview from '@/pages/MunicipalOverviewPage';import Reports from '@/pages/MunicipalReportsPage';import Orders from '@/pages/MunicipalDemandsPage';import Lighting from '@/pages/MunicipalLightingPage';import LightingStats from '@/pages/MunicipalLightingStatsPage';import Settings from '@/pages/MunicipalServiceSettingsPage';import Team from '@/pages/MunicipalityTeamPage';import Departments from '@/pages/admin/ManageAgencyChannelsPage';function RouteObserver(){const route=useLocation();window.previewRoute=route.pathname+route.search;return null;}const page=new URLSearchParams(location.search).get('page')||'/prefeitura/visao-geral';createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={[page]}><RouteObserver/><Routes><Route element={<Layout/>}><Route path="/prefeitura/executor/:activity" element={<Executor/>}/><Route path="/prefeitura/executor/:activity/ordem/:id" element={<ExecutorOrder/>}/><Route path="/prefeitura/executor/:activity/estatisticas" element={<ExecutorStats/>}/><Route path="/prefeitura/visao-geral" element={<Overview/>}/><Route path="/prefeitura/iluminacao" element={<Lighting/>}/><Route path="/prefeitura/iluminacao/estatisticas" element={<LightingStats/>}/><Route path="/prefeitura/configuracoes" element={<Settings/>}/><Route path="/prefeitura/eletricista" element={<h1>Serviços do eletricista</h1>}/><Route path="/prefeitura/demandas" element={<Orders/>}/><Route path="/prefeitura/demandas/nova" element={<Orders view="form"/>}/><Route path="/prefeitura/demandas/:id" element={<Orders view="form"/>}/><Route path="/prefeitura/broncas" element={<Reports/>}/><Route path="/prefeitura/gestao-territorial/:module?/:section?" element={<Inventory/>}/><Route path="/prefeitura/equipe" element={<Team/>}/><Route path="/prefeitura/secretarias" element={<Departments/>}/></Route></Routes></MemoryRouter>);`, loader: 'jsx', resolveDir: root },
  bundle: true, loader: { '.png': 'dataurl' }, jsx: 'automatic', outfile: path.join(out, 'preview.js'), alias: { '@': path.join(root, 'src') },
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
  plugins: [{ name: 'fixtures', setup(b) { b.onResolve({ filter: /.*/ }, a => stubs[a.path] ? { path: a.path, namespace: 'fixture' } : undefined); b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: stubs[a.path], loader: 'jsx', resolveDir: root })); } }],
});
let source = await fs.readFile('src/index.css', 'utf8');
for (const match of [...source.matchAll(/@import '([^']+)';/g)]) source = source.replace(match[0], await fs.readFile(path.join(root, 'src', match[1]), 'utf8'));
const config = loadConfig(path.join(root, 'tailwind.config.js'));
const css = await postcss([tailwind({ ...config, content: ['src/components/LocationPickerMap.jsx','src/components/arborization/TreeDetailsDialog.jsx','src/components/municipality/*.jsx','src/components/journeys/*.jsx','src/components/ui/*.jsx','src/pages/TerritorialPanelPage.jsx','src/pages/MunicipalityTeamPage.jsx','src/pages/admin/ManageAgencyChannelsPage.jsx','src/pages/Executor*.jsx','src/pages/ElectricianPanelPage.jsx','src/pages/Municipal*.jsx'] })]).process(source, { from: 'src/index.css' });
await fs.writeFile(path.join(out, 'preview.css'), css.css + await fs.readFile('node_modules/leaflet/dist/leaflet.css','utf8'));
const server = http.createServer(async (req,res) => {
  const resource = req.url.split('?')[0];
  if (['/preview.js','/preview.css'].includes(resource)) { res.setHeader('Content-Type',resource.endsWith('.js')?'text/javascript':'text/css');res.end(await fs.readFile(path.join(out,resource.slice(1)))); }
  else if(resource==='/logo.png')res.end(await fs.readFile('public/logo.png'));
  else { res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/preview.css"></head><body><div id="root"></div><script src="/preview.js"></script></body></html>'); }
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const profile=path.join(out,'chrome-'+Date.now());
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let ws;
try {
  let endpoint;
  for(let attempt=0;attempt<150&&!endpoint;attempt++){try{const [port,route]=(await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).trim().split(/\r?\n/);endpoint=`ws://127.0.0.1:${port}${route}`;}catch{await pause(100);}}
  assert.ok(endpoint,'Chrome não iniciou');ws=new WebSocket(endpoint);await new Promise(resolve=>ws.addEventListener('open',resolve,{once:true}));
  let sequence=0;const pending=new Map(),errors=[],consoleErrors=[];
  ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')consoleErrors.push(m.params.args.map(a=>a.value||a.description));if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}});
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
  const {targetId}=await send('Target.createTarget',{url:'about:blank'});const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});await send('Runtime.enable',{},sessionId);
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;};
  const wait=async expression=>{for(let i=0;i<120;i++){if(await evaluate('Boolean('+expression+')'))return;await pause(50);}throw Error('Timeout: '+expression+' / route: '+await evaluate('window.previewRoute')+' / browser errors: '+JSON.stringify(errors)+' / console errors: '+JSON.stringify(consoleErrors)+' / '+await evaluate('document.body.innerText')+' / paths: '+await evaluate("[...document.querySelectorAll('.leaflet-overlay-pane path')].map(el=>el.outerHTML).join('')"));};
  const visit=async(mode,page)=>{await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/?`+new URLSearchParams({mode,page})},sessionId);await wait('document.querySelector("main")||document.querySelector("[role=alert]")');};
  const results=[];
  if (process.argv.includes('--form-audit')) {
    const openText = async text => { await wait(`[...document.querySelectorAll('main button')].some(b=>b.textContent.trim()===${JSON.stringify(text)})`);await evaluate(`[...document.querySelectorAll('main button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`); };
    const menu = async (label, item) => { await evaluate(`document.querySelector('button[aria-label=${JSON.stringify(label)}]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);await wait('document.querySelector("[role=menu]")');await evaluate(`[...document.querySelectorAll('[role=menuitem]')].find(el=>el.textContent.includes(${JSON.stringify(item)})).click()`); };
    const cases = [
      {name:'nova-ordem',route:'demandas/nova'},
      {name:'editar-ordem',route:'demandas/work-order'},
      {name:'criar-acesso',route:'equipe',open:()=>openText('Criar acesso')},
      {name:'vincular-conta',route:'equipe',open:()=>menu('Mais ações da equipe','Vincular conta existente')},
      {name:'editar-acesso',route:'equipe',open:async()=>{await wait('document.querySelector("table tbody button")');await evaluate('document.querySelector("table tbody button").click()');}},
      {name:'nova-secretaria',route:'secretarias',open:()=>openText('Nova secretaria')},
      {name:'editar-secretaria',route:'secretarias',open:async()=>{await wait('document.querySelector("table tbody button")');await evaluate('document.querySelector("table tbody button").click()');}},
      {name:'novo-poste',route:'iluminacao',open:()=>openText('Adicionar poste')},
      {name:'lampadas-em-massa',route:'iluminacao',open:()=>menu('Mais ações da iluminação','Alterar lâmpadas em massa')},
      {name:'gerar-ordem',route:'broncas',open:()=>menu('Mais ações das solicitações','Gerar ordem de serviço')},
      {name:'exportar-solicitacoes',route:'broncas',open:()=>menu('Mais ações das solicitações','Baixar PDF')},
      {name:'exportar-ordens',route:'demandas',open:()=>openText('Exportar')},
      {name:'regras',route:'configuracoes',open:()=>openText('Editar regras')},
    ];
    for(const width of (process.argv.includes('--location-map') ? [360,390,430,1440,1920] : [390,1440,1920])) for(const theme of ['light','dark']) for(const item of cases.filter(entry => !process.argv.includes('--location-map') || ['nova-ordem','editar-ordem'].includes(entry.name))) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false},sessionId);
      await visit('admin','/prefeitura/'+item.route+'?cidade=64');await wait('document.querySelector("main")');
      await evaluate(`document.documentElement.classList.toggle('dark',${theme==='dark'})`);
      if(item.open) await item.open();
      await wait('document.querySelector("[role=dialog].task-dialog")');await pause(200);
      if(process.argv.includes('--location-map')) {
        await evaluate(`(()=>{const f=document.querySelector('#municipal-demand-form');const title=f.querySelector('input[placeholder^="Ex.:"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(title,'Iluminação da praça');title.dispatchEvent(new Event('input',{bubbles:true}));const select=[...f.querySelectorAll('label')].find(el=>el.textContent.startsWith('Categoria')).querySelector('select');select.value='iluminacao';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
        await pause(50);
        await evaluate(`(()=>{const select=[...document.querySelectorAll('#municipal-demand-form label')].find(el=>el.textContent.startsWith('Subcategoria'))?.querySelector('select');if(select){select.value=select.options[1].value;select.dispatchEvent(new Event('change',{bubbles:true}));}if(${item.name === 'editar-ordem'})[...document.querySelectorAll('[role=dialog] button')].find(button=>button.textContent.trim()==='Local').click();else document.querySelector('button[form="municipal-demand-form"][type=submit]').click();})()`);
        await wait('document.querySelector("[data-testid=municipal-location-map] .leaflet-container")');
        await wait('window.auditLocationMap?.getZoom()>=13');
        assert.equal(await evaluate('window.auditLocationMap.getZoom()'),15,'A abertura deve mostrar a cidade, inclusive com coordenadas já preenchidas');
        assert.ok(await evaluate('!document.body.innerText.includes("Selecione um poste cadastrado no mapa ou na busca")'),'Subtítulo removido reapareceu');
        if(item.name==='editar-ordem') assert.equal(await evaluate('document.querySelector("input[placeholder=\\"Ex.: -8.599342\\"]").value'),'-8.6','Centralizar não deve alterar a coordenada salva');
        assert.ok(await evaluate('(()=>{const frame=document.querySelector("[data-testid=municipal-location-map]").getBoundingClientRect(),map=document.querySelector("[data-testid=municipal-location-map] .leaflet-container").getBoundingClientRect(),sat=document.querySelector("[data-testid=municipal-location-map] button[aria-pressed]").getBoundingClientRect();return Math.abs(map.height-frame.height)<4&&sat.bottom<=frame.bottom&&sat.top>=frame.top})()'),'Mapa ou controles escapam do quadro: '+JSON.stringify(await evaluate('(()=>{const f=document.querySelector("[data-testid=municipal-location-map]"),m=f.querySelector(".leaflet-container"),s=f.querySelector("button[aria-pressed]");return {frame:f.getBoundingClientRect().toJSON(),map:m.getBoundingClientRect().toJSON(),sat:s.getBoundingClientRect().toJSON()}})()')));
        assert.ok(await evaluate('window.auditLocationMap.getCenter().distanceTo([-8.597031,-38.574217])<1500'),'Mapa abriu fora da prefeitura ativa');
        assert.equal(await evaluate('document.querySelectorAll(".pole-marker").length'),0,'Postes aparecem antes de escolher uma área');
        await evaluate('void window.auditLocationMap.setView([-8.597031,-38.574217],17,{animate:false})');
        await wait('document.querySelectorAll(".pole-marker").length===2');
        assert.ok(await evaluate('[...document.querySelectorAll(".pole-marker")].every(marker=>marker.title!=="102")'),'Poste fora da área visível');
        await evaluate('void window.auditLocationMap.setView([-8.5,-38.5],17,{animate:false})');
        await wait('document.querySelectorAll(".pole-marker").length===1&&document.querySelector(".pole-marker").title==="102"');
        await evaluate('void window.auditLocationMap.setZoom(15,{animate:false})');
        await wait('!document.querySelector(".pole-marker")');
        assert.ok(await evaluate('(()=>{const search=document.querySelector(".municipal-location-search").getBoundingClientRect(),map=document.querySelector("[data-testid=municipal-location-map]").getBoundingClientRect();return search.bottom<=map.top&&map.height>=280})()'),'Busca ocupa o mapa');
        await evaluate('(()=>{const input=document.querySelector("input[aria-label=\\"Buscar poste cadastrado\\"]");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input,"101");input.dispatchEvent(new Event("input",{bubbles:true}));})()');
        await wait('document.querySelector("[aria-label=\\"Resultados da busca de postes\\"] button")');
        assert.ok(await evaluate('(()=>{const results=document.querySelector("[aria-label=\\"Resultados da busca de postes\\"]").getBoundingClientRect(),map=document.querySelector("[data-testid=municipal-location-map]").getBoundingClientRect();return results.bottom<=map.top})()'),'Resultados cobrem o mapa');
        await evaluate('document.querySelector("[aria-label=\\"Resultados da busca de postes\\"] button").click()');
        await wait('!document.querySelector("[aria-label=\\"Resultados da busca de postes\\"]")');
        await wait('window.auditLocationMap.getZoom()>=17&&!!document.querySelector(".pole-marker[title=\\"101\\"]")');
        assert.ok(await evaluate('(()=>{const f=document.querySelector("[data-testid=municipal-location-map]").getBoundingClientRect(),z=document.querySelector("[data-testid=municipal-location-map] .leaflet-control-zoom").getBoundingClientRect();return z.top>=f.top&&z.bottom<=f.bottom})()'),'Zoom fora do mapa');
        const mapShot=await send('Page.captureScreenshot',{format:'png'},sessionId);await fs.writeFile(path.join(out,`location-map-${item.name}-${width}-${theme}.png`),Buffer.from(mapShot.data,'base64'));
        assert.ok(await evaluate('document.querySelector("input[placeholder=\\"Rua, número ou ponto de referência\\"]").value==="Rua da matriz"'));
      }
      const bounds=await evaluate(`(()=>{const d=document.querySelector('[role=dialog].task-dialog'),r=d.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,scroll:d.scrollWidth,height:r.height}})()`);
      assert.ok(bounds.top>=-1&&bounds.bottom<=901&&bounds.left>=-1&&bounds.right<=width+1&&bounds.scroll<=bounds.width+1,item.name+JSON.stringify(bounds));
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),item.name+' page overflow');
      if(width>=1440) assert.ok(Math.abs((bounds.left+bounds.right)/2-width/2)<2,item.name+' fora do centro');
      if(width===390) assert.ok(bounds.height>=899,item.name+' não ocupa a tela mobile');
      await evaluate(`(()=>{const d=document.querySelector('[role=dialog].task-dialog');for(const node of d.querySelectorAll('*')){if(['auto','scroll'].includes(getComputedStyle(node).overflowY)&&node.scrollHeight>node.clientHeight)node.scrollTop=node.scrollHeight}})()`);
      const buttons=await evaluate(`(()=>{const d=document.querySelector('[role=dialog].task-dialog');return [...d.querySelectorAll('footer button,footer [role=button]')].filter(el=>el.getBoundingClientRect().height).map(el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom}})})()`);
      assert.ok(buttons.every(r=>r.top>=0&&r.bottom<=901),item.name+' ações fora da tela');
      const shot=await send('Page.captureScreenshot',{format:'png'},sessionId);await fs.writeFile(path.join(out,`form-${item.name}-${width}-${theme}.png`),Buffer.from(shot.data,'base64'));
      if(width===390&&theme==='light') {
        await evaluate('document.documentElement.style.fontSize="200%"');
        assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),item.name+' fonte200');
      }
      await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9},sessionId);
      await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9},sessionId);
      assert.ok(await evaluate('Boolean(document.activeElement.closest("[role=dialog]"))'),item.name+' foco fora do modal');
      await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);
      await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);
      await wait('!document.querySelector("[role=dialog].task-dialog")');
      results.push({form:item.name,width,theme,realDialog:true,inViewport:true});
    }
  } else

  if (process.argv.includes('--compact-tops')) {
    const shot = async name => { const capture=await send('Page.captureScreenshot',{format:'png'},sessionId);await fs.writeFile(path.join(out,name+'.png'),Buffer.from(capture.data,'base64')); };
    for(const width of [360,390,430,1440,1920]) for(const theme of ['light','dark']) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false},sessionId);
      for(const route of ['iluminacao','iluminacao/estatisticas','equipe','secretarias','configuracoes']) {
        await visit('admin','/prefeitura/'+route+'?cidade=64');
        await wait('document.querySelector("main h1") && !document.body.innerText.includes("Carregando equipe")');
        await evaluate(`document.documentElement.classList.toggle('dark',${theme==='dark'})`);
        await pause(150);
        assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),route+' overflow');
        if(route==='iluminacao') {
          await wait('document.querySelector(".municipal-lighting-map .leaflet-container") && document.querySelector(".municipal-lighting-summary summary").textContent.includes("3 postes")');
          assert.equal(await evaluate('document.querySelector(".municipal-lighting-summary").open'),width>=640);
          if(width<640) {
            const top=await evaluate('document.querySelector(".municipal-lighting-map").getBoundingClientRect().top');
            assert.ok(top<420,'Mapa abaixo da primeira tela: '+top);
            await evaluate('document.querySelector(".municipal-lighting-summary summary").click()');
            await wait('document.querySelector(".municipal-lighting-summary").open');
            assert.ok(await evaluate('document.querySelector("section[aria-label=\\"Indicadores de iluminação da cidade\\"]").getBoundingClientRect().height>0'));
            await evaluate('document.querySelector(".municipal-lighting-summary summary").click()');
            await wait('!document.querySelector(".municipal-lighting-summary").open');
          }
          await shot(`compact-lighting-${width}-${theme}`);
          assert.ok(await evaluate('(()=>{const search=document.querySelector("button[aria-label=\\"Abrir busca e filtros\\"]").getBoundingClientRect();const zoom=document.querySelector(".municipal-lighting-map .leaflet-control-zoom").getBoundingClientRect();return zoom.top>=search.bottom+4})()'),'Zoom sobre a busca');
          await evaluate('document.querySelector("button[aria-label=\\"Mais ações da iluminação\\"]").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}))');
          await wait('document.querySelector("[role=menu]")');
          assert.ok(await evaluate('document.querySelector("[role=menu]").textContent.includes("Pendências")&&document.querySelector("[role=menu]").textContent.includes("Alterar lâmpadas em massa")'));
          await evaluate('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');
          await wait('!document.querySelector("[role=menu]")');
          await evaluate('document.querySelector("button[aria-label=\\"Abrir busca e filtros\\"]").click()');
          await wait('document.activeElement?.id==="lighting-search"');
          await evaluate('document.querySelector("button[aria-label=\\"Fechar busca e filtros\\"]").click()');
          await wait('document.querySelector("aside[aria-label=\\"Ferramentas do mapa de iluminação\\"]").getBoundingClientRect().height===0');
        } else if(route==='iluminacao/estatisticas') {
          await wait('document.querySelector(".municipal-stats-metrics article")');
          assert.equal(await evaluate('document.querySelector(".municipal-service-times").open'),width>=640);
          await shot(`compact-stats-${width}-${theme}`);
        } else if(['equipe','secretarias'].includes(route)) {
          await wait('document.querySelector(".municipal-table-filters")');
          assert.equal(await evaluate('document.querySelector(".municipal-table-filters").open'),width>=640);
          if(width<640) {
            await evaluate('document.querySelector(".municipal-table-filters summary").click()');
            await wait('document.querySelector(".municipal-table-filters").open');
            assert.ok(await evaluate('[...document.querySelectorAll(".municipal-table-filters select")].every(el=>el.getBoundingClientRect().height>=48)'));
            await evaluate('document.querySelector(".municipal-table-filters summary").click()');
          }
          await shot(`compact-${route}-${width}-${theme}`);
          if(route==='equipe') {
            await evaluate('document.querySelector("button[aria-label=\\"Mais ações da equipe\\"]").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}))');
            await wait('document.querySelector("[role=menu]")');
            assert.ok(await evaluate('document.querySelector("[role=menu]").textContent.includes("Vincular conta existente")'));
            await evaluate('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');
          }
        } else {
          await evaluate('[...document.querySelectorAll("main button")].find(b=>b.textContent==="Editar regras").click()');
          await wait('document.querySelector(".task-dialog")');
          assert.equal(await evaluate('document.querySelector(".municipal-help-disclosure").open'),width>=640);
          await shot(`compact-settings-${width}-${theme}`);
        }
        if(width===390) {
          await evaluate('document.documentElement.style.fontSize="200%"');
          assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),route+' fonte200 overflow');
          await shot(`compact-${route.replaceAll('/','-')}-font200-${theme}`);
        }
        results.push({width,theme,route,noOverflow:true,compactTop:true});
      }
    }
    // Reflow keeps the same content mounted and restores the compact mobile state.
    await visit('admin','/prefeitura/iluminacao?cidade=64');
    await wait('document.querySelector(".municipal-lighting-summary")');
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:false},sessionId);
    await wait('!document.querySelector(".municipal-lighting-summary").open');
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false},sessionId);
    await wait('document.querySelector(".municipal-lighting-summary").open');
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:false},sessionId);
    await wait('!document.querySelector(".municipal-lighting-summary").open');
  } else

  if (process.argv.includes('--journeys')) {
    const setSelect = async (label, value) => evaluate(`(()=>{const el=document.querySelector(${JSON.stringify('select[aria-label="' + label + '"]')});if(!el)throw Error('Missing select');el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    const openFilters = async () => { await evaluate(`[...document.querySelectorAll('main button')].find(b=>b.textContent.startsWith('Filtros')).click()`); await wait('document.querySelector(".municipal-filter-sheet")'); };
    const shot = async name => { const capture=await send('Page.captureScreenshot',{format:'png'},sessionId);await fs.writeFile(path.join(out,name+'.png'),Buffer.from(capture.data,'base64')); };
    for (const width of [360,390,430,1440,1920]) for (const theme of ['light','dark']) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false},sessionId);
      for (const route of ['broncas','demandas']) {
        await visit('admin', '/prefeitura/'+route+'?cidade=64');
        await wait('document.querySelector(".municipal-page-header") && !document.querySelector("main [role=status] .animate-spin")');
        await evaluate(`document.documentElement.classList.toggle('dark',${theme === 'dark'})`);
        await pause(150);
        assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),route+': overflow');
        const bounds=await evaluate(`(()=>{const main=document.querySelector('main');const page=main.firstElementChild;const header=main.querySelector('.municipal-page-header');return {left:parseFloat(getComputedStyle(page).paddingLeft),right:parseFloat(getComputedStyle(page).paddingRight),actions:[...header.querySelectorAll('button,a')].filter(el=>el.getBoundingClientRect().height).map(el=>el.getBoundingClientRect().height)};})()`);
        assert.ok(bounds.left<=64&&bounds.right<=64,JSON.stringify(bounds));
        assert.ok(bounds.actions.every(h=>h>=48),JSON.stringify(bounds));
        if(route==='broncas') {
          await wait('document.querySelector("button[aria-label^=\\"Abrir solicitação\\"]") || document.querySelector("table tbody tr")');
          if(width<640) {
            assert.ok(await evaluate(`document.querySelector('button[aria-label^="Abrir solicitação"]')?.getBoundingClientRect().top < 650 || [...document.querySelectorAll('main article button')].some(b=>b.getBoundingClientRect().top<650)`),'Lista fora da primeira tela');
          }
          await shot(`solicitacoes-${width}-${theme}`);
          await setSelect('Visibilidade das solicitações','internal');
          await wait('window.previewRoute.includes("visibilidade=internas")');
          await setSelect('Visibilidade das solicitações','public');
          await openFilters();
          await setSelect('Categoria das solicitações','poda');
          await wait('window.previewRoute.includes("categoria=poda")');
          await evaluate('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');
          await wait('!document.querySelector(".municipal-filter-sheet")');
          await evaluate('document.querySelector("button[aria-label=\\"Mais ações das solicitações\\"]").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}))');
          await wait('document.querySelector("[role=menu]")');
          assert.ok(await evaluate('document.querySelector("[role=menu]").textContent.includes("Gerar ordem de serviço")'));
          await evaluate('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');
          assert.ok(await evaluate('(()=>{const url=new URL(document.querySelector(".municipal-page-actions a").getAttribute("href"),location.origin);return url.searchParams.get("cidade")==="64"&&url.searchParams.get("categoria")==="poda"})()'));
        } else {
          assert.ok(await evaluate('!document.querySelector(".municipal-order-summary").open'));
          await shot(`ordens-${width}-${theme}`);
          await evaluate('document.querySelector(".municipal-order-summary summary").click()');
          assert.ok(await evaluate('document.querySelector(".municipal-order-summary").open'));
          if(width<640) {
            await setSelect('Situação das ordens de serviço','concluida');
            await wait('window.previewRoute.includes("status=concluida")');
          }
        }
        if(width===390) {
          await evaluate('document.documentElement.style.fontSize="200%"');
          assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),route+': fonte200');
          await shot(`${route}-fonte200-${theme}`);
        }
        results.push({width,theme,route,noOverflow:true});
      }
    }
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:false},sessionId);
    for (const mode of ['admin','agriculture','attendant','reader']) {
      await visit(mode,'/prefeitura/visao-geral?cidade=64&secretaria=agri');
      await wait('document.querySelector("main .journey-action")');
      const title=await evaluate('document.querySelector("main h1").textContent');
      assert.equal(title,{admin:'Painel da prefeitura',agriculture:'Gestão da secretaria',attendant:'Painel de atendimento',reader:'Consulta da secretaria'}[mode]);
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
      await shot(`painel-${mode}-390`);
      await visit(mode,'/prefeitura/broncas?cidade=64&secretaria=agri');
      await wait('document.querySelector(".municipal-page-header")');
      assert.equal(await evaluate('[...document.querySelectorAll("main button")].some(b=>b.textContent.includes("Nova solicitação"))'),mode!=='reader');
      results.push({mode,rolePresentation:true});
    }
    await visit('admin','/prefeitura/broncas?cidade=64');
    await wait('document.querySelector("main article")');
    await evaluate('window.failOverview=true;document.querySelector(".municipal-request-phases button:nth-child(2)").click()');
    await wait('document.querySelector("main [role=alert]")');
    await evaluate('window.failOverview=false;[...document.querySelectorAll("main [role=alert] button")].find(b=>b.textContent.includes("Tentar novamente")).click()');
    await wait('!document.querySelector("main [role=alert]")');
    results.push({errorRetry:true});
  } else {

  for(const width of (process.argv.includes('--mobile-navigation') ? [360,390,430,1440,1920] : [390,1440,1920])){
    await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false},sessionId);
    if (process.argv.includes('--mobile-navigation')) {
      for (const mode of ['admin','attendant','inventory']) {
        await visit(mode, '/prefeitura/visao-geral?cidade=64&secretaria=agri');
        await wait('document.querySelector(".municipality-shell")');
        await wait('!document.body.innerText.includes("Algo deu errado") && document.querySelector("main h1")');
        const mobile = width < 1024;
        assert.equal(await evaluate('document.querySelectorAll(".municipality-header").length'), 1);
        assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'), mode + ': rolagem horizontal');
        assert.equal(await evaluate('getComputedStyle(document.querySelector("nav[aria-label=\\"Atalhos da prefeitura\\"]")).display!=="none"'), mobile);
        if (mode!=='inventory') {
          await wait('document.querySelector("[data-journey-disclosure]")');
          assert.ok(await evaluate('!document.querySelector("[data-journey-disclosure]").open'),'Estatísticas não devem ocupar a primeira visualização');
          const overviewShot=await send('Page.captureScreenshot',{format:'png'},sessionId);
          await fs.writeFile(path.join(out,`journey-overview-${mode}-${width}.png`),Buffer.from(overviewShot.data,'base64'));
          assert.ok(await evaluate('document.querySelector("main .journey-action").getBoundingClientRect().top<innerHeight'),'Ações de trabalho ficaram escondidas');
          await evaluate('document.querySelector("[data-journey-disclosure] summary").click()');
          assert.ok(await evaluate('document.querySelector("[data-journey-disclosure]").open'));
          assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Detalhes estatísticos com overflow');
          await evaluate('document.querySelector("[data-journey-disclosure] summary").click()');
        }
        if (mobile) {
          const links = await evaluate(`[...document.querySelectorAll('nav[aria-label="Atalhos da prefeitura"] a')].map(a=>({label:a.textContent.trim(),href:a.getAttribute('href'),height:a.getBoundingClientRect().height}))`);
          assert.ok(links.length>0 && links.length<=3);
          assert.ok(links.every(link=>link.height>=48 && new URL(link.href,'http://localhost').searchParams.get('cidade')==='64'));
          if (mode==='inventory') assert.ok(links.every(link=>link.href.startsWith('/prefeitura/gestao-territorial')||link.href.startsWith('/prefeitura/adote-uma-arvore')),'Inventário recebeu atendimento');
          else assert.deepEqual(links.map(link=>link.label), ['Resumo','Solicitações','Ordens']);
          await evaluate('document.querySelector("button[aria-label=\\"Mais opções da prefeitura\\"]").click()');
          await wait('document.querySelector(".municipality-mobile-menu")');
          assert.ok(await evaluate('document.querySelector(".municipality-mobile-menu").contains(document.activeElement)'),'Menu não recebeu foco');
          await evaluate('window.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape"}))');
          await wait('!document.querySelector(".municipality-mobile-menu")');
          assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'),'Mais opções da prefeitura');
          assert.ok(await evaluate('(()=>{const main=document.querySelector("main").getBoundingClientRect();const nav=document.querySelector("nav[aria-label=\\"Atalhos da prefeitura\\"]").getBoundingClientRect();return main.bottom<=nav.top+1&&nav.bottom<=innerHeight})()'),'Atalhos cobrem o conteúdo');
          if (mode!=='inventory') {
            await evaluate('document.querySelector("nav[aria-label=\\"Atalhos da prefeitura\\"] a[aria-label=\\"Solicitações da cidade\\"]").click()');
            await wait('window.previewRoute.startsWith("/prefeitura/broncas?")');
            const scoped = new URL(await evaluate('window.previewRoute'),'http://localhost');
            assert.equal(scoped.searchParams.get('cidade'),'64');
            assert.equal(scoped.searchParams.get('secretaria'),mode==='admin'?null:'agri');
          }
        }
        const shot=await send('Page.captureScreenshot',{format:'png'},sessionId);
        await fs.writeFile(path.join(out,`mobile-navigation-${mode}-${width}.png`),Buffer.from(shot.data,'base64'));
        results.push({width,mode,mobileNavigation:mobile,permissions:true,contextPreserved:true,noOverflow:true});
      }
      for (const mode of ['tree-executor','road-executor','general-executor']) {
        await visit(mode,'/prefeitura/visao-geral');
        await wait('document.querySelector("[data-testid=executor-panel]")');
        assert.equal(await evaluate('[...document.querySelectorAll("header")].filter(el=>!el.closest("main")).length'),1);
        assert.equal(await evaluate('document.querySelector("nav[aria-label=\\"Atalhos da prefeitura\\"]")'),null,'Executor recebeu navegação do gestor');
        assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Cabeçalho de execução com overflow');
        assert.ok(await evaluate('document.querySelector("select[aria-label=\\"Etapa das minhas ordens\\"]").getBoundingClientRect().height>=48'));
        const fieldShot=await send('Page.captureScreenshot',{format:'png'},sessionId);
        await fs.writeFile(path.join(out,`field-${mode}-${width}.png`),Buffer.from(fieldShot.data,'base64'));
        await evaluate('(()=>{const el=document.querySelector("select[aria-label=\\"Etapa das minhas ordens\\"]");el.value="conferencia";el.dispatchEvent(new Event("change",{bubbles:true}));})()');
        await wait('window.rpcCalls.some(c=>c.name==="listar_painel_executor"&&c.params.p_etapa==="conferencia")');
        results.push({width,mode,ownWorkspace:true,noOverflow:true});
      }
      continue;
    }
    if(process.argv.includes('--temporary-access')){
      await visit('admin','/prefeitura/equipe');await wait('document.body.innerText.includes("Equipe e acessos")');
      await evaluate(`[...document.querySelectorAll('button')].find(el=>el.textContent.includes('Criar acesso')).click()`);
      await wait('document.querySelector("#team-email")');
      await evaluate(`(()=>{const select=document.querySelector('#invite-channel');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'agri');select.dispatchEvent(new Event('change',{bubbles:true}));const email=document.querySelector('#team-email');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(email,'executor@municipio.gov.br');email.dispatchEvent(new Event('input',{bubbles:true}));[...document.querySelectorAll('[role=dialog] label')].find(el=>el.textContent.includes('Executor de campo')).querySelector('input').click();window.inviteFailure=true;})()`);
      await evaluate('document.querySelector("[role=dialog] form").requestSubmit()');
      await wait('document.querySelector("[role=dialog] [role=alert]")');
      await evaluate('window.inviteFailure=false;document.querySelector("[role=dialog] form").requestSubmit()');
      await wait('document.body.innerText.includes("Acesso criado")');
      assert.deepEqual(await evaluate('window.rpcCalls.filter(row=>row.name==="create-municipal-account").at(-1).params.roles'),['executor']);
      assert.ok(await evaluate('document.querySelector("[role=dialog]").textContent.includes("24 horas")'));
      assert.ok(await evaluate('document.querySelector("[role=dialog]").textContent.includes("Senha-temporaria-teste-123!")'));
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Credenciais causaram rolagem horizontal');
      const shot=await send('Page.captureScreenshot',{format:'png'},sessionId);await fs.writeFile(path.join(out,`temporary-access-${width}.png`),Buffer.from(shot.data,'base64'));
      results.push({width,temporaryPassword:true,failedSavePreserved:true,roles:true,noOverflow:true});
      continue;
    }
    await visit('inventory','/prefeitura/visao-geral');
    await wait('document.querySelector("[data-testid=inventory-content]")');
    assert.equal(await evaluate('window.overviewQueries.length'),0,'Inventário consultou solicitações antes de abrir o mapa');
    if(width<1024)await evaluate('document.querySelector("button[aria-label=\\"Abrir menu\\"]").click()');
    assert.equal(await evaluate('[...document.querySelectorAll("nav a")].some(a=>/Solicitações|Ordens de serviço|Iluminação pública/.test(a.textContent))'),false,'Login do inventário exibiu menus de atendimento');
    for (const page of ['/prefeitura/broncas','/prefeitura/demandas','/prefeitura/iluminacao','/prefeitura/equipe']) {
      await visit('inventory',page+'?cidade=64&secretaria=agri');
      await wait('document.querySelector("[data-testid=inventory-content]")');
      assert.equal(await evaluate('document.body.innerText.includes("Sem acesso a esta atividade")'),false,'Rota sem acesso não redirecionou para o inventário');
      assert.equal(await evaluate('window.overviewQueries.length'),0,'Rota sem acesso consultou atendimento antes de redirecionar');
      assert.equal(await evaluate('window.previewRoute'),'/prefeitura/gestao-territorial/arborizacao?cidade=64&secretaria=agri','Redirecionamento perdeu cidade ou secretaria');
    }
    for(const mode of ['agriculture','inventory','reader']){
      await visit(mode,'/prefeitura/gestao-territorial/arborizacao?cidade=64');await wait('document.querySelector("[data-testid=inventory-content]")');
      assert.equal(await evaluate('document.querySelectorAll("header").length'),1,'Cabeçalho duplicado');
      if(width<1024)await evaluate('document.querySelector("button[aria-label=\\"Abrir menu\\"]").click()');
      assert.equal(await evaluate('[...document.querySelectorAll("a")].some(a=>a.textContent.includes("Iluminação pública"))'),false,'Agricultura recebeu iluminação');
      if(mode==='inventory')assert.equal(await evaluate('[...document.querySelectorAll("a")].some(a=>a.textContent.includes("Solicitações"))'),false,'Inventário recebeu atendimento');
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Rolagem horizontal');
      const shot=await send('Page.captureScreenshot',{format:'png'},sessionId);await fs.writeFile(path.join(out,`${mode}-${width}.png`),Buffer.from(shot.data,'base64'));
      if(width>=1200)assert.ok(await evaluate('(()=>{const main=document.querySelector("main").getBoundingClientRect(),panel=document.querySelector("[data-testid=territorial-panel]").getBoundingClientRect();return panel.width>main.width-130})()'),'Inventário não aproveitou a largura');
    }
    for(const [mode,activity] of [['tree-executor','arborizacao'],['road-executor','ruas'],['general-executor','servicos_gerais']]) {
      await visit(mode,'/prefeitura/visao-geral');await wait('document.querySelector("[data-testid=executor-panel]")');
      assert.equal(await evaluate('document.body.innerText.includes("Acesso municipal indisponível")'),false);
      assert.equal(await evaluate('document.querySelectorAll("header").length'),1);
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Executor com rolagem horizontal');
      if(width>=1200)assert.ok(await evaluate('(()=>{const box=document.querySelector("[data-testid=executor-panel]").getBoundingClientRect();return box.left<=64&&innerWidth-box.right<=64})()'),'Margens externas excessivas');
      await evaluate(`[...document.querySelectorAll('a')].find(el=>el.textContent.trim()==='Mapa').click()`);
      await wait('document.querySelector(".municipal-lighting-map .leaflet-container")');
      await wait(`window.rpcCalls.some(c=>c.name==='listar_painel_executor'&&c.params.p_aba==='minhas'&&c.params.p_etapa==='todas')&&window.rpcCalls.some(c=>c.name==='listar_painel_executor'&&c.params.p_aba==='disponiveis')`);
      assert.equal(await evaluate(`[...document.querySelectorAll('[role=group]')].some(el=>el.getAttribute('aria-label')==='Filtrar serviços por situação')`),false,'Abas de situação ainda aparecem no mapa');
      await wait(`document.querySelector('.executor-service-marker[fill="#dc2626"],.executor-tree-marker[fill="#dc2626"]')&&document.querySelector('.executor-service-marker[fill="#eab308"],.executor-tree-marker[fill="#eab308"]')`);
      if(activity==='arborizacao') {
        await wait(`document.querySelector('.executor-tree-marker[fill="#16a34a"]')`);
        await evaluate(`document.querySelector('.executor-tree-marker[fill="#16a34a"]').dispatchEvent(new MouseEvent('click',{bubbles:true}))`);
        await wait('document.querySelector("[data-testid=tree-details-dialog]")');
        assert.ok(await evaluate(`(()=>{const dialog=document.querySelector('[data-testid=tree-details-dialog]');return dialog.textContent.includes('AR-003')&&dialog.textContent.includes('Tabebuia aurea')&&dialog.textContent.includes('Praça da matriz')&&!dialog.textContent.includes('Editar árvore');})()`),'Árvore sem serviço não exibe identificação e localização em consulta');
        const treeShot=await send('Page.captureScreenshot',{format:'png'},sessionId);await fs.writeFile(path.join(out,'executor-tree-details-'+width+'.png'),Buffer.from(treeShot.data,'base64'));
        await evaluate(`[...document.querySelectorAll('[data-testid=tree-details-dialog] button')].find(el=>el.textContent==='Close').click()`);
        await wait('!document.querySelector("[data-testid=tree-details-dialog]")');
        await evaluate(`document.querySelector('.executor-tree-marker[fill="#eab308"]').dispatchEvent(new MouseEvent('click',{bubbles:true}))`);
        await wait('document.querySelector("[data-testid=tree-details-dialog]")?.textContent.includes("Disponível para aceitar")');
        assert.ok(await evaluate(`[...document.querySelectorAll('[data-testid=tree-details-dialog] button')].some(el=>el.textContent==='Abrir serviço')`),'Árvore não oferece o serviço vinculado');
        await evaluate(`[...document.querySelectorAll('[data-testid=tree-details-dialog] button')].find(el=>el.textContent==='Close').click()`);
        await wait('!document.querySelector("[data-testid=tree-details-dialog]")');
      }
      assert.ok(await evaluate('[...document.querySelectorAll("button")].some(el=>el.getAttribute("aria-label")==="Mostrar mapa de satélite")'),'Controle de satélite diferente do eletricista');
      assert.ok(await evaluate('[...document.querySelectorAll("button")].some(el=>el.getAttribute("aria-label")==="Minha localização atual")'),'Controle de localização ausente');
      assert.ok(await evaluate('document.querySelector("[data-testid=executor-panel]").getBoundingClientRect().height>=document.querySelector("main").clientHeight-1'),'Mapa não ocupa a área inteira');
      assert.equal(await evaluate('[...document.querySelectorAll("a")].some(a=>a.textContent.trim()==="Secretaria"||a.textContent.trim()==="Ruas e árvores")'),false,'Executor exclusivo recebeu navegação de inventário/gestão');
      await wait('(()=>{const circle=document.querySelector(".leaflet-overlay-pane path");const map=document.querySelector(".leaflet-container");if(!circle||!map)return false;const p=circle.getBoundingClientRect(),m=map.getBoundingClientRect();return Math.abs((p.x+p.width/2)-(m.x+m.width/2))<20})()');
      const mapShot=await send('Page.captureScreenshot',{format:'png'},sessionId);await fs.writeFile(path.join(out,activity+'-map-'+width+'.png'),Buffer.from(mapShot.data,'base64'));
      await evaluate(`[...document.querySelectorAll('a')].find(el=>el.getAttribute('aria-label')==='Serviços disponíveis').click()`);
      await wait('window.rpcCalls.some(c=>c.name==="listar_painel_executor"&&c.params.p_aba==="disponiveis")');
      assert.equal(await evaluate('window.rpcCalls.filter(c=>c.name==="listar_painel_executor").at(-1).params.p_especialidade'),activity);
      await evaluate('[...document.querySelectorAll("button")].find(button=>button.textContent.includes("Serviço de campo da praça")).click()');
      await wait('document.querySelector("[role=dialog]")');
      await evaluate('[...document.querySelectorAll("button")].find(button=>button.textContent.includes("Aceitar serviço")).click()');
      await wait('document.querySelector("[data-testid=executor-order]")&&document.body.innerText.includes("Registrar atendimento")&&[...document.querySelectorAll("select")].some(el=>el.getAttribute("aria-label")==="Solicitação a atender"&&el.value==="work-report")');
      await wait('document.querySelector(".leaflet-container")');
      const shot=await send('Page.captureScreenshot',{format:'png'},sessionId);await fs.writeFile(path.join(out,activity+'-'+width+'.png'),Buffer.from(shot.data,'base64'));
      assert.ok(await evaluate('document.querySelectorAll(".leaflet-overlay-pane path").length>=1'),'Mapa sem serviços');
      await evaluate('document.querySelector("input[type=checkbox]").click()');

      await evaluate('[...document.querySelectorAll("button")].find(button=>button.textContent.trim()==="Registrar execução").click()');
      await wait('document.body.innerText.includes("Serviço concluído.")');
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Ordem com rolagem horizontal');
      await evaluate(`[...document.querySelectorAll('a')].find(el=>el.getAttribute('aria-label')==='Minhas estatísticas').click()`);
      await wait('document.body.innerText.includes("Tipos de serviço")');
      assert.equal(await evaluate('document.querySelector("h1").textContent'), 'Estatísticas');
      const statsShot=await send('Page.captureScreenshot',{format:'png'},sessionId);await fs.writeFile(path.join(out,activity+'-stats-'+width+'.png'),Buffer.from(statsShot.data,'base64'));
      results.push({width,activity,acceptAndComplete:true,realMap:true,noOverflow:true});
    }
    await visit('attendant','/prefeitura/visao-geral?cidade=64&secretaria=agri');
    await wait('document.querySelector("[data-testid=department-overview]")&&document.body.innerText.includes("2 solicitações no escopo")');
    assert.equal(await evaluate('document.querySelector("h1").textContent'),'Visão geral');
    if(width<1024)await evaluate(`[...document.querySelectorAll('button')].find(el=>el.getAttribute('aria-label')==='Abrir menu').click()`);
    assert.equal(await evaluate('[...document.querySelectorAll("nav a")].find(a=>a.textContent.trim())?.textContent.trim()'),'Visão geral','Visão geral não é o primeiro item');
    assert.ok(await evaluate('window.overviewQueries.every(query=>query.some(([key,ids])=>key==="category_id"&&ids.length===1&&ids[0]==="poda"))'),'Consulta usou categorias de outra secretaria');
    if(width<1024)await evaluate(`[...document.querySelectorAll('button')].find(el=>el.getAttribute('aria-label')==='Fechar menu').click()`);
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Visão geral com rolagem horizontal');
    if(width>=1200)assert.ok(await evaluate('(()=>{const main=document.querySelector("main").getBoundingClientRect(),panel=document.querySelector("[data-testid=department-overview]").getBoundingClientRect();return panel.width>=main.width-128})()'),'Visão geral com largura estreita');
    assert.ok(await evaluate(`(()=>{const link=[...document.querySelectorAll('[data-testid=department-overview] a')].find(a=>a.textContent.includes('Nova ordem de serviço'));if(!link)return false;const url=new URL(link.href);return url.pathname==='/prefeitura/demandas/nova'&&url.searchParams.get('secretaria')==='agri'&&url.searchParams.get('cidade')==='64';})()`),'Nova ordem perdeu o contexto da secretaria');
    if(width>=1200)assert.ok(await evaluate(`(()=>{const panels=[...document.querySelector('[data-testid=overview-detail-grid]').children].map(el=>el.getBoundingClientRect());return Math.abs(panels[0].top-panels[1].top)<1&&panels[1].left>=panels[0].right&&Math.abs(panels[0].height-panels[1].height)<1;})()`),'Categorias e movimento devem ficar lado a lado e alinhados');
    const overviewShot=await send('Page.captureScreenshot',{format:'png'},sessionId);await fs.writeFile(path.join(out,'attendant-overview-'+width+'.png'),Buffer.from(overviewShot.data,'base64'));
    assert.ok(await evaluate('[...document.querySelectorAll("[data-testid=department-overview] a")].some(a=>{const p=new URL(a.href).searchParams;return p.get("visibilidade")==="internas"&&p.get("fase")==="in_progress"&&p.get("secretaria")==="agri"&&p.get("cidade")==="64"})'),'Indicador perdeu os filtros da fila');
    await evaluate(`window.failOverview=true;[...document.querySelectorAll('button')].find(el=>el.getAttribute('aria-label')==='Atualizar visão geral').click()`);
    await wait('document.querySelector("[data-testid=department-overview] [role=alert]")');
    assert.equal(await evaluate(`[...document.querySelectorAll('section')].some(el=>el.getAttribute('aria-label')==='Indicadores das solicitações')`),false,'Falha de consulta virou indicadores zerados');
    await visit('reader','/prefeitura/visao-geral?cidade=64&secretaria=agri');
    await wait('document.querySelector("[data-testid=overview-week]")');
    assert.equal(await evaluate(`[...document.querySelectorAll('[data-testid=department-overview] a')].some(a=>a.textContent.includes('Nova ordem de serviço'))`),false,'Somente leitura recebeu atalho de criação');
    await evaluate(`[...document.querySelectorAll('[data-testid=department-overview] a')].find(a=>a.textContent.includes('Ver solicitações')).click()`);
    await wait('document.querySelector("h1")?.textContent==="Solicitações"');
    await visit('executor','/prefeitura/visao-geral');
    await wait('document.body.innerText.includes("Painel do eletricista")');
    assert.equal(await evaluate('document.body.innerText.includes("Acesso municipal indisponível")'),false,'Executor exclusivo perdeu o painel');
    if(width===390)await wait('document.body.innerText.includes("Serviços do eletricista")');
    await visit('wrong-session','/prefeitura/visao-geral');
    await wait('document.body.innerText.includes("A sessão consultada não corresponde")');
    assert.equal(await evaluate('document.body.innerText.includes("Nenhum vínculo municipal ativo")'),false,'Erro de sessão foi confundido com falta de vínculo');
    await visit('admin','/prefeitura/equipe');await wait('document.body.innerText.includes("Equipe municipal")');
    await evaluate('[...document.querySelectorAll("tbody tr")].find(row=>row.innerText.includes("Servidor municipal")).click()');
    await wait('document.body.innerText.includes("Cargo na secretaria")');
    assert.ok(await evaluate('document.body.innerText.includes("Executor de campo")'),'Cargo de executor oculto em Agricultura');
    assert.equal(await evaluate('document.body.innerText.includes("Gerenciar ruas")'),false,'Concessão de módulo individual continuou no funcionário');
    await visit('admin','/prefeitura/equipe');await wait('document.body.innerText.includes("Equipe e acessos")');
    await evaluate(`[...document.querySelectorAll('button')].find(el=>el.textContent.includes('Criar acesso')).click()`);
    await wait('document.querySelector("#team-email")');
    assert.equal(await evaluate('document.querySelectorAll("[role=dialog] input[type=checkbox]:checked").length'),0,'Convite começou com cargo marcado');
    await evaluate(`(()=>{const select=document.querySelector('#invite-channel');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'agri');select.dispatchEvent(new Event('change',{bubbles:true}));const email=document.querySelector('#team-email');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(email,'executor@municipio.gov.br');email.dispatchEvent(new Event('input',{bubbles:true}));[...document.querySelectorAll('[role=dialog] label')].find(el=>el.textContent.includes('Executor de campo')).querySelector('input').click();window.inviteFailure=true;})()`);
    await evaluate('document.querySelector("[role=dialog] form").requestSubmit()');
    await wait('document.querySelector("[role=dialog] [role=alert]")');
    assert.ok(await evaluate('document.querySelector("[role=dialog] [role=alert]").textContent.includes("execução de campo")'),'Erro do servidor ficou fora do formulário');
    await evaluate('window.inviteFailure=false;document.querySelector("[role=dialog] form").requestSubmit()');
    await wait('document.body.innerText.includes("Acesso criado")');
    assert.deepEqual(await evaluate('window.rpcCalls.filter(row=>row.name==="create-municipal-account").at(-1).params.roles'),['executor']);
    assert.ok(await evaluate('document.querySelector("[role=dialog]").textContent.includes("24 horas")'));
    assert.ok(await evaluate('document.querySelector("[role=dialog]").textContent.includes("Senha-temporaria-teste-123!")'));
    const credentialsShot=await send('Page.captureScreenshot',{format:'png'},sessionId);await fs.writeFile(path.join(out,`temporary-access-${width}.png`),Buffer.from(credentialsShot.data,'base64'));
    await visit('admin','/prefeitura/secretarias');await wait('document.querySelector("tbody tr")');
    await evaluate('[...document.querySelectorAll("tbody tr")].find(row=>row.innerText.includes("Agricultura")).click()');await wait('document.body.innerText.includes("Mapas e cadastros da secretaria")');
    assert.equal(await evaluate('[...document.querySelectorAll("label")].find(label=>label.textContent.includes("Postes e iluminação")).querySelector("input").disabled'),true,'Agricultura habilitou postes sem categoria de iluminação');
    const shot=await send('Page.captureScreenshot',{format:'png'},sessionId);await fs.writeFile(path.join(out,`department-${width}.png`),Buffer.from(shot.data,'base64'));
    results.push({width,oneHeader:true,agricultureWithoutLighting:true,inventoryWithoutAttendance:true,rolesInStaff:true,scopeInDepartment:true,noOverflow:true});
  }
  for (const insets of process.argv.includes('--temporary-access')?[]:[
    { name: 'portrait', width: 390, height: 844, top: 44, bottom: 34, left: 0, right: 0 },
    { name: 'landscape', width: 844, height: 390, top: 0, bottom: 21, left: 44, right: 24 },
  ]) {
    const { width, height, top, bottom, left, right, name } = insets;
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);
    await visit('inventory','/prefeitura/gestao-territorial/arborizacao?cidade=64');
    await wait('document.querySelector("[data-testid=inventory-content]")');
    await evaluate(`(() => {
      const root = document.documentElement;
      root.style.setProperty('--header-safe-top', '${top}px');
      root.style.setProperty('--safe-area-bottom', '${bottom}px');
      root.style.setProperty('--safe-area-left', '${left}px');
      root.style.setProperty('--safe-area-right', '${right}px');
      document.querySelector('[data-testid=inventory-content]').style.minHeight = '1600px';
    })()`);
    const bounds = await evaluate(`(() => {
      const shell = document.querySelector('.municipality-shell').getBoundingClientRect();
      const header = document.querySelector('.municipality-header').getBoundingClientRect();
      const bar = document.querySelector('.municipality-header > div').getBoundingClientRect();
      const main = document.querySelector('main');
      main.scrollTop = main.scrollHeight;
      const content = document.querySelector('[data-testid=inventory-content]').getBoundingClientRect();
      const viewport = main.getBoundingClientRect();
      return { shellHeight: shell.height, barTop: bar.top, barLeft: bar.left, barRight: bar.right,
        headerBottom: header.bottom, mainBottom: viewport.bottom, mainLeft: viewport.left,
        navigationTop: document.querySelector('nav[aria-label="Atalhos da prefeitura"]').getBoundingClientRect().top,
        navigationBottom: document.querySelector('nav[aria-label="Atalhos da prefeitura"]').getBoundingClientRect().bottom,
        mainRight: viewport.right, contentBottom: content.bottom, scrolled: main.scrollTop > 0,
        noOverflow: document.documentElement.scrollWidth <= innerWidth };
    })()`);
    assert.equal(bounds.shellHeight,height,'Safe area increased the viewport height');
    assert.equal(bounds.barTop,top,'Header overlaps or duplicates the top safe area');
    assert.ok(bounds.barLeft>=left && bounds.barRight<=width-right,'Header overlaps the side safe areas');
    assert.ok(bounds.mainLeft>=left && bounds.mainRight<=width-right,'Inventory overlaps the side safe areas');
    assert.equal(bounds.navigationBottom,height-bottom,'Navigation overlaps or duplicates the bottom safe area');
    assert.equal(bounds.mainBottom,bounds.navigationTop,'Navigation overlaps the inventory');
    assert.ok(bounds.scrolled && bounds.contentBottom<=bounds.mainBottom,'End of inventory is inaccessible');
    assert.ok(bounds.noOverflow,'Safe areas caused horizontal overflow');
    await evaluate('document.querySelector("button[aria-label=\\"Abrir menu\\"]").click()');
    const menu = await evaluate(`(() => {
      const panel = document.querySelector('.municipality-mobile-menu');
      const box = panel.getBoundingClientRect();
      const link = panel.querySelector('nav a').getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, linkLeft: link.left, linkRight: link.right };
    })()`);
    assert.equal(menu.top,bounds.headerBottom,'Menu is detached from the actual header height');
    assert.ok(menu.bottom<=height-bottom,'Menu overlaps the bottom safe area');
    assert.ok(menu.linkLeft>=left && menu.linkRight<=width-right,'Menu overlaps the side safe areas');
    const shot=await send('Page.captureScreenshot',{format:'png'},sessionId);
    await fs.writeFile(path.join(out,`inventory-safe-area-${name}.png`),Buffer.from(shot.data,'base64'));
    assert.ok(await evaluate(`(() => {
      const panel = document.querySelector('.municipality-mobile-menu');
      panel.querySelector('p').style.marginBottom = '1000px';
      panel.scrollTop = panel.scrollHeight;
      const lastButton = panel.querySelector('nav button').getBoundingClientRect();
      return panel.scrollTop > 0 && lastButton.bottom <= innerHeight - ${bottom};
    })()`),'Long menu hides the sign-out button under the system bar');
    results.push({width,height,safeAreas:name,headerInset:true,inventoryInset:true,menuInset:true,noOverflow:true});
  }
  }
  assert.equal(errors.length,0,JSON.stringify(errors));await fs.writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({out,results},null,2));
}finally{if(ws){try{ws.send(JSON.stringify({id:99999,method:'Browser.close'}));}catch{}ws.close();}chrome.kill();await new Promise(resolve=>server.close(resolve));}
