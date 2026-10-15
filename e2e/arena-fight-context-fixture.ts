import type {ArenaStats} from '../shared/arena';
import {fight,initial} from './arena-release-fixture';
// Match the real stats API: cross-station rows include the frozen station name.
// Remote seller IDs remain distinct from station-local bootstrap identities.
export const fightDashboardFixture:NonNullable<ArenaStats['fight_dashboard']>={
 fight_id:fight.id,station_ids:fight.standings.map(s=>s.id),metric:'points',
 leaderboard:initial.leaderboard.slice(0,5).map((p,i)=>({...p,id:i%2?`k:${p.id}`:p.id,station_id:i%2?'k':'review',station_name:i%2?'Karlskrona':'Tingsryd'})),
 recent:initial.recent!.map((r,i)=>({...r,seller_id:i%2?`k:${r.seller_id}`:r.seller_id,station_id:i%2?'k':'review',station_name:i%2?'Karlskrona':'Tingsryd'})),
};
