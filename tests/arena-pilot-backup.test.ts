import {DatabaseSync} from 'node:sqlite';
import {expect,it} from 'vitest';
import {verifyArenaPilotBackup} from '../scripts/arena-pilot-backup.mjs';
const dump=`CREATE TABLE arena_children(id TEXT PRIMARY KEY,parent TEXT REFERENCES arena_stations(id),data BLOB);
INSERT INTO arena_children VALUES('child','parent',X'0001FF');
CREATE TABLE arena_stations(id TEXT PRIMARY KEY,name TEXT);
INSERT INTO arena_stations VALUES('parent','Åsa; "Östermalm"');
CREATE TRIGGER immutable_child BEFORE UPDATE ON arena_children BEGIN SELECT RAISE(ABORT,'immutable'); END;`;
it('reorders tables before data, preserves Swedish text/BLOB and restores immutable triggers',()=>{
 const {restoreSql,report}=verifyArenaPilotBackup(dump);expect(report.remoteActions).toBe(0);expect(report.rows).toBe(2);
 const db=new DatabaseSync(':memory:');try{db.exec('PRAGMA foreign_keys=ON; BEGIN');db.exec(restoreSql);db.exec('COMMIT');
 expect(db.prepare('SELECT name FROM arena_stations').get()!.name).toBe('Åsa; "Östermalm"');
 expect(db.prepare('SELECT hex(data) value FROM arena_children').get()!.value).toBe('0001FF');
 expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
 expect(()=>db.exec("UPDATE arena_children SET parent='other'")).toThrow(/immutable/);
 }finally{db.close();}
});
it('refuses foreign-key corruption and unrelated station databases',()=>{
 expect(()=>verifyArenaPilotBackup(dump.replace("VALUES('child','parent'","VALUES('child','absent'"))).toThrow();
 expect(()=>verifyArenaPilotBackup('CREATE TABLE staff(id TEXT);')).toThrow();
 expect(()=>verifyArenaPilotBackup(dump+'CREATE TABLE staff(id TEXT);')).toThrow();
});
it('empty new pilot requires explicit allow-empty and never permits non-Arena tables',()=>{
 expect(()=>verifyArenaPilotBackup('')).toThrow();expect(verifyArenaPilotBackup('',{allowEmpty:true}).report.tables).toBe(0);
 expect(()=>verifyArenaPilotBackup('CREATE TABLE staff(id TEXT);',{allowEmpty:true})).toThrow();
});
it('preserves embedded NUL text bytes instead of SQLite quote truncation',()=>{
 const {restoreSql}=verifyArenaPilotBackup("CREATE TABLE arena_stations(id TEXT); INSERT INTO arena_stations VALUES(CAST(X'410042C385' AS TEXT));");
 const db=new DatabaseSync(':memory:');try{db.exec(restoreSql);expect(db.prepare('SELECT hex(id) value FROM arena_stations').get()!.value).toBe('410042C385');}finally{db.close();}
});
