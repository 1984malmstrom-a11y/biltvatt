import {describe,it,expect} from 'vitest';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ArenaPersonContext,ArenaPersonName,isMultistation} from '../src/ArenaPersonContext';
import ArenaChampion from '../src/ArenaChampion';
import {arenaChampion,arenaChampions} from '../src/arena-champions';
import {arenaDemoIdentity} from '../src/arena-demo-identities';
import {resolveArenaAvatar} from '../src/arena-avatars';
import {ArenaCustomerBrandSlot} from '../src/ArenaBrand';
import {arenaPulse} from '../src/arena-pulse';
import type {ArenaStats} from '../shared/arena';
const stats:ArenaStats={range:{start:'2026-10-15',end:'2026-10-15',from:'',to:''},points:42,count:18,today:{points:42,count:18,sellers:7},leaderboard:[],recent:[],campaign:null,station_goals:[{id:'goal',period_type:'month',start_date:'2026-10-01',end_date:'2026-10-31',points:742,target_points:1000}],personal_goals:[]};
describe('Person station context is opt-in and based on the complete competition',()=>{
 it('omits station labels locally, with one station, or repeated station IDs',()=>{
  expect(isMultistation(['t','t',''])).toBe(false);
  expect(renderToStaticMarkup(h(ArenaPersonName,{name:'Peter',stationName:'Tingsryd'}))).not.toContain('Tingsryd');
  expect(renderToStaticMarkup(h(ArenaPersonContext,{stationIds:['t'],children:h(ArenaPersonName,{name:'Peter',stationName:'Tingsryd'})}))).not.toContain('Tingsryd');
 });
 it('shows one muted station line when the competition contains multiple stations, even for one visible person',()=>{
  const html=renderToStaticMarkup(h(ArenaPersonContext,{stationIds:['t','k'],children:h(ArenaPersonName,{name:'Peter',stationName:'Tingsryd'})}));expect(html).toContain('arena-person-station');expect(html).toContain('Tingsryd');expect(html).toContain('Peter');
 });
});
describe('Champion art is separate from all employee identities',()=>{
 it('selects one of two stable, local optimized characters by event key only',()=>{expect(arenaChampions).toHaveLength(2);expect(arenaChampion('event-1')).toEqual(arenaChampion('event-1'));const html=renderToStaticMarkup(h(ArenaChampion,{eventKey:'event-1'}));expect(html).toContain('fictional-celebration-art');expect(html).toContain('/arena-brand/champion-');expect(html).not.toContain('data-avatar');expect(html).not.toContain('portraits/');});
 it('keeps uploaded avatars first and applies curated casting only to explicit showroom identities',()=>{
  for(const [name,index] of [['Peter',0],['Alva',1],['Sofia',5],['Erik',2],['Linnea',3]] as const){expect(arenaDemoIdentity(name)).toBe(index);expect(resolveArenaAvatar({id:'s-9',name},true)).toMatchObject({index});}
  expect(resolveArenaAvatar({id:'real-id',name:'Erik',avatarIndex:14},true)).toMatchObject({index:14});expect(resolveArenaAvatar({id:'s-1',name:'Erik',avatarIndex:14},false)).toMatchObject({index:14});expect(resolveArenaAvatar({id:'s-1',name:'Erik',imageUrl:'/my-photo.webp'},true)).toMatchObject({kind:'uploaded'});
 });
});
describe('Stationspuls is calculated, never invented or duplicated KPIs',()=>{
 it('derives linear calendar-day pace without DST duration errors',()=>{expect(arenaPulse(stats).pace).toEqual({percent:153,difference:258.13,elapsed:15,days:31});const march={...stats,range:{...stats.range,end:'2026-03-30'},station_goals:[{...stats.station_goals[0],start_date:'2026-03-01',end_date:'2026-03-31',points:1000}]};expect(arenaPulse(march).pace?.elapsed).toBe(30);expect(arenaPulse(march).pace?.days).toBe(31);});
 it('does not infer a strongest activity from a truncated recent feed and handles missing goals',()=>{const s={...stats,station_goals:[],recent:[{id:'r',seller_name:'Peter',activity_name:'Kaffe + bulle',points_awarded:1,registered_at:'2026-10-15T10:00:00Z'}]};expect(arenaPulse(s)).toMatchObject({pace:null,strongest:null,lastActivity:{activity_name:'Kaffe + bulle'}});expect(arenaPulse(null)).toMatchObject({pace:null,strongest:null,lastActivity:null});});
 it('sums actual activity registrations across the full seller board',()=>{const s={...stats,leaderboard:[{id:'p',name:'Peter',active:1,external_staff_id:null,color:'',rank:1,points:2,count:1,activities:[{id:'wash',name:'Biltvätt',category:'',count:2,points:4}]},{id:'a',name:'Alva',active:1,external_staff_id:null,color:'',rank:2,points:1,count:1,activities:[{id:'wash',name:'Biltvätt',category:'',count:3,points:6}]}]};expect(arenaPulse(s).strongest).toEqual({id:'wash',name:'Biltvätt',count:5});});
});
it('customer slot is replaceable and does not draw an unavailable or disabled logo',()=>{expect(renderToStaticMarkup(h(ArenaCustomerBrandSlot,{brand:{name:'Partner',logoAsset:'/partner.svg',enabled:false}}))).toBe('');const html=renderToStaticMarkup(h(ArenaCustomerBrandSlot,{brand:{name:'Partner',logoAsset:'/partner.svg',enabled:true}}));expect(html).toContain('/partner.svg');expect(html).toContain('Kundpartner: Partner');});
