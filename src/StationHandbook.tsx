import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ChevronRight, ClipboardCheck, Croissant, LockKeyhole, Sandwich, X } from "lucide-react";
import { api, send, HttpError } from "./api";
import { BAKEOFF_GROUPS, HANDBOOK_KINDS, HANDBOOK_LABELS, WEEKDAYS, WEEKDAY_LABELS, stockholmWeekday, type HandbookBlock, type HandbookContent, type HandbookKind, type Weekday } from "../shared/handbook";
import { historyDay, publicationIsNew } from "../shared/station-history";

export type LiveHandbook = { kind: HandbookKind; id: string; title: string; description: string; content: HandbookContent; day: string; checks: { item_id: string; done: number; revision: number }[] };
type Summary = { kind: HandbookKind; title: string | null; description: string | null; published_at: string | null; available: boolean };
const icon = { bakeoff: Croissant, opening: ClipboardCheck, closing: LockKeyhole, freshfood: Sandwich };

function InfoBlock({ block }: { block: HandbookBlock }) {
  if (block.type === "heading") return <h3>{block.text}</h3>;
  if (block.type === "paragraph") return <p>{block.text}</p>;
  if (block.type === "list") return <ul>{block.items.map((item, index) => <li key={index}>{item}</li>)}</ul>;
  if (block.type === "table") {
    const hasHeader = block.rows[0]?.[0] === "Produkt" && block.rows[0]?.[1] === "Antal";
    return <div className="hb-table-scroll"><table>{hasHeader && <thead><tr>{block.rows[0].map((cell, index) => <th key={index}>{cell}</th>)}</tr></thead>}<tbody>{block.rows.slice(hasHeader ? 1 : 0).map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column}>{cell}</td>)}</tr>)}</tbody></table></div>;
  }
  return null;
}

function BakeoffGroups({ blocks }: { blocks: HandbookBlock[] }) {
  const groups: { heading: string; blocks: HandbookBlock[] }[] = [];
  for (const block of blocks) {
    if (block.type === "heading") groups.push({ heading: block.text, blocks: [] });
    else if (groups.length) groups[groups.length - 1].blocks.push(block);
    else groups.push({ heading: "Information", blocks: [block] });
  }
  return <div className="hb-bakeoff-groups">{groups.map((group, index) => <section className="hb-bakeoff-group" key={`${group.heading}-${index}`}><h3>{group.heading}</h3>{group.blocks.map((block, position) => <Fragment key={position}><InfoBlock block={block} /></Fragment>)}</section>)}</div>;
}

function FreshFoodGuide({ blocks }: { blocks: HandbookBlock[] }) {
  const intro: HandbookBlock[] = [];
  const groups: { heading: string; blocks: HandbookBlock[] }[] = [];
  const notes: HandbookBlock[] = [];
  let repeatedHeading = false;
  for (const block of blocks) {
    if (block.type === "heading") {
      repeatedHeading = groups.some((group) => group.heading === block.text);
      if (!repeatedHeading) groups.push({ heading: block.text, blocks: [] });
    }
    else if (repeatedHeading) notes.push(block);
    else if (groups.length) groups[groups.length - 1].blocks.push(block);
    else intro.push(block);
  }
  return <div className="hb-freshfood-guide">
    {intro.map((block, index) => <div className="hb-guide-lead" key={index}><InfoBlock block={block} /></div>)}
    <div className="hb-guide-grid">{groups.map((group, index) => <section className="hb-guide-card" key={`${group.heading}-${index}`}><h3>{group.heading}</h3>{group.blocks.map((block, position) => <div className="hb-guide-entry" key={position}>{block.type === "paragraph" && /datumet som skrivs|du skriver då/i.test(block.text) && <strong>Datummärkning</strong>}{block.type === "paragraph" && /får säljas|kastas|slängs/i.test(block.text) && <strong>Försäljning och kassering</strong>}<InfoBlock block={block} /></div>)}</section>)}</div>
    {notes.length > 0 && <div className="hb-guide-note">{notes.map((block, index) => <Fragment key={index}><InfoBlock block={block} /></Fragment>)}</div>}
  </div>;
}

export function HandbookDocumentView({ document, preview = false, initialBakeoffTab }: { document: LiveHandbook; preview?: boolean; initialBakeoffTab?: "weekday" | "weekend" }) {
  const [selectedDay, setSelectedDay] = useState<Weekday>(() => ["saturday", "sunday"].includes(stockholmWeekday()) ? "monday" : stockholmWeekday());
  const [bakeoffTab, setBakeoffTab] = useState<"weekday" | "weekend">(() => ["saturday", "sunday"].includes(stockholmWeekday()) ? "weekend" : "weekday");
  const [snapshot, setSnapshot] = useState(document);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  useEffect(() => { setSnapshot(document); setSelectedDay(["saturday", "sunday"].includes(stockholmWeekday()) ? "monday" : stockholmWeekday()); setBakeoffTab(initialBakeoffTab ?? (["saturday", "sunday"].includes(stockholmWeekday()) ? "weekend" : "weekday")); }, [document, initialBakeoffTab]);
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
  const hasWeekSchedule = Object.values(snapshot.content.days).some((rows) => rows.length > 0);
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
    {snapshot.kind === "bakeoff" ? <><div className="hb-days hb-bakeoff-tabs" role="tablist" aria-label="Bakeoff-schema"><button role="tab" aria-selected={bakeoffTab === "weekday"} onClick={() => setBakeoffTab("weekday")}>VARDAGAR</button><button role="tab" aria-selected={bakeoffTab === "weekend"} onClick={() => setBakeoffTab("weekend")}>HELG</button></div>{bakeoffTab === "weekend" ? BAKEOFF_GROUPS.some((group) => snapshot.content.weekend?.[group]?.length) ? <div className="hb-bakeoff-groups">{BAKEOFF_GROUPS.map((group) => <section className="hb-bakeoff-group" key={group}><h3>{group}</h3>{snapshot.content.weekend?.[group]?.length ? <table><thead><tr><th>Produkt</th><th>Antal</th></tr></thead><tbody>{snapshot.content.weekend[group].map((row, index) => <tr key={index}><td>{row.product}</td><td>{row.quantity}</td></tr>)}</tbody></table> : <p>Inga produkter inlagda.</p>}</section>)}</div> : <p className="hb-weekend-empty">Helgens upplockningsschema är ännu inte inlagt.</p> : hasWeekSchedule ? <>
      <div className="hb-days" role="tablist" aria-label="Veckodag">{WEEKDAYS.slice(0, 5).map((day, index) => <button key={day} role="tab" aria-selected={selectedDay === day} onClick={() => setSelectedDay(day)}>{WEEKDAY_LABELS[index]}</button>)}</div>
      <div className="hb-day-table" role="tabpanel"><h3>{WEEKDAY_LABELS[WEEKDAYS.indexOf(selectedDay)]}</h3>{snapshot.content.days[selectedDay].length ? <table><thead><tr><th>Produkt</th><th>Antal</th></tr></thead><tbody>{snapshot.content.days[selectedDay].map((row, index) => <tr key={`${row.product}-${index}`}><td>{row.product}</td><td>{row.quantity}</td></tr>)}</tbody></table> : <p>Inga produkter angivna för denna dag.</p>}</div>
      {snapshot.content.blocks.some((block) => block.type !== "table" || !block.schedule) && <div className="hb-supporting"><h3>Mer information</h3>{snapshot.content.blocks.filter((block) => block.type !== "table" || !block.schedule).map((block, index) => <Fragment key={index}><InfoBlock block={block} /></Fragment>)}</div>}
    </> : <BakeoffGroups blocks={snapshot.content.blocks} />}</> : snapshot.kind === "freshfood" ? <FreshFoodGuide blocks={snapshot.content.blocks} /> : <>
      <div className="hb-progress"><span>{new Intl.DateTimeFormat("sv-SE", { dateStyle: "full", timeZone: "Europe/Stockholm" }).format(new Date(`${snapshot.day}T12:00:00Z`))}</span><strong>{done} av {items.length} klara</strong><div role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={items.length} aria-label="Klarmarkerade moment"><span style={{ width: `${items.length ? done / items.length * 100 : 0}%` }} /></div></div>
      <div className="hb-blocks">{snapshot.content.blocks.map((block, index) => block.type === "check" ? <label key={block.id} className={`hb-check ${checks.get(block.id)?.done ? "is-done" : ""}`}><input type="checkbox" checked={Boolean(checks.get(block.id)?.done)} disabled={preview || Boolean(saving)} onChange={() => void toggle(block.id)} /><span>{block.text}</span></label> : block.type === "heading" ? <h3 key={index}>{block.text}</h3> : block.type === "paragraph" ? <p key={index}>{block.text}</p> : block.type === "list" ? <ul key={index}>{block.items.map((item, i) => <li key={i}>{item}</li>)}</ul> : <div className="hb-table-scroll" key={index}><table><tbody>{block.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>)}</div>
    </>}
    {error && <p className="hb-error" role="alert">{error}</p>}
  </div>;
}

export default function StationHandbook({ onClose }: { onClose: () => void }) {
  const [documents, setDocuments] = useState<Summary[]>([]);
  const [selected, setSelected] = useState<LiveHandbook | null>(null);
  const [pendingKind, setPendingKind] = useState<HandbookKind | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const dialogRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const firstCardRef = useRef<HTMLButtonElement>(null);
  const previousSelected = useRef(false);
  const closeAction = useRef(onClose);
  closeAction.current = onClose;
  useEffect(() => {
    api<{ documents: Summary[] }>("/station/handbook").then((result) => setDocuments(result.documents)).catch((cause) => {
      if (cause instanceof HttpError && cause.status === 401) window.location.assign("/station/login");
      else setError((cause as Error).message);
    }).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (previousSelected.current !== Boolean(selected)) bodyRef.current?.scrollTo({ top: 0 });
    if (selected) backRef.current?.focus();
    else if (previousSelected.current) (firstCardRef.current?.disabled ? closeRef.current : firstCardRef.current)?.focus();
    previousSelected.current = Boolean(selected);
  }, [selected]);
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const appRoot = document.getElementById("root");
    const previousInert = appRoot?.inert ?? false;
    const previousOverflow = document.body.style.overflow;
    if (appRoot) appRoot.inert = true;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeAction.current();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>("a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex='-1'])"))
        .filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) { event.preventDefault(); dialog.focus(); return; }
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", keydown, true);
    return () => {
      document.removeEventListener("keydown", keydown, true);
      if (appRoot) appRoot.inert = previousInert;
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);
  async function open(kind: HandbookKind) {
    setError("");
    setPendingKind(kind);
    try { setSelected(await api<LiveHandbook>(`/station/handbook/${kind}`)); }
    catch (cause) { setError((cause as Error).message); }
    finally { setPendingKind(null); }
  }
  return createPortal(<div className="hb-overlay" role="presentation">
    <section className="hb-dialog" role="dialog" aria-modal="true" aria-labelledby="hb-dialog-title" ref={dialogRef} tabIndex={-1}>
      <div className="hb-dialog-toolbar">
        {selected ? <button className="hb-dialog-back" ref={backRef} onClick={() => { setSelected(null); setError(""); }}><ArrowLeft size={17} /> Till Personalpärmen</button> : <span className="hb-dialog-brand">PREEM TINGSRYD</span>}
        <span className="hb-dialog-title" id="hb-dialog-title">Personalpärmen</span>
        <button className="hb-close" ref={closeRef} onClick={onClose} aria-label="Stäng Personalpärmen"><X size={22} /></button>
      </div>
      <div className="hb-dialog-body" ref={bodyRef}>
        {selected ? <HandbookDocumentView document={selected} /> : <div className="hb-home">
          <div className="hb-heading"><span className="hb-eyebrow">DIN DIGITALA HANDBOK</span><h1>Personalpärmen</h1><p>Rutiner och upplockningsschema, alltid nära till hands.</p></div>
          {loading ? <p className="hb-loading" role="status">Laddar personalpärmen…</p> : <div className="hb-cards">{HANDBOOK_KINDS.map((kind, index) => { const entry = documents.find((item) => item.kind === kind); const Icon = icon[kind]; return <button className="hb-card" ref={index === 0 ? firstCardRef : undefined} key={kind} disabled={!entry?.available || Boolean(pendingKind)} onClick={() => void open(kind)}><span className="hb-card-icon"><Icon size={26} /></span>{entry?.available && publicationIsNew(entry.published_at, now) && <span className="hb-card-new">NYTT</span>}<span className="hb-card-copy"><strong>{entry?.title || HANDBOOK_LABELS[kind]}</strong><small>{entry?.available ? entry.description || "Öppna dokumentet" : "Kommer snart"}</small>{entry?.published_at && <small className="hb-card-date">Uppdaterad {historyDay(entry.published_at)}</small>}</span><ChevronRight size={20} /></button>; })}</div>}
          {pendingKind && <p className="hb-loading" role="status">Öppnar {HANDBOOK_LABELS[pendingKind]}…</p>}
        </div>}
        {error && <p className="hb-error hb-dialog-error" role="alert">{error}</p>}
      </div>
    </section>
  </div>, document.body);
}
