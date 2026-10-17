import type {DatabaseSync} from 'node:sqlite';
export type ArenaDatabaseProof={status:string;tables:number;rows:number;integrity:string;foreignKeys:string;fingerprint:string;tableDetails:Array<{name:string;rows:number;digest:string}>};
export function inspectArenaDatabase(db:DatabaseSync, options?:{allowEmpty?:boolean}):ArenaDatabaseProof;
export function inspectArenaBackup(sql:string, options?:{allowEmpty?:boolean}):ArenaDatabaseProof;
