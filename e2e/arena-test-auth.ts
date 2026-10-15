import {existsSync,readFileSync} from 'node:fs';
import type {APIRequestContext} from '@playwright/test';
// Explicit local fixtures only. Prefer the individual Owner introduced by Arena V1.
export function hasLocalSuperadminCredentials(){const owner=process.env.ARENA_FINAL_OWNER_CREDENTIALS,legacy=process.env.ARENA_E2E_SUPERADMIN_SECRET_FILE;return Boolean(owner&&existsSync(owner)||legacy&&existsSync(legacy));}
export async function localSuperadminLogin(request:APIRequestContext){
 const owner=process.env.ARENA_FINAL_OWNER_CREDENTIALS;
 if(owner&&existsSync(owner)){const credential=JSON.parse(readFileSync(owner,'utf8'));return request.post('/api/arena/auth/superadmin/login',{data:{email:credential.email,password:credential.password}});}
 const legacy=process.env.ARENA_E2E_SUPERADMIN_SECRET_FILE;
 if(!legacy||!existsSync(legacy))throw Error('Explicit local-only Superadmin fixture required.');
 return request.post('/api/arena/auth/superadmin/login',{data:{secret:readFileSync(legacy,'utf8').trim()}});
}
// Retire only previously-created local QA direct fights through the real audited
// cancellation API. Preserve all history and never alter ordinary demo events.
export async function prepareLocalFightTest(request:APIRequestContext){
 const response=await request.get('/api/arena/superadmin/fights');if(!response.ok())throw Error('Local QA inventory unavailable');
 const {fights}=await response.json();for(const f of fights.filter((f:{name:string;status:string})=>['QA daily match · local only','QA · lokal Butiksfight'].includes(f.name)&&['active','scheduled'].includes(f.status))){const cancelled=await request.post(`/api/arena/superadmin/fights/${f.id}/cancel`,{data:{confirm:true,reason:'Retire previous local-only QA fixture before conflict regression'}});if(!cancelled.ok())throw Error('Local QA cancellation failed');}
}
export async function availableLocalFightDay(request:APIRequestContext,ids:string[],first:string){
 const {bookings}=await(await request.get('/api/arena/superadmin/competitions/availability')).json();
 const {arenaNextDay,arenaDayStart}=await import('../shared/arena-leagues');
 for(let offset=0;offset<90;offset++){const day=arenaNextDay(first,offset),start=arenaDayStart(day),end=arenaDayStart(arenaNextDay(day));if(!bookings.some((b:{station_id:string;start_at:string;end_at:string})=>ids.includes(b.station_id)&&b.start_at<end&&b.end_at>start))return day;}
 throw Error('No free local-only QA date');
}
