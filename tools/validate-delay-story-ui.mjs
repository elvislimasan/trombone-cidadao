// Componentes e exportação reais, dados ilustrativos e nenhum acesso ao Supabase.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import loadConfig from 'tailwindcss/loadConfig.js';

const root = process.cwd(), out = path.join(root, process.env.DELAY_STORY_ARTIFACTS || '.tmp/delay-story-centered-ui');
await fs.mkdir(out, { recursive: true });
await build({ stdin: { contents: `
  import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
  import {ObraDelayMeter} from '@/components/project/obra/ObraDelayMeter';
  import ElectricianPoleFields from '@/components/municipality/ElectricianPoleFields';
  import {electricianPoleForm} from '@/lib/electricianPole';
  const day=offset=>new Date(Date.now()+offset*86400000).toISOString().slice(0,10);
  window.downloads=[];window.notices=[];
  HTMLAnchorElement.prototype.click=function(){window.downloads.push({name:this.download,data:this.href})};
  function App(){const [mode,setMode]=useState('overdue');const [form,setForm]=useState(()=>electricianPoleForm({id:1,identifier:'X12345',lamp_type:'Vapor de sódio'}));
    return <main className="page-shell-fluid p-4 sm:p-8"><div className="flex flex-wrap gap-3">{['overdue','future','today','completed','invalid','long','no-photo','failed-photo','year'].map(mode=><button key={mode} onClick={()=>setMode(mode)}>{mode}</button>)}</div>
      <div className="grid gap-5 md:grid-cols-2"><ObraDelayMeter expectedEndDate={mode==='invalid'?'invalid':day(mode==='future'?5:mode==='today'?0:mode==='year'?-800:-123)} status={mode==='completed'?'completed':'in-progress'} executionDays={180}
        phaseName="Construção" work={{id:'exemplo',thumbnail_url:mode==='no-photo'?'':mode==='failed-photo'?'/missing-photo.jpg':'/work-example.svg',title:mode==='long'?'Obra de exemplo com um título extenso para verificar a apresentação dos dados em diferentes modelos sem sobrepor as datas ou ocultar o QR Code no rodapé da arte':'Obra de exemplo · dados ilustrativos',city:'Cidade de exemplo',state:'PE'}} shareUrl="https://trombonecidadao.com.br/obras-publicas/exemplo"/>
      <ElectricianPoleFields value={form} onChange={setForm}/></div></main>}
  createRoot(document.getElementById('root')).render(<App/>);
`, loader: 'jsx', resolveDir: root }, bundle: true, jsx: 'automatic', outfile: path.join(out, 'preview.js'), alias: { '@': path.join(root, 'src') },
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
  plugins: [{ name: 'local-fixtures', setup(builder) {
    const stubs = { '@/lib/shareTracking': 'export const registrarCompartilhamento=()=>{};', '@/lib/appError': 'export const showAppError=x=>window.notices.push(x);', '@/lib/cardInstagramAssets': 'export const getCardInstagramPublicUrl=()=>{throw Error("Não usar fundos de outros módulos")};', '@/design-system/theme/ThemeProvider': 'export const useTheme=()=>({resolved:window.fixtureTheme||"dark"});', '@/lib/instagramStory': 'export const canShareToStory=()=>window.storyShareMode==="instagram";export const shareImageToInstagramStory=async args=>{(window.instagramShares??=[]).push(args);return {shared:true,linkAttached:true}};' };
    builder.onResolve({ filter: /.*/ }, args => Object.hasOwn(stubs, args.path) ? { path: args.path, namespace: 'fixture' } : undefined);
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'js' }));
  } }],
});
let sourceCss = await fs.readFile('src/index.css', 'utf8');
for (const token of ['primitives', 'semantic', 'typography', 'motion']) sourceCss = sourceCss.replace(`@import './design-system/tokens/${token}.css';`, await fs.readFile(`src/design-system/tokens/${token}.css`, 'utf8'));
const config = loadConfig(path.join(root, 'tailwind.config.js'));
const css = await postcss([tailwind({ ...config, content: ['src/components/project/obra/ObraDelay*.jsx', 'src/components/municipality/ElectricianPoleFields.jsx', 'src/components/ui/{button,dialog,input}.jsx', { raw: 'page-shell-fluid p-4 sm:p-8 flex flex-wrap gap-3 grid gap-5 md:grid-cols-2' }] })]).process(sourceCss, { from: path.join(root, 'src/index.css') });
await fs.writeFile(path.join(out, 'preview.css'), css.css);
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/logo.png') { res.setHeader('Content-Type', 'image/png'); res.end(await fs.readFile(path.join(root, 'public/logo.png'))); return; }
  if (pathname === '/missing-photo.jpg') { res.writeHead(404); res.end(); return; }
  if (/^\/fonts\/(Anton-Regular\.ttf|BricolageGrotesque\.woff2|Inter\.woff2)$/.test(pathname)) { res.setHeader('Content-Type', pathname.endsWith('.ttf') ? 'font/ttf' : 'font/woff2'); res.end(await fs.readFile(path.join(root, 'public', pathname.slice(1)))); return; }
  if (pathname === '/work-example.svg') { res.setHeader('Content-Type', 'image/svg+xml'); res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><rect width="1080" height="1920" fill="#787e85"/><g fill="#53504c" stroke="#b7b3a9" stroke-width="12"><path d="M140 1800V550h80v1250zM750 1800V320h95v1480zM0 850l1080-310v65L0 920zM0 1240l1080-245v70L0 1310zM0 1600l1080-180v70L0 1670z"/></g><g stroke="#c28b56" stroke-width="6"><path d="M580 1660V920M920 1660V820M570 1020l360-90M570 1170l360-80M570 1330l360-60M570 1480l360-40"/></g></svg>'); return; }
  if (pathname === '/preview.js' || pathname === '/preview.css') { res.setHeader('Content-Type', pathname.endsWith('.js') ? 'text/javascript' : 'text/css'); res.end(await fs.readFile(path.join(out, pathname.slice(1)))); }
  else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/preview.css"></head><body><div id="root"></div><script src="/preview.js"></script></body></html>'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = path.join(out, `chrome-${Date.now()}`);
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--disable-extensions', '--no-first-run', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true });
let ws;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  let endpoint;
  for (let attempt = 0; attempt < 150 && !endpoint; attempt++) {
    try { const [port, route] = (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).trim().split(/\r?\n/); endpoint = `ws://127.0.0.1:${port}${route}`; } catch { await pause(100); }
  }
  assert.ok(endpoint, 'Chrome não iniciou');
  ws = new WebSocket(endpoint); await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let id = 0; const pending = new Map(), errors = [];
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (message.id) { const task = pending.get(message.id); pending.delete(message.id); message.error ? task.reject(Error(message.error.message)) : task.resolve(message.result); }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const next = ++id; pending.set(next, { resolve, reject }); ws.send(JSON.stringify({ id: next, method, params, sessionId })); });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Runtime.enable', {}, sessionId); await send('Page.enable', {}, sessionId);
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails)); return result.result.value;
  };
  const wait = async expression => { for (let attempt = 0; attempt < 120; attempt++) { if (await evaluate(`Boolean(${expression})`)) return; await pause(75); } throw Error(`Timeout: ${expression}\n${await evaluate('document.body.innerText')}`); };
  const click = text => evaluate(`(()=>{const el=[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===${JSON.stringify(text)});if(!el||el.disabled)throw Error('Botão indisponível: '+${JSON.stringify(text)});el.click()})()`);
  const close = async () => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sessionId); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sessionId); await wait('!document.querySelector("[role=dialog]")'); };
  const results = [];
  for (const [width, height] of [[1440, 900], [1920, 1080], [390, 844], [320, 740]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
    await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}` }, sessionId);
    await wait('document.querySelector("select")');
    assert.equal(await evaluate('document.querySelector("select").value'), 'LED');
    // Uma escolha explícita continua preservada durante outras edições do formulário.
    await evaluate(`(()=>{const el=document.querySelector('select');el.value='Vapor de sódio';el.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    await click('future');
    assert.equal(await evaluate('document.querySelector("select").value'), 'Vapor de sódio');
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'), `Overflow da página em ${width}`);
    if (width >= 1200) assert.ok(await evaluate(`(()=>{const r=document.querySelector('main').getBoundingClientRect(),s=getComputedStyle(document.querySelector('main'));return r.left+parseFloat(s.paddingLeft)<=64&&innerWidth-r.right+parseFloat(s.paddingRight)<=64})()`));
    const initialTheme = width === 1920 ? 'light' : 'dark';
    await evaluate(`window.fixtureTheme=${JSON.stringify(initialTheme)};document.documentElement.classList.toggle('dark',window.fixtureTheme==='dark')`);
    await click('overdue'); await click('Compartilhar story'); await wait('document.querySelector("[data-story-logo]") && [...document.querySelectorAll("button")].some(button=>button.textContent.trim()==="Baixar arte"&&!button.disabled)');
    assert.equal(await evaluate('document.querySelector("input[name=delay-story-appearance]:checked").value'), initialTheme, 'A arte deve iniciar no tema da plataforma');
    assert.equal(await evaluate('document.querySelectorAll("input[name=delay-story-model]").length'), 3);
    for (const appearance of ['dark', 'light']) {
    await evaluate(`document.querySelector('input[name=delay-story-appearance][value=${appearance}]').click()`);
    for (const model of ['impacto', 'editorial', 'alerta']) {
      await evaluate(`document.querySelector('input[value=${model}]').click()`);
      await wait(`document.querySelector('[aria-label^="Prévia"] [data-story-model="${model}"]')`);
      assert.ok(await evaluate(`(()=>{const r=document.querySelector('[role=dialog]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()`), `Diálogo fora da viewport em ${width}`);
      await wait(`(()=>{const p=document.querySelector('[aria-label^="Prévia"]'),c=p.querySelector('[data-story-model]');return Math.abs(c.getBoundingClientRect().width-p.firstElementChild.getBoundingClientRect().width)<1})()`);
      assert.ok(await evaluate(`(()=>{const card=[...document.querySelectorAll('[data-story-model]')].at(-1),r=card.getBoundingClientRect(),title=card.querySelector('[data-story-title]'),group=card.querySelector('[data-story-timer-group]').getBoundingClientRect();return parseFloat(getComputedStyle(title).fontSize)>=54&&title.getBoundingClientRect().bottom<group.top&&Math.abs((group.left+group.right-r.left-r.right)/2)<1})()`), 'Título maior no topo e conjunto de relógio e número centralizado');
      assert.ok(await evaluate(`(()=>{const card=[...document.querySelectorAll('[data-story-model]')].at(-1);return card.querySelector('[data-story-photo]').src.startsWith('data:')&&card.querySelector('[data-story-logo]').src.startsWith('data:')})()`), 'Foto da obra e logo devem ser embutidos antes do download');
      if (width === 1440) {
        await click('Baixar arte'); await wait('document.body.innerText.includes("Arte salva")');
        const png = await evaluate('window.downloads.at(-1)');
        const buffer = Buffer.from(png.data.split(',')[1], 'base64');
        assert.equal(buffer.readUInt32BE(16), 1080); assert.equal(buffer.readUInt32BE(20), 1920);
        const color = await evaluate(`(async()=>{const img=new Image();img.src=window.downloads.at(-1).data;await img.decode();const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);return [...ctx.getImageData(0,0,1,1).data]})()`);
        assert.ok(appearance === 'dark' ? color[0] < 90 : color[0] > 170, 'Tema do PNG difere da prévia');
        assert.equal(png.name, `atrasometro-exemplo-${model}-${appearance}.png`);
        await fs.writeFile(path.join(out, png.name), buffer);
      }
    }
    }
    await evaluate(`document.querySelector('input[value=impacto]').click()`);
    for (const [unit, number, label] of [['months', '4', 'MESES DE ATRASO']]) {
      await evaluate(`document.querySelector('[role=dialog] input[data-delay-unit=${unit}]').click()`);
      await wait(`document.querySelector('[data-story-model]').textContent.includes(${JSON.stringify(label)})`);
      assert.equal(await evaluate(`document.querySelector('[data-story-metric]').textContent`), number);
      assert.ok(await evaluate(`document.querySelector('section input[data-delay-unit=${unit}]').checked`), 'A seleção da arte e do painel deve ser a mesma');
      if (unit === 'months') {
        assert.ok(await evaluate(`(()=>{const card=[...document.querySelectorAll('[data-story-model]')].at(-1),ring=card.querySelector('[data-story-timer-group] circle').getBoundingClientRect(),metric=card.querySelector('[data-story-metric]').getBoundingClientRect();return Math.abs((ring.left+ring.right-metric.left-metric.right)/2)<1&&Math.abs((ring.top+ring.bottom-metric.top-metric.bottom)/2)<1&&metric.top>=ring.top&&metric.bottom<=ring.bottom})()`), 'Um dígito deve ficar centralizado dentro do relógio');
      }
      if (width === 1440) {
        await click('Baixar arte'); await wait('document.body.innerText.includes("Arte salva")');
        const png = await evaluate('window.downloads.at(-1)');
        assert.ok(png.name.includes(unit === 'months' ? '-meses' : '-anos'));
        await fs.writeFile(path.join(out, png.name), Buffer.from(png.data.split(',')[1], 'base64'));
      }
    }
    assert.ok(await evaluate('document.querySelector("[role=dialog] input[data-delay-unit=years]").disabled&&document.querySelector("section input[data-delay-unit=years]").disabled'), 'Anos bloqueados antes de completar um ano');
    await evaluate(`document.querySelector('[role=dialog] input[data-delay-unit=years]').click()`);
    assert.ok(await evaluate('document.querySelector("[role=dialog] input[data-delay-unit=months]").checked'), 'Uma unidade bloqueada não pode ser selecionada');
    await evaluate(`document.querySelector('[role=dialog] input[data-delay-unit=days]').click()`);
    await evaluate(`document.querySelector('input[name=delay-story-featured-image]').click()`);
    await wait('!document.querySelector("[data-story-photo]") && document.querySelector("[data-story-fallback]")');
    assert.ok(await evaluate('Boolean(document.querySelector("[data-story-logo]"))'), 'Remover foto deve preservar o logo');
    if (width === 1440) {
      await click('Baixar arte'); await wait('document.body.innerText.includes("Arte salva")');
      const png = await evaluate('window.downloads.at(-1)');
      assert.ok(png.name.endsWith('-sem-foto.png'));
      await fs.writeFile(path.join(out, png.name), Buffer.from(png.data.split(',')[1], 'base64'));
    }
    await evaluate(`document.querySelector('input[name=delay-story-featured-image]').click()`);
    await wait('document.querySelector("[data-story-photo]")');
    await close();
    await click('year');
    await evaluate(`document.querySelector('section input[data-delay-unit=years]').click()`);
    await click('Compartilhar story');
    await wait('document.querySelector("[data-story-metric]")?.textContent==="2"');
    assert.ok(await evaluate('document.querySelector("[role=dialog] input[data-delay-unit=years]").checked&&!document.querySelector("[role=dialog] input[data-delay-unit=years]").disabled'), 'Anos liberados após completar um ano');
    assert.ok(await evaluate('document.querySelector("[data-story-model]").textContent.includes("ANOS DE ATRASO")'));
    await close();
    for (const [mode, label] of [['future', 'DIAS PARA O PRAZO'], ['today', 'PRAZO VENCE HOJE']]) {
      await click(mode); await click('Compartilhar story'); await wait('document.querySelector("[role=dialog] img")');
      assert.ok(await evaluate('document.querySelector("[role=dialog] input[data-delay-unit=months]").disabled&&document.querySelector("[role=dialog] input[data-delay-unit=years]").disabled&&document.querySelector("[role=dialog] input[data-delay-unit=days]").checked'), 'Períodos curtos usam somente dias, inclusive após trocar uma seleção anterior em anos');
      assert.ok(await evaluate(`document.querySelector('[data-story-model]').textContent.includes(${JSON.stringify(label)})`));
      assert.ok(!(await evaluate(`document.querySelector('[data-story-model]').textContent`)).includes('DIAS DE ATRASO'));
      await close();
    }
    await click('long'); await click('Compartilhar story'); await wait('document.querySelector("[role=dialog] img")');
    await pause(350);
    assert.ok(await evaluate(`(()=>{const card=[...document.querySelectorAll('[data-story-model]')].at(-1),qr=card.querySelector('[data-story-qr]'),r=card.getBoundingClientRect(),q=qr.getBoundingClientRect();return q.bottom<=r.top+1880&&q.top>=r.top+1680})()`), 'QR Code fora da arte com título longo');
    const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
    await fs.writeFile(path.join(out, `dialog-${width}.png`), Buffer.from(shot.data, 'base64'));
    await close();
    for (const mode of ['no-photo', 'failed-photo']) {
      await click(mode); await click('Compartilhar story'); await wait('document.querySelector("[data-story-logo]")');
      assert.ok(await evaluate('Boolean(document.querySelector("[data-story-fallback]"))'), 'Obras sem foto devem ter composição própria');
      assert.equal(await evaluate('document.querySelectorAll("[data-story-photo]").length'), 0);
      await close();
    }
    for (const mode of ['completed', 'invalid']) { await click(mode); await pause(100); assert.equal(await evaluate('document.querySelectorAll("section").length'), 0); }
    assert.deepEqual(await evaluate('window.notices'), []);
    results.push({ width, ledDefault: true, modelSelection: true, responsive: true, dueDateStates: true, platformTheme: true, logoAndWorkPhoto: true, noPhotoFallback: true });
  }
  // PNG real; destinos de compartilhamento simulados para não abrir apps ou publicar.
  await click('overdue');
  await evaluate('window.storyShareMode="instagram"');
  await click('Compartilhar story');
  await wait('[...document.querySelectorAll("button")].some(el=>el.textContent.trim()==="Compartilhar"&&!el.disabled)');
  await click('Compartilhar');
  await wait('document.body.innerText.includes("Enviando…")');
  assert.ok(await evaluate('document.querySelector("input[name=delay-story-featured-image]").disabled'), 'Alterações bloqueadas durante compartilhamento');
  await wait('!document.querySelector("[role=dialog]")');
  assert.deepEqual(await evaluate('window.instagramShares.map(({reportId,shareUrl,dataUrl})=>({reportId,shareUrl,png:dataUrl.startsWith("data:image/png;")}))'), [{reportId:'exemplo',shareUrl:'https://trombonecidadao.com.br/obras-publicas/exemplo',png:true}]);
  await evaluate(`window.storyShareMode='web';window.webShares=[];Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:async data=>window.webShares.push({name:data.files[0].name,type:data.files[0].type,size:data.files[0].size,text:data.text,url:data.url})})`);
  await click('Compartilhar story');
  await wait('[...document.querySelectorAll("button")].some(el=>el.textContent.trim()==="Publicar no story"&&!el.disabled)');
  await click('Publicar no story');
  await wait('!document.querySelector("[role=dialog]")');
  assert.ok(await evaluate('window.webShares.length===1&&window.webShares[0].type==="image/png"&&window.webShares[0].size>0'), 'Folha do aparelho recebe a arte PNG');
  assert.deepEqual(await evaluate('window.notices'), []);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ results, png: '3 modelos × 2 temas em 1080×1920', instagramFlow: true, systemShareFlow: true, runtimeErrors: errors.length, artifacts: out }, null, 2));
} finally { ws?.close(); chrome.kill(); server.close(); }
