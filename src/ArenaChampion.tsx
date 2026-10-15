import {memo} from 'react';
import ArenaAvatar,{useArenaShowcase} from './ArenaAvatar';
import type {AvatarIdentity} from './arena-avatars';
import {ArenaEmblem} from './ArenaBrand';
import {arenaChampion} from './arena-champions';
export default memo(function ArenaChampion({eventKey,className='arena-champion-art',identity}:{eventKey:string;className?:string;identity?:AvatarIdentity}){
 const showcase=useArenaShowcase();
 if(!showcase)return identity?<ArenaAvatar {...identity} champion className={className+' arena-real-champion'}/>:<span className={className+' arena-real-champion'} aria-hidden="true"><ArenaEmblem/></span>;
 const champion=arenaChampion(eventKey);
 return <span className={className} data-champion-kind="fictional-celebration-art" data-champion-id={champion.id} aria-hidden="true"><img src={champion.src} alt="" decoding="async" draggable={false}/></span>;
});
