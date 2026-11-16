import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { Window } from 'happy-dom';
import * as cityEvents from '../lib/cityEvents.js';

const require = createRequire(import.meta.url);
const win = new Window();
for (const key of ['window','document','navigator','HTMLElement','Node','Event']) {
  Object.defineProperty(globalThis,key,{configurable:true,value:win[key]});
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const NativeDate = globalThis.Date;
let instant = new NativeDate('2026-11-16T14:00:00Z').getTime();
let intervals = new Set();
win.setInterval = callback => { intervals.add(callback); return callback; };
win.clearInterval = callback => intervals.delete(callback);
const event = {id:1,type:'event',title:'Sessão da Câmara',status:'active',started_at:'2026-11-16T13:00:00Z',estimated_end_at:'2026-11-16T14:01:00Z'};
const alert = {...event,id:2,type:'water_outage',title:'Falta de água',estimated_end_at:'2026-11-16T13:30:00Z'};
let rpcCalls = 0;
const mocks = {
  '@/lib/cityEvents': cityEvents,
  '@/contexts/SupabaseAuthContext': {useAuth:()=>({user:null})},
  '@/lib/appError': {showAppError:()=>{},showAppNotice:()=>{}},
  '@/lib/cityEventMedia': {},
  'react-router-dom': {Link:({to,children,...props})=>React.createElement('a',{href:to,...props},children)},
  'lucide-react': new Proxy({},{get:()=>()=>null}),
  '@/lib/customSupabaseClient': {supabase:{
    rpc:async()=>{rpcCalls++; return {data:[event,alert],error:null};},
    from:()=>({select:()=>({in:async()=>({data:[]})})}),
  }},
};
function load(file) {
  const code = ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const module={exports:{}};
  new Function('require','module','exports',code)(name=>mocks[name]||require(name),module,module.exports);
  return module.exports;
}
mocks['@/components/agora/CityEventVisuals'] = load('../components/agora/CityEventVisuals.jsx');
const {useCityEvents} = load('../hooks/useCityEvents.js');
const Card = load('../components/agora/CityEventCard.jsx').default;

test('feed retira agenda encerrada com a tela aberta e mantém alerta com previsão vencida',async()=>{
  globalThis.Date = class extends NativeDate {constructor(...args){super(...(args.length?args:[instant]));}};
  const host=document.createElement('div');document.body.appendChild(host);
  const root=createRoot(host);
  let snapshot;
  function Probe(){snapshot=useCityEvents(64);return React.createElement(React.Fragment,null,...snapshot.eventos.map(evento=>React.createElement(Card,{key:evento.id,evento,agora:snapshot.agora})));}
  try {
    await act(async()=>root.render(React.createElement(Probe)));
    assert.equal(snapshot.eventos.length,2);
    assert.match(host.textContent,/Sessão da Câmara/);
    assert.doesNotMatch(host.querySelector('a').textContent,/Previsão/);
    instant+=60000;
    await act(async()=>{for(const tick of intervals)tick();});
    assert.deepEqual(snapshot.eventos.map(item=>item.id),[2]);
    assert.deepEqual(snapshot.encerrados.map(item=>item.id),[1]);
    assert.doesNotMatch(host.textContent,/Sessão da Câmara/);
    assert.match(host.textContent,/Previsão vencida/);
    assert.equal(rpcCalls,1,'A passagem do tempo não precisa fazer consultas');
    await act(async()=>root.render(React.createElement(Card,{evento:snapshot.encerrados[0],agora:snapshot.agora})));
    assert.match(host.textContent,/ENCERRADO/);
    assert.match(host.textContent,/Encerrado (agora|há)/);
    assert.doesNotMatch(host.textContent,/Normalizado|Previsão/);
  } finally {
    await act(async()=>root.unmount());host.remove();globalThis.Date=NativeDate;
  }
  assert.equal(intervals.size,0,'Desmontagem limpa o relógio');
});
