// Prévia local: componentes reais, dados fictícios, sem autenticação ou gravações remotas.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import loadConfig from 'tailwindcss/loadConfig.js';

const root = process.cwd();
const tailwindConfig = loadConfig(path.join(root, 'tailwind.config.js'));
const detailOnly = process.argv.includes('--case');
const teamOnly = process.argv.includes('--team');
const tablesOnly = process.argv.includes('--tables');
const out = await fs.mkdtemp(path.join(os.tmpdir(), 'trombone-preview-'));
await fs.mkdir(out, { recursive: true });
const mocks = {
  '@/contexts/SupabaseAuthContext': `export const useAuth=()=>({user:{id:'preview',name:'Equipe municipal'},signOut:async()=>{}});`,
  '@/lib/appError': `export const showAppError=console.error;export const showAppNotice=console.log;`,
  '@/design-system/theme/ThemeProvider': `import {useState} from 'react';export function useTheme(){const [resolved,set]=useState('light');return {resolved,setPreference:(v)=>{document.documentElement.classList.toggle('dark',v==='dark');set(v)}}}`,
  '@/lib/customSupabaseClient': `
    const city={name:'Floresta',states:{uf:'PE'}};
    const membership={id:'m',papel:'administrador',prefeitura:{id:'p',city_id:64,nome:'Prefeitura Municipal de Floresta',status:'ativa',cidade:city}};
    const data={site_config:{site_name:'Trombone Cidadão',logo_url:'/logo.png'},prefeitura_membros:[membership],orgao_membros:[],prefeitura_convites:[],orgao_canais:[{id:'c',nome:'Obras e Serviços Públicos',cidade:city,ativo:true}],listar_casos_prefeitura:[],resumo_casos_prefeitura:{total:42,abertas:28,novas:8,atrasadas:3,aguardando_confirmacao:6}};
    data.categories=[{id:'iluminacao',name:'Iluminação pública'},{id:'buracos',name:'Buracos na via'}];
    data.listar_casos_prefeitura=Array.from({length:45},(_,i)=>({report_id:'r'+i,status:i%2?'nova':'em_execucao',prioridade:i%3?'normal':'urgente',prazo_em:'2026-08-01',created_at:'2026-07-01',canal:{id:'c',city_id:64,nome:'Obras e Serviços Públicos'},report:{id:'r'+i,title:'Demanda de iluminação '+(i+1),category_id:'iluminacao',category:{name:'Iluminação pública'},created_at:'2026-07-01',neighborhood:'Centro',address:'Rua de exemplo',location:{type:'Point',coordinates:[-38.57+(i%5)*.002,-8.6+Math.floor(i/5)*.001]}}}));
    data.orgao_casos=data.listar_casos_prefeitura;
    data.orgao_canais[0].city_id=64;
    data.orgao_membros=[{id:'member',canal_id:'c',user_id:'preview',ativo:true,papel:'gestor',created_at:'2026-09-20T12:00:00Z',perfil:{name:'Pessoa da equipe',phone:'(87) 99999-1234'}}];
    data.listar_emails_equipe_prefeitura=[{membro_id:'member',email:'contato.equipe.secretaria.obras@prefeitura.example.com'}];
    if(location.search.includes('team'))data.orgao_membros.push({id:'member2',canal_id:'c',user_id:'preview2',ativo:false,papel:'leitura',created_at:'2026-09-21T12:00:00Z',perfil:{name:'Pessoa sem contato cadastrado'}});
    if(location.search.includes('team')) {
      for(let i=0;i<24;i++) data.orgao_membros.push({id:'extra'+i,canal_id:'c',user_id:'u'+i,ativo:i%2===0,papel:'operador',created_at:'2026-09-22',perfil:{name:'Servidor '+i}});
    }
    if(location.search.includes('channels')) data.orgao_canais=Array.from({length:24},(_,i)=>({id:'c'+i,nome:'Secretaria '+i,city_id:64,cidade:city,ativo:i%2===0,email:'secretaria'+i+'@example.com',reply_to:'retorno@example.com',categorias:[{category_id:'iluminacao'}],created_at:'2026-09-20'}));
    data.orgao_casos[0].status='nova';
    data.orgao_casos[0].canal_id='c';
    data.orgao_casos[0].report.featured_image_url='/missing-cover.png';
    data.orgao_casos[0].report.report_media=[{type:'photo',url:'/logo.png',created_at:'2026-09-01'}];
    data.orgao_casos[1].report.report_media=[{type:'photo',url:'/logo.png',created_at:'2026-09-01'}];
    if(location.search.includes('readonly')){membership.papel='membro';data.orgao_membros[0].papel='leitura';}
    if(location.search.includes('triage'))data.orgao_casos[0].canal.canal_triagem=true;
    window.previewQueries=[];window.previewSaves=[];
    const query=(key,range,single=false)=>new Proxy({}, {get:(_,prop)=>prop==='then'?((resolve)=>Promise.resolve({data:single?structuredClone(data[key]?.[0]):range&&Array.isArray(data[key])?data[key].slice(range[0],range[1]+1):data[key]||[],count:45}).then(resolve)):((...args)=>{window.previewQueries.push([key,prop,...args]);return query(key,prop==='range'?args:range,prop==='maybeSingle'||prop==='single'||single);})});
    export const supabase={from:query,rpc:(key,args)=>{if(key==='atualizar_caso_do_orgao'){window.previewSaves.push(args);if(window.failSave)return Promise.resolve({error:{message:'Falha simulada'}});Object.assign(data.orgao_casos[0],{status:args.p_status,prioridade:args.p_prioridade,atribuido_a:args.p_atribuido_a,protocolo:args.p_protocolo,prazo_em:args.p_prazo_em});return Promise.resolve({data:{ok:true}})}return query(key)}};`,
};
await build({
  stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter,Routes,Route} from 'react-router-dom';import Layout from './src/components/municipality/MunicipalityLayout';import Dashboard from './src/pages/AgencyDashboardPage';import Team from './src/pages/MunicipalityTeamPage';import Channels from './src/pages/admin/ManageAgencyChannelsPage';import Detail from './src/pages/AgencyCaseDetailsPage';const channels=location.search.includes('channels'),detail=location.search.includes('case'),team=location.search.includes('team'),map=location.search.includes('map');createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={[channels?'/prefeitura/secretarias':detail?'/prefeitura/broncas/r0':team?'/prefeitura/equipe':map?'/prefeitura/mapa':'/prefeitura/broncas']}><Layout>{channels?<Channels/>:detail?<Routes><Route path="/prefeitura/broncas/:reportId" element={<Detail/>}/></Routes>:team?<Team/>:<Dashboard view={map?'map':'list'}/>}</Layout></MemoryRouter>);`, resolveDir: root, loader: 'jsx' },
  bundle: true, outfile: path.join(out, 'preview.js'), loader:{'.css':'empty'}, define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{name:'preview',setup(b){
    b.onResolve({filter:/^@\//},args=>mocks[args.path]?{path:args.path,namespace:'mock'}:{path:path.join(root,'src',args.path.slice(2))+ (path.extname(args.path)?'':(args.path.includes('/ui/')||args.path.includes('/components/')?'.jsx':'.js'))});
    b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'js',resolveDir:root}));
  }}],
});
let css=await fs.readFile('src/index.css','utf8');
for(const match of [...css.matchAll(/@import '([^']+)';/g)]) css=css.replace(match[0],await fs.readFile(path.join(root,'src',match[1]),'utf8'));
const compiled=await postcss([tailwind({...tailwindConfig,content:['./src/pages/admin/ManageAgencyChannelsPage.jsx','./src/components/municipality/*.jsx','./src/components/ui/{button,input}.jsx','./src/pages/{AgencyCaseDetailsPage,AgencyDashboardPage,MunicipalityTeamPage}.jsx']})]).process(css,{from:path.join(root,'src/index.css')});
await fs.writeFile(path.join(out,'preview.css'),compiled.css+'\n'+await fs.readFile('node_modules/leaflet/dist/leaflet.css','utf8'));
await fs.writeFile(path.join(out,'index.html'),'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/preview.css"></head><body><div id="root"></div><script src="/preview.js"></script></body></html>');
const server=http.createServer(async(req,res)=>{try{const name=req.url.split('?')[0];const file=name==='/logo.png'?path.join(root,'public/logo.png'):path.join(out,name==='/'?'index.html':name);const body=await fs.readFile(file);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html');res.end(body);}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${path.join(out,'chrome-profile')}`,'about:blank'],{windowsHide:true});
try {
  const endpoint=await new Promise((resolve,reject)=>{let log='';chrome.stderr.on('data',d=>{log+=d;const m=log.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});chrome.on('error',reject);setTimeout(()=>reject(Error('Chrome timeout')),15000).unref();});
  const ws=new WebSocket(endpoint);await new Promise(r=>ws.addEventListener('open',r,{once:true}));let id=0;const pending=new Map();
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const [resolve,reject]=pending.get(m.id);pending.delete(m.id);m.error?reject(Error(m.error.message)):resolve(m.result);}});
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const next=++id;pending.set(next,[resolve,reject]);ws.send(JSON.stringify({id:next,method,params,sessionId}));});
  const {targetId}=await send('Target.createTarget',{url:'about:blank'});const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  const errors=[];ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);});
  await send('Runtime.enable',{},sessionId);
  const evaluate=async expression=>(await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId)).result.value;
  for(const page of (tablesOnly?['team','channels']:detailOnly?['case']:teamOnly?['team']:['dashboard','team','map']))for(const width of [1440,1920,390]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false},sessionId);
    await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/?${page}`},sessionId);
    await new Promise(r=>setTimeout(r,1100));
    for(const dark of [false,true]){
      await evaluate(`document.documentElement.classList.toggle('dark',${dark})`);
      await new Promise(r=>setTimeout(r,350));
      const metrics=await evaluate(`JSON.stringify({width:innerWidth,scroll:document.documentElement.scrollWidth,title:document.querySelector('main h1')?.textContent,logo:document.querySelector('header img')?.naturalWidth,background:getComputedStyle(document.body).backgroundColor})`);
      console.log(page,dark?'dark':'light',metrics);
      const parsed=JSON.parse(metrics);if(parsed.scroll>width||!parsed.title||!parsed.logo)throw Error('Falha na prévia '+metrics);
      const scrollTest=await evaluate(`(()=>{const main=document.querySelector('main');main.scrollTop=1000;const aside=document.querySelector('aside');return {documentHeight:document.documentElement.scrollHeight,mainScroll:main.scrollTop,asideBottom:aside.getBoundingClientRect().bottom,mainWidth:main.clientWidth,contentWidth:main.scrollWidth}})()`);
      if(scrollTest.documentHeight>1000||scrollTest.contentWidth>scrollTest.mainWidth||width>=980&&scrollTest.asideBottom>1000)throw Error('Scroll incorreto '+JSON.stringify(scrollTest));
      if(page==='dashboard'&&!scrollTest.mainScroll)throw Error('Lista não rolou');
      await evaluate(`document.querySelector('main').scrollTop=${page==='map'||page==='case'?450:0}`);
      if(width===1440){const shot=await send('Page.captureScreenshot',{format:'png'},sessionId);await fs.writeFile(path.join(out,`${page}-${dark?'dark':'light'}.png`),Buffer.from(shot.data,'base64'));}
    }
    if(page==='dashboard'){
      if(!await evaluate(`document.querySelectorAll('main a.group img[src="/logo.png"]').length===2`))throw Error('Fotos anexadas não usadas na lista');
      await evaluate(`(()=>{const el=[...document.querySelectorAll('label')].find(e=>e.textContent.startsWith('Categoria')).querySelector('select');el.value='iluminacao';el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await new Promise(r=>setTimeout(r,200));
      if(!await evaluate(`window.previewQueries.some(q=>q[0]==='orgao_casos'&&q[1]==='eq'&&q[2]==='report.category_id'&&q[3]==='iluminacao')`))throw Error('Filtro de categoria não conectado');
    }
    if(page==='map'){
      const before=await evaluate(`document.querySelectorAll('.leaflet-interactive').length`);
      await evaluate(`document.querySelector('section[aria-label="Mapa de demandas municipais"] input').click()`);
      await new Promise(r=>setTimeout(r,200));
      const after=await evaluate(`document.querySelectorAll('.leaflet-interactive').length`);
      if(after!==45||before<=after)throw Error('Camadas do mapa incorretas '+before+'/'+after);
    }
    if(page==='team'||page==='channels'){
      const run=async(expression)=>{await evaluate(expression);await new Promise(r=>setTimeout(r,150));};
      if(await evaluate('document.querySelectorAll("tbody tr").length')!==10)throw Error('Page size');
      await run('document.querySelector("button[aria-label=\\"Próxima página\\"]").click()');
      if(!await evaluate('document.querySelector("main").textContent.includes("Página 2")'))throw Error('Pagination');
      await run('document.querySelector("thead button").click()');
      if(!await evaluate('document.querySelector("main").textContent.includes("Página 1")'))throw Error('Sort reset');
      await run('document.querySelector("tbody button").click()');
      if(!await evaluate('!!document.querySelector("[role=dialog]")'))throw Error('Drawer did not open');
      const bounds=await evaluate('(()=>{const el=document.querySelector("[role=dialog]"),r=el.getBoundingClientRect();return {right:r.right,width:r.width,scroll:el.scrollWidth,client:el.clientWidth}})()');
      if(Math.abs(bounds.right-width)>1||bounds.width>width||bounds.scroll>bounds.client)throw Error('Drawer layout '+JSON.stringify(bounds));
      if(width===1440){const shot=await send('Page.captureScreenshot',{format:'png'},sessionId);await fs.writeFile(path.join(out,page+'-drawer.png'),Buffer.from(shot.data,'base64'));}
      if(page==='team'){
        await run('(()=>{const el=document.querySelector("#edit-member-role");el.value="leitura";el.dispatchEvent(new Event("change",{bubbles:true}));})()');
        await run('[...document.querySelectorAll("[role=dialog] button")].find(b=>b.textContent==="Salvar alterações").click()');
        if(!await evaluate('window.previewQueries.some(q=>q[0]==="orgao_membros"&&q[1]==="update"&&q[2].papel==="leitura")'))throw Error('Save missing');
      }else{
        await run('[...document.querySelectorAll("[role=dialog] button")].find(b=>b.textContent.includes("recebimento")).click()');
        if(!await evaluate('window.previewQueries.some(q=>q[0]==="orgao_canais"&&q[1]==="update")'))throw Error('Channel toggle missing');
      }
      await run('document.querySelector("button[aria-label=\\"Fechar painel\\"]")?.click()');
      await run('(()=>{const el=document.querySelector("input[placeholder]");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(el,"zzzinexistente");el.dispatchEvent(new Event("input",{bubbles:true}));})()');
      if(!await evaluate('document.querySelector("tbody").textContent.includes("Nenhum registro")'))throw Error('Search empty state');
      console.log(page+' table interactions OK',width);
    }
    if(page==='case'){
      if(!await evaluate(`document.querySelector('main img[alt^="Foto da bronca"]')?.naturalWidth>0`))throw Error('Imagem alternativa não carregou');
      const click=async(text)=>{const found=await evaluate(`(()=>{const el=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!el||el.disabled)return false;el.click();return true})()`);if(!found)throw Error('Botão indisponível: '+text);await new Promise(r=>setTimeout(r,150));};
      const input=async(selector,value)=>{await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);await new Promise(r=>setTimeout(r,150));};
      await evaluate(`document.querySelectorAll('nav[aria-label="Escolher etapa"] button')[1].click()`);
      await new Promise(r=>setTimeout(r,150));
      if(await evaluate(`window.previewSaves.length`)!==0)throw Error('Navegação salvou a etapa');
      if(!await evaluate(`!!document.querySelector('#agency-assignee')`))throw Error('Etapa não abriu campos');
      await input('#agency-assignee','preview');
      await click('Marcar como atribuída');
      await click('Salvar alterações');
      if(await evaluate(`window.previewSaves.at(-1)?.p_status`)!=='atribuida')throw Error('Atribuição incorreta');
      await click('Planejar atendimento');
      await input('#agency-protocol','2026/42');
      await input('#agency-deadline','2026-11-30T16:00');
      await click('Marcar como programada');
      await input('#agency-public-response','Atendimento programado para novembro.');
      await click('Nota interna');
      await input('#agency-internal-note','Confirmar material com a equipe.');
      await evaluate('window.failSave=true');
      await click('Salvar e publicar resposta');
      if(!await evaluate(`document.querySelector('#agency-internal-note').value.includes('Confirmar')`))throw Error('Falha apagou rascunho');
      await evaluate('window.failSave=false');
      await click('Salvar e publicar resposta');
      const saved=await evaluate('window.previewSaves.at(-1)');
      if(saved.p_status!=='programada'||saved.p_protocolo!=='2026/42'||!saved.p_resposta_publica||!saved.p_nota_interna)throw Error('Campos não preservados '+JSON.stringify(saved));
      if(!await evaluate(`document.querySelector('[aria-label="Salvar atendimento"] button').disabled`))throw Error('Salvamento duplicado habilitado');
      await input('#agency-case-status','recusada');
      const savedCount=await evaluate('window.previewSaves.length');
      await click('Salvar alterações');
      if(await evaluate('window.previewSaves.length')!==savedCount)throw Error('Recusa sem justificativa enviada');
      await input('#agency-public-response','A demanda é de responsabilidade de outro órgão.');
      await click('Salvar e publicar resposta');
      if(await evaluate('window.previewSaves.at(-1)?.p_status')!=='recusada')throw Error('Recusa justificada não salva');
      console.log('case interactions OK',width);
    }
  }
  if(detailOnly){
    for(const scenario of ['readonly','triage']){
      await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/?case&${scenario}`},sessionId);
      await new Promise(r=>setTimeout(r,800));
      if(!await evaluate(`document.querySelector('#agency-public-response')?.disabled`))throw Error('Resposta indevidamente habilitada: '+scenario);
      if(scenario==='readonly'&&await evaluate(`!!document.querySelector('[aria-label="Salvar atendimento"]')`))throw Error('Leitura pode salvar');
      if(scenario==='triage'&&!await evaluate(`!!document.querySelector('#agency-destination')`))throw Error('Triagem sem encaminhamento');
      console.log('case permissions OK',scenario);
    }
  }
  if(errors.length)throw Error(errors.join('; '));
  console.log('Preview artifacts:',out);
  await send('Browser.close');ws.close();
}finally{chrome.kill();server.close();}
