import {chromium} from 'playwright-core';import {createServer} from 'http';import {readFile} from 'fs/promises';import {extname,join} from 'path';
const T={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
const srv=createServer(async(rq,rs)=>{const p=decodeURIComponent(rq.url.split('?')[0]);try{const b=await readFile(join('/home/user/gunnars-depot.html',p));rs.writeHead(200,{'content-type':T[extname(p)]||'application/octet-stream'});rs.end(b);}catch{if(!rs.headersSent)rs.writeHead(404);rs.end('no');}});
await new Promise(r=>srv.listen(8092,r));
const br=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=swiftshader','--no-sandbox']});
for(const [w,h,label] of [[1280,820,'desktop'],[390,780,'phone']]){console.log('=== '+label);
 for(const slug of ['lunar-lander','howls-moving-castle','tiny-house-frame','foam-trailer','pagoda-stub','castle-6-cycles','castle-2-cycles']){
  const pg=await br.newPage({viewport:{width:w,height:h}});
  await pg.goto(`http://127.0.0.1:8092/operative-builder-trace.html?trace=${slug}`,{waitUntil:'load'});
  await pg.waitForFunction(()=>window.trace?.msgs?.length>0,{timeout:25000});
  const n=await pg.evaluate(()=>window.trace.msgs.length);
  const at=[...new Set([Math.floor(n*.6),n-1])].filter(x=>x>=0).sort((a,b)=>a-b);
  const out=[];
  for(const i of at){const r=await pg.evaluate(async i=>{window.trace.goto(i);
    for(let k=0;k<60;k++){await new Promise(s=>setTimeout(s,120));const s=window.trace.stage?.();
     if(s&&s.total){await new Promise(z=>setTimeout(z,1800));return window.trace.stage();}}return null;},i);
   out.push(`${i}:${r?(r.onscreen?'ok':'OFF'):'-'}`);}
  console.log(' ',slug.padEnd(22),out.join('  '));
  await pg.close();}}
await br.close();srv.close();
