import {createContext,useContext,type ReactNode} from 'react';
export const isMultistation=(stationIds:readonly string[])=>new Set(stationIds.filter(Boolean)).size>1;
const StationContext=createContext(false);
// Local is the default. The enclosing board/event supplies its complete set of
// station IDs, even when the visible rows happen to come from only one station.
export function ArenaPersonContext({stationIds,children}:{stationIds:readonly string[];children:ReactNode}){
 return <StationContext.Provider value={isMultistation(stationIds)}>{children}</StationContext.Provider>;
}
export function ArenaPersonName({name,stationName}:{name:string;stationName?:string|null}){
 const multistation=useContext(StationContext);
 return <span className="arena-person-name"><strong>{name}</strong>{multistation&&stationName&&<small className="arena-person-station">{stationName}</small>}</span>;
}
