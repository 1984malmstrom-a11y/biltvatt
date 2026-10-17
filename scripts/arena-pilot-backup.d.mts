import type {ArenaDatabaseProof} from './arena-pilot-database.mjs';
export function verifyArenaPilotBackup(sql:string, options?:{allowEmpty?:boolean}):{restoreSql:string;report:ArenaDatabaseProof & {remoteActions:number}};
