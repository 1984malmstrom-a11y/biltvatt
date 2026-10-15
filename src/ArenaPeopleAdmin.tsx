import {useState} from 'react';
import type {ArenaSeller} from '../shared/arena';
import ArenaAvatar from './ArenaAvatar';
import {normalizeArenaImage} from './arena-images';
import {api} from './api';
export default function ArenaPeopleAdmin({sellers,onSaved}:{sellers:ArenaSeller[];onSaved:()=>Promise<void>}) {
  const [busy,setBusy]=useState(''),[error,setError]=useState('');
  async function update(seller:ArenaSeller,file?:File,remove=false){if(busy)return;setBusy(seller.id);setError('');try{
    if(remove)await api(`/admin/arena/sellers/${seller.id}/portrait`,{method:'DELETE'});
    else if(file){const blob=await normalizeArenaImage(file,true);await api(`/admin/arena/sellers/${seller.id}/portrait`,{method:'POST',body:blob,headers:{'Content-Type':blob.type}});}
    await onSaved();
  }catch(e){setError((e as Error).message);}finally{setBusy('');}}
  return <section className="arena-panel arena-people-admin"><span className="arena-eyebrow">LAGETS ANSIKTEN</span><h2>Profilbilder</h2><p>En uppladdad profilbild följer säljaren i hela Arenan. Utan bild visas ett stabilt fiktivt porträtt. Använd bilder med personens godkännande.</p>{error && <p role="alert" className="arena-error">{error}</p>}<div className="arena-people-grid">{sellers.map(s=><article key={s.id}><ArenaAvatar id={s.id} name={s.name} imageUrl={s.profile_url} avatarIndex={s.avatar_index} className="arena-person-avatar" /><strong>{s.name}</strong><small>{s.profile_url?'Uppladdad profilbild':'Fiktivt Arena-porträtt'}</small><label className="arena-upload">{busy===s.id?'Bearbetar…':s.profile_url?'Byt profilbild':'Ladda upp profilbild'}<input aria-label={`Profilbild för ${s.name}`} type="file" accept="image/png,image/jpeg,image/webp" disabled={Boolean(busy)} onChange={e=>{void update(s,e.target.files?.[0]);e.target.value='';}} /></label>{s.profile_url && <button disabled={Boolean(busy)} onClick={()=>void update(s,undefined,true)}>Ta bort profilbild</button>}</article>)}</div></section>;
}
