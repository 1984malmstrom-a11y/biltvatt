import type {ArenaActivity,ArenaRegistration,ArenaSeller,ArenaStats} from '../shared/arena';
import {roundedPoints} from '../shared/arena';
const dayFormat=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit'});
// Provisional presentation only; the receipt and the next server snapshot remain authoritative.
export function arenaLocalSale(stats:ArenaStats|null,seller:ArenaSeller,activity:ArenaActivity,sale:ArenaRegistration,filter={activityId:'',category:''},now=new Date()):ArenaStats|null {
  if(!stats)return null;
  const day=dayFormat.format(new Date(sale.registered_at)),today=day===dayFormat.format(now);
  const included=day>=stats.range.start&&day<=stats.range.end&&(!filter.activityId||filter.activityId===activity.id)&&(!filter.category||filter.category===activity.category);
  const points=sale.points_awarded,tb=sale.tb_ore_awarded??0;
  const leaderboard=stats.leaderboard.map(p=>{
    if(!included||p.id!==seller.id)return p;
    const exists=p.activities.some(a=>a.id===activity.id),activities=p.activities.map(a=>a.id===activity.id?{...a,count:a.count+1,points:roundedPoints(a.points+points),tb_ore:(a.tb_ore??0)+tb}:a);
    if(!exists)activities.push({id:activity.id,name:activity.name,category:activity.category,count:1,points,tb_ore:tb});
    return {...p,count:p.count+1,points:roundedPoints(p.points+points),tb_ore:(p.tb_ore??0)+tb,activities};
  });
  if(included)leaderboard.sort((a,b)=>(stats.metric==='tb'?(b.tb_ore??0)-(a.tb_ore??0):stats.metric==='count'?b.count-a.count:b.points-a.points)||b.points-a.points||b.count-a.count||a.name.localeCompare(b.name,'sv')||a.id.localeCompare(b.id));
  const goalUpdate=(g:ArenaStats['station_goals'][number])=>day>=g.start_date&&day<=g.end_date&&(!g.seller_id||g.seller_id===seller.id)?{...g,points:roundedPoints(g.points+points)}:g;
  const campaign=stats.campaign,withinCampaign=campaign?.activity_id===activity.id&&sale.registered_at>=campaign.start_at&&sale.registered_at<campaign.end_at;
  return {...stats,leaderboard:included?leaderboard.map((p,i)=>({...p,rank:i+1})):leaderboard,count:stats.count+(included?1:0),points:roundedPoints(stats.points+(included?points:0)),tb_ore:(stats.tb_ore??0)+(included?tb:0),today:today?{count:stats.today.count+1,points:roundedPoints(stats.today.points+points),sellers:stats.today.sellers+(stats.leaderboard.find(p=>p.id===seller.id)?.count===0?1:0)}:stats.today,
    recent:today?[{id:sale.id,seller_id:seller.id,seller_name:seller.name,profile_url:seller.profile_url,avatar_index:seller.avatar_index,activity_name:activity.name,display_mode:activity.display_mode,points_awarded:points,tb_ore_awarded:sale.tb_ore_awarded,registered_at:sale.registered_at},...(stats.recent??[])].slice(0,10):stats.recent,
    campaign:campaign&&withinCampaign?{...campaign,count:campaign.count+1,points:roundedPoints(campaign.points+points)}:campaign,station_goals:stats.station_goals.map(goalUpdate),personal_goals:stats.personal_goals.map(goalUpdate)};
}
