import { useEffect, useState } from "react";
import { ArrowLeft, Crown, LogOut, ShieldCheck, Users } from "lucide-react";
import { api, HttpError, send } from "./api";
import type { ArenaStation } from "../shared/arena-network";

type Account={authenticated:boolean;station?:ArenaStation;session_id?:string;sessions?:{id:string;created_at:string;expires_at:string}[]};
export default function ArenaAccount() {
  const [account,setAccount]=useState<Account|null>(null),[signup,setSignup]=useState(window.location.pathname.endsWith("join"));
  const [name,setName]=useState(""),[email,setEmail]=useState(""),[password,setPassword]=useState("");
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  async function load(){try{setAccount(await api<Account>("/arena/auth/session"));}catch(e){if(e instanceof HttpError && e.status===401)setAccount({authenticated:false});else setError((e as Error).message);}}
  useEffect(()=>{void load();},[]);
  async function act(task:()=>Promise<void>){if(busy)return;setBusy(true);setError("");try{await task();setPassword("");await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  const station=account?.station;
  return <div className="arena-page arena-theme"><header className="arena-page-header"><a href="/arena"><ArrowLeft /> Till Arenan</a><h1><Crown /> Stationskonto</h1><a href="/arena/superadmin"><ShieldCheck /> Superadmin</a></header>
    <main className="arena-account-layout"><section className="arena-panel arena-account-story"><span className="arena-eyebrow">SAMMA LAG. STÖRRE RESULTAT.</span><h2>Er egen Arena.</h2><p>Sälj mer tillsammans. Fira framsteg, följ lagets resultat och utmana andra stationer.</p><Users className="arena-account-emblem" aria-hidden="true" /><p>Stationer med en integrerad dashboard fortsätter använda sitt befintliga personalregister. Ett fristående stationskonto hanterar säljarna direkt i Arena-admin.</p></section>
      <section className="arena-panel">{error && <p role="alert" className="arena-error">{error}</p>}
        {!account ? <p role="status">Hämtar stationskontot…</p> : station ? <>
          <span className={`arena-status status-${station.status}`}>{station.status==="pending" ? "VÄNTAR PÅ GODKÄNNANDE" : station.status==="active" ? "AKTIV STATION" : "PAUSAD STATION"}</span><h2>{station.name}</h2><p>{station.email}</p>
          {station.status==="active" ? <div className="arena-page-actions"><a className="arena-gold-action" href="/arena">Öppna Arenan</a><a href="/arena/admin">Hantera aktiviteter & säljare</a><a href="/arena/groups">Gemensamma topplistor</a></div> : <p>{station.status==="pending" ? "Din station är skapad. Superadmin behöver godkänna den innan laget kan börja registrera." : "Kontakta Superadmin för att återaktivera stationen."}</p>}
          <h3>Stationens inloggningar</h3><p>Kassadatorn behåller sin inloggning. Du kan avsluta en inloggning här.</p><ul className="arena-session-list">{account.sessions?.map(s=><li key={s.id}><span>{s.id===account.session_id ? "Den här datorn" : "Annan inloggning"}<small>{new Date(s.created_at).toLocaleDateString("sv-SE")}</small></span><button disabled={busy} onClick={()=>void act(async()=>{await api("/arena/auth/revoke",send("POST",{session_id:s.id}));})}>Avsluta inloggning</button></li>)}</ul>
          <button className="arena-action" disabled={busy} onClick={()=>void act(async()=>{await api("/arena/auth/logout",{method:"POST"});setSignup(false);})}><LogOut size={18} /> Logga ut</button><button disabled={busy} className="arena-secondary-account" onClick={()=>void act(async()=>{await api("/arena/auth/logout",{method:"POST"});setSignup(false);})}>Logga in på ett annat stationskonto</button>
        </> : <form className="arena-form" onSubmit={e=>{e.preventDefault();void act(async()=>{await api(`/arena/auth/${signup ? "signup" : "login"}`,send("POST",signup ? {name,email,password}:{email,password}));});}}>
          <span className="arena-eyebrow">{signup ? "ETT NYTT LAG" : "VÄLKOMMEN TILLBAKA"}</span><h2>{signup ? "Anslut station" : "Logga in på stationen"}</h2>
          {signup && <label>Stationsnamn<input autoComplete="organization" value={name} onChange={e=>setName(e.target.value)} required maxLength={80} /></label>}
          <label>Stationsmejl<input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required maxLength={254} /></label>
          <label>Lösenord<input type="password" autoComplete={signup ? "new-password":"current-password"} value={password} onChange={e=>setPassword(e.target.value)} required minLength={12} maxLength={256} /></label>
          {signup && <small>Minst 12 tecken. Stationen blir väntande tills Superadmin godkänner den.</small>}
          <button className="arena-action" disabled={busy}>{busy ? "Vänta…" : signup ? "Skapa stationskonto" : "Logga in"}</button>
          <button type="button" disabled={busy} onClick={()=>{setSignup(!signup);setError("");}}>{signup ? "Har ni redan ett konto? Logga in" : "Anslut station"}</button>
        </form>}
      </section></main></div>;
}
