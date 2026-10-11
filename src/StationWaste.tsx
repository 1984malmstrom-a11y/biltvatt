import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { api, send } from "./api";
import { sortWaste, wasteStatus, wasteStatusLabel, type WasteItem } from "../shared/waste";
import { stockholmToday } from "../shared/handbook";
import "./waste.css";

function formatDate(day: string) { return new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", timeZone: "Europe/Stockholm" }).format(new Date(`${day}T12:00:00Z`)); }
export default function StationWaste() {
  const [items, setItems] = useState<WasteItem[]>([]);
  const [today, setToday] = useState(stockholmToday);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"active" | "history">("active");
  const [name, setName] = useState("");
  const [expires, setExpires] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const load = useCallback(async () => { try { const result = await api<{ items: WasteItem[] }>("/station/waste"); setItems(result.items); setError(""); } catch (cause) { setError((cause as Error).message); } }, []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { setToday(stockholmToday()); if (document.visibilityState === "visible") void load(); }, 30000);
    const focus = () => { setToday(stockholmToday()); void load(); };
    window.addEventListener("focus", focus);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", focus); };
  }, [load]);
  useEffect(() => {
    if (!open) return;
    const former = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = document.getElementById("root");
    const previousInert = root?.inert ?? false;
    const previousOverflow = document.body.style.overflow;
    if (root) root.inert = true;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]),input:not([disabled])")].filter((element) => element.getClientRects().length);
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("keydown", escape); if (root) root.inert = previousInert; document.body.style.overflow = previousOverflow; former?.focus(); };
  }, [open]);
  const active = sortWaste(items.filter((item) => !item.resolved));
  const history = sortWaste(items.filter((item) => item.resolved));
  async function mutate(item: WasteItem, resolved: boolean) {
    if (busy) return;
    setBusy(true); setError("");
    try { await api(`/station/waste/${item.id}`, send("PUT", { product_name: item.product_name, expires_on: item.expires_on, resolved, expected_revision: item.revision })); await load(); }
    catch (cause) { await load(); setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try {
      const row = items.find((item) => item.id === editing);
      if (row) await api(`/station/waste/${row.id}`, send("PUT", { product_name: name, expires_on: expires, resolved: Boolean(row.resolved), expected_revision: row.revision }));
      else await api("/station/waste", send("POST", { product_name: name, expires_on: expires }));
      setName(""); setExpires(""); setEditing(null); await load();
    } catch (cause) { await load(); setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function remove(item: WasteItem) {
    if (!window.confirm(`Ta bort ${item.product_name} från Svinnlistan?`)) return;
    setBusy(true); setError("");
    try { await api(`/station/waste/${item.id}`, send("DELETE", { expected_revision: item.revision })); await load(); }
    catch (cause) { await load(); setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  const row = (item: WasteItem, full = false) => {
    const status = wasteStatus(item.expires_on, today);
    return <div className={`waste-row waste-${status}`} key={item.id}>
      <button className="waste-check" aria-label={`${item.resolved ? "Ångra åtgärdad" : "Markera åtgärdad"}: ${item.product_name}`} aria-pressed={Boolean(item.resolved)} disabled={busy} onClick={() => void mutate(item, !item.resolved)}>{item.resolved && <Check size={16} />}</button>
      <div className="waste-row-copy"><strong>{item.product_name}</strong>{!item.resolved && status !== "later" && <small>{wasteStatusLabel[status]}</small>}</div>
      <time dateTime={item.expires_on}>{formatDate(item.expires_on)}</time>
      {full && <div className="waste-row-actions"><button aria-label={`Redigera ${item.product_name}`} onClick={() => { setEditing(item.id); setName(item.product_name); setExpires(item.expires_on); }}><Pencil size={15} /></button><button aria-label={`Ta bort ${item.product_name}`} onClick={() => void remove(item)}><Trash2 size={15} /></button></div>}
    </div>;
  };
  return <><section className="v2-panel v2-waste" aria-labelledby="waste-heading"><div className="v2-panel-head"><h2 id="waste-heading">SVINNLISTAN</h2><span>{active.length} aktiva</span></div><div className="waste-preview">{active.length ? active.slice(0, 5).map((item) => row(item)) : <p className="v2-panel-empty">Inga produkter att åtgärda.</p>}</div><button className="waste-more" onClick={() => setOpen(true)}>Se hela listan →</button>{error && <p className="waste-error" role="alert">{error}</p>}</section>
    {open && createPortal(<div className="waste-overlay"><section className="waste-dialog" role="dialog" aria-modal="true" aria-labelledby="waste-dialog-heading" ref={dialogRef}><header><div><span>PREEM TINGSRYD</span><h2 id="waste-dialog-heading">Svinnlistan</h2></div><button ref={closeRef} aria-label="Stäng Svinnlistan" onClick={() => setOpen(false)}><X /></button></header><div className="waste-body"><div className="waste-tabs" role="tablist" aria-label="Produktstatus"><button role="tab" aria-selected={tab === "active"} onClick={() => setTab("active")}>Aktiva ({active.length})</button><button role="tab" aria-selected={tab === "history"} onClick={() => setTab("history")}>Åtgärdade ({history.length})</button></div><form className="waste-form" onSubmit={(event) => void save(event)}><label>Produktnamn<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={180} /></label><label>Utgångsdatum<input type="date" value={expires} onChange={(event) => setExpires(event.target.value)} required /></label><button type="submit" disabled={busy}><Plus size={17} /> {editing ? "Spara ändring" : "Lägg till produkt"}</button>{editing && <button type="button" onClick={() => { setEditing(null); setName(""); setExpires(""); }}>Avbryt</button>}</form><div className="waste-list">{(tab === "active" ? active : history).length ? (tab === "active" ? active : history).map((item) => row(item, true)) : <p>Inga produkter här ännu.</p>}</div>{error && <p className="waste-error" role="alert">{error}</p>}</div></section></div>, document.body)}
  </>;
}
