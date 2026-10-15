import type {ArenaPeopleBoard} from '../shared/arena-network';
import {arenaNumber} from '../shared/arena';
import {arenaMoney} from '../shared/arena-money';
import ArenaAvatar from './ArenaAvatar';
import {ArenaPersonContext,ArenaPersonName} from './ArenaPersonContext';
const time=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',hour:'2-digit',minute:'2-digit'});
export default function ArenaNetworkPeople({board}:{board:ArenaPeopleBoard}){
 const value=(r:{points:number;count:number;tb_ore:number})=>board.metric==='tb'?`${arenaMoney(r.tb_ore)} TB`:`${arenaNumber(board.metric==='count'?r.count:r.points)} ${board.metric==='count'?'st':'p'}`;
 return <ArenaPersonContext stationIds={board.standings.map(s=>s.id)}><section className="arena-network-people"><span className="arena-eyebrow">PERSONERNA BAKOM RESULTATET</span><h2>Gemensam säljartopplista</h2><p>Periodens 100 högsta resultat · samma mått som stationslistan.</p><ol className="arena-network-person-list">{board.people.map(p=><li key={p.id}><span className={`arena-rank rank-${p.rank}`}>{p.rank}</span><ArenaAvatar id={p.id} name={p.name} imageUrl={p.profile_url} avatarIndex={p.avatar_index}/><ArenaPersonName name={p.name} stationName={p.station_name}/><b>{value(p)}</b></li>)}</ol>{!board.people.length&&<p>Inga registreringar i perioden.</p>}<h2>Senaste aktiviteter · nätverket</h2><ol className="arena-network-recent">{board.recent.map(r=><li key={r.id}><ArenaAvatar id={r.seller_id} name={r.seller_name} imageUrl={r.profile_url} avatarIndex={r.avatar_index}/><div><ArenaPersonName name={r.seller_name} stationName={r.station_name}/><span>{r.activity_name}</span></div><b>{r.display_mode==='tb'&&r.tb_ore_awarded!==null?`+${arenaMoney(r.tb_ore_awarded)} TB`:`+${arenaNumber(r.points_awarded)} p`}</b><time dateTime={r.registered_at}>{time.format(new Date(r.registered_at))}</time></li>)}</ol></section></ArenaPersonContext>;
}
