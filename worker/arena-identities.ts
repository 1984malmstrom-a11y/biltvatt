import {demoAvatarIndex} from '../shared/arena-identities';
// Existing identities prefer their original cell. Collisions use the added pool.
// Writes happen only for new/unassigned people during station bootstrap.
export async function assignArenaIdentities(db:D1Database,station:string){
 const rows=await db.prepare('SELECT id,avatar_index FROM arena_sellers WHERE station_id=? ORDER BY created_at,id').bind(station).all<{id:string;avatar_index:number|null}>();
 const used=new Set(rows.results.flatMap(s=>s.avatar_index===null?[]:[s.avatar_index])),statements:D1PreparedStatement[]=[];
 for(const s of rows.results){if(s.avatar_index!==null)continue;const preferred=demoAvatarIndex(s.id),index=!used.has(preferred)?preferred:[...Array.from({length:8},(_,i)=>i+8),...Array.from({length:8},(_,i)=>i)].find(i=>!used.has(i))??preferred;used.add(index);statements.push(db.prepare('UPDATE arena_sellers SET avatar_index=? WHERE id=? AND station_id=? AND avatar_index IS NULL').bind(index,s.id,station));}
 for(let i=0;i<statements.length;i+=50)await db.batch(statements.slice(i,i+50));
}
