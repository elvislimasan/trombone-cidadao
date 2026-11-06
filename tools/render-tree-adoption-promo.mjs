// Neural narration + deterministic 30 fps canvas frames + H.264/AAC export.
// Only fixture data is shown; no .env or production APIs are used.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import QRCode from 'qrcode';

const root = process.cwd();
const output = path.join(root, 'artifacts/videos/solicitacao-de-mudas-v3');
const renderOnly = process.argv.includes('--render-only');
await fs.mkdir(path.join(output, 'assets'), { recursive: true });
if (renderOnly) {
  for (const name of ['ui.json', 'pedido-start.png', 'pedido-muda.png', 'pedido-scroll.png', 'pedido-sombra.png', 'mudas-1.png', 'mudas-2.png', 'pedidos-enviado.png', 'pedidos-analise.png']) {
    await fs.copyFile(path.join(root, 'artifacts/videos/solicitacao-de-mudas-v2/assets', name), path.join(output, 'assets', name));
  }
}
execFileSync('python', ['tools/prepare-tree-promo-audio.py'], { cwd: root, stdio: 'inherit', windowsHide: true });
const ffmpeg = (await fs.readFile('.tmp/promo-ffmpeg-path.txt', 'utf8')).trim();
for (const [source, name] of [
  ['public/logo.png', 'logo.png'],
  ['public/images/arborization/tree-960.webp', 'tree.webp'],
  ['public/images/arborization/rega-960.webp', 'rega.webp'],
]) await fs.copyFile(path.join(root, source), path.join(output, 'assets', name));
await QRCode.toFile(path.join(output, 'assets/qr.png'), 'https://trombonecidadao.com.br', { width: 300, margin: 2, color: { dark: '#103c28', light: '#ffffff' } });
await fs.copyFile('tools/tree-adoption-promo.html', path.join(output, 'preview.html'));

// Existing real-component UI fixture provides the app screens and Chrome CDP.
let fixture = await fs.readFile('tools/validate-tree-adoption-ui.mjs', 'utf8');
fixture = fixture.slice(0, fixture.indexOf('  const click = label')).replace('length:24', 'length:0');
fixture = fixture.replace("if(location.search.includes('many-manager'))", `if(location.search.includes('promo-request'))window.requests=[{id:'12345678-0000-0000-0000-000000000001',city_id:64,author_id:'citizen',species_id:'species1',request_type:'muda',zone:'urbana',planting_place:'quintal',purpose:'sombra',provider:'viveiro_municipal',address:'Local de plantio informado',neighborhood:'Centro',latitude:-8.6,longitude:-38.57,status:'solicitada',created_at:'2026-11-06T12:00:00Z',items:[{species_id:'species1',provider:'viveiro_municipal',quantity:2}],species:species[0]}];if(location.search.includes('many-manager'))`);
fixture = fixture.replace("const file = req.url.split('?')[0];", `const file = req.url.split('?')[0];
  const videoRoot = ${JSON.stringify(output)};
  if(file==='/promo.html'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await fs.readFile(path.join(videoRoot,'preview.html')));return;}
  if(/^\\/assets\\/[a-z0-9.-]+$/.test(file)){const ext=path.extname(file);res.setHeader('Content-Type',({'.png':'image/png','.webp':'image/webp','.wav':'audio/wav','.json':'application/json'})[ext]||'application/octet-stream');res.end(await fs.readFile(path.join(videoRoot,file.slice(1))));return;}
  if(/^\\/images\\/arborization\\/[a-z0-9-]+\\.webp$/.test(file)){res.setHeader('Content-Type','image/webp');res.end(await fs.readFile(path.join(root,'public',file.slice(1))));return;}`);
fixture = fixture.replace("'--disable-extensions'", "'--disable-extensions', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--hide-scrollbars'");
fixture += `
  const videoRoot=${JSON.stringify(output)}, ffmpeg=${JSON.stringify(ffmpeg)};
  await send('Network.enable',{},sessionId);
  await send('Network.setBlockedURLs',{urls:['https://*','http://*.tile.*']},sessionId);
  const navigate=query=>send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'+query},sessionId);
  if(!${renderOnly}){
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:720,deviceScaleFactor:2,mobile:false},sessionId);
    const ui={};
    const shot=async(name,selectors={})=>{
      await evaluate('(()=>{const s=document.createElement("style");s.textContent="*{scrollbar-width:none!important}::-webkit-scrollbar{display:none!important}";document.head.append(s)})()');
      await pause(180);
      ui[name]=await evaluate('(()=>{const result={};for(const [key,selector]of Object.entries('+JSON.stringify(selectors)+')){const el=document.querySelector(selector);if(!el)throw Error("Missing promo control: "+selector);const r=el.getBoundingClientRect();result[key]={x:r.x,y:r.y,width:r.width,height:r.height}}return result})()');
      const capture=await send('Page.captureScreenshot',{format:'png'},sessionId);
      await fs.writeFile(path.join(videoRoot,'assets',name+'.png'),Buffer.from(capture.data,'base64'));
    };
    await navigate('?aba=solicitar');await waitFor('document.querySelector(".adoption-request-layout")');
    await shot('pedido-start',{muda:'.adoption-choice:has(input[value=muda])'});
    await evaluate('document.querySelector("input[value=muda]").click()');
    await shot('pedido-muda',{muda:'.adoption-choice:has(input[value=muda])'});
    await evaluate('document.querySelector(".adoption-form-body").scrollTop=120');
    await shot('pedido-scroll',{sombra:'.adoption-choice:has(input[value=sombra])'});
    await evaluate('document.querySelector("input[value=sombra]").click()');
    await shot('pedido-sombra',{sombra:'.adoption-choice:has(input[value=sombra])',continuar:'.adoption-form-footer button[type=submit]'});
    const form={request_type:'muda',purpose:'sombra',zone:'urbana',planting_place:'quintal',overhead_wiring:'nao',address:'Local de plantio informado',latitude:-8.6,longitude:-38.57,requester_name:'Pessoa de exemplo',requester_phone:'87999999999',items:[{species_id:'species1',provider:'viveiro_municipal',quantity:1}]};
    await evaluate('sessionStorage.setItem("tc_tree_adoption_draft:64:citizen",'+JSON.stringify(JSON.stringify({requestId:'12345678-0000-0000-0000-000000000001',form,step:2}))+')');
    await navigate('?aba=solicitar');await waitFor('document.querySelector(".tree-seedling-card")');
    await evaluate('document.querySelector(".adoption-form-body").scrollTop=150');
    const quantitySelector='button[aria-label^="Aumentar quantidade"]';
    await shot('mudas-1',{plus:quantitySelector});
    await evaluate('document.querySelector('+JSON.stringify(quantitySelector)+').click()');
    await shot('mudas-2',{plus:quantitySelector});
    await navigate('?aba=minhas&promo-request');await waitFor('document.querySelector(".adoption-request-card")');
    const scrollCard='window.scrollTo(0,document.querySelector(".adoption-request-card").getBoundingClientRect().top+scrollY-130)';
    await evaluate(scrollCard);
    await shot('pedidos-enviado',{badge:'.adoption-request-card .adoption-status',progress:'.adoption-citizen-progress'});
    await evaluate('window.requests[0].status="em_analise";window.dispatchEvent(new Event("tree-adoption-updated"))');
    await waitFor('document.querySelector(".adoption-request-card .adoption-status")?.textContent.includes("análise")');
    await evaluate(scrollCard);
    await shot('pedidos-analise',{badge:'.adoption-request-card .adoption-status',progress:'.adoption-citizen-progress'});
    await fs.writeFile(path.join(videoRoot,'assets/ui.json'),JSON.stringify(ui,null,2));
    console.log('Captured actual choice, quantity and request status interactions without scrollbars.');
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1080,height:1920,deviceScaleFactor:1,mobile:false},sessionId);
  await navigate('promo.html');await waitFor('window.promoReady || window.promoError');
  const problem=await evaluate('window.promoError');assert.ok(!problem,problem);
  const info=await evaluate('window.promoInfo');
  assert.ok(info.duration>=20&&info.duration<=40,'Slower narration and screen pauses must fit within 40 seconds');
  assert.equal(info.website,'https://trombonecidadao.com.br');
  assert.ok(info.scenes.every(scene=>scene.speechOffset>=.35&&scene.pauseAfter>=.55),'Each screen must have a lead-in and a reading pause');
  const frames=Math.ceil(info.duration*30), frameDir=path.join(root,'.tmp/tree-promo-v3-frames');
  await fs.mkdir(frameDir,{recursive:true});
  for(let start=0;start<frames;start+=12){
    const batch=await evaluate('window.renderFrameBatch('+start+','+Math.min(12,frames-start)+')');
    await Promise.all(batch.map((base64,index)=>fs.writeFile(path.join(frameDir,String(start+index).padStart(5,'0')+'.jpg'),Buffer.from(base64,'base64'))));
    if(start%120===0)console.log('Rendered '+start+'/'+frames+' frames');
  }
  for(let index=0;index<5;index++){
    const png=await evaluate('window.drawPromo(window.promoInfo.scenes['+index+'].start+.8);document.getElementById("film").toDataURL("image/png").split(",")[1]');
    await fs.writeFile(path.join(videoRoot,index===0?'capa.png':'cena-'+(index+1)+'.png'),Buffer.from(png,'base64'));
  }
  await fs.writeFile(path.join(videoRoot,'legendas.srt'),await evaluate('window.promoSrt'),'utf8');
  const run=async args=>{
    const encoder=spawn(ffmpeg,['-hide_banner','-loglevel','error','-y',...args],{windowsHide:true});let error='';encoder.stderr.on('data',data=>{error+=data});
    await new Promise((resolve,reject)=>{encoder.on('error',reject);encoder.on('exit',code=>code===0?resolve():reject(Error(error)))});
  };
  const movie=path.join(videoRoot,'solicite-mudas-neural.mp4');
  await run(['-framerate','30','-start_number','0','-i',path.join(frameDir,'%05d.jpg'),'-i',path.join(videoRoot,'assets/mix.wav'),'-frames:v',String(frames),'-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-r','30','-c:a','aac','-b:a','192k','-ar','48000','-movflags','+faststart','-t',String(info.duration),'-metadata','title=Adote uma árvore — Trombone Cidadão',movie]);
  await run(['-i',movie,'-f','null','-']);
  const bytes=(await fs.stat(movie)).size;assert.ok(bytes>100000);
  await fs.writeFile(path.join(videoRoot,'metadata.json'),JSON.stringify({...info,width:1080,height:1920,fps:30,frames,bytes,codec:'H.264/AAC',render:'Deterministic frame sequence encoded with FFmpeg',validation:'Full video and audio decode passed'},null,2));
  console.log(JSON.stringify({video:movie,duration:info.duration,frames,bytes,voice:info.voice,validation:'All frames and audio decoded successfully'}));
} finally { ws?.close(); chrome.kill(); server.close(); }
`;
const runner = path.join(root, '.tmp/render-tree-adoption-promo-runner.mjs');
await fs.mkdir(path.dirname(runner), { recursive: true });
await fs.writeFile(runner, fixture);
execFileSync(process.execPath, [runner], { cwd: root, stdio: 'inherit', windowsHide: true });
