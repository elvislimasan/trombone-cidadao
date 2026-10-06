// Componentes reais, dados locais e GPS simulado; nenhum acesso ao Supabase.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import loadConfig from 'tailwindcss/loadConfig.js';

const root=process.cwd(), out=path.join(root,'.tmp/electrician-patrol-validation');
await fs.mkdir(out,{recursive:true});
const figures=path.join(root,'src/assets/patrol/avatar/figura');
const publishedFigures=(await fs.readdir(figures)).filter(file=>file.endsWith('.webp'));
const renderRegistry=publishedFigures.map(file=>['figura/'+file.slice(0,-5),'/avatar/'+file]);
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
  '@/lib/customSupabaseClient':`
    const pole={id:1,identifier:'X159189',address:'Rua A',latitude:-8.6,longitude:-38.57,lighting_status:'apagado',updated_at:'2026-10-06T12:00:00Z'};
    export const supabase={from(table){let single=false,op='select',value;const q=new Proxy({}, {get(_,key){if(key==='then')return r=>{let data=[];let error=null;
      if(table==='poles')data=single?{...pole}:[{...pole}];
      if(table==='patrols'&&op==='insert'){if(window.saveMode==='reject')error={message:'validation error',code:'23514'};else if(window.saveMode==='offline')error={message:'Failed to fetch'};else {data={...value,id:crypto.randomUUID()};window.savedPatrols.push(data);}}
      if(table==='patrol_paths'&&op==='upsert'){window.savedPaths.push(value);data=value;}
      if(table==='patrols'&&op==='select')data=window.savedPatrols;
      return Promise.resolve({data,error}).then(r);};return (...args)=>{if(key==='single'||key==='maybeSingle')single=true;if(key==='insert'||key==='upsert'){op=key;value=args[0];}return q;};}});return q;},async rpc(name,args){
      if(name==='registrar_visita_poste_eletricista_v2'){window.savedVisits++;pole.lighting_status=args.p_status;return {data:{},error:null};}
      return {data:[],error:null};}};
    const rpc=supabase.rpc;supabase.rpc=(...args)=>({then:(ok,fail)=>rpc(...args).then(ok,fail)});`,
};
if(!process.argv.includes('--reuse-assets')) {
await build({jsx:'automatic',loader:{'.png':'dataurl'},stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter,Routes,Route,Outlet} from 'react-router-dom';import {Helmet} from 'react-helmet';import L from 'leaflet';import ElectricianLayout from '@/components/municipality/ElectricianLayout';import ElectricianProfilePage from '@/pages/ElectricianProfilePage';import ElectricianPatrolPage from '@/pages/ElectricianPatrolPage';import MyPatrolsPage from '@/pages/MyPatrolsPage';const context={municipality:{id:'city',city_id:1,nome:'Prefeitura teste',cidade:{name:'Floresta'}},memberships:[]};L.Map.addInitHook(function(){window.testMap=this;});const app=createRoot(document.getElementById('root'));window.unmount=()=>app.unmount();app.render(<BrowserRouter><Routes><Route element={<ElectricianLayout context={context}/>}><Route path='/prefeitura/eletricista/perfil' element={<ElectricianProfilePage/>}/><Route path='/prefeitura/eletricista/patrulha' element={<ElectricianPatrolPage/>}/><Route path='/prefeitura/eletricista/patrulha/ativa' element={<ElectricianPatrolPage running/>}/><Route path='/prefeitura/eletricista/patrulhas' element={<MyPatrolsPage electrician/>}/></Route></Routes></BrowserRouter>);`,resolveDir:root,loader:'jsx'},bundle:true,outfile:path.join(out,'preview.js'),define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{"DEV":false}'},alias:{'@':path.join(root,'src')},plugins:[{name:'fixtures',setup(b){b.onLoad({filter:/carregarRenders\.js$/},()=>({contents:`import {registrarRenders} from './renderizacoes';export const RENDERS_CARREGADOS=registrarRenders(new Map(${JSON.stringify(renderRegistry)}));`,loader:'js',resolveDir:path.join(root,'src/components/patrol/avatar')}));b.onResolve({filter:/.*/},a=>stubs[a.path]?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:stubs[a.path],loader:'jsx',resolveDir:root}));}}]});
let inputCss=await fs.readFile('src/index.css','utf8');
for(const token of ['primitives','semantic','typography','motion']) inputCss=inputCss.replace("@import './design-system/tokens/"+token+".css';",await fs.readFile('src/design-system/tokens/'+token+'.css','utf8'));
const css=await postcss([tailwind({...loadConfig(path.join(root,'tailwind.config.js')),content:[{raw:'h-screen w-full'},...['src/pages/ElectricianPatrolPage.jsx','src/components/MapView.jsx','src/components/map/MapDisplayControls.jsx','src/components/municipality/ElectricianPatrolAlert.jsx','src/pages/ElectricianProfilePage.jsx','src/pages/MyPatrolsPage.jsx','src/components/municipality/ElectricianLayout.jsx','src/components/patrol/**/*.jsx','src/components/municipality/ElectricianPoleVisitDrawer.jsx','src/components/municipality/MunicipalLightingMap.jsx','src/components/WebUploadIndicator.jsx','src/components/ui/{drawer,input,button,progress}.jsx'].map(file=>path.join(root,file))]})]).process(inputCss,{from:path.join(root,'src/index.css')});
await fs.writeFile(path.join(out,'preview.css'),(await fs.readFile(path.join(out,'preview.css'),'utf8'))+'\n'+css.css);
await fs.writeFile(path.join(out,'index.html'),'<html><head><meta charset="UTF-8"><link rel="stylesheet" href="/preview.css"></head><body><div id="root"></div><script src="/preview.js"></script></body></html>');
}
const server=http.createServer(async(req,res)=>{const avatarFile=req.url?.startsWith('/avatar/')?req.url.slice(8):null;const file=avatarFile&&publishedFigures.includes(avatarFile)?path.join(figures,avatarFile):path.join(out,req.url==='/preview.js'?'preview.js':req.url==='/preview.css'?'preview.css':'index.html');res.setHeader('Content-Type',file.endsWith('.webp')?'image/webp':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(file));});
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
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`const actualNow=Date.now;window.timeShift=0;Date.now=()=>actualNow()+window.timeShift;window.notices=[];window.voiceAlerts=[];window.savedVisits=0;window.savedPatrols=[];window.savedPaths=[];window.saveMode='ok';window.gps={watchers:{},cleared:[],next:0,emit(lat,lng,accuracy=5){Object.values(this.watchers).forEach(w=>w.ok({coords:{latitude:lat,longitude:lng,accuracy}}));}};Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok){setTimeout(()=>ok({coords:{latitude:-8.6,longitude:-38.57,accuracy:5}}),0);},watchPosition(ok,error){const id=++gps.next;gps.watchers[id]={ok,error};return id;},clearWatch(id){gps.cleared.push(id);delete gps.watchers[id];}}});`},sessionId);
  const evaluate=async(expression)=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  const pause=ms=>new Promise(r=>setTimeout(r,ms));
  const waitFor=async(expression)=>{for(let i=0;i<100;i++){if(await evaluate('Boolean(document.body && ('+expression+'))'))return;await pause(100);}throw Error('Timeout: '+expression+'; errors='+JSON.stringify(errors));};
  const results=[];
  const clickText=async(text)=>evaluate(`(()=>{const b=[...document.querySelectorAll('button,a')].find(x=>x.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('Missing button '+${JSON.stringify(text)});b.click();})()`);
  const touchable=async(text)=>evaluate(`(()=>{const b=[...document.querySelectorAll('button,a')].find(x=>x.textContent.trim()===${JSON.stringify(text)});const r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})()`);
  const alert='document.querySelector(`section[aria-label="Poste com problema próximo"]`)';
  const screenshot=async(name)=>{const capture=await send('Page.captureScreenshot',{format:'png'},sessionId);await fs.writeFile(path.join(out,name+'.png'),Buffer.from(capture.data,'base64'));};
  for(const [width,height] of [[390,844],[1440,900],[1920,1080]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);
    const load=async(route='/perfil')=>{await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/prefeitura/eletricista'+route},sessionId);};
    await load();await waitFor('document.body.innerText.includes("Sair em patrulha")');
    await evaluate('localStorage.removeItem("patrol_avatar");localStorage.removeItem("patrol_travel_mode")');
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
    await screenshot(`profile-${width}`);
    await clickText('Minhas patrulhas');await waitFor('document.body.innerText.includes("Nenhuma patrulha ainda")');
    assert.equal(await evaluate('[...document.querySelectorAll("a")].filter(a=>a.getAttribute("href")==="/prefeitura/eletricista/patrulha").length'),1);
    await screenshot(`history-empty-${width}`);
    await clickText('Iniciar nova patrulha');await waitFor('document.body.innerText.includes("Escolha seu ritmo")');
    assert.ok(await evaluate('!document.body.innerText.includes("Vistoriar os postes do município")'));
    assert.ok(await evaluate('!document.querySelector(`nav[aria-label="Painel do eletricista"]`)'));
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
    assert.ok(await touchable('Iniciar patrulha'));
    await screenshot(`preparation-${width}`);
    await evaluate('[...document.querySelectorAll(`button[role="radio"]`)].find(b=>b.textContent.includes("A pé")).click()');
    await waitFor('document.querySelector(`.patrol-avatar--sprite-walk`)');
    assert.ok(await evaluate('document.querySelector(`.patrol-avatar__sprite`).style.backgroundImage.includes("masculino-eletricista-costas-walk-4x1")'));
    await evaluate('document.querySelector(`.patrol-avatar`).closest("section").scrollIntoView({block:"center"})');
    await pause(500);
    await screenshot(`electrician-avatar-${width}`);
    await clickText('Escolher boneco');
    await waitFor('document.querySelector(`[role="dialog"]`)');
    assert.ok(await evaluate('document.querySelector(`[role="dialog"]`).innerText.includes("uniforme de eletricista")'));
    await evaluate('[...document.querySelectorAll(`[role="dialog"] button[role="radio"]`)].find(b=>b.textContent.includes("Feminino")).click()');
    await pause(350);
    assert.ok(await touchable('Usar feminino'));
    await screenshot(`electrician-choice-${width}`);
    await clickText('Usar feminino');
    assert.ok(await evaluate('document.querySelector(`.patrol-avatar__sprite`).style.backgroundImage.includes("feminino-eletricista-costas-walk-4x1")'));
    assert.equal(await evaluate('JSON.parse(localStorage.getItem("patrol_avatar")).estilo'),'urbano');
    await evaluate('[...document.querySelectorAll(`button[role="radio"]`)].find(b=>b.textContent.includes("De carro")).click()');
    await clickText('Iniciar patrulha');await waitFor('document.body.innerText.includes("Antes de começar")');
    assert.ok(await evaluate('Object.keys(gps.watchers).length===0'));
    await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("Entendi")).click()');
    await waitFor('Object.keys(gps.watchers).length===1');
    await evaluate('gps.emit(-8.60008,-38.57,30)');await pause(200);assert.ok(await evaluate('!'+alert));
    await evaluate('gps.emit(-8.60008,-38.57,5)');await waitFor(alert+' && window.testMap');
    assert.ok(await evaluate('voiceAlerts.length>0 && savedVisits===0'));
    assert.ok(await evaluate('!document.querySelector(`nav[aria-label="Painel do eletricista"]`)'));
    assert.ok(await touchable('Atualizar poste'));
    await screenshot(`active-${width}`);
    if(width===390){
      await clickText('Depois');await waitFor('!'+alert);
      await clickText('Encerrar patrulha');await waitFor('document.body.innerText.includes("Encerrar a patrulha?")');
      await clickText('Continuar patrulhando');await waitFor('Object.keys(gps.watchers).length===1');
      await evaluate('gps.emit(-8.60008,-38.57,5)');await pause(100);assert.ok(await evaluate('!'+alert));
      await evaluate('document.querySelector(".custom-leaflet-icon").click()');
    } else await clickText('Atualizar poste');
    await waitFor('document.querySelector(`button[aria-label="Fechar poste"]`)');
    await waitFor('Object.keys(gps.watchers).length===0');
    assert.ok(await evaluate('savedVisits===0'));
    if(width===390){
      await evaluate('window.history.back()');await waitFor('!document.querySelector(`button[aria-label="Fechar poste"]`)');
      await waitFor('Object.keys(gps.watchers).length===1');
      await evaluate('document.querySelector(".custom-leaflet-icon").click()');await waitFor('document.querySelector(`button[aria-label="Fechar poste"]`)');
    }
    await evaluate('(()=>{const s=document.querySelector("select");Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set.call(s,"aceso");s.dispatchEvent(new Event("change",{bubbles:true}));})()');
    await clickText('Salvar dados do poste');await waitFor('savedVisits===1 && !document.querySelector(`button[aria-label="Fechar poste"]`)');
    await waitFor('Object.keys(gps.watchers).length===1');
    await evaluate('gps.emit(-8.60008,-38.57,5)');await pause(200);assert.ok(await evaluate('!'+alert));
    await evaluate('window.timeShift+=5000;gps.emit(-8.6004,-38.57,5)');await pause(50);
    await evaluate('window.timeShift+=5000;gps.emit(-8.6008,-38.57,5)');await pause(50);
    await evaluate('window.timeShift+=5000;gps.emit(-8.6012,-38.57,5)');await pause(50);
    await evaluate('window.history.back()');await waitFor('document.body.innerText.includes("Encerrar a patrulha?")');
    await clickText('Continuar patrulhando');await waitFor('Object.keys(gps.watchers).length===1');
    await clickText('Encerrar patrulha');await waitFor('document.body.innerText.includes("Encerrar a patrulha?")');
    if(width===390){await evaluate('window.saveMode="reject"');await clickText('Encerrar e salvar');await waitFor('document.body.innerText.includes("Não foi possível salvar a patrulha")');assert.equal(await evaluate('savedPatrols.length'),0);await evaluate('window.saveMode="ok"');}
    await clickText('Encerrar e salvar');await waitFor('document.body.innerText.includes("Patrulha concluída")');
    await waitFor('Object.keys(gps.watchers).length===0');
    const saved=await evaluate('savedPatrols');assert.equal(saved.length,1);assert.equal(saved[0].city_id,1);assert.equal(saved[0].lighting_patrol,true);assert.deepEqual(saved[0].lighting_passed_pole_ids,['1']);assert.deepEqual(saved[0].lighting_updated_pole_ids,['1']);assert.equal(saved[0].travel_mode,'driving');assert.deepEqual(saved[0].passed_report_ids,[]);assert.ok(saved[0].distance_meters>=30);assert.ok(saved[0].duration_seconds>=15);
    const paths=await evaluate('savedPaths');assert.equal(paths.length,1);assert.equal(paths[0].patrol_id,saved[0].id);assert.equal(paths[0].actions[0].t,'confirmacao');assert.ok(paths[0].points>=2);
    await screenshot(`summary-${width}`);
    await clickText('Voltar ao perfil');await waitFor('document.body.innerText.includes("Sair em patrulha")');
    await clickText('Minhas patrulhas');await waitFor('document.body.innerText.includes("postes atualizados")');
    assert.ok(await evaluate('document.body.innerText.includes("1/1") && document.documentElement.scrollWidth<=innerWidth'));
    await screenshot(`history-${width}`);
    results.push({width,profileEntry:true,fullScreen:true,poleUpdate:true,savedPatrol:true,privatePath:true,history:true,backGuard:true,overflow:false});
    if(width===390){
      await load('/patrulha/ativa?modo=walking');await waitFor('document.body.innerText.includes("Antes de começar")');await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("Entendi")).click()');await waitFor('Object.keys(gps.watchers).length===1');
      await evaluate('gps.emit(-8.601,-38.57,5)');await waitFor('document.querySelector(`.patrol-avatar--walking.patrol-avatar--render`)');
      assert.ok(await evaluate('document.querySelector(`.patrol-avatar__flat`).style.backgroundImage.includes("feminino-eletricista-costas.webp")'));
      await pause(1000);
      assert.ok(await evaluate('(()=>{const r=document.querySelector(`.patrol-avatar`).getBoundingClientRect();return r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;})()'));
      await screenshot('electrician-walking-map-390');
      await clickText('Encerrar patrulha');await waitFor('document.body.innerText.includes("Encerrar a patrulha?")');await evaluate('window.saveMode="offline"');await clickText('Encerrar e salvar');await waitFor('document.body.innerText.includes("guardada neste aparelho")');
      assert.equal(await evaluate('savedPatrols.length'),0);assert.ok(await evaluate('Object.keys(gps.watchers).length===0'));
      const queued=await evaluate('new Promise((resolve,reject)=>{const r=indexedDB.open("tc_offline");r.onsuccess=()=>{const q=r.result.transaction("fila_v1").objectStore("fila_v1").getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);};r.onerror=()=>reject(r.error);})');
      assert.equal(queued.length,1);assert.equal(queued[0].tipo,'saida');assert.equal(queued[0].dados.patrulha.lighting_patrol,true);assert.equal(queued[0].dados.patrulha.travel_mode,'walking');
      results.push({offline:true,payloadPersisted:true});
    }
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify(results,null,2));
}finally{ws?.close();chrome.kill();server.close();}
