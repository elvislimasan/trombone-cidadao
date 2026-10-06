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

const root=process.cwd(), out=path.join(root,'.tmp/electrician-map-validation');
await fs.mkdir(out,{recursive:true});
const stubs={
  '@/design-system/theme/ThemeProvider':`export const useTheme=()=>({resolved:'light'});`,
  '@/contexts/UploadContext':`export const useUpload=()=>({activeUploads:{a:{id:'a',name:'Foto da bronca',status:'uploading',progress:42}},totalProgress:42,cancelUpload:()=>{}});`,
  '@/lib/appError':`export const showAppError=x=>{window.notices.push(x)};export const showAppNotice=()=>{};`,
  '@/hooks/useNavVoice':`export const useNavVoice=()=>({preparar:prepare,anunciar:announce,mudo:false,alternarMudo:()=>{},suportada:true});const prepare=()=>{};const announce=text=>window.voiceAlerts.push(text);`,
  '@/lib/customSupabaseClient':`
    const pole={id:1,identifier:'X159189',address:'Rua A',latitude:-8.6,longitude:-38.57,lighting_status:'apagado',updated_at:'2026-10-06T12:00:00Z'};
    export const supabase={from(table){let single=false;const q=new Proxy({}, {get(_,key){if(key==='then')return r=>Promise.resolve({data:table==='poles'?(single?pole:[pole]):[],error:null}).then(r);return ()=>{if(key==='single'||key==='maybeSingle')single=true;return q;};}});return q;},async rpc(name,args){
      if(name==='registrar_visita_poste_eletricista_v2'){window.savedVisits++;return {data:{},error:null};}
      if(name==='buscar_mapa_eletricista') {if(args.p_busca==='lenta')await new Promise(r=>setTimeout(r,1000));return {data:[{tipo:'ordem',poste:pole,ordem_id:'order',protocolo:args.p_busca==='lenta'?'LENTA':'DEM-123',titulo:'Manutenção'}],error:null};}
      if(name==='municipal_lighting_map_clusters')return {data:[{item_count:1,cluster_lat:pole.latitude,cluster_lng:pole.longitude,pole}],error:null};
      return {data:[],error:null};}};
    const rpc=supabase.rpc;supabase.rpc=(...args)=>({then:(ok,fail)=>rpc(...args).then(ok,fail)});`,
};
if(!process.argv.includes('--reuse-assets')) {
await build({loader:{'.png':'dataurl'},stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import L from 'leaflet';import ElectricianLightingMap from '@/components/municipality/ElectricianLightingMap';import WebUploadIndicator from '@/components/WebUploadIndicator';L.Map.addInitHook(function(){window.testMap=this;});const app=createRoot(document.getElementById('root'));window.unmount=()=>app.unmount();app.render(<MemoryRouter><main className="h-screen w-full"><ElectricianLightingMap municipality={{id:'city',city_id:1}}/><WebUploadIndicator/></main></MemoryRouter>);`,resolveDir:root,loader:'jsx'},bundle:true,outfile:path.join(out,'preview.js'),define:{'process.env.NODE_ENV':'"production"'},alias:{'@':path.join(root,'src')},plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>stubs[a.path]?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:stubs[a.path],loader:'jsx',resolveDir:root}));}}]});
let inputCss=await fs.readFile('src/index.css','utf8');
for(const token of ['primitives','semantic','typography','motion']) inputCss=inputCss.replace("@import './design-system/tokens/"+token+".css';",await fs.readFile('src/design-system/tokens/'+token+'.css','utf8'));
const css=await postcss([tailwind({...loadConfig(path.join(root,'tailwind.config.js')),content:[{raw:'h-screen w-full'},...['src/components/municipality/ElectricianLightingMap.jsx','src/components/municipality/ElectricianPoleVisitDrawer.jsx','src/components/municipality/MunicipalLightingMap.jsx','src/components/WebUploadIndicator.jsx','src/components/ui/{drawer,input,button,progress}.jsx'].map(file=>path.join(root,file))]})]).process(inputCss,{from:path.join(root,'src/index.css')});
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
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.notices=[];window.voiceAlerts=[];window.savedVisits=0;window.gps={watchers:{},cleared:[],next:0,emit(lat,lng,accuracy=5){Object.values(this.watchers).forEach(w=>w.ok({coords:{latitude:lat,longitude:lng,accuracy}}));}};Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok){setTimeout(()=>ok({coords:{latitude:-8.6,longitude:-38.57,accuracy:5}}),0);},watchPosition(ok,error){const id=++gps.next;gps.watchers[id]={ok,error};return id;},clearWatch(id){gps.cleared.push(id);delete gps.watchers[id];}}});`},sessionId);
  const evaluate=async(expression)=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  const pause=ms=>new Promise(r=>setTimeout(r,ms));
  const waitFor=async(expression)=>{for(let i=0;i<100;i++){if(await evaluate('Boolean('+expression+')'))return;await pause(100);}throw Error('Timeout: '+expression);};
  const results=[];
  for(const [width,height] of [[390,844],[1440,900],[1920,1080]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);
    await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port},sessionId);
    await waitFor('window.testMap && document.querySelector(`button[aria-label="Voltar ao centro da cidade"]`)');
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
    assert.ok(await evaluate('document.body.innerText.includes("Enviando arquivos: 42%")'));
    assert.ok(await evaluate('!document.querySelector(`button[aria-label="Ativar modo patrulha"]`)'));
    await evaluate('document.querySelector(`button[aria-label="Mostrar mapa de satélite"]`).click();void testMap.setZoom(19)');
    await waitFor('[...document.querySelectorAll(".leaflet-tile")].some(i=>i.src.includes("World_Imagery/MapServer/tile/18/"))');
    assert.ok(await evaluate('![...document.querySelectorAll(".leaflet-tile")].some(i=>i.src.includes("World_Imagery/MapServer/tile/19/"))'));
    const search=term=>evaluate(`(()=>{const input=document.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(term)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await search('lenta');await pause(400);await search('rapida');
    await waitFor('document.body.innerText.includes("DEM-123")');await pause(1100);
    assert.ok(await evaluate('!document.body.innerText.includes("LENTA")'));
    await evaluate('[...document.querySelectorAll("button")].find(e=>e.textContent.includes("DEM-123")).click()');
    await waitFor('document.querySelector(`button[aria-label="Fechar poste"]`)');
    assert.ok(await evaluate('document.body.innerText.includes("X159189")'));
    await evaluate('document.querySelector(`button[aria-label="Fechar poste"]`).click()');
    await pause(300);
    const screenshot=await send('Page.captureScreenshot',{format:'png'},sessionId);
    await fs.writeFile(path.join(out,`map-${width}.png`),Buffer.from(screenshot.data,'base64'));
    assert.ok(await evaluate('Object.keys(gps.watchers).length===0'));
    await evaluate('window.unmount()');
    results.push({width,overflow:false,uploadPercent:42,patrol:'acesso removido do mapa OK',search:'protocolo e respostas fora de ordem OK',satellite:'zoom 19 usando imagens do nível 18'});
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify(results,null,2));
}finally{ws?.close();chrome.kill();server.close();}
