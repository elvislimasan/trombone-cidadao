// Componentes reais e respostas simuladas, sem acesso ao Supabase ou geocodificação externa.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import loadConfig from 'tailwindcss/loadConfig.js';

const root = process.cwd();
const out = await fs.mkdtemp(path.join(os.tmpdir(), 'municipal-orders-'));
const mocks = {
  '@/contexts/SupabaseAuthContext': `export const useAuth=()=>({user:{id:'staff',name:'Equipe municipal'},signOut:async()=>{}});`,
  '@/contexts/CityContext': `export const useCity=()=>({activeCity:null});`,
  '@/lib/geocodeCity': `export const geocodeCity=async()=>({lat:-8.601,lng:-38.569});`,
  '@/components/map/ThemedTileLayer': `export default function Tiles(){return null;}`,
  '@/lib/appError': `export const showAppError=(v)=>window.feedback=v;export const showAppNotice=(v)=>window.feedback=v;`,
  '@/design-system/theme/ThemeProvider': `export const useTheme=()=>({resolved:'light',setPreference:()=>{}});`,
  '@/lib/customSupabaseClient': `
    const reader=location.search.includes('readonly');
    const municipality={id:'pref',city_id:64,nome:'Prefeitura de Floresta',status:'ativa',cidade:{name:'Floresta',states:{uf:'PE'}}};
    const order={id:'order0',prefeitura_id:'pref',protocolo:'DEM-0001',titulo:'Substituir luminária na Rua A',bairro:'Centro',endereco:'Rua A',latitude:-8.601,longitude:-38.569,status:'aberta',versao:1,prioridade:'normal',canal_id:'lighting',atribuido_a:'staff',category_id:'iluminacao',created_at:'2026-09-20',updated_at:'2026-09-28',category:{name:'Iluminação pública'},responsavel:{name:'Equipe municipal'},secretaria:{nome:'Iluminação pública'},origem:'interno'};
    const report={id:'r1',title:'Luminária apagada na Rua A',description:'A luz está apagada há três dias.',address:'Rua A',neighborhood:'Centro',category_id:'iluminacao',city_id:64,moderation_status:'approved',status:'pending',location:{coordinates:[-38.569,-8.601]}};
    const data={site_config:{site_name:'Trombone Cidadão',logo_url:'/logo.png'},prefeitura_membros:[{user_id:'staff',ativo:true,papel:reader?'colaborador':'administrador',prefeitura:municipality}],orgao_canais:[{id:'lighting',city_id:64,nome:'Iluminação pública',canal_triagem:false}],orgao_membros:[{canal_id:'lighting',user_id:'staff',ativo:true,papel:reader?'leitura':'operador',perfil:{name:'Equipe municipal'}}],categories:[{id:'iluminacao',name:'Iluminação pública'}],orgao_categorias:[{category_id:'iluminacao',canal_id:'lighting'}],prefeitura_servico_regras:[],demandas_municipais:Array.from({length:28},(_,i)=>({...order,id:'order'+i,protocolo:'DEM-'+i})),reports:[report],demanda_broncas:[],demanda_eventos:[],demanda_anexos:[],report_official_steps:[],report_updates:[]};
    if(location.search.includes('linked')){
      Object.assign(data.demandas_municipais[0],{endereco:null,bairro:null,latitude:null,longitude:null});
      data.reports=Array.from({length:location.search.includes('manylinked')?80:4},(_,i)=>({...report,id:'r'+(i+1),title:'Bronca '+(i+1),address:'Rua vinculada '+(i+1),location:{coordinates:[-38.569+i*0.0003,-8.601+i*0.0003]}}));
      if(location.search.includes('missinglocations')){data.reports[2].address=null;data.reports[2].location=null;data.reports[3].location={coordinates:[null,null]};}
      data.demanda_broncas=data.reports.map(r=>({demanda_id:'order0',report_id:r.id,report:r}));
      data.buscar_broncas_para_demanda=[{...report,id:'r5',title:'Bronca 5',address:'Rua vinculada 5',location:{coordinates:[-38.6,-8.62]}}];
      data.reports.push(data.buscar_broncas_para_demanda[0]);
    }
    data.poles=['aceso','apagado','manutencao','nao_informado','aceso','removido'].map((status,i)=>({id:i+1,city_id:64,identifier:String(4287+i),address:'Rua Joaquim Nogueira Ferraz',latitude:-8.601+i*0.001,longitude:-38.569+i*0.001,lamp_type:'LED',lamp_power_w:100,lighting_status:status,is_broken:i===4||i===5,updated_at:'2026-09-28T18:43:00Z'}));
    if(location.search.includes('noaddress'))data.poles[0].address=null;
    data.pole_lighting_changes=[{id:'change1',pole_id:1,city_id:64,changed_at:'2026-09-28T18:43:00Z',old_status:'apagado',new_status:'aceso',new_power_w:100,new_lamp_type:'LED',action:'updated'}];
    data.demandas_municipais[0].atribuido_a=null;data.demandas_municipais[1].atribuido_a=null;
    for(const [status,n] of [['triagem',3],['programada',2],['em_andamento',1],['aguardando_informacao',2],['aguardando_recurso',1],['aguardando_confirmacao',2],['concluida',4],['recusada',1],['cancelada',2]])for(let i=0;i<n;i++)data.demandas_municipais.push({...order,id:status+i,protocolo:status+'-'+i,status,atribuido_a:i===0?null:'staff'});
    const today=new Date();today.setHours(12,0,0,0);
    data.demandas_municipais[0].prazo_em=today.toISOString();
    data.demandas_municipais.find(r=>r.id==='concluida0').prazo_em=today.toISOString();
    data.demandas_municipais.find(r=>r.id==='triagem0').prazo_em=new Date(today.getTime()-86400000).toISOString();
    window.saves=[];window.geoCalls=[];window.pendingGeo=[];window.invites=[];window.lightingSaves=[];window.pendingLightingSaves=[];
    window.acceptResponsible=()=>data.orgao_membros.push({canal_id:'lighting',user_id:'invited-staff',ativo:true,papel:'operador',perfil:{name:'Nova responsável'}});
    const query=(key,filters=[],range=null,single=false)=>new Proxy({}, {get:(_,prop)=>prop==='then'?resolve=>{
      const matches=(r,field,operation,value)=>operation==='in'?value.includes(r[field]):operation==='gte'?r[field]!=null&&r[field]>=value:operation==='lte'?r[field]!=null&&r[field]<=value:operation==='lt'?r[field]!=null&&r[field]<value:operation==='neq'?r[field]!==value:operation==='is'?r[field]==value:operation==='ilike'?String(r[field]||'').toLowerCase().includes(String(value).replaceAll('%','').toLowerCase()):r[field]===value;
      let rows=data[key]||[];if(Array.isArray(rows))for(const [field,value,operation] of filters)rows=rows.filter(r=>operation==='or'?value.split(',').some(term=>{const [f,op,...parts]=term.split('.');const raw=parts.join('.');const v=raw==='true'?true:raw==='false'?false:raw==='null'?null:raw;return matches(r,f,op,v);}):matches(r,field,operation,value));
      const count=Array.isArray(rows)?rows.length:1;
      if(range&&Array.isArray(rows))rows=rows.slice(range[0],range[1]+1);
      return Promise.resolve({data:structuredClone(single&&Array.isArray(rows)?rows[0]||null:rows),count}).then(resolve);
    }:(...args)=>query(key,['eq','is','in','gte','lte','lt','neq','ilike','or'].includes(prop)?[...filters,prop==='or'?['',args[0],'or']:[...args,prop]]:filters,prop==='range'?args:range,prop==='maybeSingle'||single)});
    export const supabase={from:query,rpc:(name,args)=>{
      if(name==='salvar_demanda_municipal'){window.saves.push(args);data.demandas_municipais.push({...order,...args.p_dados,id:args.p_id});return Promise.resolve({data:{id:args.p_id,status:args.p_dados.status,versao:1}});}
      if(name==='criar_convite_funcionario_prefeitura'){window.invites.push(args);return Promise.resolve({data:{token:'invite-token',expires_at:'2026-10-05'}});}
      if(name==='resumo_demandas_municipais'){const rows=data.demandas_municipais;const open=rows.filter(r=>!['concluida','recusada','cancelada'].includes(r.status));data[name]={total:rows.length,abertas:rows.filter(r=>r.status==='aberta').length,em_andamento:rows.filter(r=>['triagem','programada','em_andamento','aguardando_informacao','aguardando_recurso'].includes(r.status)).length,concluidas:rows.filter(r=>r.status==='concluida').length,atrasadas:open.filter(r=>r.prazo_em&&new Date(r.prazo_em)<new Date()).length,aguardando_confirmacao:rows.filter(r=>r.status==='aguardando_confirmacao').length,sem_responsavel:open.filter(r=>!r.atribuido_a).length,revisao_pendente:0};return query(name);}
      if(name==='gerir_iluminacao_municipal'){
        window.lightingSaves.push(args);
        if(window.lightingSaveError)return Promise.resolve({error:{message:'Falha ao salvar o poste'}});
        const saved=()=>{const pole=data.poles.find(p=>p.id===args.p_pole_id);if(pole)Object.assign(pole,{address:args.p_address,identifier:args.p_number,lamp_type:args.p_lamp_type,lamp_power_w:args.p_power_w,lighting_status:args.p_status});return {data:args.p_pole_id||7};};
        if(window.deferLightingSave)return new Promise(resolve=>window.pendingLightingSaves.push(()=>resolve(saved())));
        return Promise.resolve(saved());
      }
      if(name==='salvar_configuracao_atendimento')return Promise.resolve({data:null});
      if(name==='buscar_broncas_para_demanda')return query(name);
      if(name==='atendimento_publico_bronca')return Promise.resolve({data:{protocolo:'DEM-1',orgao:'Iluminação pública',status:'concluida',resultado:'Luminária substituída.',executada_em:'2026-09-28',anexos:[]}});
      return Promise.resolve({data:[]});
    },functions:{invoke:(name,args)=>{
      window.geoCalls.push(args.body);
      if(window.geoFail)return Promise.resolve({data:null,error:{message:'Falha na geocodificação'}});
      const result={data:{address:'Rua do ponto marcado',suburb:'Bairro novo',city:'Floresta',state_uf:'PE'}};
      if(window.deferGeo)return new Promise(resolve=>window.pendingGeo.push({resolve,args}));
      return Promise.resolve(result);
    }},storage:{from:()=>({createSignedUrls:async()=>({data:[]}),upload:async()=>({}),remove:async()=>({})})}};
  `,
};
await build({
  stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter,Routes,Route} from 'react-router-dom';import Layout from './src/components/municipality/MunicipalityLayout';import Orders from './src/pages/MunicipalDemandsPage';import Lighting from './src/pages/MunicipalLightingPage';import Reports from './src/pages/MunicipalReportsPage';import Settings from './src/pages/MunicipalServiceSettingsPage';const params=new URLSearchParams(location.search);const entry=params.has('lighting')?'/prefeitura/iluminacao':params.has('new')?'/prefeitura/demandas/nova?bronca=r1':params.has('readonly')||params.has('linked')?'/prefeitura/demandas/order0':params.has('settings')?'/prefeitura/configuracoes':params.has('reports')?'/prefeitura/broncas':'/prefeitura/demandas';createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={[entry]}><Routes><Route element={<Layout/>}><Route path="/prefeitura/demandas" element={<Orders/>}/><Route path="/prefeitura/demandas/nova" element={<Orders view="form"/>}/><Route path="/prefeitura/demandas/:id" element={<Orders view="form"/>}/><Route path="/prefeitura/iluminacao" element={<Lighting/>}/><Route path="/prefeitura/broncas" element={<Reports/>}/><Route path="/prefeitura/configuracoes" element={<Settings/>}/></Route></Routes></MemoryRouter>);`, resolveDir: root, loader: 'jsx' },
  bundle: true, jsx: 'automatic', outfile: path.join(out, 'preview.js'), loader: { '.css': 'empty', '.png': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.DEV': 'false' },
  plugins: [{ name: 'preview', setup(b) {
    b.onResolve({ filter: /^@\// }, args => mocks[args.path] ? { path: args.path, namespace: 'mock' } : b.resolve(path.join(root, 'src', args.path.slice(2)), { resolveDir: root, kind: args.kind }));
    b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: mocks[args.path], loader: 'js', resolveDir: root }));
  } }],
});
let css = await fs.readFile('src/index.css', 'utf8');
for (const match of [...css.matchAll(/@import '([^']+)';/g)]) css = css.replace(match[0], await fs.readFile(path.join(root, 'src', match[1]), 'utf8'));
const compiled = await postcss([tailwind({ ...loadConfig(path.join(root, 'tailwind.config.js')), content: ['./src/components/municipality/*.jsx', './src/components/ui/*.jsx', './src/pages/Municipal*.jsx', './src/components/LocationPickerMap.jsx'] })]).process(css, { from: path.join(root, 'src/index.css') });
await fs.writeFile(path.join(out, 'preview.css'), compiled.css + '\n' + await fs.readFile('node_modules/leaflet/dist/leaflet.css', 'utf8'));
await fs.writeFile(path.join(out, 'index.html'), '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/preview.css"></head><body><div id="root"></div><script src="/preview.js"></script></body></html>');
const server = http.createServer(async (req, res) => {
  try {
    const name = req.url.split('?')[0]; const file = name === '/logo.png' ? path.join(root, 'public/logo.png') : path.join(out, name === '/' ? 'index.html' : name);
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : 'text/html'); res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', '--user-data-dir=' + path.join(out, 'chrome-profile'), 'about:blank'], { windowsHide: true });
try {
  const endpoint = await new Promise((resolve, reject) => {
    let log = ''; chrome.stderr.on('data', chunk => { log += chunk; const match = log.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) resolve(match[1]); });
    chrome.on('error', reject); setTimeout(() => reject(Error('Chrome timeout')), 15000).unref();
  });
  const ws = new WebSocket(endpoint); await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let id = 0; const pending = new Map(); const errors = [];
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (message.id) { const [resolve, reject] = pending.get(message.id); pending.delete(message.id); message.error ? reject(Error(message.error.message)) : resolve(message.result); }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const next = ++id; pending.set(next, [resolve, reject]); ws.send(JSON.stringify({ id: next, method, params, sessionId })); });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' }); const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Runtime.enable', {}, sessionId);
  ws.addEventListener('message', event => { const message = JSON.parse(event.data); if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') console.error('Browser:', message.params.args.map(arg => arg.value || arg.description).join(' ')); });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails)); return result.result.value;
  };
  const pause = (ms = 250) => new Promise(resolve => setTimeout(resolve, ms));
  const navigate = async (page, width = 1440) => {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
    await send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/?' + page }, sessionId); await pause(1000);
  };
  for (const width of [1440, 1920, 390]) {
    await navigate('linked', width);
    assert.ok(await evaluate(`!!document.querySelector('[aria-label="Localização do serviço"]')`), JSON.stringify({ errors, body: await evaluate('document.body.innerText') }));
    const linked = await evaluate(`(()=>{const section=document.querySelector('[aria-label="Localização do serviço"]');const list=section.querySelector('[aria-label="Endereços das broncas vinculadas"]');const map=section.querySelector('.leaflet-container').getBoundingClientRect();const pins=Array.from(section.querySelectorAll('.leaflet-interactive')).map(el=>el.getBoundingClientRect());const dialog=document.querySelector('[role="dialog"]');return {heading:list.querySelector('h3').textContent,addresses:Array.from(list.querySelectorAll('li')).map(el=>el.querySelector('p').textContent),pins:pins.length,pinsFit:pins.every(pin=>pin.left>=map.left&&pin.right<=map.right&&pin.top>=map.top&&pin.bottom<=map.bottom),scroll:document.documentElement.scrollWidth,dialogScroll:dialog.scrollWidth,dialogWidth:dialog.clientWidth,saveDisabled:document.querySelector('button[form="municipal-demand-form"]').disabled,geoCalls:window.geoCalls.length};})()`);
    assert.equal(linked.heading, 'Endereços das broncas (4)');
    assert.deepEqual(linked.addresses, ['Rua vinculada 1', 'Rua vinculada 2', 'Rua vinculada 3', 'Rua vinculada 4']);
    assert.equal(linked.pins, 4); assert.ok(linked.pinsFit, JSON.stringify(linked));
    assert.ok(linked.scroll <= width && linked.dialogScroll <= linked.dialogWidth, JSON.stringify(linked));
    assert.equal(linked.saveDisabled, true); assert.equal(linked.geoCalls, 0);
    const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
    await fs.writeFile(path.join(out, 'demand-linked-addresses-' + width + '.png'), Buffer.from(shot.data, 'base64'));
    await evaluate(`document.querySelector('[aria-label="Endereços das broncas vinculadas"] button').click()`); await pause();
    assert.equal(await evaluate('window.geoCalls.length'), 0);
    assert.ok(await evaluate(`document.querySelector('button[form="municipal-demand-form"]').disabled`));
  }
  await navigate('linked&missinglocations&readonly');
  assert.equal(await evaluate(`document.querySelector('[aria-label="Endereços das broncas vinculadas"] h3').textContent`), 'Endereços das broncas (3)');
  assert.equal(await evaluate(`document.querySelectorAll('[aria-label="Endereços das broncas vinculadas"] li').length`), 4);
  assert.equal(await evaluate(`document.querySelectorAll('[aria-label="Localização do serviço"] .leaflet-interactive').length`), 2);
  assert.ok(await evaluate(`document.querySelector('[aria-label="Endereços das broncas vinculadas"]').textContent.includes('Endereço não informado')`));
  assert.ok(!await evaluate(`!!document.querySelector('button[form="municipal-demand-form"]')`));
  for(const width of [1440,1920,390]){
    await navigate('linked&manylinked',width);
    const many=await evaluate(`(()=>{const list=document.querySelector('[aria-label="Endereços das broncas vinculadas"] ol');const dialog=document.querySelector('[role="dialog"]');return {count:list.children.length,listHeight:list.clientHeight,listScroll:list.scrollHeight,dialogWidth:dialog.clientWidth,dialogScroll:dialog.scrollWidth,pageWidth:document.documentElement.scrollWidth};})()`);
    assert.equal(many.count,80);
    assert.ok(many.listHeight<=256&&many.listScroll>many.listHeight&&many.dialogScroll<=many.dialogWidth&&many.pageWidth<=width,JSON.stringify(many));
  }
  await navigate('linked');
  const openTab = async tab => { await evaluate(`Array.from(document.querySelectorAll('nav[aria-label="Seções do atendimento"] button')).find(button=>button.textContent.includes(${JSON.stringify(tab)})).click()`); await pause(); };
  await openTab('Vínculos');
  await evaluate(`(()=>{const input=document.querySelector('input[placeholder="Buscar bronca por título, endereço ou bairro"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Bronca 5');input.dispatchEvent(new Event('input',{bubbles:true}));})()`); await pause(600);
  await evaluate(`Array.from(document.querySelectorAll('[role="dialog"] button')).find(button=>button.textContent.includes('Vincular ao atendimento')).click()`); await pause();
  await openTab('Dados');
  assert.equal(await evaluate(`document.querySelector('[aria-label="Endereços das broncas vinculadas"] h3').textContent`), 'Endereços das broncas (5)');
  await openTab('Vínculos');
  await evaluate(`document.querySelector('[aria-label="Retirar vínculo de Bronca 5"]').click()`); await pause();
  await openTab('Dados');
  assert.equal(await evaluate(`document.querySelector('[aria-label="Endereços das broncas vinculadas"] h3').textContent`), 'Endereços das broncas (4)');
  assert.equal(await evaluate('window.saves.length'), 0);
  console.log('OK endereços e mapa de 4 vínculos, larguras desktop/celular, dados ausentes, leitura e atualização ao vincular/retirar');
  if (process.env.MUNICIPAL_LINKS_ONLY) {
    assert.equal(errors.length, 0, JSON.stringify(errors));
    console.log('Prévia dos vínculos: ' + out);
  } else {
  for (const page of ['orders', 'lighting', 'settings', 'reports', 'new']) for (const width of [1440, 1920, 390]) {
    await navigate(page, width);
    assert.equal(errors.length, 0, JSON.stringify(errors));
    const metrics = await evaluate(`({width:innerWidth,scroll:document.documentElement.scrollWidth,title:document.querySelector('main h1')?.textContent,mainWidth:document.querySelector('main').clientWidth,mainScroll:document.querySelector('main').scrollWidth,dialog:document.querySelector('[role="dialog"]')?.clientWidth,dialogScroll:document.querySelector('[role="dialog"]')?.scrollWidth})`);
    assert.ok(metrics.title, JSON.stringify(metrics)); assert.ok(metrics.scroll <= width, JSON.stringify(metrics)); assert.ok(metrics.mainScroll <= metrics.mainWidth, JSON.stringify(metrics));
    if (page === 'orders') {
      const tabs = await evaluate(`(()=>{const nav=document.querySelector('nav[aria-label="Filas de ordens de serviço"]');const measured=Array.from(nav.querySelector('[aria-hidden="true"] > div').children).slice(0,-1);const required=measured.reduce((sum,tab)=>sum+tab.getBoundingClientRect().width,0)+(measured.length-1)*4;return {more:!!nav.querySelector('[aria-label="Mais etapas"]'),fits:required<=nav.clientWidth,labels:Array.from(nav.querySelectorAll('button')).map(b=>b.firstElementChild.textContent),cards:document.querySelectorAll('section[aria-label="Indicadores de demandas"] a').length,gutter:parseFloat(getComputedStyle(document.querySelector('main > .page-shell-fluid')).paddingLeft)}})()`);
      assert.equal(tabs.more, !tabs.fits, JSON.stringify(tabs)); assert.ok(!tabs.labels.includes('Todas')); assert.equal(tabs.cards, 4); assert.ok(tabs.gutter <= 64);
      if (width === 1920) assert.equal(tabs.more, false, JSON.stringify(tabs));
    }
    if (page === 'lighting') {
      assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('[aria-label="Indicadores de iluminação"] strong')).map(el=>Number(el.textContent))`),[5,2,2,1]);
      assert.equal(await evaluate(`document.querySelectorAll('[aria-label="Mapa de iluminação pública"] .leaflet-interactive').length`),5);
      assert.ok(!await evaluate(`!!document.querySelector('[role="dialog"]')`));
    }
    if (metrics.dialog) assert.ok(metrics.dialogScroll <= metrics.dialog, JSON.stringify(metrics));
    if (page === 'new') { assert.ok(await evaluate(`!!document.querySelector('[aria-label="Localização do serviço"] .leaflet-container')`), await evaluate(`document.querySelector('[role="dialog"]')?.textContent || document.body.textContent`)); assert.ok(!await evaluate(`document.querySelector('[role="dialog"]').textContent.includes('Latitude')`)); }
    console.log('OK', page, width);
    if (['new','orders','lighting'].includes(page)) { const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId); await fs.writeFile(path.join(out, page + '-' + width + '.png'), Buffer.from(shot.data, 'base64')); }
  }
  await navigate('lighting');
  await evaluate(`Array.from(document.querySelectorAll('[aria-label="Indicadores de iluminação"] button')).find(b=>b.textContent.includes('Apagados')).click()`); await pause();
  assert.equal(await evaluate(`document.querySelectorAll('[aria-label="Mapa de iluminação pública"] .leaflet-interactive').length`),2);
  await evaluate(`Array.from(document.querySelectorAll('main button')).find(b=>b.textContent==='Limpar').click()`); await pause();
  assert.equal(await evaluate(`document.querySelectorAll('[aria-label="Mapa de iluminação pública"] .leaflet-interactive').length`),5);
  await evaluate(`document.querySelector('[aria-label="Mapa de iluminação pública"] .municipal-pole-1').dispatchEvent(new MouseEvent('click',{bubbles:true}))`); await pause(1000);
  assert.ok(await evaluate(`document.querySelector('[aria-label="Poste selecionado"]')?.textContent.includes('Poste 4287')`), await evaluate('document.body.innerText'));
  assert.ok(!await evaluate(`!!document.querySelector('[role="dialog"]')`));
  await evaluate(`Array.from(document.querySelectorAll('[aria-label="Poste selecionado"] button')).find(b=>b.textContent==='Histórico').click()`); await pause();
  assert.ok(await evaluate(`document.querySelector('[aria-label="Poste selecionado"]').textContent.includes('100 W')`));
  assert.ok(await evaluate(`document.querySelector('[aria-label="Poste selecionado"] a').getAttribute('href').endsWith('poste=1')`));
  const lightingSelected=await send('Page.captureScreenshot',{format:'png'},sessionId);await fs.writeFile(path.join(out,'lighting-selected-1440.png'),Buffer.from(lightingSelected.data,'base64'));
  await evaluate(`Array.from(document.querySelectorAll('[aria-label="Poste selecionado"] button')).find(b=>b.textContent.includes('Ver detalhes')).click()`); await pause();
  assert.ok(await evaluate(`document.querySelector('[role="dialog"]').textContent.includes('Poste 4287')`));
  await evaluate(`document.querySelector('[aria-label="Fechar painel"]').click()`); await pause();
  assert.ok(await evaluate(`document.querySelector('[aria-label="Poste selecionado"]').textContent.includes('Poste 4287')`));
  await evaluate(`document.querySelector('#lighting-tab-report').click()`); await pause();
  assert.ok(await evaluate(`document.querySelector('#lighting-panel-report').textContent.includes('Planilha CSV')`));
  assert.ok(!await evaluate(`document.querySelector('main').textContent.includes('Não informado')`));
  await evaluate(`document.documentElement.classList.add('dark')`); await pause();
  const lightingDark=await send('Page.captureScreenshot',{format:'png'},sessionId);await fs.writeFile(path.join(out,'lighting-dark-1440.png'),Buffer.from(lightingDark.data,'base64'));
  await navigate('lighting&readonly');
  assert.ok(!await evaluate(`Array.from(document.querySelectorAll('main button')).some(b=>b.textContent==='Adicionar poste')`));
  console.log('OK iluminação: indicadores, filtros, seleção no mapa, histórico, detalhes, relatório e consulta sem edição');
  const openPole = async () => {
    await evaluate(`document.querySelector('[aria-label="Mapa de iluminação pública"] .municipal-pole-1').dispatchEvent(new MouseEvent('click',{bubbles:true}))`); await pause();
    await evaluate(`Array.from(document.querySelectorAll('[aria-label="Poste selecionado"] button')).find(b=>b.textContent.includes('Ver detalhes')).click()`); await pause();
  };
  const lookupButton = `Array.from(document.querySelectorAll('[role="dialog"] button')).find(b=>b.textContent.includes('Buscar endereço e salvar'))`;
  const setPoleField = async (selector, value) => {
    await evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`); await pause();
  };
  for (const width of [1440, 1920, 390]) {
    await navigate('lighting&noaddress', width); await openPole();
    assert.ok(await evaluate(`!!(${lookupButton})`));
    const layout = await evaluate(`(()=>{const dialog=document.querySelector('[role="dialog"]');const button=${lookupButton};const rect=button.getBoundingClientRect();const bounds=dialog.getBoundingClientRect();const shell=document.querySelector('main > .page-shell-fluid');return {scroll:document.documentElement.scrollWidth,dialogWidth:dialog.clientWidth,dialogScroll:dialog.scrollWidth,gutter:parseFloat(getComputedStyle(shell).paddingLeft),buttonFits:rect.left>=bounds.left&&rect.right<=bounds.right};})()`);
    assert.ok(layout.scroll <= width && layout.dialogScroll <= layout.dialogWidth && layout.buttonFits, JSON.stringify(layout));
    if (width >= 1200) assert.ok(layout.gutter <= 64, JSON.stringify(layout));
    const screenshot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
    await fs.writeFile(path.join(out, 'pole-address-' + width + '.png'), Buffer.from(screenshot.data, 'base64'));
    if (width === 1440) {
      await evaluate(`window.deferGeo=true;window.deferLightingSave=true;const button=${lookupButton};button.click();button.click()`); await pause();
      assert.equal(await evaluate('window.geoCalls.length'), 1);
      assert.equal(await evaluate('window.lightingSaves.length'), 0);
      assert.ok(await evaluate(`Array.from(document.querySelectorAll('[role="dialog"] input,[role="dialog"] select')).every(el=>el.disabled)`));
      assert.ok(await evaluate(`document.querySelector('[aria-label="Fechar painel"]').disabled`));
      await evaluate(`window.pendingGeo[0].resolve({data:{address:'  Rua encontrada  ',city:'Floresta',state_uf:'PE'}})`); await pause();
      assert.equal(await evaluate(`document.querySelector('#lighting-pole-address').value`), 'Rua encontrada');
      assert.equal(await evaluate('window.lightingSaves.length'), 1);
      assert.ok(await evaluate(`document.querySelector('[aria-label="Fechar painel"]').disabled`));
      await evaluate('window.pendingLightingSaves[0]()'); await pause();
    } else {
      await evaluate(`(${lookupButton}).click()`); await pause();
      assert.equal(await evaluate('window.geoCalls.length'), 1);
      assert.equal(await evaluate('window.lightingSaves.length'), 1);
    }
    const saved = await evaluate('window.lightingSaves[0]');
    assert.equal(saved.p_address, width === 1440 ? 'Rua encontrada' : 'Rua do ponto marcado');
    assert.equal(saved.p_pole_id, 1); assert.equal(saved.p_city_id, 64); assert.equal(saved.p_action, 'updated');
    assert.equal(saved.p_lamp_type, 'LED'); assert.equal(saved.p_power_w, 100); assert.equal(saved.p_status, 'aceso');
    assert.deepEqual(await evaluate('window.geoCalls[0]'), { lat: -8.601, lng: -38.569, zoom: 18 });
    assert.ok(!await evaluate(`!!document.querySelector('[role="dialog"]')`));
    console.log('OK buscar e salvar endereço, painel e largura', width);
  }
  await navigate('lighting&noaddress'); await openPole();
  await evaluate(`window.geoFail=true;window.fetch=async()=>new Response(null,{status:503});(${lookupButton}).click()`); await pause();
  assert.equal(await evaluate('window.lightingSaves.length'), 0);
  assert.equal(await evaluate(`document.querySelector('#lighting-pole-address').value`), '');
  assert.equal(await evaluate('window.feedback.title'), 'Não foi possível buscar o endereço');
  assert.ok(!await evaluate(`document.querySelector('[aria-label="Fechar painel"]').disabled`));
  await navigate('lighting&noaddress'); await openPole();
  await evaluate(`window.lightingSaveError=true;(${lookupButton}).click()`); await pause();
  assert.equal(await evaluate('window.feedback.title'), 'Não foi possível atualizar o poste');
  assert.equal(await evaluate(`document.querySelector('#lighting-pole-address').value`), 'Rua do ponto marcado');
  await evaluate(`window.lightingSaveError=false;Array.from(document.querySelectorAll('[role="dialog"] button')).find(b=>b.textContent==='Salvar poste').click()`); await pause();
  assert.equal(await evaluate('window.geoCalls.length'), 1); assert.equal(await evaluate('window.lightingSaves.length'), 2);
  await navigate('lighting'); await openPole();
  assert.ok(!await evaluate(`!!(${lookupButton})`)); assert.equal(await evaluate('window.geoCalls.length'), 0);
  await navigate('lighting&readonly&noaddress'); await openPole();
  assert.ok(!await evaluate(`!!(${lookupButton})`));
  await navigate('lighting&noaddress'); await openPole();
  await evaluate(`window.deferGeo=true;(${lookupButton}).click()`); await pause();
  await evaluate(`Array.from(document.querySelectorAll('[role="dialog"] a')).find(a=>a.textContent.includes('Abrir ordem')).click()`); await pause();
  await evaluate(`window.pendingGeo[0].resolve({data:{address:'Resposta após sair do poste',city:'Floresta',state_uf:'PE'}})`); await pause();
  assert.equal(await evaluate('window.lightingSaves.length'), 0);
  await navigate('lighting');
  await evaluate(`Array.from(document.querySelectorAll('main button')).find(b=>b.textContent==='Adicionar poste').click()`); await pause();
  assert.ok(await evaluate(`(${lookupButton}).disabled`));
  await setPoleField('[role="dialog"] input', '999');
  await setPoleField('[role="dialog"] input[min="-90"]', '-8.6');
  await setPoleField('[role="dialog"] input[min="-180"]', '-38.58');
  await evaluate(`(${lookupButton}).click()`); await pause();
  const createdPole = await evaluate('window.lightingSaves[0]');
  assert.equal(createdPole.p_action, 'created'); assert.equal(createdPole.p_lat, -8.6); assert.equal(createdPole.p_lng, -38.58);
  assert.equal(createdPole.p_address, 'Rua do ponto marcado'); assert.equal(createdPole.p_number, '999');
  console.log('OK endereço: falhas sem perder o formulário, nova tentativa, endereço existente, leitura, saída durante busca e cadastro');
  await navigate('orders');
  await evaluate(`document.querySelector('[aria-label="Mais etapas"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}))`); await pause();
  await evaluate(`Array.from(document.querySelectorAll('[role="menuitem"]')).find(item=>item.firstElementChild.textContent==='Concluídas').click()`); await pause();
  assert.equal(await evaluate(`document.querySelector('table tbody').children.length`),4);
  assert.equal(await evaluate(`document.querySelector('[aria-label="Mais etapas"]').getAttribute('aria-pressed')`),'true');
  await send('Emulation.setDeviceMetricsOverride', {width:1920,height:1000,deviceScaleFactor:1,mobile:false}, sessionId); await pause();
  assert.ok(!await evaluate(`!!document.querySelector('[aria-label="Mais etapas"]')`));
  assert.equal(await evaluate(`document.querySelector('nav[aria-label="Filas de ordens de serviço"] button[aria-pressed="true"]').firstElementChild.textContent`),'Concluídas');
  await evaluate(`document.documentElement.classList.add('dark')`); await pause();
  const darkShot=await send('Page.captureScreenshot',{format:'png'},sessionId);await fs.writeFile(path.join(out,'orders-dark-1920.png'),Buffer.from(darkShot.data,'base64'));
  await navigate('orders');
  await evaluate(`document.querySelector('[aria-label="Página 2"]').click()`); await pause();
  assert.equal(await evaluate(`document.querySelector('nav[aria-label="Paginação"] p').textContent`),'11–20 de 28');
  await evaluate(`document.querySelector('[aria-label="Página 1"]').click()`); await pause();
  await evaluate(`Array.from(document.querySelectorAll('section[aria-label="Indicadores de demandas"] a')).find(a=>a.textContent.includes('Vencem hoje')).click()`); await pause();
  assert.equal(await evaluate(`document.querySelector('table tbody').children.length`),1);
  assert.ok(await evaluate(`document.querySelector('table tbody').textContent.includes('HOJE')`));
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('main button')).find(b=>b.textContent.startsWith('Filtros')).textContent`),'Filtros1');
  await evaluate(`document.querySelector('[aria-label="Remover filtro: Vencem hoje"]').click()`); await pause();
  assert.ok(!await evaluate(`!!document.querySelector('[aria-label="Remover filtro: Vencem hoje"]')`));
  console.log('OK Mais por espaço disponível, seleção preservada ao redimensionar, paginação e prazo de hoje');
  await navigate('new');
  const clickPin = async offset => {
    const point = await evaluate(`(()=>{const rect=document.querySelector('[aria-label="Localização do serviço"] .leaflet-container').getBoundingClientRect();return {x:rect.left+rect.width/2+${offset},y:rect.top+rect.height/2+40}})()`);
    for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 }, sessionId);
    await pause();
  };
  await clickPin(70);
  assert.ok(await evaluate(`document.querySelector('[aria-label="Localização do serviço"]').textContent.includes('Rua do ponto marcado')`));
  await evaluate('window.deferGeo=true'); await clickPin(30); await clickPin(-35);
  assert.equal(await evaluate('window.pendingGeo.length'), 2);
  assert.equal(await evaluate(`document.querySelector('button[form="municipal-demand-form"]').disabled`), true);
  await evaluate(`window.pendingGeo[1].resolve({data:{address:'Rua mais recente',suburb:'Novo bairro',city:'Floresta',state_uf:'PE'}})`); await pause();
  await evaluate(`window.pendingGeo[0].resolve({data:{address:'Rua antiga',suburb:'Bairro antigo',city:'Floresta',state_uf:'PE'}})`); await pause();
  assert.ok(await evaluate(`document.querySelector('[aria-label="Localização do serviço"]').textContent.includes('Rua mais recente')`));
  assert.ok(!await evaluate(`document.querySelector('[aria-label="Localização do serviço"]').textContent.includes('Rua antiga')`));
  for (let step=0;step<3;step++) { await evaluate(`document.querySelector('button[form="municipal-demand-form"]').click()`); await pause(); assert.equal(await evaluate('window.saves.length'),0); }
  await evaluate(`document.querySelector('button[form="municipal-demand-form"]').click()`); await pause();
  const saved = await evaluate('window.saves[0]'); assert.equal(saved.p_dados.endereco, 'Rua mais recente'); assert.equal(saved.p_dados.bairro, 'Novo bairro'); assert.ok(Number.isFinite(saved.p_dados.latitude)); assert.deepEqual(saved.p_reports, ['r1']);
  console.log('OK pino, reverse geocode, concorrência e gravação da ordem');
  const tabCounts = await evaluate(`Array.from(document.querySelectorAll('nav[aria-label="Filas de ordens de serviço"] button:not([aria-label="Mais etapas"])')).map(button=>({label:button.firstElementChild.textContent,count:Number(button.lastElementChild.textContent),active:button.getAttribute('aria-pressed')}))`);
  assert.deepEqual(tabCounts.map(tab=>tab.count),[29,3,2,1,2,1,2,4,1,2].slice(0,tabCounts.length));
  assert.equal(tabCounts[0].active,'true'); assert.ok(!tabCounts.some(tab=>['Todas','Sem responsável'].includes(tab.label)));
  assert.ok(!await evaluate(`!!document.querySelector('select[aria-label="Filtrar etapa"]')`));
  await evaluate(`Array.from(document.querySelectorAll('nav[aria-label="Filas de ordens de serviço"] button')).find(button=>button.firstElementChild.textContent==='Triagem').click()`); await pause();
  assert.equal(await evaluate(`document.querySelector('table tbody').children.length`),3);
  await evaluate(`Array.from(document.querySelectorAll('main button')).find(button=>button.textContent==='Filtros').click()`); await pause();
  await evaluate(`(()=>{const label=Array.from(document.querySelectorAll('label')).find(label=>label.firstChild.textContent==='Fila');const select=label.querySelector('select');select.value='sem_responsavel';select.dispatchEvent(new Event('change',{bubbles:true}));})()`); await pause();
  const filteredCounts=await evaluate(`Array.from(document.querySelectorAll('nav[aria-label="Filas de ordens de serviço"] button:not([aria-label="Mais etapas"])')).map(button=>Number(button.lastElementChild.textContent))`);
  assert.deepEqual(filteredCounts,[2,1,1,1,1,1,1,0,0,0].slice(0,filteredCounts.length));
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'},sessionId); await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'},sessionId); await pause();
  assert.equal(await evaluate(`document.querySelector('table tbody').children.length`),1);
  await evaluate(`Array.from(document.querySelectorAll('main button')).find(button=>button.textContent==='Limpar filtros').click()`); await pause();
  assert.equal(await evaluate(`document.querySelector('table tbody').children.length`),3);
  assert.equal(await evaluate(`document.querySelector('nav[aria-label="Filas de ordens de serviço"] button[aria-pressed="true"]').firstElementChild.textContent`),'Triagem');
  console.log('OK contadores por etapa, filtro de responsável e limpeza mantendo a aba');
  await evaluate(`document.querySelector('table tbody input[type="checkbox"]').click()`); await pause();
  assert.ok(!await evaluate(`!!document.querySelector('[role="dialog"]')`));
  assert.ok(await evaluate(`document.querySelector('table tbody input[type="checkbox"]').checked`));
  await evaluate(`document.querySelector('table tbody tr td:nth-child(4)').click()`); await pause();
  assert.ok(await evaluate(`document.querySelector('[role="dialog"]').textContent.includes('triagem-0')`));
  await evaluate(`document.querySelector('[aria-label="Fechar painel"]').click()`); await pause();
  await evaluate(`document.querySelector('table tbody tr').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`); await pause();
  assert.ok(await evaluate(`!!document.querySelector('[role="dialog"]')`));
  const setInput = async (selector, value) => { await evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`); await pause(); };
  await setInput('input[placeholder="Ex.: Correção de buraco na rua…"]','Ordem com responsável cadastrado');
  await evaluate(`Array.from(document.querySelectorAll('nav[aria-label="Seções do atendimento"] button')).find(button=>button.textContent.includes('Atendimento')).click()`); await pause();
  await evaluate(`Array.from(document.querySelectorAll('[role="dialog"] button')).find(button=>button.textContent==='Convidar responsável').click()`); await pause();
  await setInput('#demand-responsible-email','invalid');
  await evaluate(`Array.from(document.querySelectorAll('section[aria-label="Cadastrar responsável"] button')).find(button=>button.textContent==='Gerar convite').click()`); await pause();
  assert.equal(await evaluate('window.invites.length'),0);
  await setInput('#demand-responsible-email',' Servidor@Prefeitura.gov.br ');
  await evaluate(`Array.from(document.querySelectorAll('section[aria-label="Cadastrar responsável"] button')).find(button=>button.textContent==='Gerar convite').click()`); await pause();
  assert.deepEqual(await evaluate('window.invites[0]'),{p_canal:'lighting',p_email:'servidor@prefeitura.gov.br',p_papel:'operador'});
  assert.ok(await evaluate(`document.querySelector('input[aria-label="Link do convite do responsável"]').value.endsWith('/prefeitura/convite/invite-token')`));
  assert.ok(!await evaluate(`Array.from(document.querySelectorAll('option')).some(option=>option.value==='invited-staff')`));
  await evaluate('window.acceptResponsible()');
  await evaluate(`Array.from(document.querySelectorAll('section[aria-label="Cadastrar responsável"] button')).find(button=>button.textContent==='Atualizar responsáveis').click()`); await pause();
  assert.ok(await evaluate(`Array.from(document.querySelectorAll('option')).some(option=>option.value==='invited-staff'&&option.textContent==='Nova responsável')`));
  await evaluate(`(()=>{const option=document.querySelector('option[value="invited-staff"]');const select=option.parentElement;select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));})()`); await pause();
  await evaluate(`document.querySelector('button[form="municipal-demand-form"]').click()`); await pause();
  assert.equal(await evaluate('window.saves[1].p_dados.titulo'),'Ordem com responsável cadastrado');
  assert.equal(await evaluate('window.saves[1].p_dados.atribuido_a'),'invited-staff');
  console.log('OK clique na linha, teclado, seleção separada, convite e atribuição sem perder rascunho');
  await navigate('readonly');
  assert.ok(!await evaluate(`!!document.querySelector('button[form="municipal-demand-form"]')`));
  assert.ok(!await evaluate(`Array.from(document.querySelectorAll('[role="dialog"] button')).some(button=>button.textContent==='Convidar responsável')`));
  assert.ok(!await evaluate(`!!document.querySelector('[aria-label="Localização do serviço"] button[title="Voltar para minha posição"]')`));
  await navigate('new');
  await evaluate(`document.querySelector('button[form="municipal-demand-form"]').click()`); await pause();
  await evaluate(`(()=>{const select=document.querySelector('select[aria-label="Responsável na plataforma (opcional)"]');select.value='';select.dispatchEvent(new Event('change',{bubbles:true}));const stage=document.querySelector('select[aria-label="Etapa do serviço"]');stage.value='programada';stage.dispatchEvent(new Event('change',{bubbles:true}));})()`); await pause();
  await setInput('input[aria-label="Previsão de execução"]','2026-10-01T10:00');
  await evaluate(`Array.from(document.querySelectorAll('[role="dialog"] button')).find(b=>b.textContent==='Convidar responsável').click()`); await pause();
  for (const width of [1440,1920,390]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false},sessionId);await pause();
    const modal=await evaluate(`(()=>{const el=document.querySelector('[role="dialog"]');const email=document.querySelector('#demand-responsible-email');const role=document.querySelector('[aria-label="Cadastrar responsável"] select');return {width:el.clientWidth,scroll:el.scrollWidth,email:email.getBoundingClientRect().top,role:role.getBoundingClientRect().top}})()`);
    assert.ok(modal.scroll<=modal.width,JSON.stringify(modal));if(width!==390)assert.ok(Math.abs(modal.email-modal.role)<1,JSON.stringify(modal));
    const shot=await send('Page.captureScreenshot',{format:'png'},sessionId);await fs.writeFile(path.join(out,'demand-attendance-'+width+'.png'),Buffer.from(shot.data,'base64'));
  }
  for(let step=0;step<3;step++){await evaluate(`document.querySelector('button[form="municipal-demand-form"]').click()`);await pause();}
  assert.equal(await evaluate('window.saves.length'),1);
  assert.equal(await evaluate('window.saves[0].p_dados.atribuido_a'),null);
  assert.equal(await evaluate('window.saves[0].p_dados.status'),'programada');
  assert.equal(await evaluate('window.invites.length'),0);
  console.log('OK criação de ordem programada sem responsável ou convite e campos alinhados em desktop/celular');
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log('OK consulta sem edição e nenhum erro de execução'); console.log('Prévia: ' + out);
  }
  ws.close();
} finally { chrome.kill(); server.close(); }
