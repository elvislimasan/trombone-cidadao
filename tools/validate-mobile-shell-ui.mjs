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

const root = process.cwd(), journeysPreview = process.argv.includes('--journeys'), realCards = process.argv.includes('--real-cards'), out = path.join(root, realCards ? '.tmp/civic-components-ui' : journeysPreview ? '.tmp/civic-journeys-ui' : '.tmp/mobile-shell-ui');
await fs.mkdir(out, { recursive: true });
const stubs = {
  '@capacitor/core': `export const Capacitor={isNativePlatform:()=>window.nativePlatform!==false};`,
  '@capacitor/haptics': `export const Haptics={impact:async()=>{}};export const ImpactStyle={Light:'LIGHT'};`,
  '@capacitor/share': `export const Share={share:async invitation=>{window.lastInvitation=invitation;if(window.inviteMode==='cancel')throw Object.assign(new Error('cancelled'),{name:'AbortError'});if(window.inviteMode==='fail')throw new Error('share-unavailable')}};`,
  '@/contexts/SupabaseAuthContext': `export const useAuth=()=>({user:window.member?{id:'preview-user',name:'Ana Cidadã',is_ambassador:!!window.ambassador}:null});`,
  '@/hooks/usePermissions': `export const usePermissions=()=>({isMaster:false,planningCityIds:[],treeAssignments:[],canWrite:()=>false});`,
  '@/design-system/theme/ThemeProvider': `export const useTheme=()=>({resolved:'light',setPreference(){}});`,
  '../contexts/NotificationContext': `export const useNotifications=()=>({notificationsEnabled:!!window.hasUpdates,toggleNotifications:async()=>{},loading:false});`,
  '@/components/feed/FeedCitySelector': `import React from 'react';import {MapPin} from 'lucide-react';export default function City(){return <button type="button" className="h-10 w-10" aria-label="Selecionar cidade"><MapPin size={20}/></button>;}`,
  '@/lib/customSupabaseClient': `export const supabase={from(table){return {select(){return this},eq(){return this},not(){return this},neq(){return this},order(){return this},limit(){return this},then(resolve){return Promise.resolve({data:table==='notifications'&&window.hasUpdates?[{id:'update-1',report_id:'report-1',message:'Uma bronca que você acompanha teve atualização.',created_at:new Date().toISOString()}]:[],error:null}).then(resolve)},async maybeSingle(){return {data:null}},async single(){return {data:{site_name:'Trombone Cidadão',logo_url:'/logo.png'}}}}}};`,
  '@/components/Notifications': `import React from 'react';import {Button} from '@/components/ui/button';import {Bell} from 'lucide-react';export default function Notifications(){return <Button type="button" size="icon" variant="ghost" aria-label="Notificações" className="h-12 w-12 rounded-full"><Bell size={22}/></Button>;}`,
  '@/hooks/useCreateReport': `export const useCreateReport=()=>({createReport:async()=>{}});`,
  '@/components/ReportModal': `import React from 'react';export default function Report({onClose}){return <div role="dialog" aria-label="Registrar bronca"><button onClick={onClose}>Fechar registro</button></div>;}`,
  '@/contexts/CityContext': `export const useCity=()=>({activeCityId:64,activeCityName:'Floresta',activeCity:{id:64,name:'Floresta'}});`,
  '@/components/CitySelector': `import React from 'react';import {MapPin} from 'lucide-react';export default function City(){return <button type="button" className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-edge-subtle bg-surface-raised px-3 text-sm text-content-primary" aria-label="Cidade selecionada: Floresta"><MapPin size={16}/>Floresta</button>;}`,
  '@/hooks/useCityEvents': `const event={id:'event-1',type:'water_outage',title:'Manutenção na rede de abastecimento',status:'active',severity:'medium',created_at:new Date().toISOString(),areas:[]};export const useCityEvents=()=>({eventos:window.hasCityEvents?[event]:[],carregando:false,erro:null});`,
  '@/hooks/useUserLocation': `const data={coords:null,status:'idle',request(){window.locationRequests=(window.locationRequests||0)+1}};export const useUserLocation=()=>data;`,
  '@/hooks/useInfiniteScroll': `export const useInfiniteScroll=()=>null;`,
  '@/hooks/useFeedRealtime': `const data={newCount:0,resetNewCount(){}};export const useFeedRealtime=()=>data;`,
  '@/hooks/useSwipeTabs': `export const useSwipeTabs=()=>({});`,
  '@/hooks/useFeed': `const reports=[{id:'report-1',title:'Iluminação precisa de atenção na nossa rua',description:'Moradores acompanham a manutenção do poste no Centro.'},{id:'report-2',title:'Uma cidade melhor começa com a nossa participação',description:'Veja os relatos e apoie o que importa para seu bairro.'}];const data={loadingMore:false,hasMore:false,loadMore(){},refresh(){},toggleUpvote(){},error:null,isSlow:false,loadMoreError:null,isSlowMore:false};export const useFeed=()=>({...data,reports:window.feedState==='empty'?[]:reports,loading:window.feedState==='loading'});`,
  '@/components/FeedCard': `import React from 'react';import {Link} from 'react-router-dom';export default function Card({report}){return <article data-fixture-report className="rounded-2xl border border-edge-subtle bg-surface-raised p-5"><p className="text-sm text-content-secondary">Comunidade · Centro</p><h2 className="mt-3 text-xl font-bold text-content-primary">{report.title}</h2><p className="mt-2 text-sm text-content-secondary">{report.description}</p><Link className="mt-4 inline-flex min-h-12 items-center text-sm font-semibold text-brand" to={'/bronca/'+report.id}>Ver bronca</Link></article>;}`,
  '@/components/feed/FeedUpdateModal': `export default function Update(){return null;}`,
  '@/components/report/ReportStoryModal': `export default function Story(){return null;}`,
};
stubs['@/contexts/NotificationContext'] = stubs['../contexts/NotificationContext'];
if (realCards) {
  // Componentes reais do cartão e de mídia; apenas dados e serviços externos
  // são simulados. Nenhuma consulta ou participação chega ao backend.
  delete stubs['@/components/FeedCard'];
  delete stubs['@/components/CitySelector'];
  delete stubs['@/components/feed/FeedCitySelector'];
  stubs['@/contexts/CityContext'] = `import {useSyncExternalStore} from 'react';const listeners=new Set();let cityId=64;const cities=[{id:64,name:'Floresta',state:{uf:'PE'}},{id:65,name:'São Francisco',state:{uf:'MG'},civic_thumbnail_url:'/city-fixture.svg'},{id:66,name:'São Sebastião da Boa Vista',state:{uf:'PA'}}];const subscribe=listener=>{listeners.add(listener);return()=>listeners.delete(listener)};const setActiveCity=id=>{cityId=id;for(const listener of listeners)listener()};export const useCity=()=>{const id=useSyncExternalStore(subscribe,()=>cityId);const city=cities.find(item=>item.id===id);return {activeCityId:id,activeCityName:city?city.name+' · '+city.state.uf:null,activeCity:city,cities,loadingCities:false,setActiveCity}};export const parseCityFromNominatim=()=>({});export const matchCityInList=()=>null;export const useCityView=()=>{const data=useCity();return {cityId:data.activeCityId,cityName:data.activeCityName,setCityId:data.setActiveCity,cities,loadingCities:false,isExploring:false}};`;
  stubs['@/lib/instagramStory'] = `export const canShareToStory=()=>false;export const shareVideoToInstagramStory=async()=>({});`;
  stubs['@/lib/shareUtils'] = `export const getReportShareUrl=id=>'https://example.test/bronca/'+id;export const getAppInviteUrl=()=>'https://example.test/app';`;
  stubs['@/hooks/useReportComments'] = `export const useReportComments=()=>({comments:[],loading:false,publicCount:0,canModerate:false,submit:async()=>({ok:true})});`;
  stubs['@/hooks/useFeed'] = `import {useState} from 'react';const initial=[{id:'report-1',title:'Iluminação precisa de atenção na nossa rua',description:'Moradores acompanham a manutenção do poste no Centro.',category_id:'iluminacao',categoryName:'Iluminação',status:'pending',created_at:new Date().toISOString(),authorName:'Ana Cidadã',authorUsername:'ana',address:'Rua do Centro, Floresta',upvotes:12,comments_count:3},{id:'report-2',title:'Uma cidade melhor começa com a nossa participação',description:'Veja os relatos e apoie o que importa para seu bairro.',category_id:'other',categoryName:'Outros',status:'resolved',created_at:new Date().toISOString(),upvotes:0,comments_count:0}];export const useFeed=()=>{const [reports,setReports]=useState(initial);return {reports:window.feedState==='empty'?[]:reports,loading:window.feedState==='loading',loadingMore:false,hasMore:false,loadMore(){},refresh(){},toggleUpvote(id){setReports(list=>list.map(item=>item.id===id?{...item,user_has_upvoted:!item.user_has_upvoted,upvotes:item.upvotes+(item.user_has_upvoted?-1:1)}:item))},error:null,isSlow:false,loadMoreError:null,isSlowMore:false}};`;
}
stubs['@/hooks/useFeed'] = stubs['@/hooks/useFeed']
  .replace("window.feedState==='empty'?[]:reports", "['empty','loading','error'].includes(window.feedState)?[]:reports")
  .replace('error:null', "error:window.feedState==='error'?{message:'Não foi possível carregar.'}:null");
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
  alias: { '@': path.join(root, 'src') }, define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.DEV': 'false' },
  plugins: [{ name: 'fixtures', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => stubs[args.path] ? { path: args.path, namespace: 'fixture' } : undefined);
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'jsx', resolveDir: root }));
  } }],
});
let source = await fs.readFile('src/index.css', 'utf8');
for (const token of ['primitives', 'semantic', 'typography', 'motion']) source = source.replace(`@import './design-system/tokens/${token}.css';`, await fs.readFile(`src/design-system/tokens/${token}.css`, 'utf8'));
source = source.replace("@import './design-system/mobile-journeys.css';", await fs.readFile('src/design-system/mobile-journeys.css', 'utf8'));
const config = loadConfig(path.join(root, 'tailwind.config.js'));
const css = await postcss([tailwind({ ...config, content: ['src/pages/FeedPage.jsx','src/pages/ExplorePage.jsx','src/components/FeedCard.jsx','src/components/PersonalUpdates.jsx','src/components/CitySelector.jsx','src/components/agora/*.jsx','src/design-system/primitives/*.jsx','src/components/feed/*.jsx','src/components/journeys/*.jsx','src/components/FeedEmptyState.jsx','src/components/Header.jsx', 'src/components/MobileHeader.jsx', 'src/components/BottomNav.jsx', 'src/components/ui/*.jsx', { raw: Object.values(stubs).join('\n')+' h-10 w-10 h-12 w-12 rounded-full page-shell-fluid min-h-screen py-24', extension: 'html' }] })]).process(source, { from: 'src/index.css' });
await fs.writeFile(path.join(out, 'preview.css'), css.css);
const server = http.createServer(async (req, res) => {
  const resource = req.url.split('?')[0];
  if (['/preview.js', '/preview.css'].includes(resource)) {
    res.setHeader('Content-Type', resource.endsWith('.js') ? 'text/javascript' : 'text/css');
    res.end(await fs.readFile(path.join(out, resource.slice(1))));
  } else if (resource === '/logo.png') { res.setHeader('Content-Type', 'image/png'); res.end(await fs.readFile('public/logo.png')); }
  else if (['/fonts/Inter.woff2', '/fonts/BricolageGrotesque.woff2'].includes(resource)) { res.setHeader('Content-Type', 'font/woff2'); res.end(await fs.readFile(path.join(root, 'public', resource))); }
  else if (resource === '/city-fixture.svg') { res.setHeader('Content-Type', 'image/svg+xml'); res.end('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 400"><rect width="900" height="400" fill="#91bdcd"/><path d="M0 240Q180 60 360 230T900 170V400H0" fill="#608e71"/><path d="M0 310Q300 190 600 310T900 230V400H0" fill="#759778"/><g fill="#f3e4cd"><path d="M80 320V190H220V320M260 340V230H410V340M470 360V140H590V360M640 320V210H830V320"/></g><g fill="#91594c"><path d="M65 190L150 140L235 190M245 230L335 180L425 230M455 140L530 90L605 140M625 210L735 155L845 210"/></g><path d="M0 380Q450 260 900 360" stroke="#b6d9de" stroke-width="42" fill="none"/></svg>'); }
  else { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/preview.css"></head><body><div id="root"></div><script src="/preview.js"></script></body></html>'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = path.join(out, 'chrome-' + Date.now());
const chromePath = process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'chromium');
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true });
chrome.on('error', error => { console.error(`Não foi possível iniciar ${chromePath}: ${error.message}. Configure CHROME_PATH com o caminho do navegador.`); });
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
    const shot=await send('Page.captureScreenshot',{format:'png'},sessionId);
    await fs.writeFile(path.join(out,'failure.png'),Buffer.from(shot.data,'base64'));
    throw Error('Timeout: ' + expression + ' / ' + JSON.stringify(errors) + ' / ' + JSON.stringify(await evaluate('({route:window.previewRoute,href:location.href,clicks:window.previewClicks?.slice(-5),navigation:window.previewNavigation?.slice(-8)})')));
  };
  await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/mapa` }, sessionId);
  await wait('window.go && document.querySelector("header")');
  await evaluate(`window.previewClicks=[];window.previewNavigation=[];document.addEventListener('click',event=>{const target=event.target.closest('button,a,[role=menuitemradio]');if(target)window.previewClicks.push({label:target.getAttribute('aria-label')||target.textContent,to:target.getAttribute('href')})},true);for(const method of ['pushState','replaceState']){const original=history[method].bind(history);history[method]=(...args)=>{window.previewNavigation.push(args[2]);return original(...args)}}`);
  const reportSelector = realCards ? '#feed-panel article' : '[data-fixture-report]';
  if (journeysPreview) {
    const enter = async route => {
      await evaluate(`window.go(${JSON.stringify(route)})`);
      await wait(`window.previewRoute===${JSON.stringify(route.split('?')[0])}`);
      await pause(40);
    };
    const clickText = async (selector, label) => {
      const lookup = `[...document.querySelectorAll(${JSON.stringify(selector)})].find(el=>(el.getAttribute('aria-label')||el.textContent).includes(${JSON.stringify(label)}))`;
      await wait(`(()=>{const target=${lookup};return target&&getComputedStyle(target).pointerEvents!=='none'})()`);
      await evaluate(`(()=>{const target=${lookup};if(!target)throw Error('Ação não encontrada: '+${JSON.stringify(label)});target.focus({preventScroll:true});target.scrollIntoView({block:'center',behavior:'instant'})})()`);
      await pause(100);
      const point = await evaluate(`(()=>{const target=${lookup};const box=target.getBoundingClientRect();const x=box.left+box.width/2,y=box.top+box.height/2;const hit=document.elementFromPoint(x,y);return {x,y,visible:target===hit||target.contains(hit),blocker:hit?.outerHTML.slice(0,300)}})()`);
      assert.ok(point.visible,`Ação encoberta: ${label}: ${point.blocker}`);
      await send('Input.dispatchMouseEvent',{type:'mouseMoved',buttons:0,x:point.x,y:point.y},sessionId);
      await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,x:point.x,y:point.y},sessionId);
      await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,x:point.x,y:point.y},sessionId);
    };
    const selectFeedSort = async label => {
      await clickText('[data-testid=feed-sort-trigger]','Organizar broncas');
      await wait('document.querySelector("[role=menuitemradio]")');
      await clickText('[role=menuitemradio]',label);
      await wait(`document.querySelector('[data-testid=feed-sort-trigger]').getAttribute('aria-label').includes(${JSON.stringify(label)})`);
      await wait('!document.querySelector("[role=menuitemradio]")');
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
        await wait(`document.querySelector("[data-testid=feed-welcome]") && document.querySelector(${JSON.stringify(reportSelector)})`);
        assert.ok(await evaluate('Boolean(document.querySelector(".feed-quick-missions[href=\\"/missoes\\"]"))'),'Patrulha e missões não estão acessíveis na abertura');
        assert.ok(await evaluate('document.querySelector(".feed-quick-missions").getBoundingClientRect().bottom<innerHeight-90'),'Missões ficaram escondidas na primeira tela');
        await clickText('.feed-quick-missions','Patrulha e missões');
        await wait('window.previewRoute==="/missoes"');
        await enter('/feed');
        await wait(`document.querySelector(${JSON.stringify(reportSelector)})`);
        assert.ok(await evaluate('!document.body.innerText.includes("Nível 12")&&!document.body.innerText.includes("3 disponíveis")'),'Progresso fictício no Início');
        assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Feed com overflow');
        assert.ok(await evaluate(`document.querySelector(${JSON.stringify(reportSelector)}).getBoundingClientRect().top<innerHeight`),'Conteúdo do feed ficou abaixo da primeira tela');
        assert.ok(await evaluate('!document.querySelector("[data-testid=feed-welcome] details")'),'Ajuda de primeiro uso voltou ao topo');
        assert.ok(await evaluate('document.querySelector("[data-testid=feed-welcome]").getBoundingClientRect().height<240'),'Cabeçalho do conteúdo ficou alto');
        assert.equal(await evaluate('document.querySelectorAll(".feed-quick-card").length'),4,'Os quatro cards de ação não foram mantidos');
        assert.ok(await evaluate('Boolean(document.querySelector(".feed-quick-grid a[href=\\"/seja-embaixador\\"]"))'),'Visitante recebeu painel sem autorização');
        assert.ok(await evaluate('!document.querySelector("[data-testid=feed-missions], [role=tablist]")'),'O feed voltou a empilhar botões e tabs');
        assert.ok(await evaluate('!document.querySelector("[data-testid=feed-welcome]").textContent.includes("Registrar bronca")'),'O topo não deve repetir o registro');
        await evaluate('document.querySelector("[data-bottom-nav] button[aria-label=\\"Registrar bronca\\"]").click()');
        await wait('document.querySelector("[role=dialog]")');
        await evaluate('document.querySelector("[role=dialog] button").click()');
        await wait('!document.querySelector("[role=dialog]")');
        await selectFeedSort('Em alta');
        await selectFeedSort('Recentes');
        assert.ok(await evaluate('document.querySelector("#feed-panel").getAttribute("aria-labelledby")==="feed-content-title"'),'Feed sem título acessível');
        await pause(350);
        if (realCards) {
          assert.ok(await evaluate('!document.querySelector("article [aria-label^=\\"Ver detalhes:\\"]")'),'Relato sem anexo não deve reservar uma capa vazia');
          assert.ok(await evaluate('[...document.querySelectorAll(".feed-card-action")].every(el=>el.offsetWidth>=48&&el.offsetHeight>=48)'),'Ação do feed com alvo menor que 48 px');
          await clickText('article button[aria-label="Apoiar bronca"]','Apoiar');
          await wait('document.querySelector("article button[aria-label=\\"Apoiar bronca\\"]").getAttribute("aria-pressed")==="true"');
          assert.ok(await evaluate('document.querySelector("article button[aria-label=\\"Apoiar bronca\\"]").textContent.includes("Apoiado")'),'Apoio sem retorno visível');
          await clickText('article button[aria-label="Apoiar bronca"]','Apoiar');
          await wait('document.querySelector("article button[aria-label=\\"Apoiar bronca\\"]").getAttribute("aria-pressed")==="false"');
        }
        await evaluate('document.activeElement?.blur();window.scrollTo(0,0)');
        await pause(350);
        if (width >= 1200) assert.ok(await evaluate('(()=>{const box=document.querySelector("[data-testid=feed-welcome]").closest(".page-shell-fluid").getBoundingClientRect();return box.left<=64&&innerWidth-box.right<=64})()'),'Feed com margens externas excessivas');
        let shot=await send('Page.captureScreenshot',{format:'png'},sessionId);
        await fs.writeFile(path.join(out,`feed-${width}-${theme}.png`),Buffer.from(shot.data,'base64'));

        await evaluate("window.feedState='empty'");
        await enter('/feed?estado=empty');
        await wait('document.querySelector("[data-testid=feed-empty]")');
        assert.ok(await evaluate('Boolean(document.querySelector(".feed-quick-missions"))'),'Estado vazio escondeu missões');
        assert.equal(await evaluate('document.querySelector("#feed-empty-title").textContent'),'Sua cidade começa com você');
        assert.ok(await evaluate('document.querySelector("[data-testid=feed-welcome]").getBoundingClientRect().height<240'),'Topo ainda ocupa espaço de apresentação em excesso');
        assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Estado vazio com overflow');
        assert.equal(await evaluate('document.querySelectorAll(".feed-participation-link").length'),3);
        assert.ok(await evaluate('!document.querySelector(".feed-empty-primary")'),'Estado vazio duplicou o card de cadastro');
        assert.ok(await evaluate('[...document.querySelectorAll(".feed-participation-link")].every(el=>el.offsetWidth>=48&&el.offsetHeight>=48)'),'Atalho com área de toque pequena');
        assert.ok(await evaluate('!document.querySelector("[data-testid=feed-help]").open'),'Ajuda deve começar recolhida');
        await clickText('[data-testid=feed-help] summary','Como registrar');
        assert.ok(await evaluate('document.querySelector("[data-testid=feed-help]").open'));
        assert.equal(await evaluate('document.querySelectorAll("[data-testid=feed-help] ol li").length'),3);
        await clickText('[data-testid=feed-help] summary','Como registrar');
        await evaluate('window.scrollTo(0,0)');
        shot=await send('Page.captureScreenshot',{format:'png'},sessionId);
        await fs.writeFile(path.join(out,`feed-empty-${width}-${theme}.png`),Buffer.from(shot.data,'base64'));
        await clickText('.feed-quick-card','Cadastrar sua bronca');
        await wait('document.querySelector("[role=dialog]")');
        await evaluate('document.querySelector("[role=dialog] button").click()');
        await wait('!document.querySelector("[role=dialog]")');
        for (const [label, target] of [['Explorar o mapa','/mapa'],['Cuidar de árvores','/explorar'],['Serviços locais','/guia-da-cidade']]) {
          await clickText('.feed-participation-link',label);
          await wait(`window.previewRoute===${JSON.stringify(target)}`);
          if (target==='/explorar') assert.equal(await evaluate('new URLSearchParams(location.search).get("jornada")'),'cuidar');
          await enter('/feed?estado=empty');
          await wait('document.querySelector("[data-testid=feed-empty]")');
        }
        await selectFeedSort('Em alta');
        await wait('document.querySelector("#feed-empty-title")?.textContent==="Toda causa começa com uma voz"');
        await clickText('[data-testid=feed-empty] button','Ver broncas recentes');
        await wait('document.querySelector("#feed-empty-title")?.textContent==="Sua cidade começa com você"');

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
        await evaluate('document.querySelector("#explore-actions button[aria-label=\\"Ver todas as funções\\"]").click()');
        await wait('document.querySelectorAll("#explore-actions .journey-action").length===15');
        await evaluate('window.member=true');
        await enter('/explorar?jornada=cuidar&sessao=1');
        await wait('document.querySelector("#explore-actions a[href=\\"/missoes\\"]")');
        results.push({width,theme,feed:true,emptyFeed:true,missions:true,sortMenu:true,participationPaths:true,explore:true,search:true,authReturn:true,allFunctions:true,noOverflow:true});
      }
    }
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false},sessionId);
    await evaluate("window.member=false;window.feedState='empty';window.hasUpdates=false;document.documentElement.classList.remove('dark')");
    await enter('/feed?estado=empty&cidade=teste');
    await wait('document.querySelector("[data-testid=feed-empty]")');
    if (realCards) {
      assert.ok(await evaluate('!document.querySelector("[data-testid=feed-welcome] button[aria-label=\\"Selecionar cidade\\"]")'),'Seletor de cidade permaneceu duplicado na capa');
      await clickText('header button[aria-label^="Cidade:"]','Cidade:');
      await wait('document.querySelector("[role=dialog][aria-label=\\"Escolher cidade\\"]")');
      await clickText('[role=dialog] button','São Francisco');
      await wait('document.querySelector("[data-testid=feed-empty]").textContent.includes("São Francisco · MG")');
      await wait('document.querySelector("[data-testid=feed-city-photo]")?.naturalWidth>0');
      await pause(350);
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Cidade com UF causou overflow');
    }
    let emptyShot=await send('Page.captureScreenshot',{format:'png'},sessionId);
    await fs.writeFile(path.join(out,'feed-empty-390-844-light.png'),Buffer.from(emptyShot.data,'base64'));
    if (realCards) {
      for (const width of [360,390,430,1440,1920]) {
        await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false},sessionId);
        for (const theme of ['light','dark']) {
          await evaluate(`document.documentElement.classList.toggle('dark',${theme==='dark'});window.scrollTo(0,0)`);
          assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Capa com overflow');
          assert.ok(await evaluate('document.querySelectorAll(".feed-quick-card").length===4'),'Capa perdeu ações');
          assert.ok(await evaluate('[...document.querySelectorAll(".feed-quick-card")].every(el=>el.offsetWidth>=48&&el.offsetHeight>=48)'),'Ação da capa com toque pequeno');
          if(width>=1200) assert.ok(await evaluate('(()=>{const r=document.querySelector("[data-testid=feed-welcome]").closest(".page-shell-fluid").getBoundingClientRect();return r.left<=64&&innerWidth-r.right<=64})()'),'Capa limitou a largura desktop');
          await pause(250);
          const shot=await send('Page.captureScreenshot',{format:'png'},sessionId);
          await fs.writeFile(path.join(out,`feed-cover-${width}-${theme}.png`),Buffer.from(shot.data,'base64'));
          results.push({width,theme,cityCover:true,fourActions:true,noOverflow:true});
        }
      }
      await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false},sessionId);
      await evaluate('document.documentElement.classList.remove("dark");window.inviteMode="success"');
      await clickText('.feed-quick-card','Convidar alguém');
      await wait('window.lastInvitation?.url==="https://example.test/app"');
      await wait('document.querySelector("[data-testid=feed-quick-actions]").textContent.includes("Compartilhado")');
      await evaluate('window.inviteMode="cancel"');
      await clickText('.feed-quick-card','Convidar alguém');
      await wait('document.querySelector("[data-testid=feed-quick-actions] button[aria-busy]").getAttribute("aria-busy")==="false"');
      assert.ok(await evaluate('!document.querySelector("[data-testid=feed-quick-actions]").textContent.includes("Compartilhado")&&!document.querySelector("input[aria-label=\\"Link para convidar\\"]")'),'Cancelamento gerou sucesso ou erro indevido');
      await evaluate('window.inviteMode="fail";Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async text=>{window.copiedInvitation=text}}})');
      await clickText('.feed-quick-card','Convidar alguém');
      await wait('window.copiedInvitation==="https://example.test/app"');
      await wait('document.querySelector("[data-testid=feed-quick-actions]").textContent.includes("Link copiado")');
      await evaluate('window.nativePlatform=false;Object.defineProperty(navigator,"share",{configurable:true,value:async data=>{window.webInvitation=data}})');
      await clickText('.feed-quick-card','Convidar alguém');
      await wait('window.webInvitation?.url==="https://example.test/app"');
      await evaluate('Object.defineProperty(navigator,"share",{configurable:true,value:undefined});Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async()=>{throw Error("clipboard-denied")}}})');
      await clickText('.feed-quick-card','Convidar alguém');
      await wait('document.querySelector("input[aria-label=\\"Link para convidar\\"]")');
      assert.equal(await evaluate('document.querySelector("input[aria-label=\\"Link para convidar\\"]").value'),'https://example.test/app');
      await clickText('button[aria-label="Fechar link de convite"]','Fechar link');
      await wait('!document.querySelector("input[aria-label=\\"Link para convidar\\"]")');
      await evaluate('window.nativePlatform=true;window.inviteMode="success";document.querySelector("[data-testid=feed-city-photo]").dispatchEvent(new Event("error"))');
      await wait('!document.querySelector("[data-testid=feed-city-photo]")');
      assert.ok(await evaluate('document.querySelector("#feed-welcome-title").textContent.includes("São Francisco")'),'Falha da imagem apagou a cidade');
      await evaluate('window.member=true;window.ambassador=true');
      await enter('/explorar');
      await enter('/feed?estado=ambassador');
      await wait('document.querySelector(".feed-quick-grid a[href=\\"/embaixador\\"]")');
      await clickText('.feed-quick-card','Painel do embaixador');
      await wait('window.previewRoute==="/embaixador"');
      await evaluate('window.member=false;window.ambassador=false');
    }
    await evaluate("window.feedState='loading'");
    await enter('/feed?estado=loading');
    await wait('!document.querySelector("[data-testid=feed-empty]")');
    await evaluate("window.feedState='error'");
    await enter('/feed?estado=error');
    await wait('document.body.textContent.includes("Não foi possível carregar")');
    assert.ok(await evaluate('!document.querySelector("[data-testid=feed-empty]")'),'Falha de consulta foi apresentada como falta de participação');
    await evaluate("window.feedState='empty';window.member=true;window.hasUpdates=true;window.hasCityEvents=true");
    await enter('/feed?estado=personal');
    await wait('document.querySelector("[data-testid=feed-empty]")');
    assert.ok(await evaluate('!document.body.textContent.includes("Há novidades nas suas broncas")'),'Aviso de novidades voltou ao feed');
    assert.ok(await evaluate('Boolean(document.querySelector("section[aria-label=\\"Acontecendo na cidade\\"] a[href=\\"/agora/event-1\\"]"))'),'Alerta real não apareceu no celular');
    await evaluate("window.member=false;window.hasUpdates=false;window.hasCityEvents=false;window.feedState='empty'");
    await enter('/feed?estado=visitor');
    await wait('document.querySelector("[data-testid=feed-empty]")');
    assert.ok(await evaluate('!document.body.textContent.includes("Há novidades nas suas broncas")'),'Novidades pessoais vazaram para o visitante');
    assert.ok(await evaluate('!window.locationRequests'),'Abrir o feed ou seus atalhos solicitou GPS');
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false},sessionId);
    await evaluate('window.nativePlatform=false');
    await enter('/explorar');
    await enter('/feed?desktop=1');
    await wait('document.querySelector(".feed-quick-missions[href=\\"/missoes\\"]")');
    await clickText('.feed-quick-missions','Patrulha e missões');
    await wait('window.previewRoute==="/missoes"');
    await evaluate('window.nativePlatform=true');
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:false},sessionId);
    await evaluate('window.member=false;document.documentElement.style.fontSize="200%"');
    assert.equal(await evaluate('getComputedStyle(document.documentElement).fontSize'),'32px','Ampliação de fonte não foi aplicada');
    for (const route of ['/feed','/explorar?jornada=cuidar']) {
      await enter(route);
      await wait('document.querySelector("[data-testid=feed-welcome], [data-testid=explore-journeys]")');
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),route+': overflow com fonte a 200%');
      const shot = await send('Page.captureScreenshot',{format:'png'},sessionId);
      await fs.writeFile(path.join(out,route.startsWith('/feed')?'feed-font200.png':'explorar-font200.png'),Buffer.from(shot.data,'base64'));
    }
    await evaluate('document.documentElement.style.removeProperty("font-size")');
    await enter('/feed?aba=nearby');
    await wait('window.locationRequests>0');
    assert.ok(await evaluate(`!document.querySelector(${JSON.stringify(reportSelector)})`),'Sem GPS o feed deve apresentar a orientação de localização');
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
