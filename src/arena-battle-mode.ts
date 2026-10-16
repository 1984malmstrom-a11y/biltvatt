import type {ArenaActivity,ArenaBootstrap} from '../shared/arena';
import type {BattleContext} from '../shared/arena-battle';
export function battleSlots(battle:BattleContext,activities:ArenaBootstrap['activities']){
 return Array.from({length:7},(_,index)=>{const category=battle.categories[index],mapped=category?.activities.filter(a=>a.active===1&&activities.some(l=>l.id===a.id&&l.active===1))??[];
 const activity=mapped.length===1?activities.find(a=>a.id===mapped[0].id)!:mapped.length?activities.find(a=>a.id===mapped[0].id)!:null;
 const view:ArenaActivity={...(activity??{id:'',offer_text:'',price_text:'',points:0,image_key:null,category:'',sort_order:index,active:0}),name:category?.name??'INAKTIV',offer_text:'',price_text:'',display_mode:'points',points:(category?.reward_milli??0)/1000};
 return {key:category?.id??`inactive-${index}`,category,activity,view,mapped};
 });
}
