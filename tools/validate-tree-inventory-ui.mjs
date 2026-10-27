// QA isolado: componentes reais, banco em memória e nenhum dado de produção.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import loadConfig from 'tailwindcss/loadConfig.js';

const root = process.cwd();
const out = path.join(root, '.tmp/tree-inventory-validation');
await fs.mkdir(out, { recursive: true });
const photoPath = path.join(out, 'tree-photo.png');
await fs.writeFile(photoPath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64'));
const stubs = {
  '@/contexts/CityContext': `import React,{useState,createContext,useContext} from 'react';
    const cities=[{id:64,name:'Floresta',state:{uf:'PE'}},{id:65,name:'Recife',state:{uf:'PE'}}];const Context=createContext();
    export function CityViewProvider({children,value:controlled}){const [cityId,setCityId]=useState(64);const city=cities.find(c=>c.id===cityId);return <Context.Provider value={controlled||{cityId,city,cityName:city?.name,cities,setCityId,loadingCities:false}}>{children}</Context.Provider>}
    export const useCityView=()=>useContext(Context);export const useCity=()=>({cities,loadingCities:false,activeCityId:64});`,
  '@/hooks/useCanManagePavement': `import {useCityView} from '@/contexts/CityContext';export function useCanManagePavement(){const {cityId}=useCityView();return {canManage:!location.search.includes('public')&&cityId===64,loading:false}}`,
  '@/design-system/theme/ThemeProvider': `export const useTheme=()=>({resolved:location.search.includes('dark')?'dark':'light',setPreference(){}});`,
  '@/lib/geocodeCity': `export const geocodeCity=async()=>({lat:-8.598,lng:-38.57});`,
  '@/lib/reverseGeocodePin': `export async function reverseGeocodePin(point){
    window.addressRequests=window.addressRequests||[];window.addressRequests.push(point);
    const delay=window.nextAddressDelay||20;window.nextAddressDelay=0;const fail=window.failAddress;
    await new Promise(resolve=>setTimeout(resolve,delay));
    if(fail)return null;
    if(window.addressResult)return window.addressResult;
    if(window.batchAddressMode)return {address:'Rua do pin '+point.lat.toFixed(5)+','+point.lng.toFixed(5),suburb:point.lat < window.batchSplitLatitude?'Três Marias':'Centro'};
    return {address:point.lat < -8.6005?'Rua Nova':'Rua Joaquim Marques de Sá',suburb:point.lat < -8.6005?'Três Marias':'Centro'};
  }`,
  '@/lib/nativeDownload': `export const salvarDocumento=async()=>{};export const pdfParaBase64=async()=>'';`,
  '@/lib/customSupabaseClient': `
    window.maintenanceCalls=[];window.writes=[];window.uploads=[];window.removedUploads=[];window.failSave=false;window.tableReads=[];window.generatedFiles=[];const originalCreateUrl=URL.createObjectURL;URL.createObjectURL=blob=>{window.generatedFiles.push(blob);return originalCreateUrl.call(URL,blob)};
    const species=[{id:'s1',city_id:64,common_name:'Ipê-amarelo',scientific_name:'Handroanthus albus',origin:'nativa'},{id:'s2',city_id:64,common_name:'Nim',scientific_name:'Azadirachta indica',origin:'exotica'}];
    if(location.search.includes('illustration'))species[0].illustration_url='/logo.png';
    if(location.search.includes('species-info'))Object.assign(species[0],{aliases:['Pau-d’arco'],summary:'Resumo público da espécie.',sidewalk_suitability:'com_restricoes',planting_guidance:'Conferir espaço para a copa.'});
    const neighborhoods=[{id:'b1',city_id:64,name:'Centro'},{id:'b2',city_id:64,name:'Três Marias'},{id:'b3',city_id:64,name:'Bela Vista'}];
    let rows=[{id:'t1',city_id:64,public_code:'AR1',species_id:'s1',bairro_id:'b1',common_name:'Ipê-amarelo',scientific_name:'Handroanthus albus',origin:'nativa',status:'saudavel',address:'Praça São José',neighborhood:'Centro',latitude:-8.597,longitude:-38.574,height_m:6,crown_diameter_m:4,maintenance_action:'nenhuma',created_at:'2026-10-15T12:00:00Z',updated_at:'2026-10-15T12:00:00Z',planted_by:'prefeitura',planted_at:'2025-02-03',estimated_birth_year:1920,is_historic_site:true},
      {id:'t2',city_id:64,public_code:'AR2',species_id:'s2',bairro_id:'b3',common_name:'Nim',scientific_name:'Azadirachta indica',origin:'exotica',status:'risco',address:'Rua das Flores',neighborhood:'Bela Vista',latitude:-8.6,longitude:-38.57,maintenance_action:'vistoria',maintenance_due_at:'2026-10-20',created_at:'2026-10-15T12:00:00Z',updated_at:'2026-10-15T12:00:00Z',planted_by:'nao_informado'}];
    if(location.search.includes('maintenance'))rows.push({id:'removed',city_id:64,public_code:'AR9',common_name:'Removida',status:'removida',latitude:-8.599,longitude:-38.572,maintenance_action:'nenhuma'});
    if(location.search.includes('improvements'))rows.push({id:'unidentified',city_id:64,public_code:'AR3',species_id:'s1',common_name:'Ipê-amarelo',status:'atencao',latitude:-8.599,longitude:-38.571,maintenance_action:'nenhuma',planted_at:'2026-05-01'}, {id:'removed',city_id:64,public_code:'AR4',common_name:'Removida',status:'removida',latitude:-8.598,longitude:-38.572,maintenance_action:'nenhuma'});
    if(location.search.includes('photo'))rows[0].photo_url='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
    let care=[];const reports=[{id:'r1',city_id:64,tree_id:'t1',title:'Poda solicitada',tree_service:'poda',status:'pending',created_at:'2026-10-16T12:00:00Z'}];
    export const supabase={functions:{async invoke(name,options){window.aiRequests=(window.aiRequests||[]).concat({name,...options});return window.failAi?{error:{message:'offline'}}:{data:{summary:'Resumo de teste: porte e características da espécie.',sidewalk_suitability:'com_restricoes',planting_guidance:'Conferir raízes e espaço para a copa.'}}}},auth:{async getUser(){return {data:{user:{id:'u1'}}}}},storage:{from(){return {async upload(path,file){window.uploads.push({path,size:file.size});return {error:null}},getPublicUrl(path){return {data:{publicUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='}}},async remove(paths){window.removedUploads.push(...paths);return {error:null}}}}},
      rpc(name,args){
        if(name==='schedule_city_tree_maintenance')return Promise.resolve().then(async()=>{
          window.maintenanceCalls.push(args);
          if(window.nextMaintenanceDelay){await new Promise(resolve=>setTimeout(resolve,window.nextMaintenanceDelay));window.nextMaintenanceDelay=0;}
          if(window.failSave)return {data:null,error:{message:'offline'}};
          const ids=[...new Set(args.p_tree_ids)];const affected=rows.filter(row=>ids.includes(row.id)&&row.city_id===args.p_city_id&&row.status!=='removida');
          if(affected.length!==ids.length)return {data:null,error:{code:'22023',message:'A seleção contém árvores indisponíveis.'}};
          const payload={maintenance_action:args.p_action,maintenance_due_at:args.p_due_at};const updated_at=new Date().toISOString();
          rows=rows.map(row=>ids.includes(row.id)?{...row,...payload,updated_at}:row);window.writes.push({table:'city_trees',operation:'maintenance',payload,ids});
          return {data:{updated_count:ids.length,updated_at},error:null};
        });
        const counts=new Map();for(const report of reports){if(report.tree_id&&report.status!=='duplicate'){const row=counts.get(report.tree_id)||{tree_id:report.tree_id,total:0,poda:0,remocao:0};row.total++;if(report.tree_service==='poda')row.poda++;if(report.tree_service==='remocao')row.remocao++;counts.set(report.tree_id,row)}}const result={data:name==='city_tree_request_counts'?[...counts.values()]:[],error:location.search.includes('fail-counts')?{code:'42501',message:'permission denied'}:null};const q={order(){return q},range(){return q},then(ok,fail){return Promise.resolve(result).then(ok,fail)}};return q},
      from(table){window.tableReads.push(table);let payload,operation,one=false,rangeStart=0,rangeEnd=Infinity;const filters=[];const q={select(){return q},order(){return q},range(start,end){rangeStart=start;rangeEnd=end;return q},limit(){return q},eq(k,v){filters.push(r=>String(r[k])===String(v));return q},gte(k,v){filters.push(r=>r[k]>=v);return q},lte(k,v){filters.push(r=>r[k]<=v);return q},neq(k,v){filters.push(r=>String(r[k])!==String(v));return q},in(k,v){filters.push(r=>v.includes(r[k]));return q},single(){one=true;return q},maybeSingle(){one=true;return q},insert(p){operation='insert';payload=p;return q},update(p){operation='update';payload=p;return q},delete(){operation='delete';return q},then(ok,fail){
      if((table==='bairros'&&location.search.includes('fail-neighborhoods'))||(table==='city_tree_species'&&location.search.includes('fail-species')))return Promise.resolve({error:{message:'catalog unavailable'}}).then(ok,fail);
      if(operation&&window.failSave)return Promise.resolve({error:{message:'offline'}}).then(ok,fail);
      let insertedRows;
      if(operation){window.writes.push({table,operation,payload});if(table==='city_trees'){if(operation==='insert'){insertedRows=(Array.isArray(payload)?payload:[payload]).map((item,index)=>({...item,public_code:'AR'+(rows.length+index+1),id:'new'+(rows.length+index),created_at:new Date().toISOString(),updated_at:new Date().toISOString()}));rows.unshift(...insertedRows);}if(operation==='update')rows=rows.map(r=>filters.every(f=>f(r))?{...r,...payload}:r);}if(table==='city_tree_care')care.push({...payload,id:'c'+care.length});if(table==='city_tree_species'){if(operation==='insert')species.unshift({...payload,id:species.some(row=>row.id==='s-new')?'s-new-'+species.length:'s-new'});if(operation==='update')species.forEach(row=>{if(filters.every(f=>f(row)))Object.assign(row,payload)});}if(table==='reports'&&operation==='insert')reports.unshift({...payload,id:'r'+reports.length,created_at:new Date().toISOString()});}
      let source=table==='pavement_streets'?[{id:'street1',city_id:64,name:'Rua das Flores',status:'paved',pavement_type:'asphalt',cep:'56400000',location:{type:'Point',coordinates:[-38.573,-8.598]},path:{type:'MultiLineString',coordinates:[[[-38.574,-8.597],[-38.573,-8.598]]]},bairro_id:'b1',bairro:{name:'Centro'},updated_at:'2026-10-20T12:00:00Z'},{id:'street2',city_id:64,name:'',is_unnamed:true,status:'unpaved',pavement_type:'granite',bairro_id:'b2',bairro:{name:'Três Marias'}},{id:'street3',city_id:64,name:'Rua Parcial',status:'partially_paved',pavement_type:'asphalt',cep:'56400001',bairro_id:'b2',bairro:{name:'Três Marias'}}]:table==='city_trees'?rows:table==='city_tree_species'?species:table==='bairros'?neighborhoods:table==='cities'?[{id:64,name:'Floresta'}]:table==='city_tree_care'?care:table==='reports'?reports:[];
      if(table==='pavement_streets'&&location.search.includes('dashboard'))source.push(...Array.from({length:13},(_,i)=>({id:'extra'+i,city_id:64,name:'Rua extra '+i,status:i%3===0?'paved':'unpaved',bairro_id:'extra-b'+i,bairro:{name:'Bairro '+String(i+1).padStart(2,'0')},cep:'56400002'})));
      const data=insertedRows||source.filter(r=>filters.every(f=>f(r))).slice(rangeStart,rangeEnd+1);if(operation==='delete'&&table==='city_trees')rows=rows.filter(r=>!filters.every(f=>f(r)));
      return Promise.resolve({data:one?(operation==='insert'?source[0]:data[0]):data,error:null}).then(ok,fail);
    }};return q;}};`,
};
stubs['@/hooks/useCanManageArborization']=stubs['@/hooks/useCanManagePavement'].replaceAll('useCanManagePavement','useCanManageArborization');

stubs['@/contexts/SupabaseAuthContext']=`export const useAuth=()=>({user:{id:'u1',name:'Funcionário de teste',is_admin:location.search.includes('scope=admin'),is_master:location.search.includes('scope=master')},signOut:async()=>{}});`;
stubs['@/contexts/MapModeContext']=`export const useMapModeToggle=()=>({mode:'map',toggleMode(){}});`;
stubs['@/hooks/usePermissions']=`import React from 'react';export function usePermissions(){
 const [revoked,setRevoked]=React.useState(false);React.useEffect(()=>{const fn=()=>setRevoked(true);window.addEventListener('test-revoke',fn);return()=>window.removeEventListener('test-revoke',fn)},[]);
 const scope=location.search.includes('public')?'none':new URLSearchParams(location.search).get('scope')||'both';const master=scope==='master';
 const planningCityIds=revoked||['trees','none'].includes(scope)?[]:[64];const treeIds=revoked||['streets','none'].includes(scope)?[]:scope==='split'?[65]:[64,65];
 return {loading:false,error:location.search.includes('permission-error'),refreshPermissions(){},isMaster:master,planningCityIds,treeAssignments:treeIds.map(city_id=>({city_id,canal_id:'ch1',secretaria:'Produção Rural e Meio Ambiente'})),municipalities:[{city_id:64,nome:'Prefeitura de Floresta',papel:scope==='municipal-admin'?'administrador':'colaborador'},{city_id:65,nome:'Prefeitura do Recife',papel:'colaborador'}],canWrite:module=>master||(module==='arborization'?treeIds.length>0:planningCityIds.length>0)};
}`;
delete stubs['@/hooks/useCanManagePavement'];delete stubs['@/hooks/useCanManageArborization'];
if(process.argv.includes('--team')) {
 stubs['@/lib/customSupabaseClient']=`
  window.rpcCalls=[];window.teamErrors=[];window.failTeamSave=false;window.failTeamAccess=false;
  const channels=[{id:'ch64',city_id:64,nome:'Produção Rural e Meio Ambiente',ativo:true,canal_triagem:false},{id:'ch65',city_id:65,nome:'Meio Ambiente Recife',ativo:true,canal_triagem:false}];
  const members=[{id:'m64',canal_id:'ch64',user_id:'employee',papel:'leitura',ativo:true,created_at:'2026-10-01',perfil:{id:'employee',name:'Ana Meio Ambiente',phone:'81999999999'}},{id:'m65',canal_id:'ch65',user_id:'other',papel:'leitura',ativo:true,created_at:'2026-10-01',perfil:{id:'other',name:'Pessoa de Recife'}}];
  const modules={employee:['arborization'],other:[]};const invites=[];
  const query=result=>{const filters=[];let start=0,end=Infinity;const q={select(){return q},order(){return q},range(a,b){start=a;end=b;return q},eq(k,v){filters.push(r=>r[k]===v);return q},in(k,values){filters.push(r=>values.includes(r[k]));return q},then(ok,fail){const rows=result.data?.filter(r=>filters.every(f=>f(r))).slice(start,end+1);return Promise.resolve({...result,data:rows}).then(ok,fail)}};return q};
  export const supabase={from(table){return query({data:table==='orgao_canais'?channels:table==='orgao_membros'?members:table==='prefeitura_convites'?invites:[],error:null})},rpc(name,args){
    window.rpcCalls.push({name,args});
    if(name==='listar_emails_equipe_prefeitura')return query({data:[{membro_id:'m64',email:'ana@floresta.gov.br'}],error:null});
    if(name==='listar_gestao_equipe_municipal')return Promise.resolve(window.failTeamAccess?{error:{message:'offline'}}:{data:[{user_id:'employee',asset_modules:modules.employee},{user_id:'other',asset_modules:modules.other}],error:null});
    if(name==='convidar_funcionario_municipal'){invites.push({id:'i1',prefeitura_id:args.p_prefeitura,canal_id:args.p_canal,email_convidado:args.p_email,papel_orgao:args.p_papel,token:'token1',status:'pendente',expires_at:'2026-11-01',asset_modules:args.p_modules});return Promise.resolve({data:{token:'token1'},error:null})}
    if(name==='set_municipal_staff_access'){if(window.failTeamSave)return Promise.resolve({error:{message:'Falha simulada'}});const member=members.find(row=>row.id===args.p_member_id);member.papel=args.p_role;member.ativo=args.p_active;modules[member.user_id]=args.p_modules;return Promise.resolve({data:null,error:null})}
    return query({data:[],error:null});}};`;
 stubs['@/lib/appError']=`export const showAppError=message=>window.teamErrors.push(message);export const showAppNotice=()=>{};`;
}

if (!process.argv.includes('--reuse-assets')) {
await build({
  stdin: { contents: `
    import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter,Routes,Route,Link,Outlet} from 'react-router-dom';
    import MunicipalityTeamPage from '@/pages/MunicipalityTeamPage';import TerritorialPanelPage from '@/pages/TerritorialPanelPage';import TreePage from '@/pages/TreePage';import Footer from '@/components/Footer';import ReportTreePicker from '@/components/report/ReportTreePicker';
    import LocationPickerMap from '@/components/LocationPickerMap';import {useReportMapTrees} from '@/hooks/useReportMapTrees';import {treeReportSelection} from '@/lib/treeInventory';import {treeLabel} from '@/lib/arborization';import {supabase} from '@/lib/customSupabaseClient';
    import {CityViewProvider} from '@/contexts/CityContext';import L from 'leaflet';import ArborizationMapPage from '@/pages/ArborizationMapPage';
    function TeamHarness(){
      const [city,setCity]=React.useState(64);window.changeTeamCity=setCity;
      const context=React.useMemo(()=>({isAdministrator:true,municipality:{id:'pref'+city,city_id:city,nome:'Prefeitura de '+(city===64?'Floresta':'Recife'),cidade:{name:city===64?'Floresta':'Recife',states:{uf:'PE'}}},channels:[{id:'ch'+city}]}),[city]);
      return <Outlet context={context}/>;
    }
    function DetailHarness(){return <div className="min-h-screen flex flex-col"><main className="flex-grow flex flex-col min-h-0"><div className="flex-1 min-h-0 flex flex-col"><TreePage/></div></main><Footer/></div>}
    function ReportHarness(){
      const [value,setValue]=React.useState({category:'poda',location:{lat:-8.597,lng:-38.574},city_id:64,address:'Praça São José'});
      const [bounds,setBounds]=React.useState(null);const [submitted,setSubmitted]=React.useState(false);
      const onViewport=React.useCallback(b=>setBounds({south:b.getSouth(),north:b.getNorth(),west:b.getWest(),east:b.getEast()}),[]);
      const nearby=useReportMapTrees(value.category,bounds,value.city_id);window.reportValue=value;
      const submit=async()=>{await supabase.from('reports').insert({tree_id:value.tree_id,tree_service:'poda',city_id:value.city_id,category_id:'poda',status:'pending',title:'Serviço na árvore selecionada',location:'POINT('+value.location.lng+' '+value.location.lat+')'});setSubmitted(true);setValue(v=>({...v,tree_id:null,tree_label:''}));window.dispatchEvent(new CustomEvent('reports-updated'))};
      return <div className='page-shell-fluid'><div className='relative isolate overflow-hidden' style={{height:500}}><LocationPickerMap initialPosition={value.location} initialZoom={15} focusPosition={value.tree_id?value.location:undefined} showMarker={!value.tree_id} onLocationChange={location=>setValue(v=>({...v,location,tree_id:null,tree_label:''}))} onViewportChange={onViewport} overlayMarkers={nearby.trees.map(tree=>({id:tree.id,title:treeLabel(tree),kind:'tree',location:{lat:Number(tree.latitude),lng:Number(tree.longitude)},data:tree}))} selectedOverlayMarkerId={value.tree_id} snapToOverlayOnSelect onOverlayMarkerSelect={marker=>setValue(v=>({...v,...treeReportSelection(marker.data)}))}/></div><ReportTreePicker value={value} onChange={changes=>setValue(v=>({...v,...changes}))} nearby={nearby}/><button disabled={!value.tree_id} onClick={submit}>Enviar bronca de teste</button>{submitted&&<Link to='/'>Voltar ao inventário</Link>}</div>
    }
    const maps=[];L.Map.addInitHook(function(){maps.push(this);window.testMap=this;this.on('unload',()=>{maps.splice(maps.indexOf(this),1);window.testMap=maps.at(-1)})});
    if(location.search.includes('dark'))document.documentElement.classList.add('dark');
    createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={[location.search.includes('team')?'/team':location.search.includes('territorial')?'/prefeitura/gestao-territorial/'+(new URLSearchParams(location.search).get('area')||'')+location.search:location.search.includes('detail')?'/arborizacao/arvore/t1':location.search.includes('report')?'/report':'/']}><CityViewProvider><Routes><Route element={<TeamHarness/>}><Route path="/team" element={<MunicipalityTeamPage/>}/></Route><Route path="/admin" element={<div data-testid="platform-overview">Visão geral administrativa</div>}/><Route path="/prefeitura/visao-geral" element={<div data-testid="municipal-overview">Visão geral municipal</div>}/><Route path="/prefeitura/gestao-territorial/:module?/:section?" element={<TerritorialPanelPage/>}/><Route path="/" element={<ArborizationMapPage/>}/><Route path="/arborizacao/arvore/:id" element={<DetailHarness/>}/><Route path="/report" element={<ReportHarness/>}/></Routes></CityViewProvider></MemoryRouter>);`, resolveDir: root, loader: 'jsx' },
  bundle: true, jsx: 'automatic', loader: { '.png': 'dataurl' }, outfile: path.join(out, 'preview.js'),
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}'  }, alias: { '@': path.join(root, 'src') },
  plugins: [{ name: 'fixtures', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => stubs[args.path] ? { path: args.path, namespace: 'fixture' } : undefined);
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'jsx', resolveDir: root }));
  } }],
});
let sourceCss = await fs.readFile('src/index.css', 'utf8');
for (const token of ['primitives', 'semantic', 'typography', 'motion']) sourceCss = sourceCss.replace(`@import './design-system/tokens/${token}.css';`, await fs.readFile(`src/design-system/tokens/${token}.css`, 'utf8'));
const config = loadConfig(path.join(root, 'tailwind.config.js'));
const css = await postcss([tailwind({ ...config, content: ['src/pages/MunicipalityTeamPage.jsx','src/components/municipality/*.jsx','src/pages/TerritorialPanelPage.jsx','src/pages/PavementMapPage.jsx','src/components/pavement/*.jsx','src/components/PavementMapView.jsx','src/pages/ArborizationMapPage.jsx', 'src/pages/TreePage.jsx', 'src/components/Footer.jsx', 'src/components/report/ReportTreePicker.jsx', 'src/components/arborization/*.jsx', 'src/components/map/FullscreenMapPanel.jsx', 'src/components/map/MapDisplayControls.jsx', 'src/components/CitySelector.jsx', 'src/components/ui/*.jsx'] })]).process(sourceCss, { from: path.join(root, 'src/index.css') });
await fs.writeFile(path.join(out, 'preview.css'), css.css + '\n' + await fs.readFile('node_modules/leaflet/dist/leaflet.css', 'utf8'));
}
const server = http.createServer(async (req, res) => {
  const file = req.url.split('?')[0];
  if (file === '/preview.js' || file === '/preview.css') {
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'text/css'); res.end(await fs.readFile(path.join(out, file.slice(1))));
  } else if(file === '/logo.png') { res.setHeader('Content-Type', 'image/png'); res.end(await fs.readFile(path.join(root, 'public/logo.png')));
  } else { res.setHeader('Content-Type', 'text/html'); res.end('<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/preview.css"></head><body><div id="root"></div><script src="/preview.js"></script></body></html>'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = path.join(out, `chrome-${Date.now()}`);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--disable-extensions', '--no-first-run', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws;
try {
  chrome.on('error', error => { throw error; });
  let endpoint;
  for (let attempt = 0; attempt < 200 && !endpoint; attempt++) {
    try { const [port, route] = (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).trim().split(/\r?\n/); endpoint = `ws://127.0.0.1:${port}${route}`; } catch { await pause(100); }
  }
  assert.ok(endpoint, 'Chrome não abriu a depuração local');
  ws = new WebSocket(endpoint); await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let id = 0; const pending = new Map(), errors = [];
  ws.addEventListener('message', event => { const message = JSON.parse(event.data); if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails); if (message.id) { const task = pending.get(message.id); pending.delete(message.id); message.error ? task.reject(Error(message.error.message)) : task.resolve(message.result); } });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const next = ++id; pending.set(next, { resolve, reject }); ws.send(JSON.stringify({ id: next, method, params, sessionId })); });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Runtime.enable', {}, sessionId); await send('Page.enable', {}, sessionId);
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] }, sessionId);
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok){ok({coords:{latitude:-8.599,longitude:-38.571}});}}});` }, sessionId);
  const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId); if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
  const waitFor = async expression => { for (let i = 0; i < 100; i++) { if (await evaluate(`Boolean(${expression})`)) return; await pause(100); } throw Error(`Timeout: ${expression}\n${await evaluate('document.body.innerText')}\n${JSON.stringify(errors)}`); };
  const tap = async selector => {
    const point=await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.scrollIntoView({block:'center',behavior:'instant'});const r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point},sessionId);
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point},sessionId);
  };
  const click = async label => {
    if(await evaluate(`Boolean([...document.querySelectorAll('[role=tab]')].find(el=>el.textContent.trim()===${JSON.stringify(label)}))`)){
      const point=await evaluate(`(()=>{const el=[...document.querySelectorAll('[role=tab]')].find(el=>el.textContent.trim()===${JSON.stringify(label)});el.scrollIntoView({block:'nearest',behavior:'instant'});const r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
      await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point},sessionId);await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point},sessionId);return;
    }
    if (label === 'Mais ações') {
      const point = await evaluate(`(()=>{const el=[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===${JSON.stringify(label)});el.scrollIntoView({block:'center',behavior:'instant'});const r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
      await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point},sessionId);await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point},sessionId);
      await waitFor('document.querySelector("[role=menu]")?.contains(document.activeElement)');
      await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      return;
    }
    if (['Cadastrar em sequência', 'Manejo em lote'].includes(label) && !await evaluate(`Boolean([...document.querySelectorAll('button,[role=menuitem]')].find(el=>el.textContent.trim()===${JSON.stringify(label)}))`)) {
      await click('Mais ações');await waitFor('document.querySelector("[role=menu]")');
    }
    return evaluate(`(()=>{const scope=document.querySelector('[role=alertdialog][data-state=open]')||document.querySelector('[role=menu][data-state=open]')||[...document.querySelectorAll('[role=dialog][data-state=open]')].at(-1)||document;const button=[...scope.querySelectorAll('button,[role=menuitem]')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!button)throw Error('Botão ausente: '+${JSON.stringify(label)});button.click()})()`);
  };
  const clickMapControl = label => evaluate(`(()=>{const scope=[...document.querySelectorAll('[role=dialog]')].at(-1)||document;scope.querySelector('button[aria-label=${JSON.stringify(label)}]').click()})()`);
  const hasSatellite = 'Object.values(window.testMap._layers).some(layer=>layer._url?.includes("World_Imagery"))';
  const zoomInsideMap = `(()=>{const map=window.testMap.getContainer();const bounds=map.getBoundingClientRect();const zoom=map.querySelector('.leaflet-control-zoom').getBoundingClientRect();return zoom.top>=bounds.top&&zoom.bottom<=bounds.bottom&&zoom.left>=bounds.left&&zoom.right<=bounds.right})()`;
  const input = (label, value) => evaluate(`(()=>{const scope=[...document.querySelectorAll('[role=dialog]')].at(-1)||document;const element=[...scope.querySelectorAll('label')].find(e=>e.firstChild.textContent===${JSON.stringify(label)}||(${JSON.stringify(label)}==='Nome popular'&&e.firstChild.textContent==='Nome popular principal')).querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(element,${JSON.stringify(value)});element.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  const addressValue = () => evaluate(`document.querySelector('[role=dialog] input[placeholder="Rua, número ou praça"]').value`);
  const waitForAddress = () => waitFor('document.querySelector("[role=dialog] [role=status]").textContent.includes("Rua e bairro preenchidos")');
  const select = (label, value) => evaluate(`(()=>{const element=[...document.querySelectorAll('label')].find(e=>e.firstChild.textContent===${JSON.stringify(label)}).querySelector('select');element.value=${JSON.stringify(value)};element.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  const navigate = query => send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/${query || ''}` }, sessionId);
  const capture = async name => { await pause(300); const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId); await fs.writeFile(path.join(out, `${name}.png`), Buffer.from(shot.data, 'base64')); };
  const closeDetails = async () => { await evaluate('document.querySelector("[data-testid=tree-details-dialog] button.absolute").click()'); await waitFor('!document.querySelector("[data-testid=tree-details-dialog]")'); };
  const fieldValue = label => evaluate(`(()=>{const scope=[...document.querySelectorAll('[role=dialog]')].at(-1)||document;const field=[...scope.querySelectorAll('label')].find(e=>e.firstChild.textContent===${JSON.stringify(label)}||(${JSON.stringify(label)}==='Nome popular'&&e.firstChild.textContent==='Nome popular principal'));return field.id?scope.querySelector('[aria-labelledby="'+field.id+'"]').dataset.value:field.querySelector('select,input').value})()`);
  const choose = async (label,value) => {
    if(['Nome popular','Espécie do lote'].includes(label)) {
      if(value==='__new_species__') return click('Nova espécie');
      await evaluate(`(()=>{const scope=[...document.querySelectorAll('[role=dialog]')].at(-1)||document;scope.querySelector('[role=combobox]').click()})()`);
      await waitFor(`document.querySelector('[data-species-id="${value}"]')`);
      await evaluate(`document.querySelector('[data-species-id="${value}"]').click()`);
      await waitFor('!document.querySelector("[cmdk-root]")');
      return;
    }
    return evaluate(`(()=>{const scope=[...document.querySelectorAll('[role=dialog]')].at(-1)||document;const el=[...scope.querySelectorAll('label')].find(e=>e.firstChild.textContent===${JSON.stringify(label)}).querySelector('select,input');if(el.closest('details'))el.closest('details').open=true;Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}))})()`);
  };
  const results=[];
  const openFilters = async () => {
    if (!await evaluate('Boolean(document.querySelector("#arborization-filters"))')) {
      await evaluate('document.querySelector(".arborization-filter-trigger").click()');
      await waitFor('document.querySelector("#arborization-filters")');
    }
  };
  const detailBottomsAligned = '(()=>{const summary=document.querySelector(".tree-profile-overview").getBoundingClientRect();const history=document.querySelector(".tree-profile-history").getBoundingClientRect();return Math.abs(summary.bottom-history.bottom)<2})()';
  const validateLayout = async width => {
    await waitFor('document.querySelectorAll(".tree-map-pin").length===2');
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Layout sem rolagem horizontal');
    assert.ok(await evaluate('!document.querySelector(".arborization-neighborhood-sidebar")'),'Mapa sem coluna fixa de estatísticas');
    assert.ok(await evaluate('(()=>{const top=document.querySelector(".arborization-primary-filters").getBoundingClientRect(),map=document.querySelector("[data-testid=tree-map]").getBoundingClientRect();return top.bottom<=map.top})()'),'Busca, situação e bairro ficam acima do mapa');
    if(width>=980){
      assert.ok(await evaluate('(()=>{const aside=document.querySelector("#arborization-filters").getBoundingClientRect(),map=document.querySelector("[data-testid=tree-map]").getBoundingClientRect(),page=document.querySelector("[data-testid=arborization-page]").getBoundingClientRect();return Math.abs(map.top-aside.top)<2&&map.left>=aside.right&&map.width>page.width*.70&&aside.width<=240})()'),'Filtros compactos à esquerda e mapa ocupa a largura restante: '+JSON.stringify(await evaluate('(()=>{const selectors=["#arborization-filters","[data-testid=tree-map]","[data-testid=arborization-page]"];return selectors.map(s=>document.querySelector(s).getBoundingClientRect().toJSON())})()')));
      if(width>=1280)assert.ok(await evaluate('(()=>{const stats=document.querySelector(".arborization-stats").getBoundingClientRect(),actions=document.querySelector(".arborization-actions").getBoundingClientRect();return actions.left>=stats.right&&actions.top>=stats.top&&actions.bottom<=stats.bottom})()'),'Indicadores e ações ficam na mesma linha');
      assert.equal(await evaluate('new Set([...document.querySelectorAll(".arborization-stat")].map(el=>el.getBoundingClientRect().top)).size'),1);
      const mapWidth=await evaluate('document.querySelector("[data-testid=tree-map]").getBoundingClientRect().width');
      await evaluate('window.layoutMap=window.testMap;window.layoutZoom=window.testMap.getZoom()');
      await evaluate(`document.querySelector('[aria-label="Recolher filtros avançados"]').click()`);await waitFor('!document.querySelector("#arborization-filters")');
      assert.ok(await evaluate(`document.querySelector('[data-testid=tree-map]').getBoundingClientRect().width>${mapWidth}&&window.layoutMap===window.testMap&&window.layoutZoom===window.testMap.getZoom()`),'Recolher amplia o mapa sem remontar nem perder zoom');
      await click('Mais filtros');await waitFor('document.querySelector("#arborization-filters")');
    }else{
      assert.ok(await evaluate('!document.querySelector("#arborization-filters")'),'Celular começa sem painel de filtros');
      await click('Mais filtros');await waitFor('document.querySelector(".arborization-filter-dialog")');
      assert.ok(await evaluate('(()=>{const dialog=document.querySelector(".arborization-filter-dialog").getBoundingClientRect(),apply=document.querySelector(".arborization-apply").getBoundingClientRect();return dialog.top>=0&&dialog.bottom<=innerHeight&&apply.bottom<=dialog.bottom})()'),'Filtros e aplicar cabem na tela');
      await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'},sessionId);
      await waitFor('!document.querySelector(".arborization-filter-dialog")');
    }
    await capture('inventory-layout-'+(await evaluate('Boolean(document.querySelector(".arborization-embedded"))')?'municipal-':'')+width);
    await input('Buscar árvore','ar2');await waitFor('document.querySelectorAll(".tree-map-pin").length===1');
    await click('Lista');await waitFor('document.querySelectorAll("article").length===1');
    assert.ok(await evaluate('document.querySelector("article h3").textContent.includes("AR2")'));
    await input('Buscar árvore','');await waitFor('document.querySelectorAll("article").length===2');
    await select('Bairro','Bela Vista');await waitFor('document.querySelectorAll("article").length===1');
    await select('Bairro','all');await select('Situação','saudavel');await waitFor('document.querySelectorAll("article").length===1');
    await select('Situação','all');await waitFor('document.querySelectorAll("article").length===2');
    await openFilters();await choose('Responsável pelo plantio','prefeitura');
    assert.equal(await evaluate('document.querySelectorAll("article").length'),2,'Filtros avançados aguardam aplicação');
    await evaluate('document.querySelector(".arborization-apply").click()');await waitFor('document.querySelectorAll("article").length===1');
    if(width<980)await waitFor('!document.querySelector(".arborization-filter-dialog")');
    await click('Estatísticas');await waitFor('document.querySelector("[data-testid=tree-neighborhood-drawer]")');
    assert.ok(await evaluate('document.querySelector(".arborization-neighborhood-total strong").textContent==="1"'),'Estatísticas acompanham filtros');
    assert.equal(await evaluate('document.querySelectorAll("[data-testid=tree-neighborhood-drawer] li").length'),3,'Inclui bairros sem árvores');
    await input('Buscar bairro','bela vista');await waitFor('document.querySelectorAll("[data-testid=tree-neighborhood-drawer] li").length===1');
    await evaluate(`document.querySelector('[aria-label="Fechar bairros"]').click()`);await waitFor('!document.querySelector("[data-testid=tree-neighborhood-drawer]")');
    await waitFor('document.activeElement===document.querySelector(".arborization-statistics-trigger")');
    await evaluate('document.querySelector(".arborization-reset-filters").click()');await waitFor('document.querySelectorAll("article").length===2');
    await click('Mapa');await waitFor('document.querySelectorAll(".tree-map-pin").length===2');
    await click('Mais ações');await waitFor('document.querySelector("[role=menu]")');
    assert.deepEqual(await evaluate('[...document.querySelectorAll("[role=menuitem]")].map(el=>el.textContent.trim())'),['Cadastrar em sequência','Manejo em lote']);
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'},sessionId);await waitFor('!document.querySelector("[role=menu]")');
  };
  const validateRegistration = async width => {
    const formReady = async () => {
      await waitFor('document.querySelector(".tree-entry-dialog [role=combobox]")&&!document.querySelector(".tree-entry-dialog [role=combobox]").disabled');
      await waitFor('document.querySelectorAll("[role=dialog]").length===1');
      assert.equal(await evaluate('document.querySelectorAll("[role=dialog]").length'),1,'Cadastro usa apenas uma tela');
      assert.ok(await evaluate('!document.querySelector(".tree-entry-dialog button[aria-label*=Expandir]")'),'Mapa não abre outro modal no cadastro');
      assert.ok(await evaluate('(()=>{const r=document.querySelector("[data-testid=tree-form-footer]").getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()'));
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
    };
    const attach = async selector => {
      const {root:doc}=await send('DOM.getDocument',{},sessionId);
      const {nodeId}=await send('DOM.querySelector',{nodeId:doc.nodeId,selector},sessionId);
      await send('DOM.setFileInputFiles',{nodeId,files:[photoPath]},sessionId);
    };
    const mark = async (dx=0,dy=0) => {
      await evaluate('window.testMap.getContainer().scrollIntoView({block:"center",behavior:"instant"})');
      const point=await evaluate(`(()=>{const r=window.testMap.getContainer().getBoundingClientRect();const p={x:r.left+r.width/2+${dx},y:r.top+r.height/2+${dy}};for(let i=0;i<8&&document.elementFromPoint(p.x,p.y)?.closest('.leaflet-marker-icon');i++){p.x+=25;p.y+=12}return p})()`);
      await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point},sessionId);
      await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point},sessionId);
    };
    const common = async (batch = false) => {
      await choose('Situação','atencao');
      if(!batch){await choose('Bairro','b2');await input('Endereço / referência','Praça das árvores');}
      await evaluate('document.querySelector("[data-testid=tree-extra-fields]").open=true');
      await input('Altura (m)','8');await input('Diâmetro da copa (m)','4');await input('Data do plantio','2020-05-10');
      await choose('Responsável pelo plantio','comunidade');await input('Ano de nascimento estimado','2000');
      await choose('Manejo necessário','poda');await input('Prazo do manejo','2026-12-10');
      await evaluate(`(()=>{const el=[...document.querySelectorAll('.tree-entry-dialog label')].find(el=>el.textContent.startsWith('Observações públicas')).querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'Dados completos');el.dispatchEvent(new Event('input',{bubbles:true}))})()`);
    };
    await navigate('');await waitFor('document.querySelectorAll(".tree-map-pin").length===2');
    await click('Tela cheia');await waitFor('document.querySelector("[role=dialog] .leaflet-container")');
    await click('Cadastrar árvore');await formReady();
    if(width>=980)assert.ok(await evaluate('document.querySelector("[data-testid=tree-form-map]").getBoundingClientRect().width>innerWidth*.5'));
    const fieldNames=await evaluate('[...document.querySelectorAll(".tree-entry-dialog label")].map(el=>el.firstChild.textContent).filter(text=>!["Latitude","Longitude"].includes(text))');
    await choose('Nome popular','s2');await click('Nova espécie');await waitFor('document.querySelector("[data-testid=tree-species-editor]")');
    assert.equal(await evaluate('document.querySelectorAll("[role=dialog]").length'),2,'Nova espécie abre um modal próprio');
    assert.ok(await evaluate('document.querySelector("[data-testid=tree-species-editor]").matches("[role=dialog]")&&!document.querySelector(".tree-entry-fields [data-testid=tree-species-editor]")'),'Espécie fora da coluna do formulário');
    await input('Nome popular','  ním  ');await click('Usar espécie existente');await waitFor('!document.querySelector("[data-testid=tree-species-editor]")');
    assert.equal(await fieldValue('Nome popular'),'s2');assert.equal(await evaluate('window.writes.length'),0);
    await click('Nova espécie');await input('Nome popular','Castanhola');
    await attach('[data-testid=tree-species-editor] input[type=file]');await waitFor('document.querySelector("[data-testid=tree-species-editor] img")');
    await evaluate('window.failSave=true');await click('Adicionar ao catálogo');await waitFor('document.querySelector("[data-testid=tree-species-editor] [role=alert]")');
    assert.equal(await fieldValue('Nome popular'),'Castanhola');assert.equal(await evaluate('window.removedUploads.length'),1,'Ilustração sem espécie salva é removida');
    await evaluate('document.querySelector("[data-testid=tree-species-body]").scrollTop=document.querySelector("[data-testid=tree-species-body]").scrollHeight');
    assert.ok(await evaluate('(()=>{const body=document.querySelector("[data-testid=tree-species-body]").getBoundingClientRect(),error=document.querySelector("[data-testid=tree-species-editor] [role=alert]").getBoundingClientRect(),footer=document.querySelector("[data-testid=tree-species-footer]").getBoundingClientRect();return error.bottom<=body.bottom+1&&body.bottom<=footer.top+1})()'),'Erro fica na área rolável e não sobrepõe as ações');
    await capture('new-species-modal-'+width);
    assert.ok(await evaluate('(()=>{const r=document.querySelector("[data-testid=tree-species-editor]").getBoundingClientRect(),save=[...document.querySelectorAll("[data-testid=tree-species-editor] button")].find(el=>el.type==="submit").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&save.bottom<=r.bottom})()'),'Modal e ação salvar cabem na tela');
    await evaluate('window.failSave=false');await click('Adicionar ao catálogo');await waitFor('!document.querySelector("[data-testid=tree-species-editor]")');
    assert.equal(await fieldValue('Nome popular'),'s-new');
    assert.ok(await evaluate('window.writes.length===1&&Boolean(window.writes[0].payload.illustration_url)&&window.writes[0].payload.scientific_name===null'),'Espécie salva ilustração opcional');
    await click('Usar GPS');await waitForAddress();await common();
    assert.ok(await evaluate('Boolean(window.testMap.getContainer().querySelector(".tree-map-current-point"))'),'Ponto atual tem marcador próprio');
    assert.equal(await evaluate('getComputedStyle(window.testMap.getContainer().querySelector(".tree-current-point-halo")).animationName'),'tree-point-pulse');
    await attach('.tree-entry-dialog section[aria-label="Foto da árvore"] input[type=file]');
    await waitFor(`document.querySelector('.tree-entry-dialog section[aria-label="Foto da árvore"] img')`);
    assert.ok(await evaluate(`!document.querySelector('.tree-entry-dialog section[aria-label="Foto da árvore"] figcaption')`),'Foto real tem prioridade no formulário');
    await capture('unified-single-'+width);
    await click('Salvar árvore');await waitFor('!document.querySelector("[role=dialog]")');
    assert.equal(await evaluate('window.writes.filter(row=>row.table==="city_trees").length'),1);
    await click('Lista');await waitFor('document.querySelectorAll("article").length===3');
    await click('Cadastrar em sequência');await formReady();
    assert.deepEqual(await evaluate('[...document.querySelectorAll(".tree-entry-dialog label")].map(el=>el.firstChild.textContent).filter(text=>!["Latitude","Longitude"].includes(text))'),fieldNames.filter(text=>!['Bairro','Endereço / referência'].includes(text)),'Lote mantém dados comuns sem campos manuais de endereço e bairro');
    assert.ok(await evaluate(`!document.querySelector('.tree-entry-dialog [aria-label="Endereço da árvore"]')&&Boolean(document.querySelector('[data-testid=tree-batch-address-info]'))`));
    await choose('Nome popular','s-new');await common(true);
    await mark(-65,-20);await mark(65,25);await waitFor('document.querySelectorAll(".tree-map-draft").length===2');
    await click('Nova espécie');await waitFor('document.querySelector("[data-testid=tree-species-editor]")');await input('Nome popular','Rascunho');
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'},sessionId);await waitFor('!document.querySelector("[data-testid=tree-species-editor]")');
    assert.equal(await evaluate('document.querySelectorAll(".tree-map-draft").length'),2,'Escape fecha só a espécie e mantém pins');
    assert.ok(await evaluate('!document.querySelector("[data-testid=tree-form-footer]").textContent.includes("Descartar")'));
    await capture('batch-pin-locations-'+width);
    await click('Sair da tela cheia');await waitFor('document.querySelector("[data-testid=tree-form-footer]").textContent.includes("Descartar os 2 pontos")');
    assert.equal(await evaluate('document.querySelectorAll("[role=dialog]").length'),1);await click('Manter lote');
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'},sessionId);
    await waitFor('document.body.innerText.includes("Manter lote")');await click('Manter lote');
    await evaluate('window.batchAddressMode=true;window.expectedBatchPoints=Object.values(window.testMap._layers).filter(layer=>layer.options?.icon?.options?.className==="tree-map-draft").map(layer=>({latitude:layer.getLatLng().lat,longitude:layer.getLatLng().lng}));window.batchSplitLatitude=window.expectedBatchPoints.reduce((sum,point)=>sum+point.latitude,0)/2;window.failAddress=true');
    await click('Salvar lote (2)');await waitFor('document.querySelector("[data-testid=tree-form-footer] [role=alert]")');
    assert.ok(await evaluate('document.querySelector("[data-testid=tree-form-footer] [role=alert]").textContent.includes("Nenhuma árvore foi salva")'));
    assert.equal(await evaluate('document.querySelectorAll(".tree-map-draft").length'),2);
    assert.equal(await evaluate('window.writes.filter(row=>row.table==="city_trees").length'),1,'Falha na consulta não salva lote parcial');
    await evaluate('window.failAddress=false;window.nextAddressDelay=400');
    await evaluate('window.failSave=true');await click('Salvar lote (2)');await waitFor('document.querySelector("[data-testid=tree-batch-address-progress]")');
    assert.ok(await evaluate('[...document.querySelectorAll(".tree-entry-dialog button")].find(el=>el.textContent.trim()==="Sair da tela cheia").disabled'),'Consulta mantém a tela e a seleção bloqueadas durante o salvamento');
    await waitFor('document.querySelector("[data-testid=tree-form-footer] [role=alert]")');
    assert.equal(await evaluate('document.querySelectorAll(".tree-map-draft").length'),2);
    const resolvedRequests=await evaluate('window.addressRequests.length');
    await evaluate('window.failSave=false');await click('Salvar lote (2)');await waitFor('document.querySelectorAll(".tree-map-draft").length===0');
    assert.equal(await evaluate('window.addressRequests.length'),resolvedRequests,'Repetir salvamento reutiliza os endereços já consultados');
    assert.ok(await evaluate('(()=>{const writes=window.writes.filter(row=>row.table==="city_trees"),one=writes[0].payload,batch=writes[1].payload;const fields=["species_id","status","height_m","crown_diameter_m","planted_at","planted_by","estimated_birth_year","maintenance_action","maintenance_due_at","notes"];return writes.length===2&&batch.length===2&&batch.every((row,i)=>fields.every(key=>row[key]===one[key])&&row.photo_url===null&&row.latitude===window.expectedBatchPoints[i].latitude&&row.longitude===window.expectedBatchPoints[i].longitude&&row.address==="Rua do pin "+row.latitude.toFixed(5)+","+row.longitude.toFixed(5)&&row.bairro_id===(row.latitude<window.batchSplitLatitude?"b2":"b1"))&&new Set(batch.map(row=>row.bairro_id)).size===2&&Boolean(one.photo_url)})()'),'Cada pin salva seu próprio endereço, bairro e coordenadas; dados da espécie e medidas permanecem comuns');
    await capture('unified-batch-'+width);
    await click('Encerrar');await waitFor('!document.querySelector("[role=dialog]")');
    assert.ok(await evaluate('!document.querySelector(".tree-batch-workspace")'),'Encerrar volta direto à visualização');
    await click('Lista');await waitFor('document.querySelectorAll("article").length===5');
    assert.equal(await evaluate('[...document.querySelectorAll("article figcaption")].filter(el=>el.textContent.includes("Imagem ilustrativa da espécie Castanhola")).length'),2,'Árvores sem foto usam ilustração identificada');
    await capture('species-fallback-list-'+width);
    await click('Cadastrar em sequência');await formReady();await click('Sair da tela cheia');await waitFor('!document.querySelector("[role=dialog]")');
    await click('Cadastrar em sequência');await formReady();await mark(-50,15);await waitFor('document.querySelectorAll(".tree-map-draft").length===1');
    await click('Sair da tela cheia');await click('Descartar pontos');await waitFor('!document.querySelector("[role=dialog]")');
    assert.equal(await evaluate('window.writes.filter(row=>row.table==="city_trees").length'),2,'Sair com descarte não salva');
    await navigate('?detail&illustration');await waitFor('document.querySelector(".tree-profile-photo figcaption")');
    assert.ok(await evaluate('document.querySelector(".tree-profile-photo figcaption").textContent.includes("Imagem ilustrativa da espécie")'));
    await navigate('?detail&illustration&photo');await waitFor('document.querySelector(".tree-profile-photo img")');
    assert.ok(await evaluate('!document.querySelector(".tree-profile-photo figcaption")'),'Foto real prevalece também no perfil');
    await navigate('?public');await waitFor('document.querySelectorAll(".tree-map-pin").length===2');
    assert.ok(await evaluate('!document.body.innerText.includes("Cadastrar árvore")&&!document.body.innerText.includes("Cadastrar em sequência")'));
  };
  if(process.argv.includes('--mobile-profile')){
    for(const [width,height] of [[320,640],[390,844],[430,932],[767,1024]]){
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);
      await navigate('?detail&species-info');await waitFor('document.querySelector(".tree-profile-history-disclosure")&&document.body.innerText.includes("Resumo público da espécie.")');
      assert.ok(await evaluate('document.querySelector(".tree-profile-photo-placeholder").getBoundingClientRect().height<=100'));
      assert.ok(await evaluate('document.querySelector(".tree-profile-all-data").open&&document.querySelector(".tree-profile-mobile-highlights").getBoundingClientRect().width>200'));
      assert.ok(await evaluate('!document.querySelector("[role=tablist]")&&document.documentElement.scrollWidth<=innerWidth'));
      assert.ok(await evaluate('(()=>{const overview=document.querySelector(".tree-profile-overview").getBoundingClientRect();const map=document.querySelector(".tree-profile-location").getBoundingClientRect();const history=document.querySelector(".tree-profile-history").getBoundingClientRect();return overview.bottom<=map.top&&map.bottom<=history.top})()'),'Resumo, mapa e histórico seguem uma sequência contínua');
      assert.ok(await evaluate('[...document.querySelectorAll(".tree-profile-header-actions > button")].every(el=>getComputedStyle(el).backgroundColor==="rgba(0, 0, 0, 0)")'),'Ações sem preenchimento chamativo');
      await capture('mobile-profile-summary-'+width);
      await evaluate('document.querySelector(".tree-profile-all-data summary").click()');
      assert.ok(await evaluate('!document.querySelector(".tree-profile-all-data").open&&document.querySelectorAll(".tree-profile-fact").length===12'));
      await evaluate('document.querySelector(".tree-profile-all-data summary").click()');
      await waitFor('window.testMap.getSize().x>100');
      await waitFor('window.testMap.getCenter().distanceTo({lat:-8.597,lng:-38.574})<2');
      assert.ok(await evaluate('!document.querySelector(".tree-profile-history-disclosure").open'));
      await evaluate('document.querySelector(".tree-profile-location").scrollIntoView({block:"start",behavior:"instant"})');
      await capture('mobile-profile-map-'+width);
      await evaluate('window.profileMap=window.testMap;void window.testMap.setView([-8.598,-38.575],16,{animate:false});window.profileCenter=window.testMap.getCenter()');
      await evaluate('document.querySelector(".tree-profile-history-toggle").click();document.querySelector(".tree-profile-history").scrollIntoView({block:"start",behavior:"instant"})');
      await capture('mobile-profile-history-'+width);
      await evaluate('document.querySelector(".tree-profile-history-toggle").click()');
      await waitFor('window.testMap.getCenter().distanceTo(window.profileCenter)<2&&window.testMap.getZoom()===16');
      assert.ok(await evaluate('window.profileMap===window.testMap'));
      await click('Ver no mapa maior');await waitFor('document.querySelector("[role=dialog] .leaflet-container")');
      await click('Sair da tela cheia');await waitFor('!document.querySelector("[role=dialog]")');
      await click('Registrar serviço');await choose('Serviço','poda');await input('Data de realização','2026-10-10');await click('Registrar no histórico');
      await waitFor('document.querySelector(".tree-profile-history")?.innerText.includes("Poda: serviço realizado")');
      await waitFor('!document.querySelector("[role=dialog]")');
      assert.ok(await evaluate('document.querySelector(".tree-profile-history-disclosure").open'));
      await click('Adicionar foto');await waitFor('document.querySelector(".tree-entry-dialog")?.dataset.mobileStep==="1"');
      await evaluate(`document.querySelector('button[aria-label="Fechar cadastro"]').click()`);await waitFor('!document.querySelector(".tree-entry-dialog")');
      assert.ok(await evaluate('(()=>{const qr=document.querySelector(".tree-profile-qr-action");const button=qr.querySelector("button").getBoundingClientRect();return getComputedStyle(qr).display!=="none"&&button.height>=44&&qr.innerText.includes("Baixar PDF")&&qr.innerText.includes("PDF A5")})()'),'Download de QR Code visível na página, com formato indicado');
      await navigate('?detail&photo');await waitFor('document.querySelector(".tree-profile-photo img")');
      assert.ok(await evaluate('document.querySelector(".tree-profile-photo").getBoundingClientRect().height<=190'));
      await click('Ver imagem completa');await waitFor('document.querySelector(".tree-profile-photo-dialog img")');
      assert.ok(await evaluate('document.querySelector(".tree-profile-photo-dialog").getBoundingClientRect().width<=innerWidth'));
      await navigate('?detail&public');await waitFor('document.querySelector(".tree-profile-history-disclosure")');
      assert.ok(await evaluate('!document.body.innerText.includes("Editar árvore")&&!document.body.innerText.includes("Registrar serviço")&&!document.body.innerText.includes("Adicionar foto")'));
      results.push({width,compactSummary:true,noTabs:true,quietActions:true,mapPreserved:true,careTimeline:true,photoShortcut:true,publicReadOnly:true,noOverflow:true});
    }
    for(const [width,height] of [[1440,900],[1920,1080]]){
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);
      await navigate('?detail');await waitFor('document.querySelector(".tree-profile-all-data")?.open');
      assert.ok(await evaluate('!document.querySelector(".tree-profile-mobile-tabs")&&document.documentElement.scrollWidth<=innerWidth'));
      assert.ok(await evaluate(detailBottomsAligned));
      await capture('desktop-profile-'+width);results.push({width,desktopColumns:true,alignedCards:true});
    }
  }else if(process.argv.includes('--mobile-flow')){
    const formReady = () => waitFor('document.querySelector(".tree-entry-dialog [role=combobox]")&&!document.querySelector(".tree-entry-dialog [role=combobox]").disabled');
    const assertStep = async step => {
      await waitFor(`document.querySelector('.tree-entry-dialog')?.dataset.mobileStep==='${step}'`);
      assert.ok(await evaluate(`(()=>{const footer=document.querySelector('[data-testid=tree-form-footer]').getBoundingClientRect();const nav=document.querySelector('.tree-entry-progress [aria-current=step]');return footer.bottom<=innerHeight+1&&footer.top>=0&&nav&&document.documentElement.scrollWidth<=innerWidth})()`),'Etapa e ações visíveis sem rolagem horizontal');
      assert.equal(await evaluate('window.writes.length'),0,'Avançar e voltar não salva o cadastro');
    };
    for(const [width,height] of [[320,640],[390,844],[430,932],[767,1024]]){
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);
      await navigate('');await waitFor('document.querySelectorAll(".tree-map-pin").length===2');
      await evaluate('document.querySelector(".tree-map-pin").click()');await waitFor('document.querySelector(".tree-details-sheet")');
      await waitFor('(()=>{const sheet=document.querySelector(".tree-details-sheet").getBoundingClientRect();return Math.abs(sheet.bottom-innerHeight)<2&&sheet.top>0&&getComputedStyle(document.querySelector(".tree-details-secondary")).display==="none"})()');
      await capture('mobile-tree-sheet-'+width);await click('Ver mais informações');
      assert.ok(await evaluate('getComputedStyle(document.querySelector(".tree-details-secondary")).display!=="none"'));
      await evaluate(`document.querySelector('button[aria-label="Voltar ao mapa"]').click()`);await waitFor('!document.querySelector(".tree-details-sheet")');
      await click('Cadastrar árvore');await formReady();await assertStep(0);
      assert.ok(await evaluate('[...document.querySelectorAll("[data-testid=tree-form-footer] button")].find(el=>el.textContent.includes("Continuar")).disabled'));
      assert.ok(await evaluate('getComputedStyle(document.querySelector(".tree-entry-identification")).display==="none"'));
      await capture('mobile-tree-location-empty-'+width);
      await click('Usar GPS');await waitFor('document.querySelectorAll(".tree-map-current-point").length===1');
      await waitFor('document.querySelector(".tree-entry-address-toggle").innerText.includes("Rua Joaquim")');
      await evaluate('window.initialMap=window.testMap;window.initialCoordinates=window.testMap.getCenter()');
      await capture('mobile-tree-location-'+width);await click('Continuar');await assertStep(1);
      assert.ok(await evaluate('getComputedStyle(document.querySelector(".tree-entry-location")).display==="none"'));
      await choose('Nome popular','s2');await choose('Situação','atencao');
      await capture('mobile-tree-identification-'+width);
      await click('Nova espécie');await input('Nome popular','Espécie em rascunho');await click('Cancelar');await waitFor('!document.querySelector("[data-testid=tree-species-editor]")');
      await click('Voltar');await assertStep(0);assert.ok(await evaluate('window.initialMap===window.testMap'));
      await waitFor('window.testMap.getCenter().distanceTo(window.initialCoordinates)<2');
      await evaluate('document.querySelector(".tree-entry-address-toggle").click()');await choose('Bairro','b2');
      await click('Continuar');await assertStep(1);assert.equal(await fieldValue('Nome popular'),'s2');
      await input('Altura (m)','-1');await click('Revisar');await waitFor('document.querySelector("[data-testid=tree-form-footer] [role=alert]")');
      assert.equal(await evaluate('document.querySelector(".tree-entry-dialog").dataset.mobileStep'),'1');
      await input('Altura (m)','6');await click('Revisar');await assertStep(2);
      assert.ok(await evaluate('document.querySelector(".tree-entry-review").innerText.includes("Nim")&&document.querySelector(".tree-entry-review").innerText.includes("Três Marias")'));
      await capture('mobile-tree-review-'+width);
      await evaluate('window.failSave=true');await click('Cadastrar árvore');await waitFor('document.querySelector("[data-testid=tree-form-footer] [role=alert]")');
      assert.equal(await evaluate('document.querySelector(".tree-entry-dialog").dataset.mobileStep'),'2');
      await evaluate('window.failSave=false');await click('Cadastrar árvore');await waitFor('!document.querySelector(".tree-entry-dialog")');
      assert.ok(await evaluate('window.writes.some(row=>row.table==="city_trees"&&row.payload.species_id==="s2"&&row.payload.bairro_id==="b2"&&row.payload.height_m===6)'));
      await navigate('');await waitFor('document.querySelectorAll(".tree-map-pin").length===2');
      await click('Cadastrar em sequência');await formReady();
      await evaluate('window.batchMap=window.testMap;void window.testMap.fire("click",{latlng:{lat:-8.61,lng:-38.58}});void window.testMap.fire("click",{latlng:{lat:-8.62,lng:-38.59}})');await waitFor('document.querySelectorAll(".tree-map-draft").length===2');
      await click('Continuar');await assertStep(1);await choose('Nome popular','s1');await click('Revisar');await assertStep(2);
      assert.ok(await evaluate('document.querySelector(".tree-entry-review").innerText.includes("2 árvores marcadas")'));
      await click('Voltar');await assertStep(1);await click('Voltar');await assertStep(0);assert.equal(await evaluate('document.querySelectorAll(".tree-map-draft").length'),2);
      await click('Continuar');await click('Revisar');await click('Salvar lote (2)');await waitFor('document.querySelector(".tree-entry-dialog").dataset.mobileStep==="0"&&document.querySelectorAll(".tree-map-draft").length===0');
      assert.ok(await evaluate('window.testMap===window.batchMap&&window.writes.some(row=>Array.isArray(row.payload)&&row.payload.length===2)'));
      await capture('mobile-tree-batch-saved-'+width);await click('Encerrar');await waitFor('!document.querySelector(".tree-entry-dialog")');
      await click('Cadastrar árvore');await formReady();await click('Usar GPS');await click('Continuar');
      await evaluate(`document.querySelector('button[aria-label="Fechar cadastro"]').click()`);await waitFor('document.body.innerText.includes("Descartar as alterações")');
      await click('Continuar cadastro');assert.equal(await evaluate('document.querySelector(".tree-entry-dialog").dataset.mobileStep'),'1');
      await evaluate(`document.querySelector('button[aria-label="Fechar cadastro"]').click()`);await click('Descartar alterações');await waitFor('!document.querySelector(".tree-entry-dialog")');
      results.push({width,stepValidation:true,mapPreserved:true,batchReview:true,saveRetry:true,bottomSheet:true,noOverflow:true});
    }
    for(const [width,height] of [[1440,900],[1920,1080]]){
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);
      await navigate('');await waitFor('document.querySelectorAll(".tree-map-pin").length===2');
      assert.ok(await evaluate('(()=>{const r=document.querySelector("[data-testid=arborization-page]").getBoundingClientRect();return r.left<=64&&innerWidth-r.right<=64})()'));
      await click('Cadastrar árvore');await formReady();
      assert.ok(await evaluate('!document.querySelector(".tree-entry-progress")&&(()=>{const a=document.querySelector(".tree-entry-location").getBoundingClientRect();const b=document.querySelector(".tree-entry-fields").getBoundingClientRect();return b.left>=a.right&&Math.abs(a.top-b.top)<2&&document.documentElement.scrollWidth<=innerWidth})()'));
      await capture('desktop-tree-registration-'+width);
      await click('Cancelar');await waitFor('!document.querySelector(".tree-entry-dialog")');
      results.push({width,desktopColumns:true,fluidMargins:true});
    }
  }else if(process.argv.includes('--improvements')){
    const setText = (label, value) => evaluate(`(()=>{const scope=[...document.querySelectorAll('[role=dialog]')].at(-1)||document;const el=[...scope.querySelectorAll('label')].find(e=>e.firstChild.textContent===${JSON.stringify(label)}).querySelector('input,textarea');Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}))})()`);
    for(const [width,height] of [[390,844],[1440,900],[1920,1080]]){
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);
      await navigate('?improvements');await waitFor('document.querySelectorAll(".tree-map-pin").length===4');
      assert.deepEqual(await evaluate('[...document.querySelectorAll(".arborization-stat-label")].map(el=>el.textContent)'),['Árvores no inventário','Espécie mais plantada','Bairro menos arborizado','Plantadas em 2026']);
      assert.deepEqual(await evaluate('[...document.querySelectorAll(".arborization-stat-value")].map(el=>el.textContent)'),['4','Ipê-amarelo','Três Marias','1']);
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
      if(width>=1200)assert.ok(await evaluate('(()=>{const r=document.querySelector("[data-testid=arborization-page]").getBoundingClientRect();return r.left<=64&&innerWidth-r.right<=64})()'));
      await select('Situação','living');await select('Bairro','unidentified');await waitFor('document.querySelectorAll(".tree-map-pin").length===1');
      await click('Lista');await waitFor('document.querySelector("article")');assert.ok(await evaluate('document.querySelector("article").innerText.includes("AR3")'));
      await click('Editar');await waitFor('document.querySelector(".tree-entry-dialog select")&&!document.querySelector(".tree-entry-dialog [role=combobox]").disabled');
      assert.equal(await evaluate('(window.addressRequests||[]).length'),0,'Abrir edição preserva o endereço sem consulta automática');
      await input('Endereço / referência','Referência conferida');
      await evaluate('window.failAddress=true');await click('Buscar bairro pelo ponto');
      await waitFor('document.querySelector(".tree-entry-address [role=status]").innerText.includes("Não foi possível identificar")');
      assert.equal(await addressValue(),'Referência conferida');assert.equal(await fieldValue('Bairro'),'');
      await evaluate('window.failAddress=false;window.addressResult={address:"Rua retornada",suburb:"Bairro sem cadastro"}');
      await click('Buscar bairro pelo ponto');await waitFor('document.querySelector(".tree-entry-address [role=status]").innerText.includes("não está no cadastro desta cidade")');
      assert.equal(await fieldValue('Bairro'),'');assert.equal(await addressValue(),'Referência conferida');
      await evaluate('delete window.addressResult;window.nextAddressDelay=500');await click('Buscar bairro pelo ponto');
      assert.ok(await evaluate('[...document.querySelectorAll(".tree-entry-address button")].find(el=>el.textContent.includes("Buscar bairro pelo ponto")).disabled'));
      await input('Endereço / referência','Referência ajustada durante a busca');
      await waitFor('document.querySelector(".tree-entry-address select").value==="b1"');
      assert.equal(await addressValue(),'Referência ajustada durante a busca');
      assert.ok(await evaluate('window.addressRequests.length===3&&window.addressRequests.every(point=>point.lat===-8.599&&point.lng===-38.571)'),'Busca usa coordenadas existentes sem mover a árvore');
      await capture('tree-neighborhood-point-'+width);
      if(width<768){await click('Continuar');await click('Revisar');await click('Salvar alterações');}else await click('Salvar árvore');
      await waitFor('!document.querySelector(".tree-entry-dialog")');
      assert.ok(await evaluate('window.writes.some(row=>row.table==="city_trees"&&row.payload.bairro_id==="b1"&&row.payload.latitude===-8.599&&row.payload.longitude===-38.571&&row.payload.address==="Referência ajustada durante a busca")'));
      await navigate('');await waitFor('document.querySelectorAll(".tree-map-pin").length===2');
      await click('Cadastrar em sequência');await waitFor('document.querySelectorAll(".tree-map-existing").length===2&&!document.querySelector(".tree-entry-dialog [role=combobox]").disabled');
      await evaluate('void window.testMap.fire("click",{latlng:{lat:-8.597,lng:-38.574}})');await waitFor('document.body.innerText.includes("até 3 metros")');
      if(width<768)await click('Continuar');
      await choose('Nome popular','s1');await click('Editar espécie');
      await setText('Nome popular principal','Ipê regional');await setText('Outros nomes populares ou regionais','Pau-d’arco; Ipê amarelo');
      await evaluate('window.failAi=true');await click('Gerar resumo e orientação com IA');await waitFor('document.querySelector("[data-testid=tree-species-editor] [role=alert]")');
      assert.equal(await evaluate('document.querySelector("[data-testid=tree-species-editor] input").value'),'Ipê regional');
      await evaluate('window.failAi=false');await click('Gerar resumo e orientação com IA');await waitFor(`document.querySelector('[data-testid=tree-species-editor] textarea[maxlength="5000"]').value.includes('Resumo de teste')`);
      await capture('species-improvements-'+width);
      await click('Salvar espécie');await waitFor('!document.querySelector("[data-testid=tree-species-editor]")');
      assert.ok(await evaluate('window.writes.some(row=>row.table==="city_tree_species"&&row.payload.common_name==="Ipê regional"&&row.payload.aliases.length===2&&row.payload.summary.includes("Resumo de teste")&&row.payload.sidewalk_suitability==="com_restricoes")'));
      assert.equal(await evaluate('document.querySelectorAll(".tree-map-draft").length'),1);
      if(width<768)await evaluate(`document.querySelector('button[aria-label="Fechar cadastro"]').click()`);else await click('Encerrar');
      await click('Descartar pontos');await waitFor('!document.querySelector("[role=dialog]")');
      await evaluate(`(()=>{const el=document.querySelector('.arborization-search input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'Pau-d’arco');el.dispatchEvent(new Event('input',{bubbles:true}))})()`);
      await waitFor('document.querySelectorAll(".tree-map-pin").length===1');
      await navigate('?detail&species-info');await waitFor('document.body.innerText.includes("Resumo público da espécie.")');
      assert.ok(await evaluate('document.body.innerText.includes("Pau-d’arco")&&document.body.innerText.includes("Com restrições")&&document.body.innerText.includes("Conferir espaço para a copa.")'));
      await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:out});
      await fs.rm(path.join(out,'arvore-AR1-qrcode.pdf'),{force:true});
      await click('Baixar PDF');await waitFor('!document.querySelector("[data-testid=tree-page] button:disabled")');
      assert.ok(await evaluate('!document.body.innerText.includes("Download iniciado:")'));
      await pause(500);const pdf=await fs.readFile(path.join(out,'arvore-AR1-qrcode.pdf'));assert.ok(pdf.subarray(0,5).toString()==='%PDF-');assert.ok(pdf.toString().includes('/arborizacao/arvore/t1'));
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
      await capture('tree-qr-'+width);
      results.push({width,aliases:true,aiDraft:true,livingWithoutNeighborhood:true,manualNeighborhood:true,existingMarkers:true,qrPdf:true,noOverflow:true});
    }
  }else if(process.argv.includes('--edit-species')){
    const attachIllustration = async () => {
      const {root:doc}=await send('DOM.getDocument',{},sessionId);
      const {nodeId}=await send('DOM.querySelector',{nodeId:doc.nodeId,selector:'[data-testid=tree-species-editor] input[type=file]'},sessionId);
      await send('DOM.setFileInputFiles',{nodeId,files:[photoPath]},sessionId);
      await waitFor('document.querySelector("[data-testid=tree-species-editor] img")');
    };
    for(const [width,height] of [[390,844],[1440,900],[1920,1080]]){
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);
      await navigate('');await waitFor('document.querySelectorAll(".tree-map-pin").length===2');
      await click('Cadastrar árvore');await waitFor('document.querySelector(".tree-entry-dialog [role=combobox]")&&!document.querySelector(".tree-entry-dialog [role=combobox]").disabled');
      await choose('Nome popular','s2');await click('Usar GPS');await waitForAddress();
      await click('Editar espécie');await waitFor('document.querySelector("[data-testid=tree-species-editor]")');
      assert.equal(await evaluate('document.querySelectorAll("[role=dialog]").length'),2,'Imagem da espécie em modal próprio');
      await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'},sessionId);await waitFor('!document.querySelector("[data-testid=tree-species-editor]")');
      assert.equal(await evaluate('document.querySelectorAll(".tree-map-current-point").length'),1,'Escape preserva o cadastro da árvore');
      await click('Editar espécie');await waitFor('document.querySelector("[data-testid=tree-species-editor]")');
      assert.ok(await evaluate('document.querySelector("[data-testid=tree-species-editor] input:not([type=file])").value==="Nim"'),'Editor carrega a identificação atual da espécie');
      await attachIllustration();await capture('edit-species-'+width);
      await evaluate('window.failSave=true');await click('Salvar espécie');await waitFor('document.querySelector("[data-testid=tree-species-editor] [role=alert]")');
      assert.equal(await evaluate('window.removedUploads.length'),1,'Upload sem atualização salva é removido');
      assert.ok(await evaluate('Boolean(document.querySelector("[data-testid=tree-species-editor] img"))'),'Falha preserva a imagem escolhida');
      await evaluate('window.failSave=false');await click('Salvar espécie');await waitFor('!document.querySelector("[data-testid=tree-species-editor]")');
      assert.ok(await evaluate('window.writes.length===1&&window.writes[0].table==="city_tree_species"&&window.writes[0].operation==="update"&&window.writes[0].payload.common_name==="Nim"&&Boolean(window.writes[0].payload.illustration_url)'),'Atualiza a espécie existente, sem criar espécie ou árvore');
      assert.equal(await fieldValue('Nome popular'),'s2');
      assert.equal(await evaluate('document.querySelectorAll(".tree-map-current-point").length'),1,'Mantém o pin do cadastro');
      await click('Cancelar');await click('Descartar alterações');await waitFor('!document.querySelector("[role=dialog]")');
      await click('Lista');await waitFor('document.querySelector("article figcaption")');
      assert.ok(await evaluate('[...document.querySelectorAll("article figcaption")].some(el=>el.textContent.includes("Imagem ilustrativa da espécie Nim"))'),'Inventário recebe a imagem atualizada');
      await click('Cadastrar em sequência');await waitFor('document.querySelector(".tree-entry-dialog [role=combobox]")&&!document.querySelector(".tree-entry-dialog [role=combobox]").disabled');
      await choose('Nome popular','s2');
      await evaluate('void window.testMap.fire("click",{latlng:{lat:-8.61,lng:-38.58}});void window.testMap.fire("click",{latlng:{lat:-8.62,lng:-38.59}})');await waitFor('document.querySelectorAll(".tree-map-draft").length===2');
      await click('Editar espécie');await click('Remover ilustração');await click('Cancelar');await waitFor('!document.querySelector("[data-testid=tree-species-editor]")');
      assert.equal(await evaluate('window.writes.length'),1,'Cancelar não altera a imagem salva');
      assert.ok(await evaluate('Boolean(document.querySelector("[data-testid=tree-species-field] figure"))'));
      await click('Editar espécie');await attachIllustration();await click('Salvar espécie');await waitFor('!document.querySelector("[data-testid=tree-species-editor]")');
      assert.equal(await evaluate('document.querySelectorAll(".tree-map-draft").length'),2,'Editar imagem mantém pontos do lote');
      assert.equal(await evaluate('window.writes.length'),2);
      await click('Editar espécie');await click('Remover ilustração');await click('Salvar espécie');await waitFor('!document.querySelector("[data-testid=tree-species-editor]")');
      assert.ok(await evaluate('window.writes.length===3&&window.writes[2].payload.illustration_url===null'),'Pode remover a imagem padrão');
      assert.ok(await evaluate('!document.querySelector("[data-testid=tree-species-field] figure")'));
      await click('Encerrar');await click('Descartar pontos');await waitFor('!document.querySelector("[role=dialog]")');
      assert.ok(await evaluate('window.writes.every(row=>row.table==="city_tree_species"&&row.operation==="update")'));
      await navigate('?detail&illustration');await waitFor('document.querySelector(".tree-profile-photo figcaption")');
      await click('Editar árvore');await waitFor('document.querySelector(".tree-entry-dialog [role=combobox]")&&!document.querySelector(".tree-entry-dialog [role=combobox]").disabled');
      await click('Editar espécie');await click('Remover ilustração');await click('Salvar espécie');await waitFor('!document.querySelector("[data-testid=tree-species-editor]")');
      await click('Cancelar');await waitFor('!document.querySelector("[role=dialog]")');
      assert.ok(await evaluate('!document.querySelector(".tree-profile-photo figcaption")'),'Perfil acompanha a edição sem salvar a árvore');
      assert.equal(await evaluate('window.writes.filter(row=>row.table==="city_trees").length'),0);
      await navigate('?detail&illustration&photo');await waitFor('document.querySelector(".tree-profile-photo img")');
      const realPhoto=await evaluate('document.querySelector(".tree-profile-photo img").src');
      await click('Editar árvore');await waitFor('document.querySelector(".tree-entry-dialog [role=combobox]")&&!document.querySelector(".tree-entry-dialog [role=combobox]").disabled');
      await click('Editar espécie');await click('Remover ilustração');await click('Salvar espécie');await waitFor('!document.querySelector("[data-testid=tree-species-editor]")');
      await click('Cancelar');await waitFor('!document.querySelector("[role=dialog]")');
      assert.equal(await evaluate('document.querySelector(".tree-profile-photo img").src'),realPhoto,'Foto real permanece prioritária');
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
      results.push({width,editExisting:true,uploadRetry:true,replaceAndRemove:true,preservesPins:true,realPhotoPriority:true,noOverflow:true});
    }
    await navigate('?detail&public');await waitFor('document.querySelector("[data-testid=tree-page]")');
    assert.ok(await evaluate('!document.body.innerText.includes("Editar espécie")&&!document.body.innerText.includes("Editar árvore")'));
  }else if(process.argv.includes('--layout')){
    for(const [width,height] of [[390,844],[768,1024],[1024,768],[1280,800],[1440,900],[1920,1080]]){
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);
      await navigate('');await validateLayout(width);
      if(width>=1280){await navigate('?territorial&scope=trees&area=arborizacao');await validateLayout(width);}
      results.push({width,topFilters:true,collapsibleAdvanced:true,statisticsDrawer:true,moreActions:true,noOverflow:true});
    }
    await navigate('?public');await waitFor('document.querySelectorAll(".tree-map-pin").length===2');
    assert.ok(await evaluate('!document.body.innerText.includes("Mais ações")&&!document.body.innerText.includes("Cadastrar árvore")'),'Consulta pública sem ações de gestão');
  }else if(process.argv.includes('--maintenance')){
    for(const [width,height] of [[390,844],[1440,900],[1920,1080]]){
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);
      await navigate('?maintenance');await waitFor('document.querySelectorAll(".tree-map-pin").length===3');
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
      await click('Tela cheia');await waitFor('document.querySelector("[role=dialog] .leaflet-container")');
      await click('Manejo em lote');await waitFor('document.querySelector("[data-testid=tree-maintenance-dialog] .tree-map-pin")');await waitFor('document.querySelectorAll("[role=dialog]").length===1');
      await capture('maintenance-open-'+width);
      assert.equal(await evaluate('document.querySelectorAll("[role=dialog]").length'),1,'Manejo abre uma única tela: '+JSON.stringify(await evaluate('[...document.querySelectorAll("[role=dialog]")].map(el=>({state:el.dataset.state,title:el.querySelector("h2")?.textContent}))')));
      assert.equal(await evaluate('document.querySelectorAll("[data-testid=tree-maintenance-dialog] .tree-map-pin").length'),2,'Árvore removida não participa da seleção');
      const point=await evaluate(`(()=>{const r=document.querySelector('[data-testid=tree-maintenance-dialog] .tree-map-pin[title="AR1 · Ipê-amarelo"]').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
      await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point},sessionId);await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point},sessionId);
      await waitFor('document.querySelectorAll(".tree-map-maintenance-selected").length===1');
      assert.ok(await evaluate('!document.querySelector("[data-testid=tree-details-dialog]")'),'Selecionar não abre outro modal');
      assert.ok(await evaluate('!document.querySelector("[data-testid=tree-maintenance-dialog] input[type=checkbox]")&&!document.querySelector("[data-testid=tree-maintenance-dialog] ul")&&!document.querySelector("[data-testid=tree-maintenance-dialog]").textContent.includes("Bairro da seleção")&&!document.querySelector("[data-testid=tree-maintenance-dialog]").textContent.includes("Selecionar resultados")'),'Seleção usa apenas busca e mapa');
      const selectOnMap = async label => evaluate(`document.querySelector('[data-testid=tree-maintenance-dialog] .tree-map-pin[title="'+${JSON.stringify(label)}+'"]').click()`);
      await input('Buscar árvores','nim');await waitFor('document.querySelectorAll("[data-testid=tree-maintenance-dialog] .tree-map-pin").length===1');
      await selectOnMap('AR2 · Nim');await waitFor('document.querySelector("[data-testid=tree-maintenance-footer]").innerText.includes("2 árvores selecionadas")');
      await input('Buscar árvores','sem resultado');await waitFor('document.querySelectorAll("[data-testid=tree-maintenance-dialog] .tree-map-pin").length===0&&document.querySelector("[data-testid=tree-maintenance-dialog]").textContent.includes("Nenhuma árvore encontrada")');
      assert.ok(await evaluate('document.querySelector("[data-testid=tree-maintenance-footer]").innerText.includes("2 árvores selecionadas")'),'Busca preserva seleção');
      await input('Buscar árvores','');await waitFor('document.querySelectorAll(".tree-map-maintenance-selected").length===2');
      await selectOnMap('AR2 · Nim');await waitFor('document.querySelectorAll(".tree-map-maintenance-selected").length===1');
      await click('Limpar seleção');await waitFor('document.querySelectorAll(".tree-map-maintenance-selected").length===0');
      await selectOnMap('AR1 · Ipê-amarelo');await selectOnMap('AR2 · Nim');await waitFor('document.querySelectorAll(".tree-map-maintenance-selected").length===2');
      await choose('Manejo necessário','poda');await input('Prazo do manejo','2026-12-20');
      await click('Revisar manejo');await waitFor('document.querySelector("[data-testid=tree-maintenance-review]")');
      assert.equal(await evaluate('window.maintenanceCalls.length'),0,'Revisão não altera cadastros');
      assert.ok(await evaluate('document.querySelector("[data-testid=tree-maintenance-dialog]").textContent.includes("serão substituídos")'),'Manejo pendente fica explícito na revisão');
      assert.ok(await evaluate('document.querySelector("[data-testid=tree-maintenance-footer]").getBoundingClientRect().bottom<=innerHeight'),'Ações permanecem visíveis');
      await capture('maintenance-review-'+width);
      await evaluate('window.failSave=true');await click('Salvar manejo (2)');await waitFor('document.querySelector("[data-testid=tree-maintenance-footer] [role=alert]")');
      assert.equal(await evaluate('document.querySelectorAll(".tree-map-maintenance-selected").length'),2,'Falha mantém seleção');assert.equal(await evaluate('window.writes.length'),0);
      await evaluate('window.failSave=false;window.nextMaintenanceDelay=400');await click('Salvar manejo (2)');
      await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'},sessionId);
      assert.ok(await evaluate('Boolean(document.querySelector("[data-testid=tree-maintenance-dialog]"))'),'Salvamento não é interrompido por Escape');
      await waitFor('!document.querySelector("[role=dialog]")');
      assert.ok(await evaluate('window.writes.length===1&&window.writes[0].operation==="maintenance"&&window.writes[0].ids.length===2&&Object.keys(window.writes[0].payload).length===2&&window.writes[0].payload.maintenance_action==="poda"&&window.writes[0].payload.maintenance_due_at==="2026-12-20"'),'Apenas manejo e prazo foram alterados');
      assert.ok(await evaluate('document.body.innerText.includes("Manejo programado em 2 árvores.")'));
      await click('Lista');await waitFor('document.querySelectorAll("article").length===3');
      assert.equal(await evaluate('[...document.querySelectorAll("article")].filter(el=>el.innerText.includes(" · Poda")).length'),2,'Lista reflete os dois manejos');
      await click('Manejo em lote');await waitFor('document.querySelector("[data-testid=tree-maintenance-dialog]")');
      await waitFor('document.querySelector("[data-testid=tree-maintenance-dialog] .tree-map-pin")');await selectOnMap('AR1 · Ipê-amarelo');
      await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'},sessionId);
      await waitFor('document.querySelector("[role=alertdialog]")');
      assert.equal(await evaluate('document.activeElement.textContent'),'Continuar programação','Confirmação começa focada em continuar');
      assert.ok(await evaluate('!document.querySelector("[data-testid=tree-maintenance-footer]").textContent.includes("Descartar alterações")'),'Confirmação aparece no modal');
      await capture('maintenance-discard-'+width);
      await click('Continuar programação');await waitFor('!document.querySelector("[role=alertdialog]")');
      assert.equal(await evaluate('document.querySelectorAll(".tree-map-maintenance-selected").length'),1);
      await click('Sair da tela cheia');await waitFor('document.querySelector("[role=alertdialog]")');
      await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'},sessionId);
      await waitFor('!document.querySelector("[role=alertdialog]")');
      assert.equal(await evaluate('document.querySelectorAll(".tree-map-maintenance-selected").length'),1,'Escape cancela somente o descarte');
      await click('Cancelar');await waitFor('document.querySelector("[role=alertdialog]")');await click('Descartar alterações');await waitFor('!document.querySelector("[role=dialog]")');
      assert.equal(await evaluate('window.writes.length'),1,'Cancelar não grava');
      await click('Manejo em lote');await waitFor('document.querySelector("[data-testid=tree-maintenance-dialog]")');
      await choose('Manejo necessário','poda');await input('Prazo do manejo','2026-12-20');
      await click('Sair da tela cheia');await waitFor('document.querySelector("[role=alertdialog]")');await click('Continuar programação');await waitFor('!document.querySelector("[role=alertdialog]")');
      assert.equal(await fieldValue('Manejo necessário'),'poda');assert.equal(await fieldValue('Prazo do manejo'),'2026-12-20');
      await click('Cancelar');await waitFor('document.querySelector("[role=alertdialog]")');await click('Descartar alterações');await waitFor('!document.querySelector("[role=dialog]")');
      await click('Manejo em lote');await waitFor('document.querySelector("[data-testid=tree-maintenance-dialog]")');await click('Sair da tela cheia');await waitFor('!document.querySelector("[role=dialog]")');
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
      await capture('maintenance-inventory-'+width);
      if(width>=980){
        await navigate('?territorial&scope=trees&area=arborizacao&maintenance');await waitFor('document.querySelector(".arborization-embedded .tree-map-pin")');
        assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Painel municipal sem overflow');
        await capture('maintenance-municipal-'+width);
        await click('Manejo em lote');await waitFor('document.querySelector("[data-testid=tree-maintenance-dialog]")');
        await click('Sair da tela cheia');await waitFor('!document.querySelector("[role=dialog]")');
      }
      results.push({width,existingTreesOnly:true,multiSelection:true,reviewBeforeSave:true,retryPreservesSelection:true,exitReturnsToInventory:true,noOverflow:true});
    }
    await navigate('?public&maintenance');await waitFor('document.querySelectorAll(".tree-map-pin").length===3');
    assert.ok(await evaluate('!document.body.innerText.includes("Manejo em lote")'),'Consulta pública não oferece escrita');
  }else if(['--registration','--batch','--species'].some(flag=>process.argv.includes(flag))){
    for(const [width,height] of [[390,844],[1440,900],[1920,1080]]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);
      await validateRegistration(width);
      results.push({width,unifiedRegistration:true,speciesModal:true,illustrationFallback:true,exitReturnsToMap:true});
    }
  }else if(process.argv.includes('--species-filter')){
    for(const [width,height] of [[390,844],[1440,900],[1920,1080]]){
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);
      await navigate(); await waitFor('document.querySelectorAll(".tree-map-pin").length===2');
      await openFilters();
      await select('Espécie','s1'); await click('Aplicar filtros (1)');
      await waitFor('document.querySelectorAll(".tree-map-pin").length===1');
      assert.equal(await evaluate('document.querySelectorAll(".tree-map-pin").length'),1);
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Filtro de espécie com rolagem horizontal');
      if(width>=1200)assert.ok(await evaluate('(()=>{const r=document.querySelector("[data-testid=arborization-page]").getBoundingClientRect();return r.left<=64&&innerWidth-r.right<=64})()'),'Margens externas excederam 64px');
      await capture('species-filter-'+width);
      await openFilters(); await select('Espécie','unidentified'); await click('Aplicar filtros (0)');
      await waitFor('document.body.innerText.includes("Nenhuma árvore encontrada")');
      await evaluate('document.querySelector(".arborization-reset-filters").click()');
      await waitFor('document.querySelectorAll(".tree-map-pin").length===2');
      results.push({width,speciesSelection:true,reset:true,noOverflow:true});
    }
  }else if(process.argv.includes('--summary')){
    for(const [width,height] of [[390,844],[1440,900],[1920,1080]]){
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);
      for(const query of ['?fail-species','?fail-neighborhoods','?fail-counts']){
        await navigate(query);await waitFor('document.querySelectorAll(".arborization-stat-value")[0]?.textContent==="2"');
        assert.equal(await evaluate('document.querySelectorAll(".arborization-stat-value")[1].textContent'),'Ipê-amarelo');
        assert.equal(await evaluate('document.querySelectorAll(".arborization-stat-value")[3].textContent'),'0');
        if(query==='?fail-counts'){
          await waitFor('document.body.innerText.includes("Os indicadores de solicitações não puderam ser carregados.")');
          assert.equal(await evaluate('document.querySelectorAll(".arborization-stat-value")[2].textContent'),'Três Marias');
          assert.equal(await evaluate('document.body.innerText.includes("O cadastro de bairros não pôde ser carregado.")'),false);
        }else{
          assert.equal(await evaluate('document.querySelectorAll(".arborization-stat-value")[2].textContent'),query==='?fail-neighborhoods'?'Bela Vista':'Três Marias');
          if(query==='?fail-neighborhoods')await waitFor('document.body.innerText.includes("O cadastro de bairros não pôde ser carregado.")');
          else assert.ok(await evaluate('document.body.innerText.includes("As imagens ilustrativas das espécies não puderam ser carregadas.")'));
        }
        assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
      }
      results.push({width,independentCounts:true,noInventedZero:true,noOverflow:true});
    }
  }else if(process.argv.includes('--team')){
    const setId=async(id,value)=>evaluate(`(()=>{const el=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}))})()`);
    const check=async label=>evaluate(`(()=>{const el=[...document.querySelectorAll('[role=dialog] label')].find(el=>el.textContent===${JSON.stringify(label)});el.querySelector('input').click()})()`);
    for(const [width,height] of [[390,844],[1440,900],[1920,1080]]){
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);
      await navigate('?team');await waitFor('document.querySelector("table tbody")?.textContent.includes("Ana Meio Ambiente")');
      assert.ok(await evaluate('!document.body.innerText.includes("Pessoa de Recife")'),'Lista limitada à prefeitura ativa');
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
      if(width>=1200)assert.ok(await evaluate('(()=>{const r=document.querySelector(".page-shell-fluid").getBoundingClientRect(),p=getComputedStyle(document.querySelector(".page-shell-fluid"));return r.left+parseFloat(p.paddingLeft)<=64&&innerWidth-r.right+parseFloat(p.paddingRight)<=64})()'));
      await capture('team-list-'+width);await click('Convidar funcionário');await waitFor('document.querySelector("[role=dialog]")');
      assert.ok(await evaluate('document.querySelector("[role=dialog]").textContent.includes("Floresta · PE")'));
      assert.ok(await evaluate('[...document.querySelectorAll("[role=dialog] select option")].every(option=>option.value!=="65")'),'Cidade não pode ser digitada ou trocada no formulário');
      assert.equal(await evaluate('document.getElementById("team-role").value'),'leitura');
      await setId('invite-channel','ch64');await setId('team-email','novas.arvores@floresta.gov.br');await check('Gerenciar arborização');
      await capture('team-invite-'+width);await click('Gerar convite');await waitFor('document.body.innerText.includes("Convite pronto")');
      assert.deepEqual(await evaluate('window.rpcCalls.find(call=>call.name==="convidar_funcionario_municipal").args'),{p_prefeitura:'pref64',p_modules:['arborization'],p_canal:'ch64',p_email:'novas.arvores@floresta.gov.br',p_papel:'leitura'});
      await evaluate(`document.querySelector('[aria-label="Fechar painel"]').click()`);await waitFor('!document.querySelector("[role=dialog]")');
      await evaluate(`document.querySelector('button[aria-label="Abrir Ana Meio Ambiente"]').click()`);await waitFor('document.querySelector("[role=dialog]")');
      assert.ok(await evaluate('[...document.querySelectorAll("[role=dialog] label")].find(el=>el.textContent==="Gerenciar arborização").querySelector("input").checked'));
      await check('Gerenciar ruas');await evaluate('window.failTeamSave=true');await click('Salvar alterações');await waitFor('window.teamErrors.length>0');
      assert.ok(await evaluate('Boolean(document.querySelector("[role=dialog]"))'),'Falha preserva escolhas e formulário');
      await evaluate('window.failTeamSave=false');await click('Salvar alterações');await waitFor('!document.querySelector("[role=dialog]")');
      assert.deepEqual(await evaluate('window.rpcCalls.filter(call=>call.name==="set_municipal_staff_access").at(-1).args'),{p_member_id:'m64',p_role:'leitura',p_active:true,p_modules:['arborization','urban_planning']});
      await click('Convidar funcionário');await setId('team-email','rascunho@floresta.gov.br');
      await evaluate('window.changeTeamCity(65)');await waitFor('!document.querySelector("[role=dialog]")&&document.body.innerText.includes("Pessoa de Recife")');
      assert.ok(await evaluate('!document.body.innerText.includes("Ana Meio Ambiente")'));
      await click('Convidar funcionário');await waitFor('document.querySelector("[role=dialog]")?.textContent.includes("Recife · PE")');
      assert.equal(await evaluate('document.getElementById("team-email").value'),'');assert.equal(await evaluate('document.getElementById("invite-channel").value'),'');
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
      results.push({width,cityDefault:true,publicOfficialNotice:true,inviteModules:true,editModules:true,failedSavePreserved:true,citySwitch:true,noOverflow:true});
    }
    await navigate('?team');await waitFor('document.querySelector("table")');await evaluate('window.failTeamAccess=true;window.changeTeamCity(65)');await waitFor('document.querySelector("[role=alert]")');
    assert.ok(await evaluate('!document.querySelector("table")'),'Erro de permissões impede editar com concessões incompletas');
    await evaluate('window.failTeamAccess=false');await click('Tentar novamente');await waitFor('document.querySelector("table")');
  }else if(process.argv.includes('--dashboard')){
    // Native setters preserve React's controlled-input behavior.
    const searchField = async(label,value)=>evaluate(`(()=>{const el=[...document.querySelectorAll('input')].find(el=>el.getAttribute('aria-label')===${JSON.stringify(label)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}))})()`);
    for(const [width,height] of [[390,844],[768,1024],[1024,768],[1280,800],[1366,768],[1440,900],[1920,1080]]){
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);
      await navigate('?territorial&dashboard&scope=both&area=ruas/estatisticas');await waitFor('document.querySelector(".pavement-dashboard-table tbody tr")');
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Página sem overflow horizontal');
      assert.equal(await evaluate('document.querySelector(".pavement-dashboard-table tbody").children.length'),10,'Paginação de bairros');
      assert.equal(await evaluate('new Set([...document.querySelectorAll(".pavement-dashboard-card")].map(el=>el.offsetTop)).size'),width>=1024?1:2,'Cartões se adaptam à tela');
      if(width>=1200)assert.ok(await evaluate('(()=>{const el=document.querySelector(".territorial-dashboard-main"),r=el.getBoundingClientRect(),s=getComputedStyle(el);return parseFloat(s.paddingLeft)<=64&&innerWidth-r.right+parseFloat(s.paddingRight)<=64})()'));
      assert.ok(await evaluate('!document.querySelector("[role=dialog]")&&!document.querySelector("#panel-ruas .leaflet-container")'));
      await capture('pavement-dashboard-'+width);
      await evaluate(`document.querySelector('[aria-label="Próxima página de bairros"]').click()`);await waitFor('document.querySelector(".pavement-dashboard-table tbody").children.length===5');
      await searchField('Buscar bairro nas estatísticas','Centro');await waitFor('document.querySelector(".pavement-dashboard-table tbody").children.length===1&&document.querySelector(".pavement-dashboard-table tbody").textContent.includes("Centro")');
      await click('Baixar CSV');await waitFor('window.generatedFiles.length>0');
      assert.ok(await evaluate('window.generatedFiles.at(-1).text().then(text=>text.includes("Centro")&&!text.includes("Três Marias")&&text.includes("Total de ruas;1"))'),'CSV contém bairros buscados e total correspondente');
      await waitFor('[...document.querySelectorAll("button")].some(el=>el.textContent.trim()==="Baixar PDF"&&!el.disabled)');await click('Baixar PDF');await waitFor('window.generatedFiles.some(blob=>blob.type==="application/pdf")');
      await searchField('Buscar bairro nas estatísticas','');await waitFor('document.querySelector(".pavement-dashboard-table tbody").children.length===10');
      await evaluate(`document.querySelector('.pavement-dashboard-table thead button').click()`);await waitFor('document.querySelector(".pavement-dashboard-table tbody tr").textContent.includes("Três Marias")');
      await click('Mais filtros');await waitFor('document.querySelector("#pavement-advanced-filters")');
      await evaluate(`document.querySelector('[aria-label="Filtrar ruas sem nome oficial"]').click()`);await waitFor('document.querySelector(".pavement-dashboard-filters").textContent.includes("Nome oficial")');
      await click('Limpar filtros');await waitFor('document.querySelector(".pavement-dashboard-filters").textContent.includes("Todas as ruas")');
      await click('Exportar relatório');await waitFor('document.querySelector("[role=dialog] #tipo-relatorio-estatisticas-label")');
      assert.ok(await evaluate('(()=>{const r=document.querySelector("[role=dialog]").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()'),'Exportação cabe na tela');
      await evaluate(`document.querySelector('[role=dialog] button.absolute').click()`);await waitFor('!document.querySelector("[role=dialog]")');
      results.push({width,height,responsiveCards:true,pagination:true,neighborhoodSearch:true,filteredExports:true,qualityFilters:true,noOverflow:true});
    }
    await navigate('?territorial&dashboard&dark&scope=both&area=ruas/estatisticas');await waitFor('document.querySelector(".pavement-dashboard-table")');await capture('pavement-dashboard-dark-1920');
  }else if(process.argv.includes('--territorial')){
    for(const [width,height] of [[390,844],[1440,900],[1920,1080]]){
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);
      await navigate('?territorial&scope=trees&area=arborizacao');await waitFor('document.querySelector("[data-testid=territorial-panel]")');
      await waitFor('document.querySelectorAll(".tree-map-pin").length===2');
      assert.ok(await evaluate(`!document.querySelector('[aria-label="Módulos de gestão"]')`),'Somente árvores não mostra abas');
      assert.equal(await evaluate('document.querySelector("h1").textContent'),'Arborização');
      assert.ok(await evaluate('document.body.innerText.includes("Produção Rural e Meio Ambiente")'));
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Sem overflow horizontal');
      const treeMapTop = await evaluate('document.querySelector("#panel-arborizacao .leaflet-container").getBoundingClientRect().top');
      assert.ok(treeMapTop <= (width >= 1200 ? 240 : 500), `Mapa de árvores perto do topo: ${width}px / ${treeMapTop}px`);
      await capture('territorial-trees-'+width);
      await navigate('?territorial&scope=both&area=arborizacao');await waitFor(`document.querySelector('[aria-label="Módulos de gestão"]')`);
      assert.equal(await evaluate(`document.querySelectorAll('[aria-label="Módulos de gestão"] a').length`),2);
      await evaluate(`document.querySelector('[aria-label="Módulos de gestão"] a').click()`);await waitFor('document.querySelector("#panel-ruas")&&!document.querySelector("#panel-ruas").hidden');
      await waitFor('document.querySelector("#panel-ruas .leaflet-interactive")');
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Ruas sem overflow horizontal');
      const streetMapTop = await evaluate('document.querySelector("#panel-ruas .leaflet-container").getBoundingClientRect().top');
      if(width >= 1200) assert.ok(streetMapTop <= 240, `Mapa de ruas perto do topo: ${width}px / ${streetMapTop}px`);
      assert.ok(await evaluate('!document.querySelector("#panel-ruas").textContent.includes("Resumo do relatório")&&!document.querySelector("#panel-ruas").textContent.includes("Ruas no cadastro")'),'Mapa sem cartões e relatórios estatísticos');
      await capture('territorial-streets-'+width);
      const streetReads = await evaluate('window.tableReads.filter(table=>table==="pavement_streets").length');
      const subnav = width<1024 ? '[aria-label="Visualização de ruas"]' : 'aside [aria-label="Ruas e pavimentações"]';
      await evaluate(`document.querySelector(${JSON.stringify(subnav+' a[href*="/estatisticas"]')}).click()`);await waitFor('document.querySelector("[data-testid=pavement-statistics] table tbody tr")');
      assert.ok(await evaluate('!document.querySelector("#panel-ruas .leaflet-container")'),'Estatísticas não monta mapa');
      assert.ok(await evaluate('document.querySelector("[data-testid=pavement-statistics]").textContent.includes("Qualidade do cadastro")&&document.querySelector("[data-testid=pavement-statistics]").textContent.includes("Pavimentação por bairro")'));
      assert.equal(await evaluate('window.tableReads.filter(table=>table==="pavement_streets").length'),streetReads,'Trocar submenu reutiliza a consulta de ruas');
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Estatísticas sem overflow horizontal');
      await capture('territorial-statistics-'+width);
      await click('Exportar relatório');await waitFor('document.querySelector("[role=dialog] #tipo-relatorio-estatisticas-label")');
      await click('Baixar CSV');await waitFor('window.generatedFiles.length>0');
      assert.ok(await evaluate('window.generatedFiles.at(-1).text().then(text=>text.includes("Rua das Flores")&&text.includes("Rua Parcial"))'),'Exportação contém as ruas do recorte');
      await waitFor('[...document.querySelectorAll("button")].some(button=>button.textContent.trim()==="Baixar PDF"&&!button.disabled)');
      await click('Baixar PDF');await waitFor('window.generatedFiles.some(blob=>blob.type==="application/pdf")');
      await evaluate(`document.querySelector('[role=dialog] button.absolute').click()`);await waitFor('!document.querySelector("[role=dialog]")');
      await evaluate(`(()=>{const el=[...document.querySelectorAll('[aria-label="Filtros das estatísticas"] label')].find(el=>el.textContent.startsWith('CEP')).querySelector('select');el.value='sem';el.dispatchEvent(new Event('change',{bubbles:true}))})()`);
      await click('Exportar relatório');await waitFor('document.querySelector("[role=dialog]")');
      await waitFor('document.querySelector("#tipo-relatorio-estatisticas-label").closest("section").textContent.includes("1 rua selecionada")');
      await waitFor('[...document.querySelectorAll("button")].some(button=>button.textContent.trim()==="Baixar CSV"&&!button.disabled)');
      await click('Baixar CSV');await waitFor('window.generatedFiles.length>=3');
      assert.ok(await evaluate('window.generatedFiles.at(-1).text().then(text=>!text.includes("Rua das Flores")&&!text.includes("Rua Parcial"))'),'CSV respeita o filtro de CEP');
      await evaluate(`document.querySelector('[role=dialog] button.absolute').click()`);await waitFor('!document.querySelector("[role=dialog]")');
      await evaluate(`document.querySelector(${JSON.stringify(subnav+' a[href*="/mapa"]')}).click()`);await waitFor('document.querySelector("#panel-ruas .leaflet-container")');
      await evaluate(`document.querySelector(${JSON.stringify(subnav+' a[href*="/estatisticas"]')}).click()`);await waitFor('document.querySelector("[data-testid=pavement-statistics]")');
      assert.equal(await evaluate(`(()=>{const el=[...document.querySelectorAll('[aria-label="Filtros das estatísticas"] label')].find(el=>el.textContent.startsWith('CEP')).querySelector('select');return el.value})()`),'sem','Filtros preservados entre os submenus');
      await click('Limpar filtros');await waitFor('document.querySelector(".pavement-dashboard-filters").textContent.includes("Todas as ruas")');

      if(width<1024)await evaluate(`document.querySelector('button[aria-label="Abrir menu"]').click()`);
      await evaluate(`document.querySelector('nav[aria-label="Áreas de trabalho"] a[href*="/arborizacao"]').click()`);await waitFor('!document.querySelector("#panel-arborizacao").hidden');
      await evaluate(`(()=>{const el=document.querySelector('[aria-label="Cidade do painel"]');el.value="65";el.dispatchEvent(new Event("change",{bubbles:true}))})()`);
      await waitFor(`!document.querySelector('[aria-label="Módulos de gestão"]')&&document.querySelector("h1").textContent==="Arborização"`);
      assert.ok(await evaluate('!document.querySelector("#panel-ruas")'),'Cidade sem ruas não monta o conteúdo de ruas');
      assert.ok(await evaluate(`!document.querySelector('header a[aria-label="Visão geral"]')`),'Funcionário comum não recebe atalho administrativo');
      for(const [scope,target,testId] of [['admin','/admin','platform-overview'],['master','/admin','platform-overview'],['municipal-admin','/prefeitura/visao-geral','municipal-overview']]){
        await navigate('?territorial&scope='+scope+'&area=arborizacao');await waitFor('document.querySelector("[data-testid=territorial-panel]")');
        const selector='header a[aria-label="Visão geral"]';
        assert.equal(await evaluate(`document.querySelector(${JSON.stringify(selector)}).getAttribute('href')`),target);
        assert.ok(await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&document.documentElement.scrollWidth<=innerWidth})()`),'Atalho cabe no cabeçalho');
        if(scope==='admin')await capture('territorial-header-admin-'+width);
        await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);await waitFor(`document.querySelector('[data-testid="${testId}"]')`);
      }
      results.push({width,treeMapTop,streetMapTop,singleModule:true,twoTabs:true,cityScope:true,noOverflow:true,overviewHeader:true,mapAndStatistics:true,filteredCsvAndPdf:true,sharedFilters:true});
    }
    await navigate('?territorial&scope=streets&area=ruas/estatisticas');await waitFor('document.querySelector("[data-testid=pavement-statistics]")');
    assert.ok(await evaluate('!document.querySelector("#panel-ruas .leaflet-container")'),'URL direta abre somente estatísticas');
    await navigate('?territorial&scope=trees&area=ruas/estatisticas');await waitFor('document.querySelector("#panel-arborizacao")');
    assert.ok(await evaluate('!document.querySelector("#panel-ruas")'),'Conta só de árvores não abre estatísticas de ruas por URL');
    await navigate('?territorial&scope=none');await waitFor('document.body.innerText.includes("Não há cidade com acesso")');
    await navigate('?territorial&scope=both&permission-error');await waitFor('document.querySelector("[role=alert]")');
    await navigate('?territorial&scope=both&area=arborizacao');await waitFor('document.querySelector("[data-testid=territorial-panel]")');
    await evaluate('window.dispatchEvent(new Event("test-revoke"))');await waitFor('!document.querySelector("[data-testid=territorial-panel]")');
  }else{
  for(const [width,height] of [[390,844],[800,900],[1280,800],[1366,768],[1440,900],[1920,1080]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);
    await navigate();await waitFor('document.querySelectorAll(".tree-map-pin").length===2');
    await waitFor('document.body.innerText.includes("Solicitações de poda")');
    assert.ok(await evaluate('!document.body.innerText.includes("Árvores em risco")'));
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
    const margins=await evaluate('(()=>{const r=document.querySelector("main").getBoundingClientRect();const p=getComputedStyle(document.querySelector("main"));return [r.left+parseFloat(p.paddingLeft),document.documentElement.clientWidth-r.right+parseFloat(p.paddingRight)]})()');
    if(width>=1200)assert.ok(margins.every(v=>v<=64),JSON.stringify({width,margins}));
    await validateLayout(width);
    await click('Tela cheia');await waitFor('document.querySelector("[role=dialog] .leaflet-container")');
    assert.ok(await evaluate(hasSatellite));assert.ok(await evaluate(zoomInsideMap));
    await click('Sair da tela cheia');await waitFor('!document.querySelector("[role=dialog]")');
    await clickMapControl('Usar mapa padrão');await waitFor(`!(${hasSatellite})`);
    await validateRegistration(width);
    await navigate('?detail');await waitFor('document.querySelector("[data-testid=tree-page]")');
    assert.equal(await evaluate('document.querySelector("h1").textContent'),'AR1 · Ipê-amarelo');
    await click('Editar árvore');await waitFor('document.querySelector("[role=dialog]").textContent.includes("Código da árvore")');
    assert.ok(await evaluate('document.querySelector("[role=dialog]").textContent.includes("AR1")'),'Edição mostra o código permanente');
    await click('Cancelar');await waitFor('!document.querySelector("[role=dialog]")');
    await waitFor('document.body.innerText.includes("Solicitação de Poda")');
    await waitFor('document.querySelectorAll(".tree-map-pin").length===1');
    assert.ok(await evaluate('(()=>{const page=document.querySelector("[data-testid=tree-page]").getBoundingClientRect();const card=document.querySelector(".tree-profile-location").getBoundingClientRect();const history=document.querySelector(".tree-profile-history").getBoundingClientRect();const map=document.querySelector("[data-testid=tree-profile-map]").getBoundingClientRect();return map.top>=card.top&&map.bottom<=card.bottom&&history.bottom<=page.bottom&&history.top>card.bottom&&!document.querySelector(".tree-profile-care-form")})()'),'Mapa acima da linha do tempo, contido no fluxo, com serviço disponível apenas no modal');
    if(width>=980){
      assert.ok(await evaluate(detailBottomsAligned),'Resumo e linha do tempo terminam na mesma altura');
      assert.ok(await evaluate('(()=>{const summary=document.querySelector(".tree-profile-overview").getBoundingClientRect();const location=document.querySelector(".tree-profile-location").getBoundingClientRect();const history=document.querySelector(".tree-profile-history").getBoundingClientRect();const buttons=[...document.querySelectorAll(".tree-profile-header-actions > button")].map(el=>el.getBoundingClientRect());return summary.width>location.width&&Math.abs(summary.top-location.top)<2&&location.left>summary.right&&location.left===history.left&&buttons.length===2&&Math.abs(buttons[0].top-buttons[1].top)<2})()'),'Resumo à esquerda, mapa e histórico à direita e botões de serviço e edição lado a lado');
      assert.ok(await evaluate('document.querySelector("[data-site-footer]").getBoundingClientRect().top>=document.querySelector("[data-testid=tree-page]").getBoundingClientRect().bottom'),'Footer abaixo do conteúdo completo');
      await evaluate('document.querySelector("[data-site-footer]").scrollIntoView({block:"start"})');
      await waitFor('(()=>{const footer=document.querySelector("[data-site-footer]");const rect=footer.getBoundingClientRect();const y=Math.min(innerHeight-20,Math.max(1,rect.top)+20);return rect.top<innerHeight&&rect.bottom>0&&footer.contains(document.elementFromPoint(100,y))})()');
      await capture('detail-footer-'+width);await evaluate('window.scrollTo(0,0)');
    }
    await click('Ver no mapa maior');await waitFor('document.querySelector("[role=dialog] .leaflet-container")');
    assert.ok(await evaluate(zoomInsideMap));
    await click('Sair da tela cheia');await waitFor('!document.querySelector("[role=dialog]")');
    assert.ok(await evaluate('document.body.innerText.includes("15/10/2026")&&document.body.innerText.includes("106 anos")'));
    await click('Registrar serviço');await waitFor('document.querySelector(".tree-profile-care-dialog")');
    assert.ok(await evaluate('(()=>{const rect=document.querySelector(".tree-profile-care-dialog").getBoundingClientRect();return rect.left>=0&&rect.right<=innerWidth&&rect.top>=0&&rect.bottom<=innerHeight&&document.querySelector(".tree-profile-care-dialog select").value===""})()'),'Modal de serviço cabe na tela e exige a escolha do serviço');
    await capture('care-modal-'+width);
    await choose('Serviço','poda');await input('Data de realização','2026-10-10');
    await click('Registrar no histórico');await waitFor('document.body.innerText.includes("Poda: serviço realizado")');
    await waitFor('!document.querySelector("[role=dialog]")');
    if(width>=980)assert.ok(await evaluate(detailBottomsAligned),'Bases continuam alinhadas após adicionar um serviço ao histórico');
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
    await capture('detail-'+width);
    await navigate('?report');await waitFor('document.querySelectorAll(".tree-picker-marker").length===2');
    assert.ok(await evaluate('!document.body.innerText.includes("Árvore e serviço solicitado")&&!document.body.innerText.includes("Cadastrar árvore e vincular à bronca")&&!document.body.innerText.includes("Tipo de serviço")'));
    const treeClick = await evaluate(`(()=>{const r=document.querySelector('.tree-picker-marker[title="AR1 · Ipê-amarelo"]').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...treeClick},sessionId);
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...treeClick},sessionId);
    await waitFor('window.reportValue.tree_id==="t1"');assert.equal(await evaluate('window.reportValue.tree_label'),'AR1 · Ipê-amarelo');await waitFor('document.body.innerText.includes("Já existem solicitações abertas")');
    await click('Desvincular');await evaluate('void window.testMap.setView([-8.5985,-38.572],15,{animate:false})');await waitFor('document.querySelectorAll(".tree-picker-marker").length===2');
    await evaluate(`document.querySelector('.tree-picker-marker[title="AR2 · Nim"]').click()`);await waitFor('window.reportValue.tree_id==="t2"');
    assert.ok(await evaluate('window.reportValue.location.lat===-8.6&&window.reportValue.location.lng===-38.57&&window.reportValue.city_id===64&&window.reportValue.address==="Rua das Flores"'));
    assert.equal(await evaluate(`document.querySelector('.tree-picker-marker[title="AR2 · Nim"] path[fill]').getAttribute("fill")`),'#eab308','Árvore selecionada fica amarela');
    assert.equal(await evaluate('window.writes.length'),0,'Selecionar no mapa não envia a bronca');
    await click('Enviar bronca de teste');await waitFor(`document.querySelector('a[href="/"]')`);
    await waitFor(`!window.reportValue.tree_id&&document.querySelector('.tree-picker-marker[title="AR2 · Nim"] path[fill]')?.getAttribute("fill")==="#eab308"`);
    assert.ok(await evaluate('window.writes.some(row=>row.table==="reports"&&row.payload.tree_id==="t2"&&row.payload.location==="POINT(-38.57 -8.6)")'),'Bronca usa o cadastro e as coordenadas da árvore');
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
    await capture('report-'+width);
    await evaluate(`document.querySelector('a[href="/"]').click()`);await waitFor('document.querySelector("[data-testid=arborization-page]")');
    await waitFor(`document.querySelector('.tree-map-pin[title="AR2 · Nim"] path[fill]')?.getAttribute("fill")==="#eab308"`);
    results.push({width,margins,linkedSpecies:true,registeredNeighborhood:true,history:true,reportLink:true});
  }
  await navigate('?dark');await waitFor('document.querySelectorAll(".tree-map-pin").length===2');await capture('map-dark-1920');
  await navigate('?detail&public');await waitFor('document.querySelector("[data-testid=tree-page]")');
  assert.ok(await evaluate('!document.body.innerText.includes("Registrar serviço")&&!document.body.innerText.includes("Editar árvore")'));
  await navigate('?detail&photo');await waitFor('document.querySelector(".tree-profile-photo img")');
  await click('Ver imagem completa');await waitFor('document.querySelector(".tree-profile-photo-dialog img")');
  assert.ok(await evaluate('document.querySelector(".tree-profile-photo-dialog img").getAttribute("alt").includes("Foto completa")'));
  await evaluate('document.querySelector(".tree-profile-photo-dialog button.absolute").click()');await waitFor('!document.querySelector("[role=dialog]")');
  await navigate('?detail&dark');await waitFor('document.body.innerText.includes("Solicitação de Poda")');await capture('detail-dark-1920');
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({results,publicReadOnly:true,runtimeErrors:errors.length},null,2));
} finally {ws?.close();chrome.kill();server.close();}
