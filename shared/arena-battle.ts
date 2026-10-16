import type {ArenaActivity} from './arena';
export type BattleCategory={id:string;name:string;activities:ArenaActivity[];count:number;points_milli:number;base_milli:number;reward_milli:number};
export type BattleContext={fight_id:string;label:string;categories:BattleCategory[];fair_play?:{reference_milli:number;max_factor_milli:number;customers_milli:number;source:string;period_start:string;period_end:string};unavailable_reason?:string};
export function battlePreference(station:string,fight:string,storage:Pick<Storage,'getItem'>){try{return storage.getItem(`arena:battle-mode:${station}:${fight}`)==='station'?'station':'battle';}catch{return 'battle';}}
