// Actual local workerd + named Service Binding. Every outbound request is mocked.
// No inherited credential is read and no provider/network request is forwarded.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {Miniflare,convertV4MiniflareOptions,Response as MockResponse} from 'miniflare';
const args=process.argv.slice(2);
if(args.length!==4||args[0]!=='--bundle'||args[2]!=='--report')throw Error('Usage: node scripts/arena-mailer-smoke.mjs --bundle <dry-run/arena-mailer.js> --report <local-proof.json>');
const bundle=resolve(args[1]),report=resolve(args[3]);
let calls=0,providerStatus=200;
const results={engine:'local workerd + actual named HTTP Service Binding + mocked Resend',checks:[],remoteChanges:0,realEmails:0};
const mf=new Miniflare(convertV4MiniflareOptions({rootPath:dirname(bundle),workers:[
 {name:'synthetic-caller',compatibilityDate:'2026-10-07',modules:true,script:`export default {fetch(request,env){const name=new URL(request.url).searchParams.get('binding');return env[name].fetch(new Request('https://arena-mailer.internal/send',request));}}`,serviceBindings:{GOOD:{name:'synthetic-mailer',entrypoint:'ArenaMailer',props:{caller:'arenan-pilot-vd-20261019'}},NO_PROPS:{name:'synthetic-mailer',entrypoint:'ArenaMailer'},WRONG:{name:'synthetic-mailer',entrypoint:'ArenaMailer',props:{caller:'other-worker'}},DEFAULT:'synthetic-mailer'}},
 {name:'synthetic-mailer',compatibilityDate:'2026-10-07',modules:[{type:'ESModule',path:bundle,contents:readFileSync(bundle,'utf8')}],bindings:{RESEND_API_KEY:'re_'+'synthetic_only_'.repeat(3),RESEND_DOMAIN_VERIFIED:'1',ARENA_ALLOWED_ORIGINS:'["https://synthetic-pilot.example.test"]'},outboundService:async request=>{
   calls++;assert.equal(request.url,'https://api.resend.com/emails');assert.equal(request.method,'POST');
   const body=await request.json();assert.equal(body.from,'ARENAN <noreply@arenanplay.se>');assert.equal(body.to[0],'synthetic-recipient@example.test');assert.ok(body.html.includes('SÄLJ MER. TILLSAMMANS.'));
   return new MockResponse(JSON.stringify({id:'12345678-1234-4234-8234-123456789abc'}),{status:providerStatus,headers:{'Content-Type':'application/json',...(providerStatus===302?{Location:'https://must-never-be-requested.example.test'}:{})}});
 }}
]}));
async function invoke(binding,purpose='verify',method='POST'){
 const response=await mf.dispatchFetch('https://synthetic-caller.test?binding='+binding,{method,headers:{'Content-Type':'application/json','X-Caller':'arenan-pilot-vd-20261019'},...(method==='POST'?{body:JSON.stringify({to:'synthetic-recipient@example.test',purpose,url:'https://synthetic-pilot.example.test/arena/recovery#token='+'a'.repeat(64)+'&realm=superadmin&purpose='+purpose})}:{})});
 return response;
}
try{
 for(const method of ['GET','POST','OPTIONS']){assert.equal((await invoke('DEFAULT','verify',method)).status,404);results.checks.push({publicDefault:method,status:404});}
 for(const binding of ['NO_PROPS','WRONG']){assert.equal((await invoke(binding)).status,403);results.checks.push({binding,status:403});}
 assert.equal(calls,0);
 for(const purpose of ['verify','reset','invite']){const response=await invoke('GOOD',purpose);assert.equal(response.status,202);assert.deepEqual(await response.json(),{accepted:true});results.checks.push({purpose,status:202});}
 providerStatus=302;assert.equal((await invoke('GOOD')).status,502);assert.equal(calls,4);results.checks.push({providerRedirect:'rejected, not followed'});
 providerStatus=429;assert.equal((await invoke('GOOD')).status,429);assert.equal(calls,5);results.checks.push({providerRateLimit:'propagated without retry'});
 writeFileSync(report,JSON.stringify({...results,status:'PASS',mockProviderCalls:calls},null,2)+'\n');console.log('PASS: local mailer runtime checks; outbound calls mocked; zero real emails/remote changes.');
}finally{await mf.dispose();}
