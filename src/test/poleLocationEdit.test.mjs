import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from '@babel/parser';
import generatorPackage from '@babel/generator';
import { polePosition } from '../lib/poleAddress.js';
import { poleDisplayLabel } from '../lib/poleDisplay.js';
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

function removalState(overrides = {}) {
  const current = state();
  const { scope, calls } = current;
  Object.assign(scope, {
    selected: { id: 815475, identifier: 'S815475', lighting_status: 'aceso' },
    editingLoading: false, poleDisplayLabel,
    confirmApp: async options => { calls.push({ confirmation: options }); return true; },
    setDetailsOpen: value => calls.push({ detailsOpen: value }),
    setSelected: value => { scope.selected = value; },
    setRevision: () => calls.push({ refreshed: true }),
    ...overrides,
  });
  return current;
}

test('remoção direta confirma o poste selecionado e preserva dados sem abrir o editor', async () => {
  const { scope, calls } = removalState();
  await action('removePole', scope)();
  assert.match(calls[0].confirmation.title, /S815475/);
  assert.equal(calls[0].confirmation.destructive, true);
  const rpc = calls.find(call => call.name);
  assert.equal(rpc.name, 'gerir_iluminacao_municipal_detalhado');
  assert.equal(rpc.params.p_pole_id, 815475, 'Não pode remover o poste de um formulário antigo');
  assert.equal(rpc.params.p_city_id, 64);
  assert.equal(rpc.params.p_action, 'removed');
  for (const field of ['p_number', 'p_address', 'p_lat', 'p_lng', 'p_lamp_type', 'p_power_w', 'p_details']) assert.equal(rpc.params[field], null);
  assert.equal(scope.selected, null);
  assert.ok(calls.some(call => call.detailsOpen === false));
  assert.ok(calls.some(call => call.refreshed));
  assert.equal(scope.saveLock.current, false);
});

test('cancelar remoção mantém o poste e não chama o servidor', async () => {
  const { scope, calls } = removalState({ confirmApp: async () => false });
  await action('removePole', scope)();
  assert.equal(calls.length, 0);
  assert.equal(scope.selected.id, 815475);
  assert.equal(scope.saveLock.current, false);
});

test('remoção direta bloqueia falta de permissão, poste removido, seleção ausente e operações concorrentes', async () => {
  for (const overrides of [{ context: { canEditLighting: false } }, { selected: null },
    { selected: { id: 1, lighting_status: 'removido' } }, { saveLock: { current: true } }, { editingLoading: true }]) {
    const { scope, calls } = removalState(overrides);
    await action('removePole', scope)();
    assert.equal(calls.length, 0);
  }
});

test('confirmação duplicada ou troca de cidade não remove um poste no contexto anterior', async () => {
  let confirm;
  const { scope, calls } = removalState({ confirmApp: () => new Promise(resolve => { confirm = resolve; }) });
  const remove = action('removePole', scope);
  const pending = remove();
  await remove();
  scope.saveGeneration.current++;
  confirm(true); await pending;
  assert.equal(calls.length, 0);
  assert.equal(scope.selected.id, 815475);
  assert.equal(scope.saveLock.current, false);
});

test('erro ao remover preserva a seleção para consultar ou tentar novamente', async () => {
  const { scope, calls } = removalState({ supabase: { rpc: async () => ({ error: { message: 'Sem permissão nesta cidade' } }) } });
  await action('removePole', scope)();
  assert.equal(scope.selected.id, 815475);
  assert.ok(calls.some(call => call.error?.title === 'Não foi possível remover o poste'));
  assert.equal(calls.some(call => call.refreshed), false);
  assert.equal(scope.saveLock.current, false);
});
