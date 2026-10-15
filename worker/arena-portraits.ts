import type {Env} from './index';
import {arenaImage} from './arena-model';
import {resolveArenaStation,requireArenaSuperadmin} from './arena-auth';
import {ApiError,fail,json} from './http';

// Bounded reader shared by activity and portrait uploads. Never trust Content-Length.
export async function readArenaImage(request:Request,max=250000,maxDimension=640) {
  const mime=request.headers.get('Content-Type')??'';
  if(!['image/png','image/webp'].includes(mime))fail(415,'Använd normaliserad WebP eller PNG.');
  const reader=request.body?.getReader();if(!reader)fail(400,'Bilden saknas.');
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const part=await reader!.read();if(part.done)break;size+=part.value.byteLength;if(size>max){await reader!.cancel();fail(413,'Bilden är för stor.');}chunks.push(part.value);}
  const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
  const {width,height}=arenaImage(bytes,mime);
  if(width>maxDimension || height>maxDimension)fail(400,`Bilden får vara högst ${maxDimension} pixlar.`);
  return {mime,bytes,width,height};
}
export async function updateArenaPortrait(request:Request,env:Env,sellerId:string,station:string) {
  const db=env.ARENA_DB!,seller=await db.prepare('SELECT profile_image_id FROM arena_sellers WHERE id=? AND station_id=?').bind(sellerId,station).first<{profile_image_id:string|null}>();
  if(!seller)fail(404,'Säljaren finns inte på stationen.');
  if(request.method==='DELETE'){
    await db.batch([db.prepare('UPDATE arena_sellers SET profile_image_id=NULL,updated_at=? WHERE id=? AND station_id=?').bind(new Date().toISOString(),sellerId,station),db.prepare('DELETE FROM arena_profile_images WHERE seller_id=? AND station_id=?').bind(sellerId,station)]);
    return json({ok:true});
  }
  if(request.method!=='POST')fail(405,'Metoden stöds inte.');
  const {mime,bytes,width,height}=await readArenaImage(request,250000,512),id=crypto.randomUUID(),now=new Date().toISOString();
  await db.batch([
    db.prepare('INSERT INTO arena_profile_images(id,seller_id,station_id,mime_type,image_bytes,width,height,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,sellerId,station,mime,bytes.buffer,width,height,now),
    db.prepare('UPDATE arena_sellers SET profile_image_id=?,updated_at=? WHERE id=? AND station_id=?').bind(id,now,sellerId,station),
    db.prepare('DELETE FROM arena_profile_images WHERE seller_id=? AND station_id=? AND id<>?').bind(sellerId,station,id),
  ]);
  return json({id,profile_url:`/api/arena/portraits/${id}`},201);
}
export async function arenaPortrait(request:Request,env:Env,id:string) {
  const db=env.ARENA_DB!;
  let key:string|null=null,superadmin=false;
  if(request.headers.get('Cookie')?.includes('arena_superadmin_session=')){try{await requireArenaSuperadmin(request,env);superadmin=true;}catch(error){if(!(error instanceof ApiError)||![401,403].includes(error.status))throw error;}}
  if(!superadmin)key=(await resolveArenaStation(request,env)).key;
  const image=await db.prepare(`SELECT mime_type,image_bytes FROM arena_profile_images p WHERE p.id=? AND
    (?=1 OR p.station_id=? OR EXISTS(SELECT 1 FROM arena_group_members a JOIN arena_group_members b ON a.group_id=b.group_id WHERE a.station_id=? AND b.station_id=p.station_id)
      OR EXISTS(SELECT 1 FROM arena_fight_stations a JOIN arena_fight_stations b ON a.fight_id=b.fight_id JOIN arena_fights f ON f.id=a.fight_id WHERE a.station_id=? AND b.station_id=p.station_id AND f.status<>'cancelled'))`)
    .bind(id,superadmin?1:0,key,key,key).first<{mime_type:string;image_bytes:ArrayBuffer}>();
  if(!image)fail(404,'Porträttet finns inte.');
  return new Response(new Uint8Array(image!.image_bytes),{headers:{'Content-Type':image!.mime_type,'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'}});
}
