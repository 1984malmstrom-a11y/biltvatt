import {memo} from 'react';
import {arenaChampion} from './arena-champions';
export default memo(function ArenaChampion({eventKey,className='arena-champion-art'}:{eventKey:string;className?:string}){
 const champion=arenaChampion(eventKey);
 return <span className={className} data-champion-kind="fictional-celebration-art" data-champion-id={champion.id} aria-hidden="true"><img src={champion.src} alt="" decoding="async" draggable={false}/></span>;
});
