const { chromium } = require("playwright"); const http=require("http"),fs=require("fs"),path=require("path");
const racine=path.resolve(process.argv[2]);const T={".js":"text/javascript",".json":"application/json",".html":"text/html",".png":"image/png",".jpg":"image/jpeg",".webp":"image/webp"};const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split("?")[0]);const f=path.join(racine,p);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end()}r.writeHead(200,{"content-type":T[path.extname(f)]||"application/octet-stream"});fs.createReadStream(f).pipe(r)});
(async()=>{await new Promise(o=>srv.listen(0,o));const nav=await chromium.launch({args:["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]});const page=await (await nav.newContext({viewport:{width:1440,height:900}})).newPage();
const err=[];page.on("pageerror",e=>err.push(String(e)));
await page.goto(`http://localhost:${srv.address().port}/page/index.html`);await page.waitForFunction(()=>typeof fondGlobal!=="undefined"&&fondGlobal,null,{timeout:120000});
for(const [id,f] of [["carte-pop",0.5],["site-relief",0.5],["site-bassins",0.5],["frise",0.5]]){
 await page.evaluate(([id,f])=>{const i=DIAPOS.findIndex(d=>d.id===id);const s=diapos[i];scrollTo(0,s.offsetTop+s.offsetHeight*f)},[id,f]);await page.waitForTimeout(3500);
 await page.evaluate(()=>{window.scrollBy(0,5)});await page.waitForTimeout(2500);
 await page.screenshot({path:`o-${id}.png`});
 console.log(id,await page.evaluate(()=>JSON.stringify({analyses:!!analyses,topo:typeof topo!=="undefined"&&!!topo.img.relief,an:Math.round(an),span:Math.round(cam.span)})));}
console.log("erreurs",err);await nav.close();srv.close()})();
