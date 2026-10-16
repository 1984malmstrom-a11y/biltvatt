import {describe,it,expect} from 'vitest';
import {fightScopeLabel,fightMetricLabel,fightDifference,stationInitials} from '../src/arena-war-fight';
import {shouldShowArenaIntro,finishArenaIntro,ARENA_INTRO_KEY} from '../src/arena-intro';
describe('Presentation follows authoritative fight data',()=>{
 it('does not borrow scope from a different fight or invent qualifying categories',()=>{
  expect(fightScopeLabel('f',undefined)).toBe('Se fightens regler');
  expect(fightScopeLabel('f',{fight_id:'old',scope:'all',activity_ids:null})).toBe('Se fightens regler');
  expect(fightScopeLabel('f',{fight_id:'f',scope:'all',activity_ids:null})).toBe('ALLA KATEGORIER');
  expect(fightScopeLabel('f',{fight_id:'f',scope:'focus',activity_ids:['a']})).toBe('MÅNADENS FOKUS');
  expect(fightScopeLabel('f',{fight_id:'f',scope:'activity',activity_ids:['missing']})).toBe('1 VALDA AKTIVITETER');
  expect(fightScopeLabel('f',{fight_id:'f',scope:'activity',activity_ids:[]})).toBe('INGA AKTIVA AKTIVITETER');
  expect(fightScopeLabel('f',{fight_id:'f',scope:'activity',activity_ids:[]},[],[{fight_id:'f',active:1,name:'Fight-fika'},{fight_id:'other',active:1,name:'Fel match'},{fight_id:'f',active:0,name:'Inaktiv'}])).toBe('Fight-fika');
 });
 it('does not label a frozen category subset as all categories when the builder uses all as its base scope',()=>{
  const activities=['Biltvätt','Kaffe + bulle','Korv med mos'].map((name,i)=>({id:`a${i}`,name,active:1,points:1,offer_text:'',price_text:'',image_key:null,category:'',sort_order:i}));
  expect(fightScopeLabel('f',{fight_id:'f',scope:'all',activity_ids:['a0','a1']},activities)).toBe('Biltvätt · Kaffe + bulle');
  expect(fightScopeLabel('f',{fight_id:'f',scope:'all',activity_ids:['a0','a1','a2']},activities)).toBe('ALLA KATEGORIER');
  expect(fightScopeLabel('f',{fight_id:'f',scope:'all',activity_ids:['missing']},activities)).toBe('1 VALDA AKTIVITETER');
 });
 it('labels series points independently of the underlying score metric',()=>{
  for(const metric of ['points','tb','count'] as const){const f={id:'f',name:'F',version:1,phase:'active' as const,standings:[],metric};expect(fightMetricLabel({...f,scoring_mode:'daily'})).toBe('MATCHPOÄNG');expect(fightMetricLabel(f)).toBe(metric==='tb'?'TB · kr':metric==='count'?'ANTAL':'POÄNG');expect(fightDifference(f,100)).toBe(metric==='tb'?'1 kr TB':metric==='count'?'100 registreringar':'100 poäng');expect(fightDifference({...f,scoring_mode:'daily'},3)).toBe('3 matchpoäng');if(metric==='count')expect(fightDifference(f,-1)).toBe('1 registrering');}
  expect(stationInitials('Tingsryd')).toBe('T');expect(stationInitials('Växjö Centrum')).toBe('VC');expect(stationInitials('  ')).toBe('–');
 });
});
describe('Intro session policy with unavailable storage',()=>{
 it('plays once and only permits explicit development/showcase replay',()=>{
  expect(shouldShowArenaIntro(null,'')).toBe(true);
  const storage={getItem:()=> '1',setItem:()=>{}};
  expect(shouldShowArenaIntro(storage,'')).toBe(false);
  expect(shouldShowArenaIntro(storage,'?intro=1')).toBe(false);
  expect(shouldShowArenaIntro(storage,'?intro=1&showcase=1')).toBe(true);
  expect(shouldShowArenaIntro(storage,'?intro=1',true)).toBe(true);
  const broken={getItem:()=>{throw Error('denied');},setItem:()=>{throw Error('denied');}};
  expect(shouldShowArenaIntro(broken,'')).toBe(true);
  expect(()=>finishArenaIntro(broken)).not.toThrow();
  expect(shouldShowArenaIntro(broken,'')).toBe(false);
  let key='';finishArenaIntro({setItem:k=>{key=k;}});expect(key).toBe(ARENA_INTRO_KEY);
 });
});
