// Perfil, contribuições e acompanhamento reais; sessão, serviços e modais auxiliares simulados.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import loadConfig from 'tailwindcss/loadConfig.js';

const root=process.cwd(),out=path.join(root,'.tmp/personal-journeys-ui');await fs.mkdir(out,{recursive:true});
const stubs={
  "@/contexts/SupabaseAuthContext": "import {useSyncExternalStore} from 'react';const members={member:{id:'member',name:'Ana Cidadã da Comunidade',username:'ana',avatar_type:'url',avatar_url:'/photo.svg',public_bio:'Participo para cuidar da minha cidade.',public_profile_enabled:true},admin:{id:'admin',name:'Gestora da comunidade',is_admin:true,is_ambassador:true}};let role=new URLSearchParams(location.search).get('role')||'member';const listeners=new Set();window.setRole=value=>{role=value;for(const listener of listeners)listener()};export const useAuth=()=>{useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn)},()=>role);return {user:members[role]||null,loading:false,refreshUserProfile:async()=>{}}};",
  "@/contexts/CityContext": "export const useCity=()=>({activeCityId:64,setActiveCity(){}});",
  "@/contexts/NotificationContext": "export const useNotifications=()=>({notificationsEnabled:false,pushEnabled:false});",
  "@/components/EditProfileModal": "import React from 'react';export default function Edit({onClose}){return <div role=\"dialog\" aria-label=\"Editar perfil\"><button onClick={onClose}>Fechar edição</button></div>}",
  "@/components/ReportModal": "import React from 'react';export default function Form({onClose}){return <div role=\"dialog\" aria-label=\"Registrar bronca\"><button onClick={onClose}>Fechar registro</button></div>}",
  "@/components/ReportDetails": `import React from 'react';export default function Details({report,onClose}){return <div role="dialog" aria-label="Detalhes da bronca"><p>{report.title}</p><button onClick={onClose}>Fechar detalhe</button></div>}`,
  "@/components/SuggestedProfiles": "export default function Suggested(){return null}",
  "../hooks/useUpvotes": "export const useUpvote=()=>({handleUpvote:async()=>({})});",
  "@/lib/appError": "export const showAppError=error=>window.lastAppError=error;",
  "@/lib/customSupabaseClient": "const reports=[{id:'r1',title:'Iluminação na Rua do Centro',description:'O poste está apagado perto da praça.',category_id:'iluminacao',category:{name:'Iluminação',icon:'💡'},created_at:'2026-11-01T12:00:00Z',status:'pending',moderation_status:'approved',address:'Rua do Centro, Floresta',upvotes:[{count:12}],comments:[],report_media:[{type:'photo',url:'/photo.svg'}],views:29},{id:'r2',title:'Limpeza da praça do bairro',description:'Acompanhe o cuidado com os espaços públicos.',category_id:'limpeza',category:{name:'Limpeza',icon:'🧹'},created_at:'2026-11-02T12:00:00Z',status:'resolved',moderation_status:'approved',address:'Praça do Centro',upvotes:[{count:2}],comments:[],report_media:[],views:10}];const updates=[{id:'n1',report_id:'r1',message:'Sua bronca recebeu uma resposta da equipe responsável.',created_at:'2026-11-05T12:00:00Z'},{id:'n2',report_id:'r2',message:'A comunidade registrou uma atualização no relato da praça.',created_at:'2026-11-04T12:00:00Z'}];\n    export const supabase={auth:{getUser:async()=>({data:{user:{id:'member'}}})},rpc:async name=>({data:name==='get_public_profile_follow_state'?{followers_count:4,following_count:2}:name==='get_following_activity'?{items:[],total:0}:name==='get_my_following_profiles'?[{id:'p1',name:'Maria da comunidade',username:'maria'}]:null}),from(table){const filters={};let isUpdate=false,isHead=false;const q={select(columns,options){isHead=Boolean(options?.head);return this},eq(key,value){filters[key]=value;return this},neq(){return this},not(){return this},in(){return this},or(){return this},order(){return this},limit(){return this},range(){return this},abortSignal(){return this},update(){isUpdate=true;return this},then(resolve,reject){const mode=window.dataMode||new URLSearchParams(location.search).get('data');const source=mode==='many'?Array.from({length:31},(_,i)=>({...reports[i%2],id:'row-'+i})):reports;const result=isHead&&mode!=='error'?{data:null,count:table==='reports'?source.length:table==='favorite_reports'?2:table==='community_trees'?3:1}:isUpdate?{data:null,error:null}:mode==='error'?{error:{message:'Rede indisponível'}}:{data:mode==='empty'?[]:table==='notifications'?updates:table==='reports'?source:table==='favorite_reports'?reports.filter(r=>!filters['report.status']||r.status===filters['report.status']).map(report=>({report_id:report.id,report})):table==='comments'?[{id:'c1',text:'A comunidade está acompanhando.',created_at:'2026-11-03T12:00:00Z',moderation_status:'approved',report:{title:reports[0].title}}]:[],count:2};window.lastQuery={table,filters};return Promise.resolve(result).then(resolve,reject)}};return q}};"
};
await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter,Routes,Route,useNavigate,useLocation}from'react-router-dom';import Profile from '@/pages/ProfilePage';import Following from '@/pages/FollowingActivityPage';\nfunction App(){const navigate=useNavigate(),location=useLocation();window.go=path=>navigate(path);window.route=location.pathname+location.search;return <><Routes><Route path=\"/perfil\" element={<Profile/>}/><Route path=\"/seguindo\" element={<Following/>}/><Route path=\"*\" element={<p data-destination>{location.pathname}</p>}/></Routes></>};createRoot(document.getElementById('root')).render(<BrowserRouter><App/></BrowserRouter>);",resolveDir:root,loader:'jsx'},bundle:true,outfile:path.join(out,'preview.js'),format:'iife',jsx:'automatic',alias:{'@':path.join(root,'src')},define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{}'},plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>stubs[a.path]?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:stubs[a.path],loader:'jsx',resolveDir:root}))}}]});
let source=await fs.readFile('src/index.css','utf8');for(const match of [...source.matchAll(/@import '(.+?)';/g)])if(match[1].startsWith('./'))source=source.replace(match[0],await fs.readFile(path.join(root,'src',match[1]),'utf8'));
const config=loadConfig(path.join(root,'tailwind.config.js'));const css=await postcss([tailwind({...config,content:['src/pages/ProfilePage.jsx','src/pages/UserDashboardPage.jsx','src/pages/FollowingActivityPage.jsx','src/components/PersonalUpdates.jsx','src/components/SavedReports.jsx','src/components/FollowingPeople.jsx','src/components/journeys/*.jsx','src/components/ui/*.jsx','src/design-system/primitives/*.jsx']})]).process(source,{from:'src/index.css'});await fs.writeFile(path.join(out,'preview.css'),css.css);
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
  const click = async label => { assert.ok(await evaluate(`(()=>{const scope=[...document.querySelectorAll('[role=dialog]')].filter(el=>el.getClientRects().length).at(-1)||document;const b=[...scope.querySelectorAll('button,a')].find(b=>(b.querySelector('.personal-journey-copy strong')?.textContent||b.getAttribute('aria-label')||b.textContent.trim())===${JSON.stringify(label)}&&b.getClientRects().length);if(!b)return false;b.focus();b.click();return true})()`), 'Controle ausente: ' + label); await pause(80); };
  const fill = (selector, value) => evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  const noOverflow=async()=>assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Rolagem horizontal');
  const load=async(route)=>{await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}${route}`},sessionId);await wait('window.go&&document.querySelector("main")');await pause(300)};
  const tab=async label=>{await evaluate(`(()=>{const el=[...document.querySelectorAll('[role=tab]')].find(el=>el.textContent.trim()===${JSON.stringify(label)});el.focus();el.click()})()`);await pause(150)};
  const setMode=async mode=>evaluate(`window.dataMode=${JSON.stringify(mode)}`);
  for(const width of [360,390,430,1440,1920])for(const theme of ['light','dark']){
    await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false},sessionId);
    await load('/perfil');await evaluate(`document.documentElement.className=${JSON.stringify(theme)}`);await wait('document.querySelector(".profile-report-gallery")');await noOverflow();
    await wait('document.querySelector(".personal-journey-count").textContent.includes("2 broncas")');
    assert.ok(await evaluate('document.querySelector(".personal-journeys").textContent.includes("3 árvores")&&document.querySelector(".personal-journeys").textContent.includes("1 pedido")'));
    assert.equal(await evaluate('!!document.querySelector(".personal-journey-badge")'),false,'Sem tag vermelha');
    assert.equal(await evaluate('!!document.querySelector("[role=tablist]")'),false,'Perfil sem abas');
    assert.ok(await evaluate('document.querySelector(".personal-journeys a[href*=adoteumaarvore]").getAttribute("href").includes("cidade=64")'));
    assert.equal(await evaluate('!!document.querySelector(".personal-stats")'),false);
    assert.equal(await evaluate('[...document.querySelectorAll("button")].some(b=>b.textContent.trim()==="Nova bronca")'),false);
    await wait('document.querySelectorAll(".profile-report-tile").length===2');
    await evaluate('document.querySelector(".personal-profile-controls summary").click()');await click('Meus comentários');await wait('location.search.includes("tab=comments")');assert.ok(await evaluate('document.body.textContent.includes("A comunidade está acompanhando.")'));
    await click('Ver minhas broncas');await evaluate('document.querySelector(".personal-profile-controls summary").click()');await shot(`profile-${width}-${theme}`);
    await fill('.personal-gallery-search input','limpeza');await wait('document.querySelectorAll(".profile-report-tile").length===1');
    await fill('.personal-gallery-search input','');await wait('document.querySelectorAll(".profile-report-tile").length===2');
    await evaluate('document.querySelector(".profile-report-open").click()');await wait('document.querySelector("[role=dialog]")');await click('Fechar detalhe');
    await click('Minhas broncas');await wait('document.activeElement.id==="minhas-contribuicoes"');
    await evaluate('document.querySelector(".personal-profile-controls summary").click()');await click('Editar perfil');await wait('document.querySelector("[role=dialog]")');await click('Fechar edição');
    if(width>=1200)assert.ok(await evaluate('(()=>{const box=document.querySelector(".personal-profile-page").getBoundingClientRect();return box.left<=64&&innerWidth-box.right<=64})()'));
    await load('/seguindo?cidade=64');await evaluate(`document.documentElement.className=${JSON.stringify(theme)}`);await wait('document.querySelector(".personal-updates-list a")');await noOverflow();
    assert.equal(await evaluate('document.querySelector("[role=tab][data-state=active]").textContent.trim()'),'Novidades');await shot(`following-updates-${width}-${theme}`);
    await tab('Salvas');await wait('document.querySelector(".saved-reports-grid a")');assert.ok(await evaluate('location.search.includes("cidade=64")&&location.search.includes("aba=broncas")'));
    await click('Resolvidas');await wait('document.querySelectorAll(".saved-reports-grid a").length===1');await shot(`following-saved-${width}-${theme}`);
    await tab('Pessoas');await wait('document.body.textContent.includes("Perfis seguidos")');await shot(`following-people-${width}-${theme}`);await noOverflow();
    if(width>=1200)assert.ok(await evaluate('(()=>{const box=document.querySelector(".following-page").getBoundingClientRect();return box.left<=64&&innerWidth-box.right<=64})()'));
    results.push({width,theme,profile:true,following:true,tabs:true,filters:true});
  }
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:false},sessionId);
  await load('/seguindo?data=empty');await wait('document.body.textContent.includes("Tudo em dia por aqui")');await shot('following-empty');
  await load('/seguindo?data=error');await wait('document.querySelector("[role=alert]")');await setMode('normal');await click('Tentar novamente');await wait('document.querySelector(".personal-updates-list a")');
  await load('/perfil?data=error');await wait('[...document.querySelectorAll("[role=alert] button")].some(button=>button.getClientRects().length)');await setMode('normal');await click('Tentar novamente');await wait('document.body.textContent.includes("Iluminação na Rua do Centro")');
  await load('/seguindo?role=guest&aba=pessoas&cidade=64');await click('Entrar para acompanhar');await wait('window.route.startsWith("/login")');assert.ok(await evaluate('history.state.usr.from.search.includes("aba=pessoas")&&history.state.usr.from.search.includes("cidade=64")'));
  await load('/perfil?role=admin');await evaluate('document.querySelector(".personal-profile-controls summary").click()');assert.ok(await evaluate(`!!document.querySelector('a[href="/admin"]')&&!!document.querySelector('a[href="/embaixador"]')`));
  await load('/perfil');await evaluate('document.querySelector(".personal-profile-controls summary").click()');assert.equal(await evaluate(`!!document.querySelector('a[href="/admin"]')`),false);
  await load('/perfil?data=many');await wait('document.querySelectorAll(".profile-report-tile").length===18');await shot('profile-many-390');
  await click('Próxima página');await wait('document.querySelectorAll(".profile-report-tile").length===13');await click('Página anterior');
  await evaluate('document.querySelector(".profile-report-options").focus()');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);
  await wait('document.querySelector("[role=menuitem]")');
  await evaluate(`[...document.querySelectorAll('[role=menuitem]')].find(el=>el.textContent.trim()==='Excluir bronca').click()`);
  await wait('document.querySelector("[role=dialog]")');await click('Cancelar');await wait('!document.querySelector("[role=dialog]")');
  for(const route of ['/perfil','/seguindo','/seguindo?aba=broncas']){await load(route);await evaluate('document.documentElement.style.fontSize="200%"');await pause(200);await noOverflow();await shot('font200-'+route.replace(/\W/g,'-'))}
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({out,scenarios:results.length,font200:true,errorsAndEmpty:true,authReturn:true,roleLinks:true}));
} finally {
  if (ws) { try { ws.send(JSON.stringify({ id: 99999, method: 'Browser.close' })); } catch {} ws.close(); }
  chrome.kill(); await new Promise(resolve => server.close(resolve));
}
