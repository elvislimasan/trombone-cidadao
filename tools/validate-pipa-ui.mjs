// Componentes reais e Leaflet no Chrome, com fixtures locais. Não lê .env.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import loadConfig from 'tailwindcss/loadConfig.js';

const root = process.cwd(), out = path.join(root, '.tmp/pipa-ui');
await fs.mkdir(out, { recursive: true });
const stubs = {
  '@/hooks/useMunicipalityWorkspace': `const c={id:'channel',name:'Secretaria de Agricultura',manage:!location.search.includes('reader'),request:!location.search.includes('reader')};export default ()=>({userId:'manager',municipality:{id:'hall',city_id:64,nome:'Prefeitura de Floresta',cidade:location.search.includes('raw-city')?{id:location.search.includes('other-city')?65:64,name:'Floresta',state_id:17}:{id:64,name:'Floresta',states:{uf:'PE'}}},waterChannels:[c],isAdministrator:true});`,
  '@/contexts/SupabaseAuthContext': `export const useAuth=()=>({user:{id:'driver-user',app_metadata:{pipa_driver:true}},signOut:async()=>{},resetPassword:async email=>{window.fixture.resetCalls||=[];window.fixture.resetCalls.push(email);return {error:window.fixture.resetFail?{message:'Falha ao enviar recuperação'}:null}}});`,
  '@/design-system/theme/ThemeProvider': `import {useEffect,useState} from 'react';export function useTheme(){const [resolved,setPreference]=useState(location.search.includes('dark')?'dark':'light');useEffect(()=>{document.documentElement.classList.toggle('dark',resolved==='dark')},[resolved]);return {resolved,setPreference}}`,
  '@/components/map/ThemedTileLayer': `import React,{useEffect} from 'react';import {TileLayer,useMap} from 'react-leaflet';export default function Tiles(){const map=useMap();useEffect(()=>{window.pipaMaps ||= [];window.pipaMaps.push(map);return()=>{window.pipaMaps=window.pipaMaps.filter(m=>m!==map)}},[map]);return <TileLayer url={location.origin+'/tile.svg?x={x}&y={y}&z={z}'} attribution="Mapa de teste local"/>;}`,
  '@/lib/geocodeCity': `export const geocodeCity=async(name,uf)=>{(window.cityGeocodes ||= []).push({name,uf});return uf==='PR'?{lat:-23.6,lng:-52.08}:uf==='PE'?{lat:-8.597,lng:-38.574}:null};`,
  '@/lib/customSupabaseClient': `export const supabase={functions:{async invoke(name,{body}){(window.reverseLookups ||= []).push({name,body});const result={data:window.reverseFail?null:{address:'Endereço do ponto '+body.lat.toFixed(4)+', '+body.lng.toFixed(4),city:'Floresta',state_uf:'PE'}};if(window.reverseDelay)return new Promise(resolve=>{(window.reversePending ||= []).push(()=>resolve(result))});return result}},from(table){if(table==='site_config')return {select(){return this},eq(){return this},async maybeSingle(){return {data:{site_name:'Trombone Cidad\u00e3o',logo_url:'/logo.png'}}}};if(table!=='cities')throw Error('Consulta inesperada');let city;return {select(){return this},eq(key,value){city=value;return this},async maybeSingle(){(window.cityLookups ||= []).push(city);return {data:{id:city,name:'Floresta',states:{uf:city===65?'PR':'PE'}}}}}}};`,
  '@/lib/reverseGeocodePin': `export async function reverseGeocodePin(point,{invoke}){return (await invoke('reverse-geocode',{body:point})).data}`,
  '@/lib/pipaReport': `export async function exportPipaReport(data){window.fixture.exported=data;}`,
  '@/lib/pipaApi': `
    const now=new Date(),day=now.toISOString().slice(0,10),month=day.slice(0,7)+'-01';
    const tanks=[{id:'tank-1',channel_id:'channel',system_code:'CX1',official_code:'GOV-001',name:'Caixa do Sítio Serra Negra',locality:'Serra Negra',address:'Estrada da comunidade, próximo à escola',latitude:-8.58,longitude:-38.55,capacity_liters:20000,provider:'prefeitura',responsible_name:'Responsável de teste',responsible_document:'52998224725',responsible_phone:'87999990000',responsible_address:'Sítio Serra Negra',active:true},{id:'tank-2',channel_id:'channel',system_code:'CX2',official_code:null,name:'Caixa da Lagoa Comprida',locality:'Lagoa Comprida',address:'Associação da comunidade',latitude:-8.64,longitude:-38.62,capacity_liters:16000,provider:'exercito',responsible_name:'Responsável de teste 2',responsible_document:'52998224725',responsible_phone:'87999990001',responsible_address:'Lagoa Comprida',active:true}];
    tanks[0].emptying_days=10;tanks[1].emptying_days=10;
    const drivers=[{id:'driver-1',channel_id:'channel',name:'José de teste',plate:'ABC1D23',capacity_liters:10000,provider:'prefeitura',active:true,user_id:'driver-user'},{id:'driver-2',channel_id:'channel',name:'Maria de teste',plate:'DEF5678',capacity_liters:8000,provider:'prefeitura',active:true}];
    const requests=[{id:'request-1',channel_id:'channel',tank_id:'tank-1',kind:'urgent',status:'assigned',driver_id:'driver-1',requester_name:'Morador de teste',requester_phone:'87999990002',locality:'Serra Negra',address:tanks[0].address,latitude:tanks[0].latitude,longitude:tanks[0].longitude,notes:'Caixa seca desde ontem',created_at:now.toISOString()}];
    const deliveries=[{id:'delivery-1',channel_id:'channel',tank_id:'tank-2',driver_id:'driver-1',delivered_at:now.toISOString(),loads:2,liters:20000,provider:'prefeitura',source:'manual',locality:'Lagoa Comprida',destination_name:tanks[1].name,driver_name:drivers[0].name,plate:drivers[0].plate,recorded_at:now.toISOString(),recorded_by:'manager',notes:'Sem sinal no local'}];
    const routes=[];if(location.search.includes('planned-driver')){routes.push({id:'route-city',channel_id:'channel',driver_id:'driver-1',name:'Rota da prefeitura',source:'municipality',scheduled_date:day,cancelled:false});requests.push({...requests[0],id:'route-stop-1',route_id:'route-city',route_position:1,kind:'regular'})}
    window.fixture={tanks,drivers,requests,deliveries,routes,quotas:[{driver_id:'driver-1',month,loads:20}],calls:[],fail:false};
    if(new URLSearchParams(location.search).has('empty'))tanks.length=0;
    export async function loadPipaData(){if(window.fixture.fail)throw Error('Falha de conexão de teste');return structuredClone(window.fixture)};
    export async function createPipaLogin(id,email){window.fixture.calls.push({name:'login',id,email});drivers.find(d=>d.id===id).user_id='created';return {email,temporary_password:'senha-de-teste',password_expires_at:now.toISOString()}};
    export async function pipaRpc(name,args){const f=window.fixture;f.calls.push({name,args});if(f.fail)throw Error('Falha de conexão de teste');
      if(name==='pipa_driver_login_details'){const d=drivers.find(d=>d.id===args.p_driver);if(f.loginFail)throw Error('Falha ao consultar login');return {user_id:d.user_id,name:'Nome da conta do pipeiro',email:'pipeiro-conta@example.test',phone:'87999998888'}}
      if(name==='pipa_save_tank'){const t={...args.p_data,id:args.p_data.id||'tank-new'};const i=tanks.findIndex(x=>x.id===t.id);t.system_code=i<0?'CX'+(Math.max(0,...tanks.map(x=>Number(x.system_code?.slice(2))||0))+1):tanks[i].system_code;t.official_code=t.official_code?.trim()||null;if(i<0)tanks.push(t);else tanks[i]=t;return t.id}
      if(name==='pipa_save_driver'){const d={...args.p_data,id:args.p_data.id||'driver-new'};const i=drivers.findIndex(x=>x.id===d.id);if(i<0)drivers.push(d);else drivers[i]=d;return d.id}
      if(name==='pipa_set_quota'){const i=f.quotas.findIndex(q=>q.driver_id===args.p_driver&&q.month===args.p_month);const q={driver_id:args.p_driver,month:args.p_month,loads:args.p_loads};if(i<0)f.quotas.push(q);else f.quotas[i]=q;return}
      if(name==='pipa_create_request'){requests.push({...args.p_data,id:'request-new',status:'pending',created_at:now.toISOString()});return 'request-new'}
      if(name==='pipa_dispatch'){const r=requests.find(r=>r.id===args.p_request);r.driver_id=args.p_driver;r.status=args.p_cancel?'cancelled':'assigned';return}
      if(name==='pipa_plan_route'){const r={...args.p_data,id:args.p_data.id,channel_id:'channel',source:location.pathname.startsWith('/prefeitura/')?'municipality':'driver',cancelled:false};routes.push(r);r.tank_ids.forEach((id,i)=>{const t=tanks.find(t=>t.id===id);requests.push({id:'route-stop-'+r.id+'-'+i,route_id:r.id,route_position:i+1,driver_id:r.driver_id,channel_id:'channel',tank_id:t.id,kind:'regular',status:'assigned',locality:t.locality,address:t.address,latitude:t.latitude,longitude:t.longitude,created_at:now.toISOString()})});return r.id}
      if(name==='pipa_cancel_route'){routes.find(r=>r.id===args.p_route).cancelled=true;requests.filter(r=>r.route_id===args.p_route&&r.status==='assigned').forEach(r=>r.status='cancelled');return}
      if(name==='pipa_change_destination'){requests.filter(r=>r.status==='in_transit').forEach(r=>r.status='assigned');const r=requests.find(r=>r.tank_id===args.p_tank&&r.status==='assigned');return pipaRpc('pipa_start_trip',{p_request:r?.id,p_tank:args.p_tank})}
      if(name==='pipa_driver_workspace')return structuredClone({driver:drivers[0],quota:location.search.includes('empty-driver')?null:20,monthly_loads:location.search.includes('empty-driver')?0:deliveries.reduce((n,d)=>n+d.loads,0),tanks,routes:routes.map(r=>({...r,stops:requests.filter(s=>s.route_id===r.id).map(s=>({request_id:s.id,tank_id:s.tank_id,status:s.status,position:s.route_position}))})),requests:location.search.includes('empty-driver')?[]:requests.filter(r=>r.driver_id==='driver-1'&&['assigned','in_transit'].includes(r.status)),deliveries:location.search.includes('empty-driver')?[]:deliveries});
      if(name==='pipa_start_trip'){const r=requests.find(r=>r.id===args.p_request);if(r){r.status='in_transit';return r.id}const t=tanks.find(t=>t.id===args.p_tank);if(t){const r={id:crypto.randomUUID(),driver_id:'driver-1',tank_id:t.id,status:'in_transit',kind:'regular',locality:t.locality,address:t.address,latitude:t.latitude,longitude:t.longitude};requests.push(r);return r.id}}
      if(name==='pipa_record_delivery'){const r=requests.find(r=>r.id===args.p_data.request_id);if(r)r.status='completed';deliveries.unshift({...args.p_data,id:args.p_data.id,loads:args.p_data.loads||1,driver_id:'driver-1',provider:'prefeitura',delivered_at:now.toISOString(),locality:r?.locality||'Serra Negra',destination_name:'Caixa do Sítio Serra Negra',driver_name:drivers[0].name,plate:drivers[0].plate});return args.p_data.id}
    }
  `,
};
await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter,Routes,Route,useNavigate,useLocation,Navigate} from 'react-router-dom';import Manager from '@/pages/OperationPipaPage';import Driver from '@/pages/PipaDriverPage';import {isolatedOperationalShell,operationalRedirect} from '@/lib/operationalAccess';function App(){window.go=useNavigate();const location=useLocation();const user=location.pathname.startsWith('/prefeitura/')?{has_municipality_access:true}:{app_metadata:{pipa_driver:true}};const redirect=operationalRedirect(user,location.pathname);if(redirect)return <Navigate to={redirect} replace/>;return <>{!isolatedOperationalShell(user,location.pathname)&&<div data-citizen-chrome>Menu do cidadao</div>}<Routes><Route path="/prefeitura/operacao-pipa/:section?" element={<Manager/>}/><Route path="/operacao-pipa/pipeiro/:view?" element={<Driver/>}/></Routes></>};createRoot(document.getElementById('root')).render(<BrowserRouter><App/></BrowserRouter>);`, resolveDir: root, loader: 'jsx' }, loader: { '.png': 'dataurl' }, bundle: true, jsx: 'automatic', outfile: path.join(out, 'preview.js'), alias: { '@': path.join(root, 'src') }, define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' }, plugins: [{ name: 'fixtures', setup(b) { b.onResolve({ filter: /.*/ }, args => stubs[args.path] ? { path: args.path, namespace: 'fixture' } : undefined); b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'jsx', resolveDir: root })); } }] });
let sourceCss = await fs.readFile('src/index.css', 'utf8');
for (const token of ['primitives', 'semantic', 'typography', 'motion']) sourceCss = sourceCss.replace(`@import './design-system/tokens/${token}.css';`, await fs.readFile(`src/design-system/tokens/${token}.css`, 'utf8'));
sourceCss += '\n' + await fs.readFile('src/design-system/municipal-journeys.css', 'utf8');
sourceCss += '\n' + await fs.readFile('src/design-system/wizard.css', 'utf8');
sourceCss += '\n' + await fs.readFile('src/components/municipality/pipa.css', 'utf8');
sourceCss += '\n' + await fs.readFile('node_modules/leaflet/dist/leaflet.css', 'utf8');
const config = loadConfig(path.join(root, 'tailwind.config.js'));
const css = await postcss([tailwind({ ...config, content: ['src/pages/OperationPipaPage.jsx', 'src/pages/PipaDriverPage.jsx', 'src/components/municipality/Pipa*.jsx', 'src/components/municipality/Municipal*.jsx', 'src/components/ui/*.jsx'] })]).process(sourceCss, { from: path.join(root, 'src/index.css') });
await fs.writeFile(path.join(out, 'preview.css'), css.css);
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (['/images/operacao-pipa/caminhao-pipa.png','/logo.png','/fonts/Inter.woff2','/fonts/BricolageGrotesque.woff2'].includes(url.pathname)) { res.setHeader('Content-Type', url.pathname.endsWith('.png') ? 'image/png' : 'font/woff2'); res.end(await fs.readFile(path.join(root,'public',url.pathname.slice(1)))); }
  else if (url.pathname === '/tile.svg') { res.setHeader('Content-Type', 'image/svg+xml'); res.end('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e7ecdd"/><path d="M0 30Q40 80 130 70T256 20M-20 170Q90 90 280 140" fill="none" stroke="#d4dcc9" stroke-width="35"/><path d="M0 230Q150 170 256 80" fill="none" stroke="white" stroke-width="8"/><path d="M0 230Q150 170 256 80" fill="none" stroke="#d9c8a6" stroke-width="3"/></svg>'); }
  else if (url.pathname === '/preview.js' || url.pathname === '/preview.css') { res.setHeader('Content-Type', url.pathname.endsWith('.js') ? 'text/javascript' : 'text/css'); res.end(await fs.readFile(path.join(out, url.pathname.slice(1)))); }
  else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/preview.css"></head><body><div id="root"></div><script src="/preview.js"></script></body></html>'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = path.join(out, `chrome-${Date.now()}`);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--disable-extensions', '--no-first-run', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms)); let ws;
try {
  let endpoint;
  for (let i = 0; i < 100 && !endpoint; i++) { try { const [port, route] = (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).trim().split(/\r?\n/); endpoint = `ws://127.0.0.1:${port}${route}`; } catch { await pause(100); } }
  assert.ok(endpoint, 'Chrome não abriu'); ws = new WebSocket(endpoint); await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let id = 0; const pending = new Map(), errors = [];
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails); if (m.id) { const t = pending.get(m.id); pending.delete(m.id); m.error ? t.reject(Error(m.error.message)) : t.resolve(m.result); } });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const next = ++id; pending.set(next, { resolve, reject }); ws.send(JSON.stringify({ id: next, method, params, sessionId })); });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Runtime.enable', {}, sessionId); await send('Page.enable', {}, sessionId);
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.voiceMessages=[];if(window.speechSynthesis){window.speechSynthesis.speak=utterance=>{if(utterance.text.trim())window.voiceMessages.push(utterance.text)};window.speechSynthesis.cancel=()=>{}}` }, sessionId);
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId); if (r.exceptionDetails) throw Error(r.exceptionDetails.text + ' ' + r.exceptionDetails.exception?.description); return r.result.value; };
  const wait = async expression => { for (let i = 0; i < 350; i++) { if (await evaluate(`Boolean(${expression})`)) return; await pause(70); } console.log(await evaluate('[...document.querySelectorAll("input,select,textarea")].filter(e=>!e.validity.valid).map(e=>({name:e.name,value:e.value,message:e.validationMessage}))'));console.log(await evaluate('({text:document.body.innerText.slice(-1200),calls:window.fixture.calls.slice(-3)})'));throw Error('Timeout: ' + expression); };
  const click = async text => {
    const point = await evaluate(`(()=>{const scope=document.querySelector('[role=dialog][data-state=open]')||document,label=${JSON.stringify(text)},section=document.querySelector('.pipa-mobile-section select'),option=section?.getClientRects().length&&[...section.options].find(o=>o.textContent.replace(/ \\(\\d+\\)$/,'')===label);if(option){section.value=option.value;section.dispatchEvent(new Event('change',{bubbles:true}));return null}const items=[...scope.querySelectorAll('button,a')],visible=items.filter(e=>e.getClientRects().length),match=list=>list.find(e=>e.textContent.trim()===label)||list.find(e=>e.textContent.trim().startsWith(label)),e=match(visible)||match(items);if(!e)throw Error('Ausente: '+label);let parent=e.closest('details');while(parent){parent.open=true;parent=parent.parentElement?.closest('details')}if(e.getAttribute('role')==='tab'){e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}}e.click();return null})()`);
    if(point){await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1},sessionId);await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1},sessionId);}
  };
  const input = (name, value) => evaluate(`(()=>{const e=document.querySelector('[name="'+${JSON.stringify(name)}+'"]');Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  const select = (label, value) => evaluate(`(()=>{const e=[...(document.querySelector('[role=dialog]')||document).querySelectorAll('label')].find(e=>e.querySelector('span')?.textContent===${JSON.stringify(label)}).querySelector('select');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  const navigate = route => send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}${route}` }, sessionId);
  const layout = async width => {
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'), `Overflow da página em ${width}`);
    assert.ok(await evaluate('[...document.querySelectorAll("[role=dialog]")].every(e=>e.scrollWidth<=e.clientWidth+1)'), `Overflow do formulário em ${width}`);
    if (width >= 1200) assert.ok(await evaluate(`(()=>{const e=document.querySelector('.pipa-page,.pipa-patrol-main'),r=e.getBoundingClientRect(),p=getComputedStyle(e);return r.left+parseFloat(p.paddingLeft)<=64&&innerWidth-r.right+parseFloat(p.paddingRight)<=64})()`), 'Margens desktop até 64px');
  };
  const capture = async name => { const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId); await fs.writeFile(path.join(out, name + '.png'), Buffer.from(shot.data, 'base64')); };
  const results = [];
  for (const width of [1440, 1920, 390, 320]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: width < 600 ? 844 : 1000, deviceScaleFactor: 1, mobile: width < 600 }, sessionId);
    await navigate('/prefeitura/operacao-pipa/mapa'); await wait('document.querySelector(".leaflet-container")'); await pause(250); await layout(width); await capture(`mapa-${width}`);
    assert.ok(await evaluate('!document.querySelector(".pipa-management-sidebar,.pipa-priority-list")'),'Mapa sem lista lateral de caixas');
    assert.ok(await evaluate('(()=>{const r=document.querySelector(".pipa-map").getBoundingClientRect(),p=document.querySelector(".pipa-management-map").getBoundingClientRect();return Math.abs(r.width-p.width)<2})()'),'Mapa ocupa toda a largura disponível');
    const markerCount = 'Object.values(window.pipaMaps[0]._layers).filter(l=>l.getRadius&&[9,12].includes(l.getRadius())).length';
    await evaluate(`document.querySelector('button[aria-label="Ver prioridades"]').click()`);await wait(`${markerCount}===1`);
    await evaluate('(()=>{let marker;window.pipaMaps[0].eachLayer(l=>{if(!marker&&l.getRadius?.()===9)marker=l});marker.fire("click")})()');
    await wait('document.querySelector(".pipa-tank-details")');
    assert.ok(await evaluate('document.querySelector(".pipa-tank-details").innerText.includes("Vazia informada")'),'Caixa seca tem prioridade visível no modal');
    assert.ok(await evaluate('!document.querySelector(".leaflet-popup")'),'Detalhes abrem no modal sem popup sobreposto');
    await layout(width);await pause(250);await capture(`detalhes-caixa-${width}`);
    await click('Editar caixa');await wait('document.querySelector("#pipa-form")');
    assert.equal(await evaluate('document.querySelectorAll("[role=dialog]").length'),1,'Editar substitui os detalhes sem empilhar modais');
    await click('Cancelar');await wait('!document.querySelector("[role=dialog]")');
    await click('Todas');await wait(`${markerCount}===2`);
    await evaluate('(()=>{let marker;window.pipaMaps[0].eachLayer(l=>{if(!marker&&l.getRadius?.()===9)marker=l});marker.fire("click")})()');
    await wait('document.querySelector(".pipa-tank-details")');
    await evaluate('[...document.querySelectorAll(".pipa-tank-details summary")].find(e=>e.textContent==="Responsável pela caixa").click()');
    assert.ok(await evaluate('document.querySelector(".pipa-tank-details").innerText.includes("Dados pessoais restritos")'),'Responsável disponível em seção recolhível');
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);
    await wait('!document.querySelector("[role=dialog]")');
    await click('Caixas d’água'); await wait('document.querySelector("table")'); await layout(width);
    await click('Cadastrar caixa'); await wait('document.querySelector("[role=dialog]")'); await layout(width); await capture(`cadastro-caixa-${width}`);
    assert.equal(await evaluate('Boolean(document.querySelector("[name=latitude], [name=responsible_name]"))'), false, 'Primeira etapa mostra somente os dados da caixa');
    assert.ok(await evaluate('document.querySelector(".pipa-code-output")?.textContent.includes("Gerado ao salvar")'), 'Código do sistema é gerado ao salvar');
    await click('Continuar'); assert.equal(await evaluate('document.querySelector("#pipa-form").getAttribute("aria-labelledby")'), 'pipa-tank-step-0', 'Não avança sem os campos obrigatórios');
    for(const [name,value] of Object.entries({name:'Caixa de teste cadastrada',locality:'Comunidade de teste',capacity_liters:'16000',emptying_days:'10'})) await input(name,value);
    await input('official_code','GOV-TESTE-3');
    await click('Continuar'); await wait('document.querySelector("[name=latitude]")'); await layout(width); await capture(`cadastro-localizacao-${width}`);
    await click('Continuar'); assert.equal(await evaluate('document.querySelector("#pipa-form").getAttribute("aria-labelledby")'), 'pipa-tank-step-1', 'Não avança sem a localização');
    assert.ok(await evaluate('Boolean(document.querySelector(`.pipa-location-controls [aria-label="Usar mapa de satélite"]`) && document.querySelector(`.pipa-location-controls [aria-label="Ir para minha localização"]`))'), 'Mapa de cadastro oferece satélite e GPS');
    if(width===1440){
      await evaluate('document.querySelector(`.pipa-location-controls [aria-label="Usar mapa de satélite"]`).click()');
      await wait('document.querySelector(".leaflet-tile-pane img[src*=arcgisonline]")');
      await evaluate('document.querySelector(`.pipa-location-controls [aria-label="Usar mapa padrão"]`).click()');
      await wait('window.pipaMaps.length>0');
      await send('Emulation.setGeolocationOverride',{latitude:-8.59,longitude:-38.56,accuracy:10},sessionId);
      await send('Browser.grantPermissions',{origin:`http://127.0.0.1:${server.address().port}`,permissions:['geolocation']});
      await evaluate('document.querySelector(`.pipa-location-controls [aria-label="Ir para minha localização"]`).click()');
      await wait('Number(document.querySelector("[name=latitude]").value)===-8.59');
      assert.equal(await evaluate('Number(document.querySelector("[name=longitude]").value)'),-38.56,'GPS marca a caixa no mapa');
    }
    assert.ok(await evaluate('document.querySelector("[role=dialog] .pipa-map").getBoundingClientRect().bottom<document.querySelector("[name=address]").getBoundingClientRect().top'), 'Mapa aparece acima do endereço');
    await evaluate('void window.pipaMaps[0].fire("click",{latlng:{lat:-8.601,lng:-38.571}})');
    await wait('document.querySelector("[name=address]").value==="Endereço do ponto -8.6010, -38.5710"');
    assert.equal(await evaluate('Number(document.querySelector("[name=latitude]").value)'), -8.601);
    assert.ok(await evaluate('(()=>{let small=false;window.pipaMaps[0].eachLayer(l=>{if(l.getRadius?.()===5)small=true});return small})()'), 'Ponto de seleção tem raio de cinco pixels');
    if(width===1440){
      await evaluate('window.reverseDelay=true;void window.pipaMaps[0].fire("click",{latlng:{lat:-8.605,lng:-38.575}})');await wait('window.reversePending?.length===1');
      await input('address','Referência informada manualmente');await evaluate('window.reversePending.shift()()');await pause(80);
      assert.equal(await evaluate('document.querySelector("[name=address]").value'),'Referência informada manualmente','Busca atrasada preserva a correção manual');
      await evaluate('void window.pipaMaps[0].fire("click",{latlng:{lat:-8.606,lng:-38.576}})');await wait('window.reversePending.length===1');
      await evaluate('void window.pipaMaps[0].fire("click",{latlng:{lat:-8.607,lng:-38.577}})');await wait('window.reversePending.length===2');
      await evaluate('window.reversePending.shift()()');await pause(80);assert.equal(await evaluate('document.querySelector("[name=address]").value'),'','Resposta do ponto anterior é ignorada');
      await evaluate('window.reversePending.shift()()');await wait('document.querySelector("[name=address]").value==="Endereço do ponto -8.6070, -38.5770"');
      await evaluate('window.reverseDelay=false;window.reverseFail=true;void window.pipaMaps[0].fire("click",{latlng:{lat:-8.608,lng:-38.578}})');await wait('document.querySelector("#pipa-address-lookup-error")');
      assert.equal(await evaluate('Number(document.querySelector("[name=latitude]").value)'),-8.608,'Falha de endereço mantém o ponto');
      await input('address','Referência sem geocodificação');await evaluate('window.reverseFail=false');
    }
    for(const [name,value] of Object.entries({latitude:'-8.6',longitude:'-38.57'})) await input(name,value);
    await wait('document.querySelector("[name=address]").value==="Endereço do ponto -8.6000, -38.5700"');
    await input('address','Estrada rural');await capture(`cadastro-localizacao-marcada-${width}`);
    await click('Voltar'); await wait('document.querySelector("[name=name]")'); assert.equal(await evaluate('document.querySelector("[name=name]").value'), 'Caixa de teste cadastrada', 'Voltar preserva os dados');
    await click('Continuar'); await wait('document.querySelector("[name=latitude]")'); assert.equal(await evaluate('document.querySelector("[name=latitude]").value'), '-8.6');
    await click('Continuar'); await wait('document.querySelector("[name=responsible_name]")'); await layout(width); await capture(`cadastro-responsavel-${width}`);
    assert.equal(await evaluate('Boolean(document.querySelector("[name=latitude], [name=name]"))'), false, 'Última etapa mostra os dados do responsável');
    for(const [name,value] of Object.entries({responsible_name:'Responsavel de teste',responsible_document:'11111111111',responsible_phone:'87999990003',responsible_address:'Sitio de teste'})) await input(name,value);
    assert.equal(await evaluate('document.querySelector("[name=responsible_document]").value'), '111.111.111-11', 'Máscara de CPF aparece durante a digitação');
    assert.equal(await evaluate('document.querySelector("[name=responsible_phone]").value'), '(87) 99999-0003', 'Máscara de celular inclui DDD');
    await evaluate('document.querySelector("[name=responsible_document]").focus();document.querySelector("[name=responsible_document]").blur()');
    await wait('document.querySelector("[name=responsible_document][aria-invalid=true]")');
    await click('Salvar');await wait('document.querySelector("[name=responsible_document][aria-invalid=true]")');assert.equal(await evaluate('window.fixture.calls.filter(c=>c.name==="pipa_save_tank").length'),0);
    await click('Voltar'); await wait('document.querySelector("[name=latitude]")');
    await evaluate('document.querySelector(".pipa-tank-progress button").click()'); await wait('document.querySelector("[name=name]")');
    await click('Continuar'); await wait('document.querySelector("[name=latitude]")'); await click('Continuar'); await wait('document.querySelector("[name=responsible_document]")');
    assert.equal(await evaluate('document.querySelector("[name=responsible_phone]").value'), '(87) 99999-0003', 'Navegação entre etapas preserva os dados do responsável');
    await input('responsible_document','529.982.247-25');assert.equal(await evaluate('document.querySelector("[name=responsible_document]").value'), '529.982.247-25');
    await input('responsible_phone','00999990003');await evaluate('document.querySelector("[name=responsible_phone]").focus();document.querySelector("[name=responsible_phone]").blur()');
    await wait('document.querySelector("[name=responsible_phone][aria-invalid=true]")');await click('Salvar');
    assert.equal(await evaluate('window.fixture.calls.filter(c=>c.name==="pipa_save_tank").length'),0,'Telefone inválido impede salvar');
    await input('responsible_phone','8738511234');assert.equal(await evaluate('document.querySelector("[name=responsible_phone]").value'),'(87) 3851-1234','Máscara aceita telefone fixo');
    await input('responsible_phone','+55 (87) 99999-0003');assert.equal(await evaluate('document.querySelector("[name=responsible_phone]").value'),'(87) 99999-0003','Colagem com prefixo +55 mantém o número correto');
    await wait('!document.querySelector("[name=responsible_phone][aria-invalid=true]")');
    await click('Salvar');await wait('!document.querySelector("[role=dialog]")');
    assert.ok(await evaluate('window.fixture.tanks.some(t=>t.id==="tank-new"&&t.name==="Caixa de teste cadastrada"&&t.latitude==="-8.6"&&t.responsible_document==="52998224725"&&t.emptying_days===10&&t.system_code==="CX3"&&t.official_code==="GOV-TESTE-3")'));
    if(width===1440){
      await evaluate(`(()=>{const row=[...document.querySelectorAll('tbody tr')].find(r=>r.textContent.includes('Caixa de teste cadastrada'));row.querySelector('button').click()})()`);
      await wait('document.querySelector("[name=name]")'); await input('name', 'Caixa de teste editada');
      await click('Continuar');await wait('document.querySelector("[name=latitude]")');await click('Continuar');await wait('document.querySelector("[name=responsible_document]")');await click('Salvar');await wait('!document.querySelector("[role=dialog]")');
      assert.equal(await evaluate('window.fixture.tanks.filter(t=>t.id==="tank-new"&&t.name==="Caixa de teste editada").length'),1, 'Edição segue as mesmas etapas e atualiza a caixa existente');
    }
    await click('Pipeiros'); await wait('document.body.textContent.includes("Cota não definida")'); await click('Criar login'); await wait('document.querySelector("[name=email]")'); await input('email', 'pipeiro-teste@example.org'); await click('Criar acesso'); await wait('document.body.textContent.includes("Login criado")'); await layout(width); await click('Concluir');
    await click('Dados do login'); await wait('document.querySelector("[role=dialog]")?.textContent.includes("pipeiro-conta@example.test")');
    assert.ok(await evaluate('document.querySelector("[role=dialog]").textContent.includes("Nome da conta do pipeiro")&&document.querySelector("[role=dialog]").textContent.includes("87999998888")'));
    await layout(width); await capture(`dados-login-${width}`);
    await evaluate('window.fixture.resetFail=true'); await click('Redefinir senha'); await wait('document.querySelector("[role=alert]")?.textContent.includes("Falha ao enviar")');
    await evaluate('window.fixture.resetFail=false'); await click('Redefinir senha'); await wait('document.querySelector("[role=dialog]").textContent.includes("Redefinição solicitada")');
    assert.equal(await evaluate('window.fixture.resetCalls.filter(email=>email==="pipeiro-conta@example.test").length'),2);
    await click('Fechar'); await wait('!document.querySelector("[role=dialog]")');
    await click('Solicitações'); await wait('document.body.innerText.includes("Direcionada")'); await layout(width); await capture(`solicitacoes-${width}`);
    await evaluate(`['pending','assigned','in_transit','completed','cancelled'].forEach(status=>window.fixture.requests.push({...window.fixture.requests[0],id:'tab-'+status,status,requester_name:'Solicitante da aba '+status}))`);
    await click('Atualizar');await wait('document.querySelector(".pipa-request-content").textContent.includes("Solicitante da aba pending")');
    assert.ok(await evaluate('[...document.querySelectorAll("tr[data-request-status]")].every(row=>["pending","assigned","in_transit"].includes(row.dataset.requestStatus))'),'Pendentes reúne solicitações aguardando, direcionadas e em rota');
    await click('Atendidas');await wait('document.querySelector("tr[data-request-status=completed]")');
    assert.ok(await evaluate('[...document.querySelectorAll("tr[data-request-status]")].every(row=>row.dataset.requestStatus==="completed")'),'Atendidas mostra somente solicitações concluídas');
    assert.ok(await evaluate('!document.querySelector(".pipa-request-content .pipa-actions")'),'Solicitações atendidas não oferecem lançamento ou cancelamento');
    await click('Canceladas');await wait('document.querySelector("tr[data-request-status=cancelled]")');
    assert.ok(await evaluate('[...document.querySelectorAll("tr[data-request-status]")].every(row=>row.dataset.requestStatus==="cancelled")'),'Canceladas permanecem acessíveis separadamente');
    await click('Pendentes');await wait('document.querySelector("tr[data-request-status=pending]")');
    await click('Filtros');await select('Situação','in_transit');
    await wait('[...document.querySelectorAll("tr[data-request-status]")].every(row=>row.dataset.requestStatus==="in_transit")');
    await click('Atendidas');await wait('document.querySelector("tr[data-request-status=completed]")');
    assert.equal(await evaluate('document.querySelector(".pipa-request-content select").value'),'','Trocar a aba limpa o filtro de situação anterior');
    await click('Pendentes');await layout(width);await pause(250);await capture(`solicitacoes-abas-${width}`);
    await evaluate('window.fixture.requests.splice(0,window.fixture.requests.length,...window.fixture.requests.filter(row=>!row.id.startsWith("tab-")))');await click('Atualizar');
    await click('Solicitar água'); await wait('document.querySelector("[role=dialog]")'); await select('Tipo de solicitação', 'one_off'); await input('requester_name', 'Solicitante de teste'); await input('locality', 'Localidade avulsa'); await input('latitude', '-8.61'); await input('longitude', '-38.51'); await wait('document.querySelector("[name=address]").value.length>0'); await input('address', 'Casa de teste'); await click('Salvar'); await wait('!document.querySelector("[role=dialog]")'); assert.ok(await evaluate('window.fixture.calls.some(c=>c.name==="pipa_create_request"&&c.args.p_data.kind==="one_off"&&!c.args.p_data.tank_id)'));
    await click('Abastecimentos');await wait('document.querySelector(".pipa-delivery-history")');
    assert.equal(await evaluate('document.querySelector(".pipa-filter-panel").hidden'),true,'Filtros do histórico fechados por padrão');
    await layout(width);await capture(`abastecimentos-${width}`);
    if(width>=1200)assert.ok(await evaluate('[...document.querySelectorAll(".pipa-deliveries-table tbody tr")].every(row=>row.getBoundingClientRect().height<=76)'),'Linhas do histórico compactas no desktop');
    await click('Filtros');await wait('!document.querySelector(".pipa-filter-panel").hidden');await select('Entrega realizada por','exercito');await wait('document.body.innerText.includes("Nenhum abastecimento no período")');
    await click('Restaurar filtros');await click('Concluir filtros');await wait('document.querySelector(".pipa-history-destination")');
    await evaluate('(()=>{const e=document.querySelector(".pipa-delivery-history input[type=search]");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(e,"ABC1D23");e.dispatchEvent(new Event("input",{bubbles:true}))})()');
    assert.ok(await evaluate('document.querySelector(".pipa-history-heading").innerText.includes("1 registro")'),'Busca por placa atualiza os resultados');
    if(width<768)await evaluate('document.querySelector(".pipa-history-mobile-record").click()');else await evaluate('document.querySelector(".pipa-history-destination").click()');
    await wait('document.querySelector(".pipa-delivery-audit")');await layout(width);await capture(`abastecimento-detalhe-${width}`);await click('Fechar');await wait('!document.querySelector(".pipa-delivery-audit")');
    await evaluate(`document.querySelector('button[aria-label="Limpar busca"]').click()`);
 await wait('document.body.innerText.includes("Lançar abastecimento")'); await click('Lançar abastecimento'); await wait('document.querySelector("[role=dialog]")'); await select('Caixa d’água', 'tank-1'); await select('Pipeiro', 'driver-1'); await select('Como a caixa ficou após a entrega?', 'full'); await input('notes', 'Registro manual de teste'); await click('Salvar'); await wait('!document.querySelector("[role=dialog]")'); assert.ok(await evaluate('window.fixture.calls.some(c=>c.name==="pipa_record_delivery"&&c.args.p_data.source==="manual"&&c.args.p_data.level_after_percent===100)'));
    await click('Estatísticas'); await wait('document.body.innerText.includes("Por pipeiro")'); await layout(width); await capture(`estatisticas-${width}`);
    assert.ok(await evaluate('!document.querySelector(".pipa-metrics")'),'Estatísticas sem repetição de grandes cartões');
    await click('Por pipeiro');await wait('document.querySelector(".pipa-report-workspace table")');await capture(`estatisticas-pipeiros-${width}`);
    await click('Por localidade');await wait('document.querySelector(".pipa-report-workspace table")');await capture(`estatisticas-localidades-${width}`);
    await click('Visão geral');await click('Relatório PDF'); await wait('window.fixture.exported?.stats.loads>0');
    await click('Rotas');await wait('document.body.innerText.includes("Rotas planejadas")');await click('Planejar rota');await wait('document.querySelector("#pipa-route-form")');
    assert.ok(await evaluate('!document.querySelector("#pipa-route-form .pipa-map")'),'Planejamento começa pelos dados da rota');
    await click('Adicionar caixas');await wait('document.querySelector("[data-planner-step]")?.dataset.plannerStep==="1"');
    await evaluate('(()=>{let marker;window.pipaMaps[0].eachLayer(l=>{if(!marker&&l.getRadius?.()===9)marker=l});marker.fire("click")})()');await wait('document.querySelector(".pipa-planner-preview")');
    assert.equal(await evaluate('document.querySelectorAll(".pipa-planner-option[data-added=true]").length'),0,'Tocar no mapa abre prévia sem adicionar a caixa');
    await capture(`planejar-rota-previa-${width}`);await click('Adicionar à rota');await wait('document.querySelectorAll(".pipa-planner-option[data-added=true]").length===1');
    await click('Caixa da Lagoa Comprida');
    assert.equal(await evaluate('document.querySelectorAll(".pipa-planner-option[data-added=true]").length'),1,'Abrir os detalhes de outra caixa mantém a seleção');
    await click('Adicionar à rota');await wait('document.querySelectorAll(".pipa-planner-option[data-added=true]").length===2');
    await click('Revisar rota');await wait('document.querySelector("[data-planner-step]")?.dataset.plannerStep==="2"');
    await evaluate('document.querySelector("button[aria-label^=Descer]").click()');await layout(width);await capture(`planejar-rota-${width}`);await click('Salvar rota');await wait('!document.querySelector("[role=dialog]")');
    assert.ok(await evaluate('window.fixture.routes[0].source==="municipality"&&window.fixture.routes[0].tank_ids[0]==="tank-2"'),'Prefeitura define as caixas e a ordem');
    await navigate('/operacao-pipa/pipeiro'); await wait('document.body.innerText.includes("Entregas direcionadas")');
    await wait('document.querySelector(".pipa-vehicle-image")?.naturalWidth>0');await evaluate('document.querySelector(".pipa-vehicle-image").decode()');await layout(width);await capture(`pipeiro-inicio-${width}`);
    assert.ok(await evaluate('![...document.querySelectorAll("h1")].some(e=>e.textContent.includes("Minhas entregas"))'),'Título removido da tela de entregas');
    assert.ok(await evaluate('!document.querySelector("table,.leaflet-container,[data-citizen-chrome]")'),'Entregas n?o mistura mapa ou hist?rico');
    await click('Histórico');await wait('document.querySelector("table")');assert.ok(await evaluate('!document.querySelector(".pipa-vehicle-image,.leaflet-container")'),'Histórico tem tela própria');await capture(`pipeiro-historico-${width}`);
    await click('Entregas');await wait('document.querySelector(".pipa-vehicle-image")');await evaluate("window.go('/mapa')");await wait('location.pathname==="/operacao-pipa/pipeiro"');assert.ok(await evaluate('!document.querySelector("[data-citizen-chrome]")'));
    await send('Emulation.setGeolocationOverride', { latitude: -8.58 + 1600 / 111195, longitude: -38.55, accuracy: 10 }, sessionId); await send('Browser.grantPermissions', { origin: `http://127.0.0.1:${server.address().port}`, permissions: ['geolocation'] });
    assert.ok(await evaluate('!/patrulha|em deslocamento/i.test(document.body.innerText)'), 'Interface do pipeiro usa rota e estados de entrega');
    await click('Iniciar rota');await wait('document.querySelector("[data-driver-screen=mapa]")');await wait('document.body.innerText.includes("em linha reta")');await layout(width);await capture(`pipeiro-${width}`);
    await wait('window.voiceMessages.some(text=>text.includes("Rota iniciada. Destino: Caixa do Sítio Serra Negra"))');
    await send('Emulation.setGeolocationOverride', { latitude: -8.58 + 900 / 111195, longitude: -38.55, accuracy: 10 }, sessionId);
    await wait('window.voiceMessages.some(text=>text.includes("a 1 quilômetro"))');
    await send('Emulation.setGeolocationOverride', { latitude: -8.58 + 450 / 111195, longitude: -38.55, accuracy: 500 }, sessionId);await pause(500);
    assert.ok(await evaluate('!window.voiceMessages.some(text=>text.includes("a 500 metros"))'), 'GPS impreciso não dispara alerta de proximidade');
    await send('Emulation.setGeolocationOverride', { latitude: -8.58 + 450 / 111195, longitude: -38.55, accuracy: 10 }, sessionId);
    await wait('window.voiceMessages.some(text=>text.includes("a 500 metros"))');
    await send('Emulation.setGeolocationOverride', { latitude: -8.58 + 80 / 111195, longitude: -38.55, accuracy: 10 }, sessionId);
    await wait('window.voiceMessages.some(text=>text.includes("a 100 metros"))');
    assert.equal(await evaluate('window.voiceMessages.filter(text=>/a (1 quilômetro|500 metros|100 metros)/.test(text)).length'), 3, 'Cada marco é falado uma vez');
    await evaluate(`document.querySelector('button[aria-label="Silenciar avisos por voz"]').click()`);
    assert.ok(await evaluate('document.querySelector(\'button[aria-label="Ativar avisos por voz"]\')?.getAttribute("aria-pressed")==="false"'), 'Som pode ser silenciado no mapa');
    await evaluate(`document.querySelector('button[aria-label="Ativar avisos por voz"]').click()`);
    await evaluate(`window.fixture.requests.push({...window.fixture.requests[0],id:'queued-request',tank_id:'tank-2',status:'assigned',locality:'Lagoa Comprida'});window.go('/operacao-pipa/pipeiro/entregas')`);
    await evaluate('document.querySelector(".pipa-vehicle-heading button").click()');await wait('document.querySelector(".pipa-driver-queue-note")');await layout(width);await capture(`pipeiro-entrega-ativa-${width}`);
    assert.ok(await evaluate('(()=>{const card=document.querySelector(".pipa-driver-live"),r=card.getBoundingClientRect();return [...card.querySelectorAll("h2,p,button")].every(e=>{const b=e.getBoundingClientRect();return b.top>=r.top&&b.bottom<=r.bottom})&&card.scrollHeight<=card.clientHeight+1})()'), 'Entrega em andamento preserva destino e ação sem comprimir o cartão');
    assert.ok(await evaluate('document.querySelector(".pipa-driver-card button").disabled'), 'Entrega da fila aguarda a entrega atual');
    assert.ok(await evaluate('!/patrulha|em deslocamento/i.test(document.body.innerText)'), 'Entrega ativa usa terminologia de rota');
    await click('Continuar rota');await wait('document.querySelector("[data-driver-screen=mapa]")');await wait('document.body.innerText.includes("em linha reta")');
    assert.ok(await evaluate('(()=>{const a=document.querySelector(".pipa-patrol-main").getBoundingClientRect(),b=document.querySelector(".pipa-patrol-main>.pipa-map").getBoundingClientRect();return Math.abs(a.height-b.height)<2&&Math.abs(a.width-b.width)<2&&a.height>innerHeight*.65&&!!document.querySelector(".pipa-patrol-header")&&!document.querySelector(".pipa-vehicle-image,table,[data-citizen-chrome]")})()'),'Mapa de caixas ocupa a tela abaixo do cabeçalho compacto');
    assert.ok(await evaluate('document.querySelector(".leaflet-control-zoom").getBoundingClientRect().top>document.querySelector(".pipa-patrol-locate").getBoundingClientRect().bottom'),'Controles de zoom separados do GPS');
    const expandedPanelHeight=await evaluate('document.querySelector(".pipa-patrol-destination").getBoundingClientRect().height');
    await evaluate('document.querySelector(".pipa-patrol-panel-toggle").click()');await wait('document.querySelector(".pipa-patrol-destination[data-collapsed=true]")');
    assert.ok(await evaluate('document.querySelector(".pipa-patrol-destination").getBoundingClientRect().height')<expandedPanelHeight,'Recolher o painel libera espaço no mapa');
    assert.ok(await evaluate('[...document.querySelectorAll(".pipa-patrol-destination-actions button,.pipa-patrol-destination-actions a")].every(e=>e.getBoundingClientRect().height>=44)'),'Navegar e registrar continuam acessíveis no painel recolhido');await capture(`pipeiro-painel-recolhido-${width}`);
    await click('Registrar abastecimento');await wait('document.querySelector("#pipa-discharge-form")');await select('Como a caixa ficou após a entrega?', 'custom');await input('level_after_percent','101');await click('Confirmar descarga');
    assert.equal(await evaluate('window.fixture.calls.filter(c=>c.name==="pipa_record_delivery"&&c.args.p_data.source==="gps").length'),0,'Percentual inválido não registra a entrega');
    await select('Como a caixa ficou após a entrega?', 'full');await input('liters','5000');await capture(`descarga-caixa-completada-${width}`);await click('Confirmar descarga');await wait('document.body.innerText.includes("Abastecimento registrado.")');assert.ok(await evaluate('window.fixture.calls.some(c=>c.name==="pipa_record_delivery"&&c.args.p_data.source==="gps"&&c.args.p_data.level_after_percent===100&&c.args.p_data.liters===5000)'));
    await navigate('/operacao-pipa/pipeiro?empty-driver');await wait('document.querySelector(".pipa-driver-empty")');await wait('document.querySelector(".pipa-vehicle-image")?.naturalWidth>0');await layout(width);await capture(`pipeiro-sem-entregas-${width}`);
    assert.ok(await evaluate('parseFloat(getComputedStyle(document.querySelector(".pipa-quota-unset")).fontSize)<=16'));
    await evaluate(`document.querySelector('button[aria-label="Ativar tema escuro"]').click()`);await wait('document.documentElement.classList.contains("dark")');await capture(`pipeiro-escuro-${width}`);
    await navigate('/operacao-pipa/pipeiro/rotas');await wait('document.body.innerText.includes("Rotas planejadas")');await click('Planejar rota');await wait('document.querySelector("#pipa-route-form")');await click('Adicionar caixas');await wait('document.querySelector(".pipa-planner-option")');await evaluate('document.querySelector(".pipa-planner-option button[aria-label^=Adicionar]").click()');await click('Revisar rota');await wait('document.querySelector("[data-planner-step]")?.dataset.plannerStep==="2"');await click('Salvar rota');await wait('document.querySelector("[data-driver-screen=mapa]")');
    assert.ok(await evaluate('window.fixture.routes[0].source==="driver"'),'Pipeiro cria sua pr?pria rota');
    assert.equal(await evaluate('Object.values(window.pipaMaps[0]._layers).filter(l=>l.getRadius&&[9,12].includes(l.getRadius())).length'),1,'Rota mostra somente a caixa escolhida');
    await select('Exibir no mapa','todas');await wait('Object.values(window.pipaMaps[0]._layers).filter(l=>l.getRadius&&[9,12].includes(l.getRadius())).length===2');await layout(width);
    await navigate('/operacao-pipa/pipeiro/mapa?planned-driver');await wait('document.querySelector(".pipa-patrol-top")?.innerText.includes("Planejada pela prefeitura")');await layout(width);await capture(`pipeiro-rota-prefeitura-${width}`);
    await select('Exibir no mapa','todas');await select('Selecionar caixa','tank-2');await click('Iniciar rota');await wait('document.body.innerText.includes("Registrar abastecimento")');
    assert.ok(await evaluate('window.fixture.requests.find(r=>r.id==="route-stop-1").status==="assigned"'),'Abastecer fora da rota mant?m a parada planejada pendente');
    await navigate('/operacao-pipa/pipeiro/rotas?planned-driver');await wait('document.querySelector(".pipa-route-card")');
    await evaluate(`window.fixture.routes[0].source='driver';document.querySelector('button[aria-label="Atualizar entregas"]').click()`);await wait('[...document.querySelectorAll("button")].some(e=>e.textContent==="Cancelar rota")');
    const deliveryCount = await evaluate('window.fixture.deliveries.length');
    await click('Cancelar rota');await click('Confirmar cancelamento');await wait('document.querySelector(".pipa-driver-empty")');
    assert.ok(await evaluate('window.fixture.routes[0].cancelled&&!document.querySelector(".pipa-route-card")'), 'Rota cancelada sai da listagem e mostra o estado vazio');
    assert.equal(await evaluate('window.fixture.deliveries.length'), deliveryCount, 'Cancelar preserva as entregas registradas');
    await evaluate(`window.go('/operacao-pipa/pipeiro/mapa?rota=route-city')`);await wait('document.querySelector(".pipa-patrol-route-select select")');
    assert.equal(await evaluate('document.querySelectorAll(".pipa-patrol-route-select option").length'), 1, 'Rota cancelada não aparece no seletor nem por link antigo');
    results.push({ width, map: true, forms: true, requests: true, manual: true, statistics: true, driverGps: true, driverArtwork:true, separateScreens:true, fullScreenTankMap:true, municipalityRoutes:true, driverRoutes:true, outsideRoute:true, explicitRouteSelection:true, collapsiblePanel:true, darkTheme:true, activeDeliveryVisible:true, cancelledRoutesHidden:true, routeVoiceMilestones:true });
  }
  await navigate('/prefeitura/operacao-pipa/mapa?raw-city&empty');
  await wait('window.pipaMaps?.length');
  await wait('window.pipaMaps?.[0]&&Math.abs(window.pipaMaps[0].getCenter().lat+8.597)<0.001');
  assert.deepEqual(await evaluate('window.cityLookups'), [64], 'Busca a UF pelo id do município da prefeitura');
  assert.equal(await evaluate('window.cityGeocodes.at(-1).uf'), 'PE');
  await navigate('/prefeitura/operacao-pipa/mapa?raw-city');
  await wait('window.pipaMaps?.[0]&&Math.abs(window.pipaMaps[0].getCenter().lat+8.597)<0.001');
  assert.equal(await evaluate('window.fixture.tanks.length'), 2, 'Com caixas cadastradas, a abertura ainda usa a cidade da prefeitura');
  await evaluate(`window.go('/prefeitura/operacao-pipa/mapa?raw-city&other-city')`);
  await wait('window.pipaMaps?.[0]&&Math.abs(window.pipaMaps[0].getCenter().lat+23.6)<0.001');
  assert.equal(await evaluate('window.cityGeocodes.at(-1).uf'), 'PR', 'Cidade homônima em outra UF recentraliza corretamente');
  await navigate('/prefeitura/operacao-pipa/mapa?reader'); await wait('document.querySelector(".leaflet-container")'); assert.equal(await evaluate('[...document.querySelectorAll("button")].some(e=>e.textContent.includes("Cadastrar caixa")||e.textContent.includes("Solicitar água"))'), false);
  await evaluate('window.fixture.fail=true'); await click('Atualizar'); await wait('document.querySelector("[role=alert]")');
  await navigate('/operacao-pipa/pipeiro');await wait('document.querySelector(".pipa-vehicle-image")');await evaluate('window.fixture.fail=true;document.querySelector(".pipa-vehicle-heading button").click()');await wait('document.querySelector("[role=alert]")');
  assert.ok(await evaluate('[...document.querySelectorAll("button")].some(b=>b.textContent==="Tentar novamente")'),'Falha ao carregar entregas oferece nova tentativa');
  await evaluate('window.fixture.fail=false');await click('Tentar novamente');await wait('document.querySelector(".pipa-vehicle-image")');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ results, municipalityCity: true, municipalityCityWithoutTanks: true, homonymousCityChange: true, readOnly: true, networkFailure: true, runtimeErrors: errors.length, screenshots: out }, null, 2));
} finally { ws?.close(); chrome.kill(); server.close(); }
