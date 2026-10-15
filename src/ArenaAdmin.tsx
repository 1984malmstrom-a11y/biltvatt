import ArenaReports from "./ArenaReports";
import ArenaPeopleAdmin from "./ArenaPeopleAdmin";
import { useEffect, useState } from "react";
import { ArrowLeft, ImagePlus, Pencil, Plus, Save, Settings } from "lucide-react";
import { api, HttpError, send } from "./api";
import { ArenaActivityButton } from "./ArenaApp";
import type { ArenaActivity, ArenaBootstrap, ArenaCampaign, ArenaGoal, ArenaSeller } from "../shared/arena";
import { arenaNumber as num } from "../shared/arena";
import { arenaDecimalMoney, arenaMoney, parseArenaMoney } from "../shared/arena-money";
import { normalizeArenaImage } from "./arena-images";
import { arenaDay as day, arenaDateSpan, arenaPeriodDates, arenaPeriodLabel, arenaPeriodStatus, type ArenaPeriod } from "./arena-dates";

type Config = { activities: ArenaActivity[]; campaigns: ArenaCampaign[]; station_goals: ArenaGoal[]; personal_goals: ArenaGoal[];sellers?:ArenaSeller[] };
const blankActivity = (): ArenaActivity => ({ id: "", name: "", offer_text: "", price_text: "", category: "", points: 1, image_key: null, sort_order: 0, active: 1 });
const blankCampaign = () => ({ id: "", name: "", activity_id: "", start_date: day(), end_date: day(), target_count: "", target_points: "", active: 1 });
const blankGoal = () => ({ id: "", seller_id: "", period_type: "custom", start_date: day(), end_date: day(), target_points: 100 });

export default function ArenaAdmin() {
  const [authorized, setAuthorized] = useState<boolean | null>(null), [pin, setPin] = useState("");
  const [accountRequired,setAccountRequired]=useState(false),[seller,setSeller]=useState({id:"",name:"",color:"#49caff",active:1});
  const [config, setConfig] = useState<Config | null>(null), [bootstrap, setBootstrap] = useState<ArenaBootstrap | null>(null);
  const [tab, setTab] = useState("activities"), [activity, setActivity] = useState(blankActivity), [campaign, setCampaign] = useState(blankCampaign), [goal, setGoal] = useState(blankGoal);
  const [tbKronor,setTbKronor]=useState("0,00");
  const [campaignPeriod, setCampaignPeriod] = useState<ArenaPeriod>("custom");
  const [blob, setBlob] = useState<Blob | null>(null), [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  useEffect(() => {
    if (!blob) { setPreview(""); return; }
    const url = URL.createObjectURL(blob); setPreview(url); return () => URL.revokeObjectURL(url);
  }, [blob]);
  async function load() {
    try {
      // Bootstrap only syncs the existing station register; Arena has no separate staff editor.
      let b:ArenaBootstrap;
      try{b=await api<ArenaBootstrap>("/arena/bootstrap");}catch(e){if(e instanceof HttpError && [401,403].includes(e.status)){setAccountRequired(true);setAuthorized(false);return;}throw e;}
      const c = await api<Config>("/admin/arena/config");
      setBootstrap(b); setConfig(c); setAuthorized(true);
    } catch (e) { if (e instanceof HttpError && e.status === 401) setAuthorized(false); else setError((e as Error).message); }
  }
  useEffect(() => { void load(); }, []);
  async function action(task: () => Promise<void>) {
    if (busy) return; setBusy(true); setError(""); setNotice("");
    try { await task(); await load(); setNotice("Sparat. Arenan hämtar ändringarna automatiskt."); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function image(file?: File) {
    if (!file) return; setBusy(true); setError("");
    try { setBlob(await normalizeArenaImage(file)); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const field = (label: string, value: string | number, onChange: (v: string) => void, type = "text", required = false) => <label>{label}<input type={type} value={value} onChange={e => onChange(e.target.value)} required={required} maxLength={type === "text" ? 80 : undefined} step={type === "number" ? "0.01" : undefined} min={type === "number" ? 0 : undefined} /></label>;
  const save = <button className="arena-action" disabled={busy}><Save size={18} /> {busy ? "Sparar…" : "Spara"}</button>;
  return <div className="arena-admin arena-theme"><header className="arena-admin-header"><a href="/arena"><ArrowLeft /> Till Arenan</a><h1><Settings /> Arena-admin</h1><a href={bootstrap?.station.kind==="arena" ? "/arena/account":"/station/admin"}>{bootstrap?.station.kind==="arena" ? "Stationskonto":"Stationsadmin"}</a></header>
    {error && <p className="arena-error" role="alert">{error}</p>}{notice && <p className="arena-notice" role="status">{notice}</p>}
    {authorized === false && accountRequired ? <section className="arena-login arena-panel"><h2>Stationskonto krävs</h2><p>Logga in på ett aktivt stationskonto. Väntande stationer behöver godkännas först.</p><a className="arena-gold-action" href="/arena/account">Logga in / Anslut station</a></section> : authorized === false ? <form className="arena-login arena-panel" onSubmit={e => { e.preventDefault(); void action(async () => { await api("/admin/login", send("POST", { pin })); setPin(""); }); }}>
      <h2>Logga in som stationsadmin</h2><p>Samma administratörssession som i Tvättligan och stationsdashboarden.</p><label>Administratörs-PIN<input type="password" inputMode="numeric" autoComplete="current-password" value={pin} onChange={e => setPin(e.target.value)} required maxLength={12} /></label><button className="arena-action" disabled={busy}>Logga in</button>
    </form> : !config ? <p role="status">Hämtar administrationen…</p> : <>
      <nav className="arena-admin-tabs" aria-label="Arena-administration">{[["portraits", "Profilbilder"],["reports", "Rapporter"],["activities", "Aktiviteter"], ["campaigns", "Kampanj / fokus"], ["goals", "Stationsmål & personliga mål"],...(bootstrap?.station.kind==="arena" ? [["sellers","Säljare"]]:[])].map(([value, label]) => <button key={value} aria-pressed={tab === value} onClick={() => { setTab(value); setNotice(""); }}>{label}</button>)}{bootstrap?.station.kind!=="arena" && <a href="/">Personal hanteras i Tvättligan → Admin → Personal</a>}</nav>
      {tab==="reports" && <ArenaReports sellers={bootstrap?.sellers??[]} />}
      {tab==="portraits" && <ArenaPeopleAdmin sellers={bootstrap?.sellers??[]} onSaved={load} />}
      {tab==="sellers" && bootstrap?.station.kind==="arena" && <div className="arena-admin-grid"><section className="arena-panel"><h2>Stationens säljare</h2><p>Arkivering bevarar säljarens historik.</p><button className="arena-action" onClick={()=>setSeller({id:"",name:"",color:"#49caff",active:1})}>Ny säljare</button><ul className="arena-admin-list">{config.sellers?.map(s=><li key={s.id}><button aria-label={`Redigera säljare: ${s.name}`} onClick={()=>setSeller({id:s.id,name:s.name,color:s.color,active:s.active})}>{s.name}<small>{s.active ? "Aktiv":"Arkiverad"}</small></button></li>)}</ul></section><form className="arena-panel arena-form" onSubmit={e=>{e.preventDefault();void action(async()=>{const {id,...values}=seller;const r=await api<{id:string}>(`/admin/arena/sellers${id ? `/${id}`:""}`,send(id?"PATCH":"POST",values));setSeller(s=>({...s,id:r.id}));});}}><h2>{seller.id ? "Redigera säljare":"Ny säljare"}</h2><label>Säljarnamn<input value={seller.name} onChange={e=>setSeller(s=>({...s,name:e.target.value}))} maxLength={80} required /></label><label>Färg<input type="color" value={seller.color} onChange={e=>setSeller(s=>({...s,color:e.target.value}))} /></label><label className="arena-check"><input type="checkbox" checked={seller.active===1} onChange={e=>setSeller(s=>({...s,active:e.target.checked ? 1:0}))} />Aktiv säljare</label>{save}</form></div>}
      {tab === "activities" && <div className="arena-admin-grid"><section className="arena-panel"><h2>Aktiviteter</h2><p>Välj en post för att redigera. Arkivering bevarar alla historiska registreringar.</p><button className="arena-action" onClick={() => { setActivity(blankActivity()); setTbKronor("0,00");setBlob(null); }}><Plus size={18} /> Ny aktivitet</button>
        <ul className="arena-admin-list">{config.activities.map(a => <li key={a.id}><button className="arena-edit-item" aria-label={`Redigera aktivitet: ${a.name}`} aria-pressed={activity.id === a.id} onClick={() => { setActivity(a);setTbKronor(arenaDecimalMoney(a.tb_ore??0)); setBlob(null); }}><span>{a.name}<small>{a.category || "Utan kategori"} · Ordning {a.sort_order + 1} · {a.active ? "Aktiv" : "Arkiverad"}</small></span><strong>{num(a.points)} p<small>{arenaMoney(a.tb_ore??0)} TB</small></strong><Pencil className="arena-edit-icon" aria-hidden="true" /></button></li>)}</ul>
      </section><form className="arena-panel arena-form" onSubmit={e => { e.preventDefault(); void action(async () => {
        let image_key = activity.image_key;
        if (blob) {
          const response = await fetch("/api/admin/arena/activity-images", { method: "POST", body: blob, headers: { "Content-Type": blob.type }, credentials: "same-origin" });
          const result = await response.json() as { id: string; error?: string };
          if (!response.ok) throw new Error(result.error || "Bilden kunde inte laddas upp.");
          image_key = result.id; setActivity(a => ({ ...a, image_key })); setBlob(null);
        }
        const { id,tb_ore:_tb, ...values } = activity;
        const made = await api<{ id: string }>(`/admin/arena/activities${id ? `/${id}` : ""}`, send(id ? "PATCH" : "POST", { ...values, image_key,tb_kronor:tbKronor }));
        setActivity(a => ({ ...a, id: made.id, image_key }));
      }); }}><h2>{activity.id ? "Redigera aktivitet" : "Skapa aktivitet"}</h2>
        {field("Namn", activity.name, name => setActivity(a => ({ ...a, name })), "text", true)}
        <div className="arena-form-row">{field("Erbjudandetext", activity.offer_text, offer_text => setActivity(a => ({ ...a, offer_text })))}{field("Pristext", activity.price_text, price_text => setActivity(a => ({ ...a, price_text })))}</div>
        <div className="arena-form-row">{field("Poäng", activity.points, v => setActivity(a => ({ ...a, points: Number(v) })), "number", true)}<label>Ordning<input type="number" min="1" step="1" required value={activity.sort_order + 1} onChange={e => setActivity(a => ({ ...a, sort_order: Number(e.target.value) - 1 }))} /></label></div>
        <div className="arena-form-row"><label>TB (kr)<input inputMode="decimal" value={tbKronor} onChange={e=>setTbKronor(e.target.value)} required maxLength={12} /></label><label>Synlig badge<select aria-label="Synlig badge" value={activity.display_mode??"points"} onChange={e=>setActivity(a=>({...a,display_mode:e.target.value as "points" | "tb"}))}><option value="points">POÄNG</option><option value="tb">TB</option></select></label></div>
        <small>TB är stationens uppskattade marginaleffekt från mersälj, inte automatisk kassadata. Både poäng och TB sparas vid varje ny registrering.</small>
        <label>Kategori<input value={activity.category} maxLength={40} list="arena-categories" onChange={e => setActivity(a => ({ ...a, category: e.target.value }))} /><datalist id="arena-categories">{[...new Set(config.activities.map(a => a.category).filter(Boolean))].map(c => <option key={c}>{c}</option>)}</datalist></label>
        <label className="arena-check"><input type="checkbox" checked={activity.active === 1} onChange={e => setActivity(a => ({ ...a, active: e.target.checked ? 1 : 0 }))} /> Aktiv (avmarkera för att arkivera)</label>
        <label className="arena-upload"><ImagePlus /> Produktbild<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e => void image(e.target.files?.[0])} /></label><small>Hela motivet bevaras, centreras och komprimeras med luft runt produkten.</small>
        {(blob || activity.image_key) && <button type="button" onClick={() => { setBlob(null); setActivity(a => ({ ...a, image_key: null })); }}>Ta bort bilden</button>}
        <div className="arena-preview"><ArenaActivityButton activity={{ ...activity,tb_ore:parseArenaMoney(tbKronor)??activity.tb_ore, name: activity.name || "AKTIVITET" }} imageUrl={preview} /></div><small>Förhandsvisning – ingen registrering görs.</small>{save}
      </form></div>}
      {tab === "campaigns" && <div className="arena-admin-grid"><section className="arena-panel"><h2>Kampanjer</h2><p>Välj en kampanj för att redigera. Inaktivering bevarar försäljningshistoriken.</p><button className="arena-action" onClick={() => { setCampaign(blankCampaign()); setCampaignPeriod("custom"); }}><Plus size={18} /> Ny kampanj</button><ul className="arena-admin-list">{config.campaigns.map(c => <li key={c.id}><button className="arena-edit-item" aria-label={`Redigera kampanj: ${c.name}`} aria-pressed={campaign.id === c.id} onClick={() => { setCampaignPeriod("custom"); setCampaign({ id: c.id, name: c.name, activity_id: c.activity_id, start_date: day(new Date(c.start_at)), end_date: day(new Date(Date.parse(c.end_at) - 1)), target_count: c.target_count === null ? "" : String(c.target_count), target_points: c.target_points === null ? "" : String(c.target_points), active: c.active }); }}><span>{c.name}<small>{config.activities.find(a => a.id === c.activity_id)?.name || "Historisk aktivitet"}</small><small>{[c.target_points !== null ? `${num(c.target_points)} p` : "", c.target_count !== null ? `${num(c.target_count)} st` : ""].filter(Boolean).join(" · ") || "Fokus utan poäng-/antalsmål"}</small><small>{arenaDateSpan(day(new Date(c.start_at)), day(new Date(Date.parse(c.end_at) - 1)))} · {c.active ? `Aktiv · ${arenaPeriodStatus(day(new Date(c.start_at)), day(new Date(Date.parse(c.end_at) - 1)))}` : "Inaktiv"}</small></span><Pencil className="arena-edit-icon" aria-hidden="true" /></button></li>)}</ul></section>
        <form className="arena-panel arena-form" onSubmit={e => { e.preventDefault(); void action(async () => {
          const { id, ...values } = campaign;
          const result = await api<{ id: string }>(`/admin/arena/campaigns${id ? `/${id}` : ""}`, send(id ? "PATCH" : "POST", { ...values, target_count: values.target_count ? Number(values.target_count) : null, target_points: values.target_points ? Number(values.target_points) : null })); setCampaign(c => ({ ...c, id: result.id }));
        }); }}><h2>{campaign.id ? "Redigera kampanj" : "Ny kampanj / fokus"}</h2>
          {field("Kampanjnamn", campaign.name, name => setCampaign(c => ({ ...c, name })), "text", true)}<label>Fokusaktivitet<select required value={campaign.activity_id} onChange={e => setCampaign(c => ({ ...c, activity_id: e.target.value }))}><option value="">Välj aktivitet</option>{config.activities.filter(a => a.active || a.id === campaign.activity_id).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <label>Period<select value={campaignPeriod} onChange={e => { const type = e.target.value as ArenaPeriod; setCampaignPeriod(type); if (type !== "custom") setCampaign(c => ({ ...c, ...arenaPeriodDates(type) })); }}><option value="week">Vecka</option><option value="month">Månad</option><option value="custom">Valfri period</option></select></label>
          <div className="arena-form-row">{field("Startdatum", campaign.start_date, start_date => { setCampaignPeriod("custom"); setCampaign(c => ({ ...c, start_date })); }, "date", true)}{field("Slutdatum (inklusive)", campaign.end_date, end_date => { setCampaignPeriod("custom"); setCampaign(c => ({ ...c, end_date })); }, "date", true)}</div>
          <div className="arena-form-row">{field("Mål i antal", campaign.target_count, target_count => setCampaign(c => ({ ...c, target_count })), "number")}{field("Mål i poäng", campaign.target_points, target_points => setCampaign(c => ({ ...c, target_points })), "number")}</div><small>Ange antal och/eller poäng. Hela den valda perioden räknas.</small>
          <label className="arena-check"><input type="checkbox" checked={campaign.active === 1} onChange={e => setCampaign(c => ({ ...c, active: e.target.checked ? 1 : 0 }))} /> Aktiv kampanj (avmarkera för att inaktivera)</label><small>Inaktiva kampanjer visas inte i Arenan. Historiken bevaras.</small>{save}
        </form></div>}
      {tab === "goals" && <div className="arena-admin-grid"><section className="arena-panel"><h2>Lagets & säljarnas mål</h2><p>Välj ett mål för att redigera. Borttagning av ett mål bevarar registreringar och poänghistorik.</p><button className="arena-action" onClick={() => setGoal(blankGoal())}><Plus size={18} /> Nytt mål</button><ul className="arena-admin-list">{[...config.station_goals, ...config.personal_goals].map(g => <li key={g.id}><button className="arena-edit-item" aria-label={`Redigera mål: ${g.seller_id ? bootstrap?.sellers.find(s => s.id === g.seller_id)?.name || "Historisk säljare" : "Hela stationen"}`} aria-pressed={goal.id === g.id} onClick={() => setGoal({ id: g.id, seller_id: g.seller_id ?? "", period_type: g.period_type, start_date: g.start_date, end_date: g.end_date, target_points: g.target_points })}><span>{g.seller_id ? bootstrap?.sellers.find(s => s.id === g.seller_id)?.name || "Historisk säljare" : "Hela stationen"}<small>{arenaPeriodLabel(g.start_date, g.end_date, g.period_type)}</small><small>{arenaPeriodStatus(g.start_date, g.end_date)}</small></span><strong>{num(g.target_points)} p</strong><Pencil className="arena-edit-icon" aria-hidden="true" /></button><button aria-label="Ta bort mål" disabled={busy} onClick={() => void action(async () => { await api(`/admin/arena/goals/${g.id}`, { method: "DELETE" }); if (goal.id === g.id) setGoal(blankGoal()); })}>Ta bort</button></li>)}</ul></section>
        <form className="arena-panel arena-form" onSubmit={e => { e.preventDefault(); void action(async () => {
          const { id, ...values } = goal;
          const result = await api<{ id: string }>(`/admin/arena/goals${id ? `/${id}` : ""}`, send(id ? "PATCH" : "POST", { ...values, seller_id: values.seller_id || null })); setGoal(g => ({ ...g, id: result.id }));
        }); }}><h2>{goal.id ? "Redigera mål" : "Sätt ett mål"}</h2><label>Vem gäller målet?<select value={goal.seller_id} disabled={Boolean(goal.id)} onChange={e => setGoal(g => ({ ...g, seller_id: e.target.value }))}><option value="">Hela stationen</option>{bootstrap?.sellers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}{goal.seller_id && !bootstrap?.sellers.some(s => s.id === goal.seller_id) && <option value={goal.seller_id}>Historisk säljare</option>}</select></label>
          <label>Period<select value={goal.period_type} onChange={e => {
            const type = e.target.value as ArenaPeriod;
            setGoal(g => ({ ...g, period_type: type, ...(type === "custom" ? {} : arenaPeriodDates(type)) }));
          }}><option value="week">Vecka</option><option value="month">Månad</option><option value="custom">Valfri period</option></select></label>
          <div className="arena-form-row">{field("Startdatum", goal.start_date, start_date => setGoal(g => ({ ...g, start_date })), "date", true)}{field("Slutdatum", goal.end_date, end_date => setGoal(g => ({ ...g, end_date })), "date", true)}</div>
          {field("Mål i poäng", goal.target_points, v => setGoal(g => ({ ...g, target_points: Number(v) })), "number", true)}{save}
        </form></div>}
    </>}
  </div>;
}
