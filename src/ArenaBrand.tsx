export type ArenaCustomerBrand={name:string;logoAsset:string;enabled:boolean};
// Presentation configuration only: no customer branding is stored in sale data.
// UI cutout derived from the customer's attached PNG; no external logo source.
export const arenaCustomerBrand:ArenaCustomerBrand={name:'Preem',logoAsset:'/arena-brand/preem-customer.webp',enabled:true};
export function ArenaEmblem({className='arena-brand-mark'}:{className?:string}){
 return <svg className={className} viewBox="0 0 44 44" aria-hidden="true"><path d="M3 38 21 4l19 34h-9L21 19 12 38Z"/><path d="m17 29 14 9h-9l-9-6Z"/></svg>;
}
export function ArenaCustomerBrandSlot({brand=arenaCustomerBrand,compact=false}:{brand?:ArenaCustomerBrand|null;compact?:boolean}){
 if(!brand?.enabled)return null;
 return <div className={`arena-customer-brand${compact?' is-compact':''}`} aria-label={`Kundpartner: ${brand.name}`}><span>KUNDPARTNER</span><img src={brand.logoAsset} alt={brand.name} decoding="async"/></div>;
}
