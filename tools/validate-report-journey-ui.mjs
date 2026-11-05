// Componentes reais; serviços, sessão, mapa e captura simulados. Sem acesso ao backend.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import loadConfig from 'tailwindcss/loadConfig.js';

const root = process.cwd(), out = path.join(root, '.tmp/report-journey-ui');
await fs.mkdir(out, { recursive: true });
const stubs = {
  '@capacitor/core': `export const Capacitor={isNativePlatform:()=>false,isPluginAvailable:()=>false,convertFileSrc:p=>p};`,
  '@capacitor/app': `export const App={addListener:async()=>({remove(){}})};`,
  '@capacitor/preferences': `export const Preferences={get:async()=>({value:null}),set:async()=>{}};`,
  '@capacitor/status-bar': `export const StatusBar={};export const Style={};`,
  '@capacitor/camera': `export const Camera={};export const CameraResultType={};export const CameraSource={};export const CameraDirection={};`,
  '@capacitor/filesystem': `export const Filesystem={};export const Directory={};`,
  '@capacitor/share': `export const Share={share:async()=>{window.shared=true}};`,
  '@/plugins/VideoProcessor': `export const VideoProcessor={};`,
  '@/contexts/SupabaseAuthContext': `const user={id:'member',name:'Ana Cidadã'},admin={...user,is_admin:true};export const useAuth=()=>({user:window.guest?null:window.admin?admin:user});`,
  '@/contexts/UploadContext': `export const useUpload=()=>({registerUpload(){},queueWebUpload:async()=>{},failUploadBatch(){}});`,
  '@/contexts/MobileHeaderContext': `const context={setTitle(){},setActions(){},setShowBack(){},setOnBack(){},reset(){}};export const useMobileHeader=()=>context;`,
  '@/contexts/NativeUIModeContext': `export const useNativeUIMode=()=>({isInteractive:false});`,
  '@/hooks/useNativeCamera': `export const compressToJpeg=async f=>f;export const useNativeCamera=()=>({photos:[],reset(){}});`,
  '@/hooks/useReportPermissions': `export const useReportPermissions=()=>({});`,
  '../hooks/useUpvotes': `export const useUpvote=()=>({handleUpvote:async(id,count,active)=>({success:true,newUpvotes:count+(active?-1:1),newUserHasUpvoted:!active})});`,
  '@/hooks/useCityIdFromLocation': `export const useCityIdFromLocation=()=>({resolveCityIdFromLocation:async()=>64,resetCityCache(){},getResolvedNeighborhood:()=>null});`,
  '@/hooks/useReportMapTrees': `export const useReportMapTrees=()=>({trees:[]});`,
  '@/lib/reverseGeocodePin': `export const reverseGeocodePin=async()=>({address:'Rua do Centro, Floresta',city:'Floresta',state_uf:'PE'});`,
  '@/lib/appError': `export const showAppError=error=>window.lastError=error;export const showAppInfo=()=>{};export const showAppNotice=()=>{};`,
  '@/lib/nativeNotification': `export const notifyNative=async()=>{};`,
  '@/lib/shareUtils': `export const getReportShareUrl=id=>'https://example.test/bronca/'+id;`,
  '@/components/report/SugestaoDeCategoria': `export default function Suggestion(){return null}export const registrarEscolha=()=>{};`,
  '@/components/LocationPickerMap': `import React from 'react';export default function Map({onPositionChange,overlayMarkers=[],onOverlayMarkerSelect}){return <div className="h-full w-full bg-surface-subtle text-content-primary"><button type="button" onClick={()=>onPositionChange({lat:-8.6,lng:-38.5})}>Marcar local no mapa de teste</button>{overlayMarkers.map(marker=><button type="button" key={marker.id} data-pole-marker={marker.id} onClick={()=>onOverlayMarkerSelect(marker)}>Selecionar poste {marker.title}</button>)}</div>}`, 
  '@/lib/customSupabaseClient': `const report={id:'test-report',title:'Buraco na Rua do Centro',description:'O asfalto precisa de manutenção perto da praça.',category_id:'buracos',category:{name:'Buracos na Via'},status:'pending',moderation_status:'approved',protocol:'TROMB-TESTE-42',created_at:'2026-11-01T12:00:00Z',address:'Rua do Centro, Floresta',author:{name:'Ana Cidadã'},upvotes:[{count:12}],report_media:[],comments:[],timeline:[]};
    let pole=null;
    export const supabase={rpc:async(name,args)=>{if(name==='nearest_poles')return {data:pole&&(window.staleNearest||pole.lighting_status!=='removido')?[pole]:[]};if(name==='create_pending_pole'){pole={pole_id:window.otherPoleOwner?4456:4455,id:window.otherPoleOwner?4456:4455,created_by:window.otherPoleOwner?'other-account':'member',city_id:args.p_city_id,identifier:args.p_identifier,latitude:args.p_lat,longitude:args.p_lng,validation_status:'approved',lighting_status:'aceso'};return {data:pole}}return {data:null}},from(table){let patch=null,owner=null;const query={select(){return this},eq(field,value){if(field==='created_by')owner=value;return this},neq(){return this},not(){return this},or(){return this},in(){return this},match(){return this},order(){return this},limit(){return this},delete(){return this},insert(){return this},update(value){patch=value;return this},async maybeSingle(){if(table==='poles'&&patch){if(owner!==pole.created_by)return {data:null};window.removalRequests=(window.removalRequests||0)+1;if(window.failPoleRemoval)return {error:new Error('Sem permissão para remover')};pole={...pole,...patch};return {data:pole}}return {data:table==='poles'?(owner&&owner!==pole?.created_by?null:pole):table==='reports'?{...report,report_media:window.withMedia?[{id:'photo',type:'photo',url:'/photo.svg'}]:[]}:null}},then(resolve){return Promise.resolve({data:[],error:null}).then(resolve)}};return query}};`,
};
for (const name of ['VideoProcessor', 'CameraCapture', 'WebCameraCapture', 'MediaViewer', 'ReportDetails', 'LinkReportModal', 'DonationModal', 'MarkResolvedModal', 'DynamicSeo', 'report/ColaborarOuRegistrar', 'report/PoleNumberSearch', 'report/ReportTreePicker', 'report/ReportFlyerModal', 'report/ReportStoryModal', 'report/ReportUpdateModal']) stubs['@/components/' + name] = 'export default function Stub(){return null}';
// Leaf maps depend on tile services; the layout and address stay real.
stubs['react-leaflet'] = `import React from 'react';export const MapContainer=({children})=><div className="h-full bg-surface-subtle">{children}</div>;export const TileLayer=()=>null;export const Marker=()=>null;export const Popup=()=>null;export const useMap=()=>({});`;
await build({ stdin: { contents: `
  import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter,Routes,Route}from'react-router-dom';
  import ReportPage from '@/pages/ReportPage';import ReportModal from '@/components/ReportModal';import Notice from '@/components/ReportSubmissionNotice';
  Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok){ok({coords:{latitude:-8.6,longitude:-38.5}})}}});
  window.guest=new URLSearchParams(location.search).has('guest');window.withMedia=new URLSearchParams(location.search).has('media');window.admin=new URLSearchParams(location.search).has('admin');
  function App(){const[open,setOpen]=useState(false);window.openWizard=()=>setOpen(true);return <BrowserRouter><button id="open-wizard" className="min-h-12 p-4" onClick={()=>setOpen(true)}>Registrar bronca</button><Routes><Route path="/bronca/:reportId" element={<ReportPage/>}/><Route path="*" element={<p>Destino da navegação</p>}/></Routes>{open&&<ReportModal municipalMode={new URLSearchParams(location.search).has('municipal')} municipalCategoryIds={['buracos']} onClose={()=>setOpen(false)} onSubmit={async data=>{window.submitted=data;if(window.failSubmission)throw Error('Falha simulada. Tente novamente.');window.dispatchEvent(new CustomEvent('report-submitted',{detail:{id:'test-report',title:data.title,protocol:'TROMB-TESTE-42',published:false}}));return {notified:true}}}/>}<Notice/></BrowserRouter>};createRoot(document.getElementById('root')).render(<App/>);`, resolveDir: root, loader: 'jsx' }, bundle: true, loader: { '.png': 'dataurl', '.css': 'empty' }, outfile: path.join(out, 'preview.js'), format: 'iife', jsx: 'automatic', alias: { '@': path.join(root, 'src') }, define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' }, plugins: [{ name: 'fixtures', setup(b) { b.onResolve({ filter: /.*/ }, a => stubs[a.path] ? { path: a.path, namespace: 'fixture' } : undefined); b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: stubs[a.path], loader: 'jsx', resolveDir: root })); } }] });
let source = await fs.readFile('src/index.css', 'utf8');
source = await (async () => { for (const match of [...source.matchAll(/@import '(.+?)';/g)]) { if (match[1].startsWith('./')) source = source.replace(match[0], await fs.readFile(path.join(root, 'src', match[1]), 'utf8')); } return source; })();
const config = loadConfig(path.join(root, 'tailwind.config.js'));
const css = await postcss([tailwind({ ...config, content: ['src/components/report/*.jsx', 'src/components/ReportModal.jsx', 'src/components/ReportSubmissionNotice.jsx', 'src/components/ui/*.jsx', 'src/components/municipality/MunicipalRequesterFields.jsx', 'src/pages/ReportPage.jsx', 'src/design-system/primitives/*.jsx', { raw: Object.values(stubs).join('\n') + ' min-h-12 p-4', extension: 'jsx' }] })]).process(source, { from: 'src/index.css' });
await fs.writeFile(path.join(out, 'preview.css'), css.css);
const server = http.createServer(async (req, res) => {
  const resource = req.url.split('?')[0];
  if (['/preview.js', '/preview.css'].includes(resource)) { res.setHeader('Content-Type', resource.endsWith('.js') ? 'text/javascript' : 'text/css'); res.end(await fs.readFile(path.join(out, resource.slice(1)))); }
  else if (resource.startsWith('/fonts/')) { res.end(await fs.readFile(path.join(root, 'public', resource))); }
  else if (resource === '/photo.svg') { res.setHeader('Content-Type', 'image/svg+xml'); res.end('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500"><rect width="800" height="500" fill="#9aada4"/><path d="M0 500L250 0H550L800 500" fill="#66706d"/><ellipse cx="400" cy="380" rx="90" ry="35" fill="#333b3a"/></svg>'); }
  else { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/preview.css"></head><body><div id="root"></div><script src="/preview.js"></script></body></html>'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', '--user-data-dir=' + path.join(out, 'chrome-' + Date.now()), 'about:blank'], { windowsHide: true });
const profile = chrome.spawnargs.find(a => a.startsWith('--user-data-dir=')).slice(16), pause = ms => new Promise(r => setTimeout(r, ms));
let ws;
try {
  let endpoint;
  for (let i = 0; i < 150 && !endpoint; i++) { try { const [port, route] = (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).trim().split(/\r?\n/); endpoint = `ws://127.0.0.1:${port}${route}`; } catch { await pause(100); } }
  assert.ok(endpoint, 'Chrome não iniciou'); ws = new WebSocket(endpoint); await new Promise(r => ws.addEventListener('open', r, { once: true }));
  const pending = new Map(), errors = [], results = []; let sequence = 0;
  ws.addEventListener('message', event => { const m = JSON.parse(event.data); if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails); if (pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); } });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' }), { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Runtime.enable', {}, sessionId);
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result?.value; };
  const shot = async name => { await pause(300); const r = await send('Page.captureScreenshot', { format: 'png' }, sessionId); await fs.writeFile(path.join(out, name + '.png'), Buffer.from(r.data, 'base64')); };
  const wait = async expression => { for (let i = 0; i < 100; i++) { if (await evaluate(`Boolean(${expression})`)) return; await pause(50); } await shot('failure'); throw Error('Timeout: ' + expression + ' / ' + JSON.stringify(errors)); };
  const click = async label => { assert.ok(await evaluate(`(()=>{const scope=[...document.querySelectorAll('[role=dialog]')].filter(el=>el.getClientRects().length).at(-1)||document;const b=[...scope.querySelectorAll('button,a')].find(b=>(b.getAttribute('aria-label')||b.querySelector('[data-category-name]')?.textContent||b.textContent.trim())===${JSON.stringify(label)}&&b.getClientRects().length);if(!b)return false;b.focus();b.click();return true})()`), 'Controle ausente: ' + label); await pause(80); };
  const fill = (selector, value) => evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  const load = async query => { await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/bronca/test-report${query}` }, sessionId); await wait('document.querySelector(".report-participation")'); };
  const noOverflow = async () => assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'), 'Rolagem horizontal');
  if (process.argv.includes('--notice-only')) {
    for (const width of [360, 390, 430, 1440, 1920]) for (const theme of ['light', 'dark']) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
      await load(''); await evaluate(`document.documentElement.className=${JSON.stringify(theme)}`);
      await evaluate(`document.querySelector('#open-wizard').focus();window.dispatchEvent(new CustomEvent('report-submitted',{detail:{id:'test-report',title:'Iluminação precisa de atenção na Rua do Centro',protocol:'BR202611052',published:true}}))`);
      await wait('document.querySelector(".report-submission-notice")'); await pause(250);
      await noOverflow();
      assert.equal(await evaluate('document.activeElement.id'), 'open-wizard', 'Confirmação não rouba foco');
      const box = await evaluate('(()=>{const r=document.querySelector(".report-submission-notice").getBoundingClientRect();return {top:r.top,right:innerWidth-r.right,left:r.left,bottom:r.bottom,height:r.height}})()');
      assert.ok(box.top >= 68 && box.top < 80 && box.bottom < 796, 'Abaixo do cabeçalho e acima da navegação');
      assert.ok(box.height <= 210, 'Confirmação compacta');
      assert.ok(box.left >= 12 && box.right >= 12 && box.right <= 64, 'Margens externas');
      assert.ok(await evaluate('document.querySelector(".report-notice-link").getBoundingClientRect().height>=48&&document.querySelector(".report-notice-close").getBoundingClientRect().height>=48'));
      await shot(`notice-${width}-${theme}`);
      await click('Ver bronca'); await wait('!document.querySelector(".report-submission-notice")');
      await evaluate(`window.dispatchEvent(new CustomEvent('report-submitted',{detail:{id:'test-report',title:'Relato recebido para análise',protocol:'BR202611052',published:false}}))`);
      await wait('document.querySelector(".report-submission-notice")');
      assert.equal(await evaluate('document.querySelector(".report-submission-notice a").getAttribute("href")'), '/perfil');
      await shot(`notice-pending-${width}-${theme}`);
      await click('Fechar confirmação de envio'); await wait('!document.querySelector(".report-submission-notice")');
      results.push({ width, theme, notice: true, published: true, pending: true, close: true });
    }
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 700, deviceScaleFactor: 1, mobile: false }, sessionId);
    await load(''); await evaluate(`document.documentElement.style.setProperty('--header-safe-top','32px');window.dispatchEvent(new CustomEvent('report-submitted',{detail:{id:'test-report',published:false,anonymous:true,protocol:'BR202611052'}}))`);
    await wait('document.querySelector(".report-submission-notice")'); await pause(250);
    assert.ok(await evaluate('document.querySelector(".report-submission-notice").getBoundingClientRect().top>=100'), 'Respeita área segura');
    assert.equal(await evaluate('!!document.querySelector(".report-submission-notice a")'), false);
    await evaluate('document.documentElement.style.fontSize="200%"'); await noOverflow();
    assert.ok(await evaluate('document.querySelector(".report-submission-notice").scrollWidth<=document.querySelector(".report-submission-notice").clientWidth'), 'Sem corte horizontal com fonte ampliada');
    await shot('notice-font200-safe-area');
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId);
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".report-submission-notice")).animationName'), 'none');
    await click('Fechar confirmação de envio');
  } else {
  for (const width of [360, 390, 430, 1440, 1920]) for (const theme of ['light', 'dark']) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await load(''); await evaluate(`document.documentElement.className=${JSON.stringify(theme)}`);
    await noOverflow();
    if (width >= 1200) assert.ok(await evaluate('(()=>{const r=document.querySelector(".report-detail-grid").getBoundingClientRect();return r.left<=64&&innerWidth-r.right<=64})()'), 'Margens externas');
    assert.equal(await evaluate('document.querySelector(".report-detail-main img")!==null'), false, 'Sem capa vazia');
    await click('Apoiar bronca'); await wait('document.querySelector(".report-support-button[aria-pressed=true]")'); await click('Apoiado');
    await click('Salvar'); await wait('document.querySelector(".report-secondary-actions [aria-pressed=true]")');
    await shot(`detail-${width}-${theme}`);
    await click('Registrar bronca'); await wait('document.querySelector(".report-wizard-dialog")');
    await pause(350);
    assert.ok(await evaluate('(()=>{const buttons=[...document.querySelectorAll(".report-wizard-actions button")];const a=buttons[0].getBoundingClientRect(),b=buttons[1].getBoundingClientRect();return Math.abs(a.top-b.top)<2&&a.height>=48&&b.height>=48})()'), 'Ações lado a lado com alvo de toque confortável');
    await shot(`wizard-${width}-${theme}`); await click('Continuar');
    assert.equal(await evaluate('document.activeElement.id'), 'report-title');
    await fill('#report-title', 'Buraco perto da praça'); await click('Buracos na Via'); await click('Continuar');
    await wait('document.querySelector("[aria-current=step]").textContent.includes("Local")');
    assert.ok(await evaluate(`document.activeElement===document.querySelector('[role=group][aria-labelledby^=report-step-label]')`));
    await wait('document.querySelector("[data-error-field=address]")'); await fill('[data-error-field=address]', 'Rua do Centro, Floresta');
    await click('Continuar'); await wait('document.querySelector("[data-error-field=photos]")'); await click('Enviar bronca');
    assert.equal(await evaluate('document.querySelector("#report-step-label-2").textContent'), 'Evidências');
    assert.equal(await evaluate('!!document.querySelector(".report-review")'), false);
    assert.equal(await evaluate('window.submitted===undefined'), true, 'Exige evidência antes de enviar');
    await evaluate(`(async()=>{const canvas=document.createElement('canvas');canvas.width=120;canvas.height=80;const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));const files=new DataTransfer();files.items.add(new File([blob],'foto.png',{type:'image/png'}));const input=document.querySelector('input[type=file][accept*="image"]');input.files=files.files;input.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    await wait(`document.querySelector('[aria-label="Remover foto"]')`);
    await click('Voltar'); await click('Voltar'); await wait('document.querySelector("#report-title")');
    assert.equal(await evaluate('document.querySelector("#report-title").value'), 'Buraco perto da praça');
    await click('Continuar'); await click('Continuar'); await wait('document.querySelector("[data-error-field=photos]")');
    assert.ok(await evaluate('(()=>{const buttons=[...document.querySelectorAll(".report-wizard-actions button")];return Math.abs(buttons[0].getBoundingClientRect().top-buttons[1].getBoundingClientRect().top)<2})()'), 'Voltar e enviar lado a lado: ' + JSON.stringify(await evaluate('document.querySelector(".report-wizard-actions").innerHTML')));
    await shot(`evidence-${width}-${theme}`); await noOverflow();
    await evaluate('window.failSubmission=true'); await click('Enviar bronca'); await wait('window.lastError');
    assert.ok(await evaluate(`!!document.querySelector('[aria-label="Remover foto"]')`), 'Falha preserva anexos');
    await evaluate('window.failSubmission=false'); await click('Enviar bronca'); await wait('!document.querySelector(".report-wizard-dialog")');
    await wait('document.querySelector(".report-submission-notice")');
    assert.ok(await evaluate('document.querySelector(".report-submission-notice").textContent.includes("TROMB-TESTE-42")'));
    assert.equal(await evaluate('document.querySelector(".report-submission-notice a").getAttribute("href")'), '/perfil');
    await shot(`receipt-${width}-${theme}`); results.push({ width, theme, detail: true, validation: true, evidence: true, retry: true, receipt: true });
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 700, deviceScaleFactor: 1, mobile: false }, sessionId);
  await load('?media'); await wait(`document.querySelector('[aria-label="Ampliar foto da bronca"]')`); await evaluate('document.documentElement.style.fontSize="200%"'); await noOverflow(); await shot('detail-font200');
  await click('Registrar bronca'); await noOverflow(); await shot('wizard-font200');
  await click('Fechar modal');
  await load(''); await click('Registrar bronca');
  await evaluate('document.querySelector(".report-wizard-footer button:last-child").focus()');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }, sessionId);
  assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'), 'Fechar modal');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sessionId);
  await wait('!document.querySelector(".report-wizard-dialog")');
  assert.equal(await evaluate('document.activeElement.id'), 'open-wizard', 'Devolve foco à origem');
  for (const payload of [{ id: 'test-report', title: 'Teste', published: true }, { id: 'test-report', published: false, anonymous: true }, { id: 'test-report', municipal: true, published: false }]) {
    await evaluate(`window.dispatchEvent(new CustomEvent('report-submitted',{detail:${JSON.stringify(payload)}}))`); await pause(80);
    if (payload.municipal) assert.equal(await evaluate('!!document.querySelector(".report-submission-notice")'), false);
    else if (payload.anonymous) assert.equal(await evaluate('!!document.querySelector(".report-submission-notice a")'), false);
    else assert.equal(await evaluate('document.querySelector(".report-submission-notice a").getAttribute("href")'), '/bronca/test-report');
  }
  await load(''); await click('Voltar'); await wait('location.pathname==="/mapa"');
  // O mesmo formulário institucional mantém evidência opcional e visibilidade interna.
  await load('?municipal'); await click('Registrar bronca');
  await fill('#report-title', 'Buraco perto da praça'); await click('Buracos na Via'); await click('Continuar');
  await fill('[data-error-field=address]', 'Rua do Centro, Floresta'); await click('Continuar');
  await wait('document.querySelector("[data-error-field=photos]")'); await shot('municipal-review-390');
  await click('Enviar solicitação'); await wait('!document.querySelector(".report-wizard-dialog")');
  assert.equal(await evaluate('window.submitted.is_public'), false);
  assert.equal(await evaluate('window.submitted.photos.length'), 0);
  for (const width of [390, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await load('?admin'); await click('Registrar bronca'); await fill('#report-title', 'Poste de teste'); await click('Iluminação');
    await evaluate(`(()=>{const el=document.querySelector('[data-error-field="issue_type"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,el.options[1].value);el.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    await click('Continuar'); await wait(`document.querySelector('[data-error-field="pole_number"]')`);
    await fill('[data-error-field=pole_number]', 'TESTE-4455'); await click('Cadastrar poste no mapa');
    await wait(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Remover poste do mapa')`);
    await wait('document.querySelector("[data-pole-marker]")'); await shot(`own-pole-${width}`);
    await click('Remover poste do mapa'); await wait('document.querySelectorAll("[role=dialog]").length===2');
    await click('Cancelar'); assert.equal(await evaluate('window.removalRequests||0'), 0);
    await evaluate('window.failPoleRemoval=true'); await click('Remover poste do mapa'); await click('Remover poste');
    await wait('window.lastError'); assert.ok(await evaluate('!!document.querySelector("[data-pole-marker]")'), 'Falha preserva poste');
    await evaluate('window.failPoleRemoval=false;window.staleNearest=true'); await click('Remover poste do mapa'); await click('Remover poste');
    await wait('!document.querySelector("[data-pole-marker]")'); await pause(700);
    assert.equal(await evaluate('!!document.querySelector("[data-pole-marker]")'), false, 'Resposta antiga não recoloca o poste');
    assert.equal(await evaluate('document.querySelector("[data-error-field=pole_number]").value'), '');
    await click('Voltar'); assert.equal(await evaluate('document.querySelector("#report-title").value'), 'Poste de teste');
    await click('Continuar');
    await evaluate('window.otherPoleOwner=true;window.staleNearest=false');
    await fill('[data-error-field=pole_number]', 'POSTE-DE-OUTRA-CONTA'); await click('Cadastrar poste no mapa');
    await wait('document.querySelector("[data-pole-marker]")'); await pause(150);
    assert.equal(await evaluate(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Remover poste do mapa')`), false, 'Sem remoção de poste de outra conta');
    results.push({ width, poleRemoval: true, ownAccountOnly: true, cancel: true, failure: true, staleResponse: true });
  }
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify({ scenarios: results, font200: true, keyboardFocus: true, noticeStates: true }, null, 2));
  console.log(JSON.stringify({ out, scenarios: results.length, font200: true, keyboardFocus: true, noticeStates: true }));
} finally {
  if (ws) { try { ws.send(JSON.stringify({ id: 99999, method: 'Browser.close' })); } catch {} ws.close(); }
  chrome.kill(); await new Promise(resolve => server.close(resolve));
}
