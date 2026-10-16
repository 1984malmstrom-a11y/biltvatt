export type ArenaStation = {id:string; name:string; email:string | null; status:"pending" | "active" | "suspended"; kind:"integrated" | "arena"};
export type ArenaMetric="points" | "tb" | "count";
export type ArenaStationStanding={points_milli?:number|null;base_milli?:number|null;raw_points?:number;id:string;name:string;rank:number;points:number;tb_ore:number;count:number;unknown_tb_count:number;active_sellers?:number;match_points?:number};
export type ArenaGroup={id:string;name:string;station_ids?:string[]};
export type ArenaGroupBoard={name:string;metric:ArenaMetric;normalization:"total";period?:"today" | "week" | "month" | "custom";range:{start:string;end:string;from:string;to:string};standings:ArenaStationStanding[];people?:ArenaNetworkPerson[];recent?:ArenaNetworkRecent[]};
export type ArenaNetworkPerson=ArenaStationStanding & {station_id:string;station_name:string;profile_url?:string|null;avatar_index?:number|null};
export type ArenaNetworkRecent={id:string;seller_id:string;seller_name:string;station_id:string;station_name:string;profile_url?:string|null;avatar_index?:number|null;activity_name:string;points_awarded:number;tb_ore_awarded:number|null;display_mode:'points'|'tb';registered_at:string};
export type ArenaPeopleBoard=ArenaGroupBoard & {people:ArenaNetworkPerson[];recent:ArenaNetworkRecent[]};
