import {describe,expect,it} from 'vitest';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {arenaFixture} from './arena-fixture';
import {passwordMatches} from '../shared/arena-crypto';
const pass='Offline local Owner password 2026!';
function sql(mode:string,email='owner@example.test',environment='local-mastertest'){
 const dir=mkdtempSync(join(tmpdir(),'arena-infra-')),out=join(dir,'private.sql');
 try{const r=spawnSync(process.execPath,['scripts/arena-owner-maintenance.mjs','--mode',mode,'--environment',environment,'--confirm',`ARENA ${environment} ${mode.toUpperCase()}`,'--output',out,'--emit-only'],{input:JSON.stringify({email,display_name:'Local test Owner',password:pass}),encoding:'utf8',timeout:10000});expect(r.status).toBe(0);expect(r.stdout).not.toContain(pass);return readFileSync(out,'utf8');}finally{rmSync(dir,{recursive:true,force:true});}
}
describe('Offline infra bootstrap and break glass',()=>{
 it('bootstraps exactly one Owner, with an unverified email, salted KDF and audit event',async()=>{const f=arenaFixture();try{const statement=sql('bootstrap');f.arena.exec(statement);const a=f.arena.prepare('SELECT * FROM arena_superadmins').get()!;expect(a.role).toBe('owner');expect(a.email_verified_at).toBeNull();expect(await passwordMatches(pass,String(a.password_hash),String(a.password_salt),Number(a.password_iterations))).toBe(true);expect(()=>f.arena.exec(sql('bootstrap','other@example.test'))).toThrow();expect(f.arena.prepare('SELECT COUNT(*) n FROM arena_superadmins').get()!.n).toBe(1);expect(f.arena.prepare('SELECT action FROM arena_audit_log').get()!.action).toBe('owner.bootstrapped');}finally{f.close();}});
 it('requires an existing matching Owner for recovery and produces a traceable security event',()=>{const f=arenaFixture();try{f.arena.exec(sql('bootstrap'));expect(()=>f.arena.exec(sql('recover','wrong@example.test'))).toThrow();expect(f.arena.prepare('SELECT auth_epoch FROM arena_superadmins').get()!.auth_epoch).toBe(0);f.arena.exec(sql('recover'));expect(f.arena.prepare('SELECT auth_epoch FROM arena_superadmins').get()!.auth_epoch).toBe(1);expect(f.arena.prepare("SELECT action FROM arena_audit_log WHERE action='owner.break_glass'").get()).toBeTruthy();}finally{f.close();}});
 it('refuses a nonlocal execution environment unless explicitly emit-only',()=>{const r=spawnSync(process.execPath,['scripts/arena-owner-maintenance.mjs','--mode','recover','--environment','production','--confirm','ARENA production RECOVER','--output','/tmp/should-not-exist-arena.sql'],{input:'{}',encoding:'utf8',timeout:10000});expect(r.status).not.toBe(0);expect(r.stderr).toContain('ENDAST köra lokalt');});
});
