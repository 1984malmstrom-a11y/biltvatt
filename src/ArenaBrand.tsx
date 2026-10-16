import {arenaEmblemPaths} from '../shared/arena-emblem';
export function ArenaEmblem({className='arena-brand-mark'}:{className?:string}){
 return <svg className={className} viewBox="0 0 44 44" aria-hidden="true">{arenaEmblemPaths.map(d=><path key={d} d={d}/>)}</svg>;
}
