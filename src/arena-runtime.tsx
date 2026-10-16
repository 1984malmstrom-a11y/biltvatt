import {createContext,useContext} from 'react';
import {api} from './api';
export type ArenaRuntime={request:typeof api;now:()=>number;demo:boolean;storage:Pick<Storage,'getItem'|'setItem'>;subscribe?:(listener:()=>void)=>()=>void};
const live:ArenaRuntime={request:api,now:()=>Date.now(),demo:false,storage:{getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value)}};
export const ArenaRuntimeContext=createContext<ArenaRuntime>(live);
export const useArenaRuntime=()=>useContext(ArenaRuntimeContext);
