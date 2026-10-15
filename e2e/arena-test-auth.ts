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
