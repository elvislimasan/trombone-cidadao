// Componentes reais, fila local e consultas simuladas; nenhum acesso ao Supabase.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import loadConfig from 'tailwindcss/loadConfig.js';

const root=process.cwd(), out=path.join(root,'.tmp/electrician-pagination-validation');
await fs.mkdir(out,{recursive:true});
const stubs={
  '@/design-system/theme/ThemeProvider':`export const useTheme=()=>({resolved:'light'});`,
  
  '@/contexts/SupabaseAuthContext':`const user={id:'11111111-1111-4111-8111-111111111111',name:'Eletricista Teste',email:'teste@local'};export const useAuth=()=>({user,signOut:async()=>{},refreshUserProfile:async()=>{}});`,
  '@/contexts/MapModeContext':`export const useMapModeToggle=()=>({mode:'default'});`,
  '@/contexts/NativeUIModeContext':`export const useNativeUIMode=()=>({isNative:false});`,
  '@/hooks/useIsDesktopViewport':`export const useIsDesktopViewport=()=>false;`,
  '@/components/Notifications':`export default function Notifications(){return null;}`,
  '@/contexts/UploadContext':`export const useUpload=()=>({activeUploads:{a:{id:'a',name:'Foto da bronca',status:'uploading',progress:42}},totalProgress:42,cancelUpload:()=>{}});`,
  '@/lib/appError':`export const showAppError=x=>{window.notices.push(x)};export const showAppNotice=()=>{};`,
  '@/hooks/useNavVoice':`export const useNavVoice=()=>({preparar:prepare,anunciar:announce,mudo:false,alternarMudo:()=>{},suportada:true});const prepare=()=>{};const announce=text=>window.voiceAlerts.push(text);`,
  '@/components/municipality/ElectricianLightingMap':`export default function Map(){return <div>Mapa de iluminação</div>}`,
  '@/lib/customSupabaseClient':`
    const rows=Array.from({length:53},(_,i)=>({tipo:'solicitacao',id:'row-'+(i+1),protocolo:'PAG-'+(i+1),titulo:'Poste '+(i+1),descricao:'Lâmpada apagada',endereco:'Rua A',bairro:'Centro',prioridade:'normal',status:'aberta',pole_id:i+1,report_id:'report-'+(i+1),created_at:new Date(2020,0,i+1).toISOString()}));
    export const supabase={rpc(name,args){const request={name,args};window.requests.push(request);let signal;return {abortSignal(s){signal=s;return this;},then(ok,fail){return new Promise(resolve=>setTimeout(()=>{
      request.aborted=Boolean(signal?.aborted);
      if(name==='listar_painel_eletricista'){
        if(window.failPage){resolve({data:null,error:{message:'Falha de teste'}});return;}
        let found=rows.filter(r=>args.p_aba==='disponiveis'||args.p_etapa==='fazer').filter(r=>!args.p_busca||r.protocolo.toLowerCase().includes(args.p_busca.toLowerCase())||r.titulo.toLowerCase().includes(args.p_busca.toLowerCase()));
        found=found.filter(r=>!args.p_adiadas.includes(r.tipo+':'+r.id));
        if(args.p_ordem==='recent')found=[...found].reverse();
        const page=Math.max(1,Math.min(args.p_pagina,Math.ceil(found.length/args.p_tamanho)));
        resolve({data:{items:found.slice((page-1)*args.p_tamanho,page*args.p_tamanho),total:found.length,page,stage_counts:{fazer:53,execucao:0,conferencia:0,historico:0}},error:null});
      }else resolve({data:[],error:null});
    },args.p_busca==='lenta'?1200:30)).then(ok,fail);}};},from(table){const request={table};window.auxRequests.push(request);const q=new Proxy({}, {get(_,k){if(k==='then')return (ok,fail)=>Promise.resolve({data:[],error:null}).then(ok,fail);return(...args)=>{if(k==='in')request.ids=args[1];return q;};}});return q;}};
  `,

};
if(!process.argv.includes('--reuse-assets')) {
await build({jsx:'automatic',loader:{'.png':'dataurl'},stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter,Routes,Route} from 'react-router-dom';import ElectricianLayout from '@/components/municipality/ElectricianLayout';import ElectricianPanelPage from '@/pages/ElectricianPanelPage';const context={userId:'11111111-1111-4111-8111-111111111111',municipality:{id:'city',city_id:1,nome:'Prefeitura teste',cidade:{name:'Floresta'}},memberships:[]};createRoot(document.getElementById('root')).render(<BrowserRouter><Routes><Route element={<ElectricianLayout context={context}/>}><Route path='/prefeitura/eletricista' element={<ElectricianPanelPage/>}/></Route></Routes></BrowserRouter>);`,resolveDir:root,loader:'jsx'},bundle:true,outfile:path.join(out,'preview.js'),define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{"DEV":false}'},alias:{'@':path.join(root,'src')},plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>stubs[a.path]?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:stubs[a.path],loader:'jsx',resolveDir:root}));}}]});
let inputCss=await fs.readFile('src/index.css','utf8');
for(const token of ['primitives','semantic','typography','motion']) inputCss=inputCss.replace("@import './design-system/tokens/"+token+".css';",await fs.readFile('src/design-system/tokens/'+token+'.css','utf8'));
const css=await postcss([tailwind({...loadConfig(path.join(root,'tailwind.config.js')),content:[{raw:'h-screen w-full'},...['src/pages/ElectricianPanelPage.jsx','src/components/MapView.jsx','src/components/map/MapDisplayControls.jsx','src/components/municipality/ElectricianPatrolAlert.jsx','src/pages/ElectricianProfilePage.jsx','src/pages/MyPatrolsPage.jsx','src/components/municipality/ElectricianLayout.jsx','src/components/patrol/**/*.jsx','src/components/municipality/ElectricianPoleVisitDrawer.jsx','src/components/municipality/MunicipalLightingMap.jsx','src/components/WebUploadIndicator.jsx','src/components/ui/{drawer,input,button,progress}.jsx'].map(file=>path.join(root,file))]})]).process(inputCss,{from:path.join(root,'src/index.css')});
await fs.writeFile(path.join(out,'preview.css'),(await fs.readFile(path.join(out,'preview.css'),'utf8'))+'\n'+css.css);
await fs.writeFile(path.join(out,'index.html'),'<html><head><meta charset="UTF-8"><link rel="stylesheet" href="/preview.css"></head><body><div id="root"></div><script src="/preview.js"></script></body></html>');
}
const server=http.createServer(async(req,res)=>{const file=path.join(out,req.url==='/preview.js'?'preview.js':req.url==='/preview.css'?'preview.css':'index.html');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(file));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
await fs.rm(path.join(out,'chrome-profile/DevToolsActivePort'),{force:true});
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--disable-extensions','--no-first-run','--remote-debugging-port=0','--user-data-dir='+path.join(out,'chrome-profile'),'about:blank'],{windowsHide:true});
let ws;
try{
  const endpoint=await new Promise((resolve,reject)=>{
    const started=Date.now();
    chrome.on('error',reject);
    const findEndpoint=async()=>{
      try {
        const [port,route]=(await fs.readFile(path.join(out,'chrome-profile/DevToolsActivePort'),'utf8')).trim().split(/\r?\n/);
        if(port && route){resolve('ws://127.0.0.1:'+port+route);return;}
      }catch{}
      if(Date.now()-started>20000){reject(Error('Chrome não abriu a depuração local'));return;}
      setTimeout(findEndpoint,100);
    };
    findEndpoint();
  });
  ws=new WebSocket(endpoint);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
  let id=0;const pending=new Map(), errors=[];
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message+" ("+p.method+")")):p.resolve(m.result);}});
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const next=++id;pending.set(next,{resolve,reject,method});ws.send(JSON.stringify({id:next,method,params,sessionId}));});
  const {targetId}=await send('Target.createTarget',{url:'about:blank'}), {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  await send('Runtime.enable',{},sessionId);
  await send('Page.enable',{},sessionId);
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.requests=[];window.auxRequests=[];window.failPage=false;`},sessionId);
  const evaluate=async(expression)=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  const pause=ms=>new Promise(r=>setTimeout(r,ms));
  const waitFor=async(expression)=>{for(let i=0;i<100;i++){if(await evaluate('Boolean(document.body && ('+expression+'))'))return;await pause(100);}throw Error('Timeout: '+expression+'; errors='+JSON.stringify(errors));};
  const results=[];
  const clickText=async(text)=>evaluate(`(()=>{const b=[...document.querySelectorAll('button,a')].find(x=>x.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('Missing button '+${JSON.stringify(text)});b.click();})()`);
  const touchable=async(text)=>evaluate(`(()=>{const b=[...document.querySelectorAll('button,a')].find(x=>x.textContent.trim()===${JSON.stringify(text)});const r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})()`);
  const alert='document.querySelector(`section[aria-label="Poste com problema próximo"]`)';
  const screenshot=async(name)=>{const capture=await send('Page.captureScreenshot',{format:'png'},sessionId);await fs.writeFile(path.join(out,name+'.png'),Buffer.from(capture.data,'base64'));};
  const cards='[...document.querySelectorAll("button")].filter(b=>b.textContent.includes("Ver detalhes")||b.textContent.includes("Abrir ordem"))';
  const input=async(value)=>evaluate(`(()=>{const i=document.querySelector('input[placeholder]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,${JSON.stringify(value)});i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  for(const [width,height] of [[390,844],[1440,900],[1920,1080]]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);
    await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/prefeitura/eletricista?aba=disponiveis&vista=lista'},sessionId);
    await waitFor('document.body.innerText.includes("Página 1 de 3")');
    assert.equal(await evaluate(cards+'.length'),20);
    assert.ok(await evaluate('requests.every(r=>r.name==="listar_painel_eletricista"&&r.args.p_tamanho===20&&r.args.p_aba==="disponiveis")'));
    assert.ok(await evaluate('auxRequests.every(r=>!r.ids||r.ids.length<=20)'));
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
    await screenshot(`available-${width}`);
    await evaluate('document.querySelector("main").scrollTop=document.querySelector("main").scrollHeight');
    await pause(100);assert.ok(await touchable('Próxima'));await screenshot(`pagination-${width}`);
    assert.ok(await evaluate('document.querySelector(`nav[aria-label="Paginação dos serviços"]`).getBoundingClientRect().bottom<=document.querySelector(`nav[aria-label="Painel do eletricista"]`).getBoundingClientRect().top-20'));
    await clickText('Próxima');await waitFor('document.body.innerText.includes("Página 2 de 3")');
    assert.equal(await evaluate(cards+'.length'),20);
    assert.ok(await evaluate(cards+'[0].textContent.includes("PAG-21")'));
    await clickText('Próxima');await waitFor('document.body.innerText.includes("Página 3 de 3")');
    assert.equal(await evaluate(cards+'.length'),13);
    assert.ok(await evaluate('document.querySelector(`button[aria-label="Próxima página"]`).disabled'));
    await clickText('Anterior');await waitFor('document.body.innerText.includes("Página 2 de 3")');
    await input('PAG-53');await waitFor('document.body.innerText.includes("Página 1 de 1")');
    assert.equal(await evaluate(cards+'.length'),1);
    assert.ok(await evaluate(cards+'[0].textContent.includes("PAG-53")'));
    await input('');await waitFor('document.body.innerText.includes("Página 1 de 3")');
    await evaluate('(()=>{const s=document.querySelector(`select[aria-label="Ordenar serviços"]`);Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set.call(s,"recent");s.dispatchEvent(new Event("change",{bubbles:true}));})()');
    await waitFor(cards+'[0]?.textContent.includes("PAG-53")');
    if(width===390) {
      await input('lenta');await waitFor('requests.some(r=>r.args.p_busca==="lenta")');
      await input('PAG-52');await waitFor(cards+'[0]?.textContent.includes("PAG-52")');
      await pause(1200);assert.equal(await evaluate(cards+'.length'),1);
      assert.ok(await evaluate('requests.some(r=>r.args.p_busca==="lenta"&&r.aborted)'));
      await evaluate('window.failPage=true;document.querySelector(`button[aria-label="Atualizar serviços"]`).click()');
      await waitFor('document.querySelector(`[role="alert"]`)?.textContent.includes("Falha de teste")');
      assert.ok(await evaluate('!document.querySelector(`nav[aria-label="Paginação dos serviços"]`)'));
      await evaluate('window.failPage=false;document.querySelector(`button[aria-label="Atualizar serviços"]`).click()');
      await waitFor(cards+'[0]?.textContent.includes("PAG-52")');
    }
    await input('');await waitFor('document.body.innerText.includes("Página 1 de 3")');
    await evaluate('document.querySelector(`a[aria-label="Minhas ordens"]`).click()');
    await waitFor('document.body.innerText.includes("Minhas ordens")&&document.body.innerText.includes("Página 1 de 3")');
    assert.equal(await evaluate(cards+'.length'),20);
    assert.ok(await evaluate('requests.at(-1).args.p_aba==="minhas"'));
    await clickText('Próxima');await waitFor('document.body.innerText.includes("Página 2 de 3")');
    await evaluate('[...document.querySelectorAll(`button[role="tab"]`)].find(b=>b.textContent.includes("Histórico")).click()');
    await waitFor('document.body.innerText.includes("Nenhuma ordem nesta etapa")');
    assert.equal(await evaluate('requests.at(-1).args.p_pagina'),1);
    const before=await evaluate('requests.length');
    await evaluate('document.querySelector(`a[aria-label="Mapa de iluminação"]`).click()');
    await waitFor('document.body.innerText.includes("Mapa de ilumina")');await pause(100);
    assert.equal(await evaluate('requests.length'),before);
    results.push({width,pageSize:20,available:true,mine:true,searchOutsideFirstPage:true,filtersResetPage:true,overflow:false});
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify(results,null,2));
}finally{ws?.close();chrome.kill();server.close();}
