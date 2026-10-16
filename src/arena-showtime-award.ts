import type {ShowtimeEngine} from './arena-showtime-engine';
import type {ArenaReportSnapshot} from '../shared/arena-reports';
import {awardFromSnapshot} from '../shared/arena-awards';
// A local, visibly simulated preview. Never sent to reports/awards APIs.
export function showtimeAward(engine:ShowtimeEngine){
 const fight=engine.fight();if(fight?.phase!=='finished'||fight.winner_ids?.length!==1)return null;
 const source:ArenaReportSnapshot={version:1,id:'demo-only-source',type:'fight',title:'Showtime · SIMULERAT SLUTRESULTAT',created_at:new Date(engine.now).toISOString(),period:{start: fight.start_at!.slice(0,10),end:fight.end_at!.slice(0,10)},station:null,totals:{count:0,points:0,tb_ore:0,unknown_tb_count:0},leaderboard:fight.standings,activities:[],goals:[],winner_names:fight.standings.filter(s=>fight.winner_ids!.includes(s.id)).map(s=>s.name),winner_ids:fight.winner_ids,metric:fight.metric,source:'showtime-synthetic-memory-only'};
 source.activity={id:'demo-frozen-scope',name:'Biltvätt · Kaffe + bulle · Spolarvätska'};
 return awardFromSnapshot(source,'fight',fight.winner_ids[0],'demo-only-award');
}
