export type ArenaStation = {id:string; name:string; email:string | null; status:"pending" | "active" | "suspended"; kind:"integrated" | "arena"};
export type ArenaMetric="points" | "tb" | "count";
export type ArenaStationStanding={id:string;name:string;rank:number;points:number;tb_ore:number;count:number;unknown_tb_count:number;active_sellers?:number;match_points?:number};
export type ArenaGroup={id:string;name:string;station_ids?:string[]};
export type ArenaGroupBoard={name:string;metric:ArenaMetric;normalization:"total";period?:"today" | "week" | "month" | "custom";range:{start:string;end:string;from:string;to:string};standings:ArenaStationStanding[]};
