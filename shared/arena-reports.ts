export type ArenaReportType='diploma'|'summary'|'seller'|'station'|'fight';
export type ReportTotals={count:number;points:number;tb_ore:number;unknown_tb_count:number};
export type ReportIdentity={id:string;name:string;avatar_index?:number|null;profile_url?:string|null};
export type ReportRow=ReportTotals & ReportIdentity & {rank:number;match_points?:number};
export type ArenaReportSnapshot={competition?:import('./arena-competitions').Competition;version:1;id:string;type:ArenaReportType;title:string;created_at:string;period:{start:string;end:string};station:{id:string;name:string}|null;subject?:ReportIdentity;activity?:{id:string;name:string};totals:ReportTotals;leaderboard:ReportRow[];activities:{name:string;count:number;points:number;tb_ore:number}[];goals:{name:string;points:number;target_points:number}[];winner_names:string[];metric:'points'|'tb'|'count';source:string;scoring_mode?:'daily';day_win_points?:number;day_tie_points?:number};
export type ArenaReportListItem={id:string;report_type:ArenaReportType;title:string;created_at:string;station_id:string|null;fight_id:string|null};
export const reportTypes:[ArenaReportType,string][]=[['diploma','Vinnardiplom'],['summary','Resultatsammanställning'],['seller','Individuell säljarrapport'],['station','Stationsrapport'],['fight','Butiksfight-rapport']];
