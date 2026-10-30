// Componentes reais em Chrome, com dados locais simulados. Não acessa .env ou produção.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import loadConfig from 'tailwindcss/loadConfig.js';

const root = process.cwd(), out = path.join(root, '.tmp/community-trees-ui');
await fs.mkdir(out, { recursive: true });
const stubs = {
  '@/contexts/SupabaseAuthContext': `const visitor=location.search.includes('visitor');export const useAuth=()=>({user:visitor?null:{id:'00000000-0000-0000-0000-000000000002'}});`,
  '@/contexts/CityContext': `import React,{createContext,useContext,useState} from 'react';
    const cities=[{id:64,name:'Floresta',state:{uf:'PE'}}],Context=createContext();
    export const useCity=()=>({cities,activeCityId:64,activeCity:cities[0],loadingCities:false});
    export function CityViewProvider({children,value}){const [cityId,setCityId]=useState(64);return <Context.Provider value={value||{cities,cityId,setCityId,city:cities[0],cityName:'Floresta',resetToMyCity(){},loadingCities:false}}>{children}</Context.Provider>}
    export const useCityView=()=>useContext(Context);`,
  '@/lib/treePickup': `export async function loadPickupMapCenter(){return {lat:-8.6,lng:-38.57}}`,
  '@/components/LocationPickerMap': `import React from 'react';export default function Map({onLocationChange,readOnly}){return <div className="qa-map">Mapa de localização{!readOnly&&<button type="button" onClick={()=>onLocationChange({lat:-8.6,lng:-38.57})}>Marcar árvore neste ponto</button>}</div>}`,
  '@/lib/customSupabaseClient': `
    const visitor=location.search.includes('visitor'),manager=location.search.includes('manager');
    const id='b1000000-0000-0000-0000-000000000001';
    const tree={id,name:'Ipê da nossa rua',city_id:64,city_name:'Floresta',species_name:'Ipê-roxo',public_profile:true,location_visibility:'city',latitude:-8.6,longitude:-38.57,address:'Rua reservada, 25',status:location.search.includes('pending')?'pending':'approved',cover_photo:'cover.jpg',created_at:'2026-01-01T12:00:00Z',is_owner:!visitor&&!manager,can_review:manager,care_count:2,public_care_count:1,latest_public_care:{photo_path:'care.jpg',performed_on:'2026-10-25',is_public:true}};
    const history=[{id:'care-1',tree_id:id,action:'growth',performed_on:'2026-10-25',notes:'Novas folhas depois de um mês de cuidado.',photo_path:'care.jpg',is_public:true,is_hidden:false,created_at:'2026-10-25T12:00:00Z'},{id:'care-private',tree_id:id,action:'observation',performed_on:'2026-10-24',notes:'PRIVATE NOTE',is_public:false,is_hidden:false}];
    window.fixture={tree,history,calls:[],fail:false,uploads:[]};
    const query={select(){return this},eq(){return this},order(){return this},then(resolve){return Promise.resolve({data:[],error:null}).then(resolve)}};
    export const supabase={from(){return Object.create(query)},storage:{from(){return {async createSignedUrls(paths){return {data:paths.map(path=>({path,signedUrl:'/photo.svg?path='+encodeURIComponent(path)}))}},async upload(path,blob){window.fixture.uploads.push({path,type:blob.type,size:blob.size});return {}},async remove(){return {}}}}},async rpc(name,args){window.fixture.calls.push({name,args});if(window.fixture.fail)return {error:{message:'Conexão indisponível. Tente novamente.'}};
      if(name==='list_community_trees')return {data:[{...tree,is_owner:!visitor&&!manager}]};
      if(name==='get_community_tree')return {data:{...tree}};
      if(name==='list_community_tree_care')return {data:history.filter(c=>tree.is_owner||manager||c.is_public&&!c.is_hidden)};
      if(name==='submit_community_tree'){Object.assign(tree,args.p_tree,{status:'pending',is_owner:true,can_review:false,care_count:0,public_care_count:0});history.length=0;return {data:tree.id}};
      if(name==='record_community_tree_care'){history.unshift({...args.p_care,created_at:new Date().toISOString(),is_hidden:false});tree.care_count++;return {data:args.p_care.id}};
      if(name==='set_community_care_privacy'){history.find(c=>c.id===args.p_id).is_public=args.p_public;return {}};
      if(name==='set_community_tree_privacy'){tree.public_profile=args.p_public;tree.location_visibility=args.p_location;return {}};
      if(name==='review_community_tree'){tree.status=args.p_approve?'approved':'rejected';return {}};
      if(name==='list_community_care_reports')return {data:window.fixture.resolved?[]:[{id:'report-1',care_id:'care-1',tree_id:id,tree_name:tree.name,reason:'Foto a revisar pela equipe.',photo_path:'care.jpg',notes:history[0]?.notes,action:'growth'}]};
      if(name==='review_community_tree_care_report'){window.fixture.resolved=true;return {}};
      return {data:null};
    }};`,
};
await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter,Routes,Route,useNavigate} from 'react-router-dom';
  import Directory from '@/pages/CommunityTreesPage';import Registration from '@/pages/CommunityTreeRegistrationPage';import Profile from '@/pages/CommunityTreeProfilePage';import Review from '@/components/arborization/CommunityTreeReview';
  import Header from '@/components/arborization/TreeAdoptionHeader';import Introduction from '@/components/arborization/TreeAdoptionIntroduction';import {CityViewProvider} from '@/contexts/CityContext';
  function Program(){const [tab,setTab]=React.useState('programa');return <CityViewProvider><main className="page-shell-fluid tree-adoption-page"><Header cityId={64} city={{id:64,name:'Floresta'}} tab={tab} onTabChange={setTab}/>{tab==='programa'?<Introduction city={{id:64,name:'Floresta'}} onStart={()=>setTab('solicitar')}/>:<p>Formulário de solicitação</p>}</main></CityViewProvider>}
  function App(){window.go=useNavigate();return <><header className="qa-header">Trombone Cidadão</header><Routes><Route path="/programa" element={<Program/>}/><Route path="/arvores-da-comunidade" element={<Directory/>}/><Route path="/arvores-da-comunidade/nova" element={<Registration/>}/><Route path="/arvores-da-comunidade/:id" element={<Profile/>}/><Route path="/revisao" element={<main className="page-shell-fluid community-page"><Review cityId={64}/></main>}/></Routes></>};createRoot(document.getElementById('root')).render(<BrowserRouter><App/></BrowserRouter>);`, resolveDir: root, loader: 'jsx' },
  bundle: true, jsx: 'automatic', outfile: path.join(out, 'preview.js'), alias: { '@': path.join(root, 'src') }, define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
  plugins: [{ name: 'fixtures', setup(builder) { builder.onResolve({ filter: /.*/ }, args => stubs[args.path] ? { path: args.path, namespace: 'fixture' } : undefined); builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'jsx', resolveDir: root })); } }],
});
let sourceCss = await fs.readFile('src/index.css', 'utf8');
for (const token of ['primitives', 'semantic', 'typography', 'motion']) sourceCss = sourceCss.replace(`@import './design-system/tokens/${token}.css';`, await fs.readFile(`src/design-system/tokens/${token}.css`, 'utf8'));
sourceCss += '\n' + await fs.readFile('src/components/arborization/communityTrees.css', 'utf8');
sourceCss += '\n' + await fs.readFile('src/components/arborization/treeAdoption.css', 'utf8');
sourceCss += '\n' + await fs.readFile('src/components/arborization/treeAdoptionIntroduction.css', 'utf8');
sourceCss += '\n.qa-header{height:64px;display:flex;align-items:center;padding-inline:32px;background:#571614;color:white;font-weight:700}.qa-map{height:100%;display:grid;place-content:center;gap:25px;text-align:center;border-radius:12px;background:repeating-linear-gradient(30deg,#e0eee5,#e0eee5 35px,#eaf4ed 35px,#eaf4ed 70px);color:#15583e}.qa-map button{background:white;padding:15px;border:1px solid #a0bfae;border-radius:10px}';
const config = loadConfig(path.join(root, 'tailwind.config.js'));
const css = await postcss([tailwind({ ...config, content: ['src/pages/Community*.jsx', 'src/components/arborization/Community*.jsx', 'src/components/arborization/TreeSpeciesField.jsx', 'src/components/WebCameraCapture.jsx', 'src/components/CitySelector.jsx', 'src/components/ui/*.jsx'] })]).process(sourceCss, { from: path.join(root, 'src/index.css') });
await fs.writeFile(path.join(out, 'preview.css'), css.css);
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/photo.svg') { res.setHeader('Content-Type', 'image/svg+xml'); res.end('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="#d7eee0"/><circle cx="620" cy="100" r="50" fill="#f7faf8"/><path d="M0 550 Q400 400 800 540V600H0" fill="#a3ceb3"/><path d="M400 520V200" stroke="#77563b" stroke-width="25"/><circle cx="400" cy="230" r="140" fill="#34825a"/><circle cx="300" cy="280" r="90" fill="#419d6d"/><circle cx="490" cy="285" r="105" fill="#226745"/></svg>'); }
  else if (url.pathname === '/preview.js' || url.pathname === '/preview.css') { res.setHeader('Content-Type', url.pathname.endsWith('.js') ? 'text/javascript' : 'text/css'); res.end(await fs.readFile(path.join(out, url.pathname.slice(1)))); }
  else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/preview.css"></head><body><div id="root"></div><script src="/preview.js"></script></body></html>'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = path.join(out, `chrome-${Date.now()}`);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--disable-extensions', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--no-first-run', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms)); let ws;
try {
  let endpoint;
  for (let i = 0; i < 150 && !endpoint; i++) { try { const [port, route] = (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).trim().split(/\r?\n/); endpoint = `ws://127.0.0.1:${port}${route}`; } catch { await pause(100); } }
  assert.ok(endpoint, 'Chrome não abriu'); ws = new WebSocket(endpoint); await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let id = 0; const pending = new Map(), errors = [];
  ws.addEventListener('message', event => { const message = JSON.parse(event.data); if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails); if (message.id) { const task = pending.get(message.id); pending.delete(message.id); message.error ? task.reject(Error(message.error.message)) : task.resolve(message.result); } });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const next = ++id; pending.set(next, { resolve, reject }); ws.send(JSON.stringify({ id: next, method, params, sessionId })); });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' }); const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Runtime.enable', {}, sessionId); await send('Page.enable', {}, sessionId);
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.qaCameraStreams=[];const originalGetMedia=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async (...args)=>{const stream=await originalGetMedia(...args);window.qaCameraStreams.push(stream);return stream;};` }, sessionId);
  const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId); if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
  const waitFor = async expression => { for (let i = 0; i < 120; i++) { if (await evaluate(`Boolean(${expression})`)) return; await pause(100); } throw Error(`Timeout: ${expression}\n${await evaluate('document.body.innerText')}\n${JSON.stringify(errors)}`); };
  const click = text => evaluate(`(()=>{const scope=[...document.querySelectorAll('[role=dialog]')].at(-1)||document;const el=[...scope.querySelectorAll('button,a')].find(el=>el.textContent.trim()===${JSON.stringify(text)});if(!el)throw Error('Ausente: '+${JSON.stringify(text)});el.click()})()`);
  const input = (selector, value) => evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  const navigate = route => send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}${route}` }, sessionId);
  const capture = async name => { await pause(150); assert.ok(await evaluate('[...document.querySelectorAll(".community-dialog")].every(el=>el.scrollWidth<=el.clientWidth+1)'), `Overflow no diálogo: ${name}`); const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId); await fs.writeFile(path.join(out, `${name}.png`), Buffer.from(shot.data, 'base64')); };
  const layout = async width => {
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'), `Overflow em ${width}px`);
    assert.ok(await evaluate('[...document.querySelectorAll(".community-dialog")].every(el=>el.scrollWidth<=el.clientWidth+1)'), `Overflow dentro do formulário em ${width}px`);
    if (width >= 1200) assert.ok(await evaluate(`(()=>{const el=document.querySelector('.community-page'),r=el.getBoundingClientRect(),p=getComputedStyle(el);return r.left+parseFloat(p.paddingLeft)<=64&&innerWidth-r.right+parseFloat(p.paddingRight)<=64&&r.width>=innerWidth-64})()`), 'Página deve ocupar largura disponível');
  };
  for (const [width, height] of [[1440,900],[1920,1080],[390,844]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
    await navigate('/programa'); await waitFor('document.querySelector(".adoption-program")'); assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'), 'Entrada do programa sem overflow'); await click('Começar solicitação'); await waitFor('document.querySelector(".adoption-page-tabs button")'); assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'), 'Navegação de solicitações sem overflow'); await capture(`navegacao-${width}`);
    await navigate('/arvores-da-comunidade?visitor'); await waitFor('document.querySelector(".community-tree-card")'); await capture(`galeria-${width}`); await layout(width);
    assert.ok(await evaluate(`(()=>{const card=document.querySelector('.community-tree-card'),photo=card.querySelector('.community-tree-card-photo'),copy=card.querySelector('.community-tree-card-copy');const p=photo.getBoundingClientRect(),c=copy.getBoundingClientRect();return p.bottom<=c.top+1&&c.bottom<=card.getBoundingClientRect().bottom&&p.height<=231&&card.getBoundingClientRect().width<=600})()`), 'Foto e identificação devem caber no card da árvore');
    await evaluate('document.querySelector("a.community-tree-card").click()'); await waitFor('document.querySelector(".community-profile-grid")'); await layout(width);
    assert.ok(await evaluate('!document.body.innerText.includes("PRIVATE NOTE")&&!document.body.innerText.includes("Rua reservada")&&!document.querySelector(".community-profile-map")'));
    await click('Compartilhar'); await waitFor('document.querySelector(".community-share-preview")');
    const card = await evaluate(`(()=>{const img=document.querySelector('.community-share-preview');return {src:img.src,w:img.naturalWidth,h:img.naturalHeight}})()`);
    assert.equal(card.w, 1080); assert.equal(card.h, 1350); await fs.writeFile(path.join(out, `cartao-${width}.png`), Buffer.from(card.src.split(',')[1], 'base64')); await capture(`compartilhar-${width}`); await layout(width);
    await navigate('/arvores-da-comunidade/nova'); await waitFor('document.querySelector(".community-stepper")'); await click('Continuar'); await waitFor('document.querySelector("[role=alert]")');
    await input('input[placeholder^="Ex."]', 'Minha primeira árvore');
    await evaluate(`(async()=>{const canvas=document.createElement('canvas');canvas.width=160;canvas.height=160;canvas.getContext('2d').fillRect(0,0,160,160);const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));const transfer=new DataTransfer();transfer.items.add(new File([blob],'arvore.png',{type:'image/png'}));const input=document.querySelector('input[type=file]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    await click('Tirar foto'); await waitFor('document.querySelector(".community-camera-dialog video")?.readyState>=2'); await capture(`camera-cadastro-${width}`);
    await evaluate('[...document.querySelectorAll(".community-camera-dialog button")].find(b=>b.getAttribute("aria-label")).click()'); await waitFor('!document.querySelector(".community-camera-dialog")');
    assert.ok(await evaluate('document.querySelector(".community-photo-picker img")&&document.querySelector("input[placeholder]").value==="Minha primeira árvore"'), 'Cancelar a câmera preserva a foto e o nome');
    await click('Tirar foto'); await waitFor('[...document.querySelectorAll(".community-camera-dialog button")].some(b=>b.textContent.trim()==="Capturar"&&!b.disabled)'); await click('Capturar'); await waitFor('!document.querySelector(".community-camera-dialog")&&document.querySelector(".community-photo-picker img")');
    assert.ok(await evaluate('window.qaCameraStreams.every(s=>s.getTracks().every(t=>t.readyState==="ended"))'), 'Câmera deve desligar depois de capturar ou cancelar');
    await waitFor('document.querySelector(".community-photo-picker img")'); await capture(`cadastro-foto-${width}`); await layout(width); await click('Continuar'); await waitFor('document.querySelector(".qa-map")');
    await click('Continuar'); await waitFor('document.querySelector("[role=alert]")'); await click('Marcar árvore neste ponto'); await click('Continuar'); await waitFor('document.querySelector(".community-privacy-fields")'); await capture(`cadastro-privacidade-${width}`); await layout(width);
    await evaluate('window.fixture.fail=true'); await click('Enviar para aprovação'); await waitFor('document.querySelector("[role=alert]")'); assert.ok(await evaluate('document.querySelector(".community-privacy-fields input[type=checkbox]").checked'));
    await evaluate('window.fixture.fail=false'); await click('Enviar para aprovação'); await waitFor('document.querySelector(".community-profile-grid")');
    assert.ok(await evaluate('document.body.innerText.includes("Em análise")&&![...document.querySelectorAll("button")].some(b=>b.textContent.trim()==="Compartilhar")'));
    assert.ok(await evaluate('window.fixture.uploads.every(p=>p.type==="image/jpeg")'), 'Fotos devem ser recodificadas sem metadados');
    await click('Registrar cuidado'); await waitFor('document.querySelector("form.community-small-form")'); await input('[role=dialog] textarea', 'Primeira rega registrada.');
    await click('Tirar foto'); await waitFor('[...document.querySelectorAll(".community-camera-dialog button")].some(b=>b.textContent.trim()==="Capturar"&&!b.disabled)'); await capture(`camera-cuidado-${width}`); await click('Capturar');
    await waitFor('!document.querySelector(".community-camera-dialog")&&document.querySelector(".community-dialog .community-photo-picker img")');
    assert.equal(await evaluate('document.querySelector(".community-dialog textarea").value'), 'Primeira rega registrada.');
    assert.ok(await evaluate('window.qaCameraStreams.every(s=>s.getTracks().every(t=>t.readyState==="ended"))'), 'Captura do cuidado libera a câmera');
    await capture(`registrar-cuidado-${width}`); await click('Salvar cuidado'); await waitFor('document.querySelector(".community-care-list")'); assert.ok(await evaluate('document.body.innerText.includes("Primeira rega registrada.")')); await layout(width);
    await navigate('/revisao?manager&pending'); await waitFor('document.querySelector(".community-tree-card")'); await capture(`revisao-${width}`); await click('Revisar cadastro'); await waitFor('document.querySelector(".community-review-summary")'); await click('Confirmar revisão'); await waitFor('!document.querySelector("[role=dialog]")'); assert.equal(await evaluate('window.fixture.tree.status'), 'approved');
    await click('Denúncias de cuidados'); await waitFor('document.querySelector(".community-report-card")'); await click('Revisar denúncia'); await waitFor('document.querySelector("[role=dialog] textarea")'); await input('[role=dialog] textarea', 'Conteúdo revisado e ocultado.'); await click('Ocultar registro'); await waitFor('!document.querySelector("[role=dialog]")&&!document.querySelector(".community-report-card")'); await layout(width);
    console.log(`${width}px: galeria, privacidade pública, PNG com QR Code, cadastro com recuperação de erro, cuidado, aprovação e denúncia OK.`);
  }
  assert.deepEqual(errors, []); console.log(`Erros de execução: 0. Capturas: ${out}`);
} finally { ws?.close(); chrome.kill(); server.close(); }
