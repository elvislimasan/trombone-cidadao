import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { Window } from 'happy-dom';
import { polePosition } from '../lib/poleAddress.js';
const require = createRequire(import.meta.url);
const React = require('react');
const window = new Window();
const previousGlobals = Object.fromEntries(['window','document','navigator','IS_REACT_ACT_ENVIRONMENT'].map((key)=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
globalThis.window=window; globalThis.document=window.document;
Object.defineProperty(globalThis,'navigator',{configurable:true,value:window.navigator});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
after(()=>{for(const [key,descriptor] of Object.entries(previousGlobals)) { if(descriptor) Object.defineProperty(globalThis,key,descriptor); else delete globalThis[key]; }});
const {createRoot}=require('react-dom/client');
const {act}=React;
const Input=React.forwardRef((props,ref)=>React.createElement('input',{...props,ref}));
const Button=({variant,size,...props})=>React.createElement('button',props);
function load(file, extra={}) {
  const code=ts.transpileModule(fs.readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
  const module={exports:{}};
  const mocks={'@/components/ui/input':{Input},'@/components/ui/button':{Button},'@/lib/poleAddress':{polePosition},...extra};
  new Function('require','module','exports',code)((name)=>mocks[name]||require(name),module,module.exports);
  return module.exports.default;
}
const Fields=load('../components/municipality/PoleCoordinateFields.jsx');
let map;
const Steps=load('../components/municipality/MunicipalPoleFormSteps.jsx',{
  './PoleCoordinateFields':{__esModule:true,default:Fields},
  '@/lib/poleDisplay':{poleCode:(value)=>value},'@/lib/lightingCatalog':{LAMP_TYPES:[],isStandardLampType:()=>true},
  '@/components/LocationPickerMap':{__esModule:true,default:(props)=>{map=props; return React.createElement('div',{'data-map':true});}},
});
function mount(component,props) {
  const container=document.createElement('div'); document.body.appendChild(container); const root=createRoot(container);
  act(()=>root.render(React.createElement(component,props)));
  return {container,root,dispose:()=>{act(()=>root.unmount()); container.remove();}};
}
function input(element,value) {
  act(()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(element,value); element.dispatchEvent(new window.Event('input',{bubbles:true}));});
}
test('coordenadas aceitam vírgula decimal e precisam ser aplicadas antes de salvar',()=>{
  const applied=[],pending=[];
  const view=mount(Fields,{position:{lat:-8.6,lng:-38.5},onApply:(point)=>applied.push(point),onPendingChange:(value)=>pending.push(value)});
  try {
    input(view.container.querySelector('#pole-latitude'),'-8,5974'); input(view.container.querySelector('#pole-longitude'),'-38,5907');
    assert.equal(pending.at(-1),true); assert.equal(applied.length,0);
    act(()=>view.container.querySelector('button').click());
    assert.deepEqual(applied,[{lat:-8.5974,lng:-38.5907}]); assert.equal(pending.at(-1),false);
    input(view.container.querySelector('#pole-latitude'),'91');
    assert.equal(view.container.querySelector('button').disabled,true);
    assert.match(view.container.textContent,/latitude entre/);
  } finally {view.dispose();}
});
test('poste existente permite arrastar e clicar; falta de permissão e salvamento bloqueiam mapa',()=>{
  const points=[];
  const props={step:1,form:{identifier:'X171815',latitude:-8.597442,longitude:-38.590736,address:'Rua João Ernesto'},setForm:()=>{},creating:false,saving:false,canEditLocation:true,onLocationChange:(point)=>points.push(point),onAddressChange:()=>{},onCoordinatesPendingChange:()=>{}};
  const view=mount(Steps,props);
  try {
    assert.equal(map.readOnly,false); assert.equal(map.showMarker,true);
    act(()=>map.onLocationChange({lat:-8.5974,lng:-38.5907})); assert.deepEqual(points,[{lat:-8.5974,lng:-38.5907}]);
    act(()=>view.root.render(React.createElement(Steps,{...props,saving:true}))); assert.equal(map.readOnly,true);
    assert.equal(view.container.querySelector('#pole-latitude').disabled,true);
    act(()=>view.root.render(React.createElement(Steps,{...props,canEditLocation:false}))); assert.equal(map.readOnly,true);
    assert.equal(view.container.querySelector('#pole-latitude'),null);
  } finally {view.dispose();}
});
