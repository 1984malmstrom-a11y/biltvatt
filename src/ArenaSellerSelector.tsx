import {memo,useImperativeHandle,useState,type CSSProperties,type ComponentType,type Ref} from "react";
import {Check} from "lucide-react";
import type {ArenaActivity,ArenaSeller} from "../shared/arena";
import {arenaReward} from "../shared/arena-money";
import ArenaDialog from "./ArenaDialog";
import ArenaAvatar from "./ArenaAvatar";
export type ArenaSellerSelection={activity:ArenaActivity;requestId:string;sellerId?:string};
export type ArenaSellerSelectorHandle={select:(next:ArenaSellerSelection|null)=>void};
// The touch-critical dialog owns its rendering. Opening it does not wait for
// a render of the full Arena, background stats or an outgoing celebration.
export default memo(function ArenaSellerSelector({ref,sellers=[],busy,error,onRegister,onClose,Product}:{ref:Ref<ArenaSellerSelectorHandle>;sellers?:ArenaSeller[];busy:boolean;error:string;onRegister:(id:string)=>void;onClose:()=>void;Product:ComponentType<{activity:ArenaActivity}>}) {
 const [attempt,setAttempt]=useState<ArenaSellerSelection|null>(null);
 useImperativeHandle(ref,()=>({select:setAttempt}),[]);
 if(!attempt)return null;
 return <ArenaDialog title="Vem gjorde försäljningen?" className="arena-dialog-sellers" eyebrow="EN FÖRSÄLJNING. TVÅ TRYCK." locked={busy || Boolean(attempt.sellerId)} onClose={onClose}>
      <div className="arena-modal-summary"><span className="arena-selected-product" aria-hidden="true"><Product activity={attempt.activity} /></span><span>{attempt.activity.name}<small>VALD AKTIVITET</small></span><strong>{arenaReward(attempt.activity)}</strong></div>
      <div className="arena-sellers">{sellers.map(seller => <button key={seller.id} aria-label={seller.name} aria-pressed={attempt.sellerId===seller.id} onClick={() => onRegister(seller.id)} disabled={busy || Boolean(attempt.sellerId)} style={{ "--seller-color": seller.color } as CSSProperties}><ArenaAvatar id={seller.id} name={seller.name} imageUrl={seller.profile_url} avatarIndex={seller.avatar_index} className="arena-seller-initial" /><span className="arena-seller-name">{seller.name}</span></button>)}</div>
      <p className="arena-seller-hint"><Check aria-hidden="true" /> Tryck på ditt namn – sedan är det klart.</p>
      {!sellers.length && <p>Lägg till aktiva säljare i stationens personalregister.</p>}
      {busy && <p role="status">Sparar…</p>}{error && <p className="arena-error" role="alert">{error}</p>}
      {error && attempt.sellerId && <button className="arena-action" onClick={() => onRegister(attempt.sellerId!)} disabled={busy}>Försök igen</button>}
    </ArenaDialog>;
});
