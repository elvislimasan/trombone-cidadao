// Real components, local fixtures and Chrome; no credentials or remote writes.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import loadConfig from 'tailwindcss/loadConfig.js';
import { runLegislativeLayoutScenarios } from './legislative-layout-scenarios.mjs';

const root = process.cwd(), out = path.resolve('.tmp/legislative-ui');await fs.mkdir(out, { recursive: true });
const personId = '20000000-0000-4000-8000-000000000001';
const source = { id: '30000000-0000-4000-8000-000000000001', city_id: 64, name: 'Câmara Municipal de Floresta', url: 'https://sapl.floresta.pe.leg.br', base_url: 'https://sapl.floresta.pe.leg.br', first_year: 2025, published_at: new Date().toISOString(), collected_at: new Date().toISOString(), run_id: 'run', daily_enabled: false, auto_publish: false, published_run_id: null };
const matter = i => ({ id: i, data: { number: i, year: 2025, presented_on: '2025-02-01', summary: `Matéria ${i}: serviço público e transparência para a população de Floresta.`, document_url: 'https://sapl.floresta.pe.leg.br/media/doc.pdf' }, type_data: { name: 'Pedido de Providência', abbreviation: 'PPROV' }, source_url: `https://sapl.floresta.pe.leg.br/materia/${i}`, hash: 'version-1', authors: [{ id: 11, name: 'Pessoa de teste', councilor_id: personId, parliamentarian_id: 1, slug: 'pessoa-de-teste' }] });
const data = { state: 'ready', source, matters: Array.from({ length: 25 }, (_, i) => matter(i + 1)), metrics: { matters: 25, normative: 2, requests: 23, classified: 3, honorary: 1 }, distribution: [{ id: 21, name: 'Pedido de Providência', abbreviation: 'PPROV', total: 23 }], types: [{ id: 21, data: { name: 'Pedido de Providência' } }], councilors: [{ id: personId, name: 'Pessoa de teste', slug: 'pessoa-de-teste' }], parliamentarians: [{ id: 1, data: { name: 'Pessoa de teste', parliamentary_name: 'Pessoa', active: true }, councilor: { id: personId, name: 'Pessoa de teste', slug: 'pessoa-de-teste' }, source_url: 'https://sapl.floresta.pe.leg.br/parlamentar/1' }], proceedings: [{ id: 1, data: { date: '2025-02-02', text: 'Encaminhado para avaliação.' }, status: 'Em análise', source_url: 'https://sapl.floresta.pe.leg.br/api/materia/tramitacao/1/' }], norms: [], ballots: [{ id: 1, data: { yes: 10, no: 0, abstentions: 0 }, result: 'Aprovado', session_id: 1, votes: [{ name: 'Pessoa', choice: 'Sim', source_url: 'https://sapl.floresta.pe.leg.br/api/sessao/votoparlamentar/1/' }] }], sessions: [{ id: 1, data: { date: '2025-02-01', label: '1ª Sessão Ordinária' }, source_url: 'https://sapl.floresta.pe.leg.br/sessao/1' }], attendance: [{ name: 'Pessoa', source_url: 'https://sapl.floresta.pe.leg.br/api/sessao/sessaoplenariapresenca/1/' }], groups: [{ location_key: 'rua de teste', location: 'Rua de teste', service: 'poda', total: 3, first_date: '2025-02-01', last_date: '2025-02-03', matters: [1, 2, 3].map(id => ({ id, number: id, year: 2025 })) }] };
data.recurrences = data.groups;
data.groups = { melhorias: 23, cobrancas: 0, homenagens: 1, leis: 1, outros: 0 };
data.classification = { reviewed: 0, automatic: 25, method: 'regras-1' };
data.matters.forEach((m,i) => {m.data.group_key=i===0?'leis':i===1?'homenagens':'melhorias';m.data.group_method='regras-1';if(i===2||i===3)m.data.summary+=' Rua S\u00e3o Jos\u00e9, bairro Tr\u00eas Marias.';});
data.related = [{ id: '40000000-0000-4000-8000-000000000001', kind: 'report', title: 'Bronca TC-001', href: '/bronca/20000000-0000-4000-8000-000000000001', status: 'resolved', note: 'Vínculo conferido pelo endereço e pelo documento.' }];
const fixtureCode = `
window.fixture=${JSON.stringify(data)};window.calls=[];
export const supabase={functions:{invoke:async(name,args)=>({data:{run_id:'run',pages:1}})},async rpc(name,args){window.calls.push({name,args});await new Promise(r=>setTimeout(r,10));if(window.failLoad)return {error:{code:'network',message:'offline'}};
 const f=window.fixture;if(name==='legislative_admin')return {data:{state:'ready',source:f.source,runs:[{id:'run',status:window.published?'published':'ready',started_at:new Date().toISOString(),summary:{matters:25,quality:{blocked:!!window.qualityBlocked,reviewed:!!window.qualityReviewed,issues:window.qualityBlocked?[{kind:'attendance',missing:1,before:10,after:9}]:[]}}}],jobs:[{id:'job',resource_key:'matters-2025',received:25,expected_total:25,status:'done'}],parliamentarians:f.parliamentarians.map(p=>({...p,link:window.bound?{councilor_id:'${personId}'}:null})),councilors:f.councilors,corrections:[]}};
 if(name==='legislative_decide'){if(args.p_action==='publish')window.published=true;if(args.p_action==='bind')window.bound=true;return {data:{saved:true}};}
 if(name==='legislative_review_collection'){window.qualityReviewed=true;return {data:null};}
 if(name==='legislative_report_error')return {data:'correction'};
 if(name==='legislative_activity'||name==='legislative_parliamentarian_activity')return {data:{state:'ready',votes:{total:1,items:[{id:1,choice:'Sim',date:'2025-02-01',session_id:1,source_url:'https://sapl.floresta.pe.leg.br/api/sessao/votoparlamentar/1/'}]},attendance:{total:1,items:[{session_id:1,date:'2025-02-01',label:'1ª Sessão Ordinária'}]},agenda_attendance:{total:1}}};
 if(args.p_city!==64)return {data:{state:'unconfigured'}};
 if(location.search.includes('pending'))return {data:{state:'pending',source:f.source}};
 let rows=f.matters;const filters=args.p_filters||{};if(filters.search)rows=rows.filter(m=>m.data.summary.toLowerCase().includes(filters.search.toLowerCase()));if(filters.group_key)rows=rows.filter(m=>m.data.group_key===filters.group_key);if(filters.territory)rows=rows.filter(m=>m.data.summary.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(filters.territory.toLowerCase()));const page=filters.page||1;
 const result={...f,total:rows.length,page,page_size:20,matters:rows.slice((page-1)*20,page*20)};
 if(args.p_view==='parliamentarian'){result.parliamentarian={...f.parliamentarians[0],councilor:null,author_ids:[11]};}
 if(args.p_view!=='directory')result.parliamentarians=f.parliamentarians.map(p=>({id:p.id,name:p.data.parliamentary_name,active:true}));
 if(args.p_view==='matter'){result.matter=f.matters.find(m=>m.id===filters.id);if(!result.matter)return {data:{state:'missing'}};}
 if(args.p_view==='session'){result.session=f.sessions[0];result.agenda=[{id:1,data:{order:1},section:'Ordem do dia',matter:f.matters[0]}];}
 if(args.p_view==='sessions')result.total=1;
 if(args.p_view==='recurrences'){result.groups=f.recurrences;result.total=1;}
 return {data:result};}};
`;
await build({ stdin: { contents: `
 import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter,Routes,Route} from 'react-router-dom';
 import LegislativePage from '@/pages/LegislativePage';import Admin from '@/pages/admin/ManageLegislativePage';import Overview from '@/components/councilor/CouncilorLegislativeOverview';
 createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={[location.pathname+location.search]}><Routes>
 <Route path='/camara/:cityId' element={<LegislativePage/>}/><Route path='/camara/:cityId/materias' element={<LegislativePage view='matters'/>}/><Route path='/camara/:cityId/materias/:matterId' element={<LegislativePage view='matter'/>}/><Route path='/camara/:cityId/vereadores/:parliamentarianId' element={<LegislativePage view='parliamentarian'/>}/><Route path='/camara/:cityId/vereadores' element={<LegislativePage view='directory'/>}/><Route path='/camara/:cityId/sessoes' element={<LegislativePage view='sessions'/>}/><Route path='/camara/:cityId/sessoes/:sessionId' element={<LegislativePage view='session'/>}/><Route path='/camara/:cityId/demandas' element={<LegislativePage view='recurrences'/>}/><Route path='/admin/legislativo' element={<Admin/>}/><Route path='/vereadores/64/pessoa-de-teste' element={<main className='page-shell-fluid councilor-profile-shell'><Overview cityId={64} councilorId='${personId}'/></main>}/>
 </Routes></MemoryRouter>);
`, resolveDir: root, loader: 'jsx' }, bundle: true, jsx: 'automatic', outfile: path.join(out, 'preview.js'), alias: { '@': path.join(root, 'src') }, define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' }, plugins: [{ name: 'fixtures', setup(builder) {
  const mocks = { '@/lib/customSupabaseClient': fixtureCode, '@/contexts/CityContext': `export const useCity=()=>({activeCityId:64,cities:[{id:64,name:'Floresta',state:{uf:'PE'}},{id:65,name:'Recife',state:{uf:'PE'}}]});`, '@/contexts/SupabaseAuthContext': `export const useAuth=()=>({user:{id:'admin',is_admin:true}});` };
  builder.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: 'fixture' } : undefined);
  builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'jsx' }));
} }] });
let css = await fs.readFile('src/index.css', 'utf8');
for (const match of [...css.matchAll(/@import '(.+?)';/g)]) css = css.replace(match[0], await fs.readFile(path.join(root, 'src', match[1]), 'utf8'));
css += '\n' + await fs.readFile(path.join(out, 'preview.css'), 'utf8');
const config = loadConfig(path.join(root, 'tailwind.config.js'));
const compiled = await postcss([tailwind({ ...config, content: ['src/components/legislative/*.jsx', 'src/pages/LegislativePage.jsx', 'src/pages/admin/ManageLegislativePage.jsx', 'src/components/councilor/CouncilorLegislativeOverview.jsx', 'src/components/ui/*.jsx'] })]).process(css, { from: 'src/index.css' });
await fs.writeFile(path.join(out, 'preview.css'), compiled.css);
const server = http.createServer(async (req, res) => { const file = req.url.split('?')[0];if (['/preview.js', '/preview.css'].includes(file)) { res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'text/css');res.end(await fs.readFile(path.join(out, file.slice(1)))); } else { res.setHeader('Content-Type', 'text/html');res.end('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/preview.css"></head><body><div id="root"></div><script src="/preview.js"></script></body></html>'); } });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = path.join(out, `chrome-${Date.now()}`);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--disable-extensions', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));let ws;
try {
  let endpoint;for (let i = 0; i < 120 && !endpoint; i++) { try { const [port, route] = (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).trim().split(/\r?\n/);endpoint = `ws://127.0.0.1:${port}${route}`; } catch { await pause(100); } }
  assert.ok(endpoint);ws = new WebSocket(endpoint);await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let id = 0;const pending = new Map(), errors = [];
  ws.addEventListener('message', event => { const result = JSON.parse(event.data);if (result.method === 'Runtime.exceptionThrown') errors.push(result.params.exceptionDetails);if (result.id) { const task = pending.get(result.id);pending.delete(result.id);result.error ? task.reject(Error(result.error.message+' ['+task.method+'] '+(task.expression||''))) : task.resolve(result.result); } });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const next = ++id;pending.set(next, { resolve, reject, method, expression: params.expression?.slice(0,600) });ws.send(JSON.stringify({ id: next, method, params, sessionId })); });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });await send('Runtime.enable', {}, sessionId);await send('Page.enable', {}, sessionId);
  const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));return result.result.value; };
  const wait = async expression => { for (let i = 0; i < 100; i++) { if (await evaluate(`Boolean(${expression})`)) return;await pause(100); }throw Error(`Timeout ${expression}: ${await evaluate('document.body.innerText')} Errors: ${JSON.stringify(errors)}`); };
  let activeTheme = 'light';
  const setTheme = value => { activeTheme = value; };
  const navigate = async url => { await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}${url}` }, sessionId);await wait('window.fixture');await evaluate(`document.documentElement.classList.toggle('dark',${activeTheme === 'dark'})`); };
  const nativeClick = async expression => {
    const read = scroll => evaluate(`(()=>{const el=${expression};if(!el||el.disabled)throw Error('Missing or disabled action');${scroll ? "el.scrollIntoView({block:'nearest',inline:'nearest'});" : ''}const r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,visible:r.width>0&&r.height>0&&r.top>=-2&&r.bottom<=innerHeight+2}})()`);
    let box = await read(true);
    for(let attempt=0;attempt<30;attempt++){await pause(35);const next=await read(false);if(next.visible&&Math.abs(next.x-box.x)<1&&Math.abs(next.y-box.y)<1){box=next;break;}box=next;}
    if(!box.visible)throw Error('Action is outside the viewport: '+expression+' '+JSON.stringify(box)+' '+await evaluate('JSON.stringify({scrollY,height:innerHeight,body:document.body.getAttribute(\"style\")})'));
    const point={x:box.x,y:box.y};
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',...point},sessionId);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point},sessionId);
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point},sessionId);
  };
  const clickSelector = selector => nativeClick(`document.querySelector(${JSON.stringify(selector)})`);
  const click = text => nativeClick(`[...document.querySelectorAll('button,a,summary,[role^=menuitem]')].find(el=>el.textContent.trim()===${JSON.stringify(text)}&&el.getClientRects().length&&el.getBoundingClientRect().height>0&&!el.closest('[aria-hidden="true"],[role="dialog"][data-state="closed"],[role="menu"][data-state="closed"]'))`);
  const input = (selector, value) => evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  const screenshot = async name => { await pause(100);const result = await send('Page.captureScreenshot', { format: 'png' }, sessionId);await fs.writeFile(path.join(out, name + '.png'), Buffer.from(result.data, 'base64')); };
  const scenarios = await runLegislativeLayoutScenarios({ send, sessionId, navigate, evaluate, wait, input, click, clickSelector, screenshot, setTheme, pause });
  assert.deepEqual(errors, []);console.log(JSON.stringify({ scenarios, runtimeErrors: errors.length, artifacts: out }));
} finally { ws?.close();chrome.kill();server.close(); }
