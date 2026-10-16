import {demoFunctionalFixture} from './arena-demo-functional-fixture';

// Isolate the backend's deterministic clock from Playwright's own clock driver.
let fixture:Awaited<ReturnType<typeof demoFunctionalFixture>>|undefined;
async function command(kind:string,args:any) {
 if(kind==='init'){
  fixture=await demoFunctionalFixture();const f=fixture;
  return {station:f.station,opponent:f.opponent,viktor:f.viktor,alva:f.alva,ids:f.ids,challenge:f.challenge,now:f.now()};
 }
 const f=fixture;if(!f)throw Error('Isolated test fixture not initialized');
 if(kind==='all')return f.all();
 if(kind==='stats')return f.stats();
 if(kind==='view')return f.view(args.id);
 if(kind==='time'){f.setNow(args.value);return f.now();}
 if(kind==='inspect'){
  if(args.kind==='sale-id')return f.arena.prepare('SELECT COUNT(*) n FROM arena_registrations WHERE id=?').get(args.id);
  if(args.kind==='request-id')return f.arena.prepare('SELECT COUNT(*) n FROM arena_registrations WHERE request_id=?').get(args.id);
  if(args.kind==='voided')return f.arena.prepare('SELECT voided_at FROM arena_registrations WHERE id=?').get(args.id);
  if(args.kind==='foreign-keys')return f.arena.prepare('PRAGMA foreign_key_check').all();
  throw Error('Unknown verification query');
 }
 if(kind==='call'){
  const cookie=args.role==='owner'?f.owner:args.role==='stationAdmin'?f.stationAdmin:f.cookies[args.role==='opponent'?f.opponent:f.station];
  const response=await f.call(args.path,args.method,args.data,cookie,{Origin:'https://tvattligan.test'});
  return {status:response.status,contentType:response.headers.get('content-type'),body:Buffer.from(await response.arrayBuffer()).toString('base64')};
 }
 if(kind==='close'){await f.finish();f.close();fixture=undefined;return true;}
 throw Error('Unknown test command');
}
let queue=Promise.resolve();
process.on('message',(message:{id:number;kind:string;args:any})=>{
 queue=queue.then(async()=>{try{process.send?.({id:message.id,result:await command(message.kind,message.args)});}catch(e){process.send?.({id:message.id,error:String(e)});}});
});
