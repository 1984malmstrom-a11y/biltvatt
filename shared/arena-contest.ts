export type ContestKind='individual'|'station'|'fight'|'championship';
export type ContestLevel='local'|'district'|'region'|'national'|'selected';
export type ContestCategory={id:string;name:string;points_milli:number};
export type CustomerFlow={station_id:string;customers_milli:number;source:string;period_start:string;period_end:string;recorded_at:string;id:string};
export type ContestRules={kind:ContestKind;organization_id:string;level:ContestLevel;region_id?:string;district_id?:string;seller_ids?:string[];categories:ContestCategory[];fair_play?:{reference_milli:number;max_factor_milli:number;confirmed:boolean};flows?:CustomerFlow[];people?:{id:string;name:string;station_id:string}[]};
export type ContestEntry={id:string;name:string;station_id:string;station_name:string;rank:number;count:number;points:number;raw_points:number;base_milli:number;adjusted_milli:number;tb_ore:number;unknown_tb_count:number};
export const contestKindLabels={individual:'Individ',station:'Station',fight:'Butiksfight',championship:'Mästerskap'};
export const contestLevelLabels={local:'Lokal',district:'Distrikt',region:'Region',national:'Nationell',selected:'Utvalda deltagare'};
// Integer milli-points; round HALF UP once per sale, then sum integers.
// Factor is an exact rational, never a rounded floating point intermediary.
export function fairPlayScore(base_milli:number,customers_milli:number,reference_milli:number,max_factor_milli:number){
 for(const n of [base_milli,customers_milli,reference_milli,max_factor_milli])if(!Number.isSafeInteger(n))throw Error('FAIR PLAY kräver heltal i tusendelar.');
 if(base_milli<0||base_milli>10000000||customers_milli<=0||customers_milli>1000000000||reference_milli<=0||reference_milli>1000000000||max_factor_milli<100||max_factor_milli>10000)throw Error('Ogiltiga FAIR PLAY-värden. Maxfaktor ska vara 0,1–10.');
 let numerator=BigInt(reference_milli),denominator=BigInt(customers_milli);
 if(numerator*1000n>BigInt(max_factor_milli)*denominator){numerator=BigInt(max_factor_milli);denominator=1000n;}
 const n=BigInt(base_milli)*numerator;
 return Number((n*2n+denominator)/(2n*denominator));
}
export function contestSalePoints(r:ContestRules,station:string,base:number){const f=r.fair_play;if(!f)return base;const flow=r.flows?.find(s=>s.station_id===station);if(!flow)throw Error('Fryst kundsnitt saknas för stationen.');return fairPlayScore(base,flow.customers_milli,f.reference_milli,f.max_factor_milli);}
