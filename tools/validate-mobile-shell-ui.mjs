// Shell real em Chrome, com sessão e dados simulados; não acessa produção.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import loadConfig from 'tailwindcss/loadConfig.js';

const root = process.cwd(), journeysPreview = process.argv.includes('--journeys'), out = path.join(root, journeysPreview ? '.tmp/civic-journeys-ui' : '.tmp/mobile-shell-ui');
await fs.mkdir(out, { recursive: true });
const stubs = {
  '@capacitor/core': `export const Capacitor={isNativePlatform:()=>true};`,
  '@capacitor/haptics': `export const Haptics={impact:async()=>{}};export const ImpactStyle={Light:'LIGHT'};`,
  '@/contexts/SupabaseAuthContext': `export const useAuth=()=>({user:window.member?{id:'preview-user',name:'Ana Cidadã'}:null});`,
  '@/hooks/usePermissions': `export const usePermissions=()=>({isMaster:false,planningCityIds:[],treeAssignments:[],canWrite:()=>false});`,
  '@/design-system/theme/ThemeProvider': `export const useTheme=()=>({resolved:'light',setPreference(){}});`,
  '../contexts/NotificationContext': `export const useNotifications=()=>({notificationsEnabled:false,toggleNotifications:async()=>{},loading:false});`,
  '@/components/feed/FeedCitySelector': `import React from 'react';import {MapPin} from 'lucide-react';export default function City(){return <button type="button" className="h-10 w-10" aria-label="Selecionar cidade"><MapPin size={20}/></button>;}`,
  '@/lib/customSupabaseClient': `export const supabase={from(){return {select(){return this},eq(){return this},limit(){return this},async maybeSingle(){return {data:null}},async single(){return {data:{site_name:'Trombone Cidadão',logo_url:'/logo.png'}}}}}};`,
  '@/components/Notifications': `import React from 'react';import {Button} from '@/components/ui/button';import {Bell} from 'lucide-react';export default function Notifications(){return <Button type="button" size="icon" variant="ghost" aria-label="Notificações" className="h-12 w-12 rounded-full"><Bell size={22}/></Button>;}`,
  '@/hooks/useCreateReport': `export const useCreateReport=()=>({createReport:async()=>{}});`,
  '@/components/ReportModal': `import React from 'react';export default function Report({onClose}){return <div role="dialog" aria-label="Registrar bronca"><button onClick={onClose}>Fechar registro</button></div>;}`,
  '@/contexts/CityContext': `export const useCity=()=>({activeCityId:64,activeCityName:'Floresta',activeCity:{id:64,name:'Floresta'}});`,
  '@/components/CitySelector': `import React from 'react';import {MapPin} from 'lucide-react';export default function City(){return <button type="button" className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-edge-subtle bg-surface-raised px-3 text-sm text-content-primary" aria-label="Cidade selecionada: Floresta"><MapPin size={16}/>Floresta</button>;}`,
  '@/hooks/useCityEvents': `const data={eventos:[],carregando:false,erro:null};export const useCityEvents=()=>data;`,
  '@/hooks/useUserLocation': `const data={coords:null,status:'idle',request(){window.locationRequests=(window.locationRequests||0)+1}};export const useUserLocation=()=>data;`,
  '@/hooks/useInfiniteScroll': `export const useInfiniteScroll=()=>null;`,
  '@/hooks/useFeedRealtime': `const data={newCount:0,resetNewCount(){}};export const useFeedRealtime=()=>data;`,
  '@/hooks/useSwipeTabs': `export const useSwipeTabs=()=>({});`,
  '@/hooks/useFeed': `const reports=[{id:'report-1',title:'Iluminação precisa de atenção na nossa rua',description:'Moradores acompanham a manutenção do poste no Centro.'},{id:'report-2',title:'Uma cidade melhor começa com a nossa participação',description:'Veja os relatos e apoie o que importa para seu bairro.'}];const data={loadingMore:false,hasMore:false,loadMore(){},refresh(){},toggleUpvote(){},error:null,isSlow:false,loadMoreError:null,isSlowMore:false};export const useFeed=()=>({...data,reports:window.feedState==='empty'?[]:reports,loading:window.feedState==='loading'});`,
  '@/components/FeedCard': `import React from 'react';import {Link} from 'react-router-dom';export default function Card({report}){return <article data-fixture-report className="rounded-2xl border border-edge-subtle bg-surface-raised p-5"><p className="text-sm text-content-secondary">Comunidade · Centro</p><h2 className="mt-3 text-xl font-bold text-content-primary">{report.title}</h2><p className="mt-2 text-sm text-content-secondary">{report.description}</p><Link className="mt-4 inline-flex min-h-12 items-center text-sm font-semibold text-brand" to={'/bronca/'+report.id}>Ver bronca</Link></article>;}`,
  '@/components/feed/FeedUpdateModal': `export default function Update(){return null;}`,
  '@/components/report/ReportStoryModal': `export default function Story(){return null;}`,
};
await build({
  stdin: { resolveDir: root, loader: 'jsx', contents: `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {BrowserRouter,Routes,Route,useNavigate,useLocation} from 'react-router-dom';
    import {NativeUIModeProvider,useNativeUIMode} from '@/contexts/NativeUIModeContext';
    import {MobileHeaderProvider} from '@/contexts/MobileHeaderContext';
    import Header from '@/components/Header';import CompactHeader from '@/components/MobileHeader';import BottomNav from '@/components/BottomNav';
    import {getMobileRoute} from '@/lib/mobileNavigation';
    import Feed from '@/pages/FeedPage';import Explore from '@/pages/ExplorePage';
    function Screen(){const location=useLocation();window.go=useNavigate();window.previewRoute=location.pathname;const {isInteractive}=useNativeUIMode();
      return <>{isInteractive?<CompactHeader/>:<Header/>}{${journeysPreview}?<div style={{paddingTop:'calc(var(--header-bar-height) + var(--header-safe-top))',paddingBottom:100}}><Routes><Route path="/feed" element={<Feed/>}/><Route path="/explorar" element={<Explore/>}/><Route path="*" element={<main className="page-shell-fluid py-5"><h1>{getMobileRoute(location.pathname).title}</h1></main>}/></Routes></div>:<main className="page-shell-fluid min-h-screen py-24"><h1>{getMobileRoute(location.pathname).title}</h1><p>Avaliação de cabeçalho, destinos ativos e menu hambúrguer.</p></main>}<BottomNav/></>}
    createRoot(document.getElementById('root')).render(<BrowserRouter><NativeUIModeProvider><MobileHeaderProvider><Screen/></MobileHeaderProvider></NativeUIModeProvider></BrowserRouter>);
  ` },
  bundle: true, jsx: 'automatic', outfile: path.join(out, 'preview.js'),
  alias: { '@': path.join(root, 'src') }, define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'fixtures', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => stubs[args.path] ? { path: args.path, namespace: 'fixture' } : undefined);
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'jsx', resolveDir: root }));
  } }],
});
let source = await fs.readFile('src/index.css', 'utf8');
for (const token of ['primitives', 'semantic', 'typography', 'motion']) source = source.replace(`@import './design-system/tokens/${token}.css';`, await fs.readFile(`src/design-system/tokens/${token}.css`, 'utf8'));
const config = loadConfig(path.join(root, 'tailwind.config.js'));
const css = await postcss([tailwind({ ...config, content: ['src/pages/FeedPage.jsx','src/pages/ExplorePage.jsx','src/components/feed/*.jsx','src/components/journeys/*.jsx','src/components/FeedEmptyState.jsx','src/components/Header.jsx', 'src/components/MobileHeader.jsx', 'src/components/BottomNav.jsx', 'src/components/ui/*.jsx', { raw: Object.values(stubs).join('\n')+' h-10 w-10 h-12 w-12 rounded-full page-shell-fluid min-h-screen py-24', extension: 'html' }] })]).process(source, { from: 'src/index.css' });
await fs.writeFile(path.join(out, 'preview.css'), css.css);
const server = http.createServer(async (req, res) => {
  const resource = req.url.split('?')[0];
  if (['/preview.js', '/preview.css'].includes(resource)) {
    res.setHeader('Content-Type', resource.endsWith('.js') ? 'text/javascript' : 'text/css');
    res.end(await fs.readFile(path.join(out, resource.slice(1))));
  } else if (resource === '/logo.png') { res.setHeader('Content-Type', 'image/png'); res.end(await fs.readFile('public/logo.png')); }
  else { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/preview.css"></head><body><div id="root"></div><script src="/preview.js"></script></body></html>'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = path.join(out, 'chrome-' + Date.now());
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws;
try {
  let endpoint;
  for (let attempt = 0; attempt < 150 && !endpoint; attempt++) {
    try { const [port, route] = (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).trim().split(/\r?\n/); endpoint = `ws://127.0.0.1:${port}${route}`; }
    catch { await pause(100); }
  }
  assert.ok(endpoint, 'Chrome não iniciou');
  ws = new WebSocket(endpoint);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let sequence = 0;
  const pending = new Map(), errors = [], results = [];
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (message.id && pending.has(message.id)) {
      const task = pending.get(message.id); pending.delete(message.id);
      message.error ? task.reject(Error(message.error.message)) : task.resolve(message.result);
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Runtime.enable', {}, sessionId);
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result?.value;
  };
  const wait = async expression => {
    for (let i = 0; i < 100; i++) { if (await evaluate(`Boolean(${expression})`)) return; await pause(50); }
    throw Error('Timeout: ' + expression + ' / ' + JSON.stringify(errors));
  };
  await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/mapa` }, sessionId);
  await wait('window.go && document.querySelector("header")');
  if (journeysPreview) {
    const enter = async route => {
      await evaluate(`window.go(${JSON.stringify(route)})`);
      await wait(`window.previewRoute===${JSON.stringify(route.split('?')[0])}`);
    };
    const clickText = async (selector, label) => {
      await evaluate(`(()=>{const target=[...document.querySelectorAll(${JSON.stringify(selector)})].find(el=>el.textContent.includes(${JSON.stringify(label)}));if(!target)throw Error('Ação não encontrada: '+${JSON.stringify(label)});target.click()})()`);
    };
    const searchFor = async value => {
      await evaluate(`(()=>{const field=document.querySelector('#explore-function-search');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,${JSON.stringify(value)});field.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await wait(`document.querySelector('#explore-function-search').value===${JSON.stringify(value)}`);
    };
    for (const width of [360, 390, 430, 1440, 1920]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
      for (const theme of ['light', 'dark']) {
        await evaluate(`document.documentElement.classList.toggle('dark',${theme === 'dark'});window.member=false;window.feedState='ready';window.scrollTo(0,0)`);
        await enter('/feed');
        await wait('document.querySelector("[data-testid=feed-welcome]") && document.querySelector("[data-fixture-report]")');
        assert.ok(await evaluate('!document.body.innerText.includes("Nível 12")&&!document.body.innerText.includes("3 disponíveis")'),'Progresso fictício no Início');
        assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Feed com overflow');
        assert.ok(await evaluate('document.querySelector("[data-fixture-report]").getBoundingClientRect().top<innerHeight'),'Conteúdo do feed ficou abaixo da primeira tela');
        assert.ok(await evaluate('!document.querySelector("[data-testid=feed-welcome] details").open'),'Ajuda não deve ocupar o topo automaticamente');
        await clickText('[data-testid=feed-welcome] summary','Primeira vez');
        assert.ok(await evaluate('document.querySelector("[data-testid=feed-welcome] details").open'));
        assert.equal(await evaluate('document.querySelectorAll("[data-testid=feed-welcome] ol li").length'),3);
        await clickText('[data-testid=feed-welcome] summary','Primeira vez');
        await clickText('[data-testid=feed-welcome] button','Registrar bronca');
        await wait('document.querySelector("[role=dialog]")');
        await evaluate('document.querySelector("[role=dialog] button").click()');
        await wait('!document.querySelector("[role=dialog]")');
        if (width >= 1200) assert.ok(await evaluate('(()=>{const box=document.querySelector("[data-testid=feed-welcome]").closest(".page-shell-fluid").getBoundingClientRect();return box.left<=64&&innerWidth-box.right<=64})()'),'Feed com margens externas excessivas');
        let shot=await send('Page.captureScreenshot',{format:'png'},sessionId);
        await fs.writeFile(path.join(out,`feed-${width}-${theme}.png`),Buffer.from(shot.data,'base64'));

        await enter('/explorar');
        await wait('document.querySelector("[data-testid=explore-journeys]")');
        assert.equal(await evaluate('document.querySelectorAll("#explore-actions .journey-action").length'),4,'Excesso de funções na abertura');
        assert.ok(await evaluate('document.querySelector("#explore-actions .journey-action").getBoundingClientRect().top<innerHeight-80'),'O próximo passo ficou abaixo da primeira tela');
        assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Explorar com overflow');
        if (width >= 1200) assert.ok(await evaluate('(()=>{const box=document.querySelector("[data-testid=explore-journeys]").getBoundingClientRect();return box.left<=64&&innerWidth-box.right<=64})()'),'Explorar com margens externas excessivas');
        shot=await send('Page.captureScreenshot',{format:'png'},sessionId);
        await fs.writeFile(path.join(out,`explorar-${width}-${theme}.png`),Buffer.from(shot.data,'base64'));
        await clickText('section[aria-label="Escolha seu objetivo"] button','Cuidar da cidade');
        await wait('document.querySelector("#explore-actions-title").textContent==="Cuidar da cidade"');
        assert.ok(await evaluate('Boolean(document.querySelector("#explore-actions a[href=\\"/adoteumaarvore\\"]"))'));
        assert.ok(await evaluate('Boolean(document.querySelector("#explore-actions a[href=\\"/arvores-da-comunidade\\"]"))'));
        assert.ok(await evaluate('Boolean(document.querySelector("#explore-actions a[href=\\"/login\\"]"))'),'Missão privada sem retorno de login');
        await clickText('#explore-actions a','Encontrar uma missão');
        await wait('window.previewRoute==="/login"');
        assert.equal(await evaluate('window.history.state.usr.from.pathname'),'/missoes');
        await evaluate('history.back()');
        await wait('window.previewRoute==="/explorar"&&document.querySelector("#explore-actions-title")?.textContent==="Cuidar da cidade"');
        await searchFor('ARVORE');
        await wait('document.querySelectorAll("#explore-actions .journey-action").length===3');
        await searchFor('ônibus');
        await wait('document.querySelectorAll("#explore-actions .journey-action").length===1');
        assert.ok(await evaluate('Boolean(document.querySelector("#explore-actions a[href=\\"/guia-da-cidade\\"]"))'));
        await searchFor('nenhuma-funcao-com-este-nome');
        await wait('document.querySelector("#explore-actions").textContent.includes("Nenhuma função encontrada")');
        await evaluate('document.querySelector("button[aria-label=\\"Limpar busca\\"]").click()');
        await wait('document.querySelectorAll("#explore-actions .journey-action").length===4');
        await clickText('#explore-actions button','Ver todas as funções');
        await wait('document.querySelectorAll("#explore-actions .journey-action").length===15');
        await evaluate('window.member=true');
        await enter('/explorar?jornada=cuidar&sessao=1');
        await wait('document.querySelector("#explore-actions a[href=\\"/missoes\\"]")');
        results.push({width,theme,feed:true,explore:true,search:true,authReturn:true,allFunctions:true,noOverflow:true});
      }
    }
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:false},sessionId);
    await evaluate('window.member=false;document.documentElement.style.fontSize="200%"');
    assert.equal(await evaluate('getComputedStyle(document.documentElement).fontSize'),'32px','Ampliação de fonte não foi aplicada');
    for (const route of ['/feed','/explorar?jornada=cuidar']) {
      await enter(route);
      await wait('document.querySelector("[data-testid=feed-welcome], [data-testid=explore-journeys]")');
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),route+': overflow com fonte a 200%');
    }
    await evaluate('document.documentElement.style.removeProperty("font-size")');
    await enter('/feed?aba=nearby');
    await wait('window.locationRequests>0');
    assert.ok(await evaluate('!document.querySelector("[data-fixture-report]")'),'Sem GPS o feed deve apresentar a orientação de localização');
  } else {
  for (const width of [360, 390, 430, 1440, 1920]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    for (const theme of ['light', 'dark']) {
      await evaluate(`document.documentElement.classList.toggle('dark',${theme === 'dark'})`);
      for (const [route, title, active] of [['/mapa', 'Mapa', '/mapa'], ['/mapa-arborizacao', 'Arborização', '/explorar'], ['/noticias/1', 'Notícia', '/explorar'], ['/configuracoes', 'Configurações', '/perfil']]) {
        await evaluate(`window.go(${JSON.stringify(route)})`);
        await wait(`window.previewRoute===${JSON.stringify(route)} && document.querySelector('main h1').textContent.includes(${JSON.stringify(title)})`);
        assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'), route + ': rolagem horizontal');
        assert.equal(await evaluate('document.querySelector("[data-bottom-nav] a[aria-current=page]")?.getAttribute("href")'), active);
        assert.equal(await evaluate('document.querySelectorAll("header").length'),1,'Cabeçalho duplicado');
        assert.equal(await evaluate('Boolean(document.querySelector("header button[aria-label=Voltar]"))'),false,'Variante compacta ativada');
        assert.ok(await evaluate('Boolean(document.querySelector("header img[alt=\\"Trombone Cidadão\\"]"))'),'Marca do cabeçalho clássico ausente');
        const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
        await fs.writeFile(path.join(out, `${route.replaceAll('/', '-')}-${width}-${theme}.png`), Buffer.from(shot.data, 'base64'));
        results.push({ width, theme, route, noOverflow: true, activeSection: active });
      }
    }
    if (width < 1024) {
      await evaluate('document.querySelector("header button[aria-label=\\"Abrir menu\\"]").click()');
      await wait('document.querySelector("header .fixed.inset-0 nav")');
      assert.ok(await evaluate('Boolean(document.querySelector("header .fixed.inset-0 nav a[href=\\"/mapa-arborizacao\\"]"))'),'Menu clássico sem acesso à arborização');
      const menuShot=await send('Page.captureScreenshot',{format:'png'},sessionId);
      await fs.writeFile(path.join(out,`classic-menu-${width}.png`),Buffer.from(menuShot.data,'base64'));
      await evaluate('document.querySelector("header .fixed.inset-0 nav a[href=\\"/mapa-arborizacao\\"]").click()');
      await wait('window.previewRoute==="/mapa-arborizacao" && !document.querySelector("header .fixed.inset-0 nav")');
      await evaluate('document.querySelector("button[aria-label=\\"Registrar bronca\\"]").click()');
      await wait('document.querySelector("[role=dialog]")');
      await evaluate('document.querySelector("[role=dialog] button").click()');
      await wait('!document.querySelector("[role=dialog]")');
    }
  }
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ out, scenarios: results.length, noOverflow: true, ...(journeysPreview ? {feed:true,explore:true,search:true,authReturn:true,font200:true} : {activeSections: true, classicHeader: true, hamburgerNavigation: true}) }));
} finally {
  if (ws) { try { ws.send(JSON.stringify({ id: 99999, method: 'Browser.close' })); } catch {} ws.close(); }
  chrome.kill();
  await new Promise(resolve => server.close(resolve));
}
