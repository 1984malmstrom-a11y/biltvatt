import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ChevronRight, ClipboardCheck, Croissant, LockKeyhole, X } from "lucide-react";
import { api, send, HttpError } from "./api";
import { HANDBOOK_KINDS, HANDBOOK_LABELS, WEEKDAYS, WEEKDAY_LABELS, stockholmWeekday, type HandbookContent, type HandbookKind, type Weekday } from "../shared/handbook";

export type LiveHandbook = { kind: HandbookKind; id: string; title: string; description: string; content: HandbookContent; day: string; checks: { item_id: string; done: number; revision: number }[] };
type Summary = { kind: HandbookKind; title: string | null; description: string | null; available: boolean };
const icon = { bakeoff: Croissant, opening: ClipboardCheck, closing: LockKeyhole };

export function HandbookDocumentView({ document, preview = false }: { document: LiveHandbook; preview?: boolean }) {
  const [selectedDay, setSelectedDay] = useState<Weekday>(() => stockholmWeekday());
  const [snapshot, setSnapshot] = useState(document);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  useEffect(() => { setSnapshot(document); setSelectedDay(stockholmWeekday()); }, [document]);
  const refresh = useCallback(async () => {
    if (preview) return;
    try { setSnapshot(await api<LiveHandbook>(`/station/handbook/${document.kind}`)); }
    catch (cause) { setError((cause as Error).message); }
  }, [document.kind, preview]);
  useEffect(() => {
    if (preview) return;
    const timer = window.setInterval(() => void refresh(), 15000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [refresh, preview]);
  const checks = new Map(snapshot.checks.map((row) => [row.item_id, row]));
  const items = snapshot.content.blocks.filter((block) => block.type === "check");
  const done = items.filter((block) => checks.get(block.id)?.done).length;
  async function toggle(id: string) {
    if (preview || saving) return;
    setError("");
    setSaving(id);
    try {
      const current = checks.get(id);
      await api(`/station/handbook/${snapshot.kind}/checks/${id}`, send("PUT", {
        day: snapshot.day, done: !current?.done, expected_revision: current?.revision ?? 0,
      }));
      await refresh();
    } catch (cause) {
      setError((cause as Error).message);
      await refresh();
    } finally { setSaving(null); }
  }
  return <div className="hb-document">
    <div className="hb-document-intro"><span className="hb-eyebrow">PERSONALPÄRMEN</span><h2>{snapshot.title}</h2>{snapshot.description && <p>{snapshot.description}</p>}</div>
    {snapshot.kind === "bakeoff" ? <>
      <div className="hb-days" role="tablist" aria-label="Veckodag">{WEEKDAYS.map((day, index) => <button key={day} role="tab" aria-selected={selectedDay === day} onClick={() => setSelectedDay(day)}>{WEEKDAY_LABELS[index]}</button>)}</div>
      <div className="hb-day-table" role="tabpanel"><h3>{WEEKDAY_LABELS[WEEKDAYS.indexOf(selectedDay)]}</h3>{snapshot.content.days[selectedDay].length ? <table><thead><tr><th>Produkt</th><th>Antal</th></tr></thead><tbody>{snapshot.content.days[selectedDay].map((row, index) => <tr key={`${row.product}-${index}`}><td>{row.product}</td><td>{row.quantity}</td></tr>)}</tbody></table> : <p>Inga produkter angivna för denna dag.</p>}</div>
      {snapshot.content.blocks.some((block) => block.type !== "table" || !block.schedule) && <div className="hb-supporting"><h3>Mer information</h3>{snapshot.content.blocks.map((block, index) => block.type === "heading" ? <h4 key={index}>{block.text}</h4> : block.type === "paragraph" ? <p key={index}>{block.text}</p> : block.type === "list" ? <ul key={index}>{block.items.map((item, i) => <li key={i}>{item}</li>)}</ul> : block.type === "table" && !block.schedule ? <div className="hb-table-scroll" key={index}><table><tbody>{block.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div> : null)}</div>}
    </> : <>
      <div className="hb-progress"><span>{new Intl.DateTimeFormat("sv-SE", { dateStyle: "full", timeZone: "Europe/Stockholm" }).format(new Date(`${snapshot.day}T12:00:00Z`))}</span><strong>{done} av {items.length} klara</strong><div role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={items.length} aria-label="Klarmarkerade moment"><span style={{ width: `${items.length ? done / items.length * 100 : 0}%` }} /></div></div>
      <div className="hb-blocks">{snapshot.content.blocks.map((block, index) => block.type === "check" ? <label key={block.id} className={`hb-check ${checks.get(block.id)?.done ? "is-done" : ""}`}><input type="checkbox" checked={Boolean(checks.get(block.id)?.done)} disabled={preview || Boolean(saving)} onChange={() => void toggle(block.id)} /><span>{block.text}</span></label> : block.type === "heading" ? <h3 key={index}>{block.text}</h3> : block.type === "paragraph" ? <p key={index}>{block.text}</p> : block.type === "list" ? <ul key={index}>{block.items.map((item, i) => <li key={i}>{item}</li>)}</ul> : <div className="hb-table-scroll" key={index}><table><tbody>{block.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>)}</div>
    </>}
    {error && <p className="hb-error" role="alert">{error}</p>}
  </div>;
}

export default function StationHandbook() {
  const [documents, setDocuments] = useState<Summary[]>([]);
  const [selected, setSelected] = useState<LiveHandbook | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api<{ documents: Summary[] }>("/station/handbook").then((result) => setDocuments(result.documents)).catch((cause) => {
      if (cause instanceof HttpError && cause.status === 401) window.location.assign("/station/login");
      else setError((cause as Error).message);
    }).finally(() => setLoading(false));
  }, []);
  async function open(kind: HandbookKind) {
    setError("");
    try { setSelected(await api<LiveHandbook>(`/station/handbook/${kind}`)); }
    catch (cause) { setError((cause as Error).message); }
  }
  useEffect(() => {
    if (!selected) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [selected]);
  return <div className="hb-page"><header className="hb-header"><a href="/station" className="hb-back"><ArrowLeft size={18} /> Till dashboarden</a><span>PREEM TINGSRYD</span></header><main className="hb-main"><div className="hb-heading"><span className="hb-eyebrow">DIN DIGITALA HANDBOK</span><h1>Personalpärmen</h1><p>Rutiner och upplockningsschema, alltid nära till hands.</p></div>{loading ? <p>Laddar personalpärmen…</p> : <div className="hb-cards">{HANDBOOK_KINDS.map((kind) => { const document = documents.find((entry) => entry.kind === kind); const Icon = icon[kind]; return <button className="hb-card" key={kind} disabled={!document?.available} onClick={() => void open(kind)}><span className="hb-card-icon"><Icon size={26} /></span><span className="hb-card-copy"><strong>{document?.title || HANDBOOK_LABELS[kind]}</strong><small>{document?.available ? document.description || "Öppna dokumentet" : "Kommer snart"}</small></span><ChevronRight size={20} /></button>; })}</div>}{error && <p className="hb-error" role="alert">{error}</p>}</main>{selected && <div className="hb-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section className="hb-dialog" role="dialog" aria-modal="true" aria-label={selected.title}><button className="hb-close" onClick={() => setSelected(null)} aria-label="Stäng"><X size={22} /></button><HandbookDocumentView document={selected} /></section></div>}</div>;
}
