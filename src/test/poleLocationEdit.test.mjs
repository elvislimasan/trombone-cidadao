import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from '@babel/parser';
import generatorPackage from '@babel/generator';
import { polePosition } from '../lib/poleAddress.js';
const generate = generatorPackage.default || generatorPackage;
const page = parse(fs.readFileSync(new URL('../pages/MunicipalLightingPage.jsx',import.meta.url),'utf8'),{sourceType:'module',plugins:['jsx']});
const body = page.program.body.find((node)=>node.type==='ExportDefaultDeclaration').declaration.body.body;
function action(name, scope) {
  const declaration = body.find((node)=>node.type==='VariableDeclaration' && node.declarations[0].id.name===name).declarations[0];
  return new Function(...Object.keys(scope), 'return ' + generate(declaration.init).code)(...Object.values(scope));
}
const setter = () => {};
function state(overrides={}) {
  const calls=[];
  const scope = {
    context:{canEditLighting:true},cityId:64,
    form:{id:2236,identifier:'X171815',latitude:-8.59744,longitude:-38.59073,address:'Rua José do Carmo',lamp_type:'LED',lamp_power_w:'50',lighting_status:'aceso'},
    saveLock:{current:false},saveGeneration:{current:0},addressLookupGeneration:{current:0},addressEdited:{current:false},
    locatingAddress:false,coordinatesPending:false,polePosition,isStandardLampType:()=>true,normalizeLampType:(value)=>value,poleCode:(value)=>value,
    poleTechnicalDetailsPayload:()=>({}),validatePoleTechnicalDetails:()=>null,
    setFormStep:setter,setSaving:setter,setSelected:setter,setCreating:setter,setDrawerOpen:setter,setRevision:setter,setLocatingAddress:setter,setAddressLookupFailed:setter,
    showAppError:(error)=>calls.push({error}),showAppNotice:setter,
    supabase:{rpc:async(name,params)=>{calls.push({name,params}); return {data:2236,error:null};}},
    ...overrides,
  };
  scope.setForm=(updater)=>{scope.form=updater(scope.form);};
  return {scope,calls};
}
test('salvar poste existente envia coordenadas corrigidas ao servidor',async()=>{
  const {scope,calls}=state(); await action('save',scope)();
  assert.equal(calls[0].name,'gerir_iluminacao_municipal_detalhado');
  assert.equal(calls[0].params.p_action,'updated');
  assert.equal(calls[0].params.p_lat,-8.59744); assert.equal(calls[0].params.p_lng,-38.59073);
  assert.equal(scope.addressLookupGeneration.current,1);
});
test('coordenadas incompletas ou busca pendente impedem salvar endereço e posição desatualizados',async()=>{
  for (const override of [{coordinatesPending:true},{locatingAddress:true},{form:{identifier:'X1',latitude:'',longitude:-38,lamp_type:'LED'}}]) {
    const {scope,calls}=state(override); await action('save',scope)();
    assert.equal(calls.filter((call)=>call.name).length,0);
  }
});
test('remover poste não altera coordenadas mesmo durante uma consulta de endereço',async()=>{
  const {scope,calls}=state({locatingAddress:true}); await action('save',scope)('removed');
  assert.equal(calls[0].params.p_lat,null); assert.equal(calls[0].params.p_lng,null);
});
test('pin fora dos limites ou editor sem permissão não inicia geocodificação',async()=>{
  for (const point of [{lat:91,lng:-38},{lat:-8,lng:181},{lat:null,lng:-38}]) {
    const {scope,calls}=state(); await action('setPoleLocation',scope)(point); assert.equal(calls.length,0);
  }
  const {scope,calls}=state({context:{canEditLighting:false}});
  await action('save',scope)(); await action('setPoleLocation',scope)({lat:-8,lng:-38}); assert.equal(calls.length,0);
});
test('arrastar o pin usa endereço cadastrado e ignora resposta de um pin anterior',async()=>{
  const lookups=[];
  const {scope}=state({supabase:{rpc:()=>({maybeSingle:()=>new Promise((resolve)=>lookups.push(resolve))})}});
  const move=action('setPoleLocation',scope);
  const first=move({lat:-8.5,lng:-38.5}),second=move({lat:-8.6,lng:-38.6});
  lookups[1]({data:{address:'Rua do pin atual'}}); await second;
  lookups[0]({data:{address:'Rua do pin antigo'}}); await first;
  assert.equal(scope.form.latitude,-8.6); assert.equal(scope.form.address,'Rua do pin atual');
});
test('endereço digitado durante geocodificação prevalece sobre resposta atrasada',async()=>{
  let finish;
  const {scope}=state({supabase:{rpc:()=>({maybeSingle:()=>new Promise((resolve)=>{finish=resolve;})})}});
  const lookup=action('setPoleLocation',scope)({lat:-8.6,lng:-38.6});
  action('updatePoleAddress',scope)('Rua José do Carmo, conferida no mapa');
  finish({data:{address:'Rua João Ernesto'}}); await lookup;
  assert.equal(scope.form.address,'Rua José do Carmo, conferida no mapa');
});
