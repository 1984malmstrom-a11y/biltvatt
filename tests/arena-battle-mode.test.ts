import {it,expect} from 'vitest';
import {battleSlots} from '../src/arena-battle-mode';
import {battlePreference,type BattleContext} from '../shared/arena-battle';
import type {ArenaActivity} from '../shared/arena';
const a=(i:number):ArenaActivity=>({id:`a${i}`,name:`Produkt ${i}`,points:1,offer_text:'',price_text:'',image_key:null,category:'test',sort_order:i,active:1});
const battle=(n:number):BattleContext=>({fight_id:'f',label:'FINAL',categories:Array.from({length:n},(_,i)=>({id:`c${i}`,name:`KATEGORI ${i}`,activities:[a(i)],count:2,points_milli:8000,base_milli:2000,reward_milli:4000}))});
it('keeps exactly seven existing orbit slots, actual categories, correct frozen reward and inactive empty slots',()=>{
 for(const n of [3,7]){const data=battle(n),activities=Array.from({length:n},(_,i)=>a(i)),before=structuredClone(activities),slots=battleSlots(data,activities);expect(slots).toHaveLength(7);expect(slots.filter(s=>s.activity)).toHaveLength(n);expect(slots[0].view).toMatchObject({name:'KATEGORI 0',points:4});expect(activities).toEqual(before);expect(slots.slice(n).every(s=>s.view.name==='INAKTIV'&&!s.activity)).toBe(true);}
});
it('missing, deactivated and stale activity mappings cannot turn a category into a wrong product sale',()=>{const b=battle(3);const slots=battleSlots(b,[{...a(0),active:0},a(2)]);expect(slots[0].activity).toBeNull();expect(slots[1].activity).toBeNull();expect(slots[2].activity?.id).toBe('a2');});
it('defaults to battle once per match, preserves manual Station choice through refresh, isolates stations and fights',()=>{
 const entries=new Map<string,string>(),storage={getItem:(k:string)=>entries.get(k)??null};expect(battlePreference('s','f',storage)).toBe('battle');entries.set('arena:battle-mode:s:f','station');expect(battlePreference('s','f',storage)).toBe('station');expect(battlePreference('s','new',storage)).toBe('battle');expect(battlePreference('other','f',storage)).toBe('battle');expect(battlePreference('s','f',{getItem:()=>{throw Error();}})).toBe('battle');
});
