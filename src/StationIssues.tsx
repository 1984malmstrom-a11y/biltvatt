import { stationNameUpper } from "./station-brand";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Check, ChevronRight, Plus, Wrench, X } from "lucide-react";
import { api, HttpError, send } from "./api";
import { issueDateTime, issueEventDescription, type Issue, type IssueEvent, type IssueEventPage, type IssuePage } from "../shared/issues";

type Tab = "open" | "completed";
type View = "list" | "create" | "detail" | "edit";

export default function StationIssues() {
  const [count, setCount] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("list");
  const [tab, setTab] = useState<Tab>("open");
  const [items, setItems] = useState<Issue[]>([]);
  const [listCursor, setListCursor] = useState<string | null>(null);
  const [issue, setIssue] = useState<Issue | null>(null);
  const [events, setEvents] = useState<IssueEvent[]>([]);
  const [eventCursor, setEventCursor] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [listLoading, setListLoading] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const listRequest = useRef(0);
  const eventsRequest = useRef(0);

  const refreshCount = useCallback(async () => {
    try { const result = await api<{ unresolved: number }>("/station/issues/summary"); setCount(Number.isSafeInteger(result.unresolved) && result.unresolved >= 0 ? result.unresolved : null); }
    catch { setCount(null); }
  }, []);
  const loadList = useCallback(async (status: Tab, before?: string) => {
    const current = ++listRequest.current;
    setListLoading(true); setError("");
    try {
      const result = await api<IssuePage>(`/station/issues?status=${status}${before ? `&before=${encodeURIComponent(before)}` : ""}`);
      if (current !== listRequest.current) return;
      setItems((previous) => before ? [...previous, ...result.items] : result.items);
      setListCursor(result.next_cursor);
    } catch (cause) {
      if (current === listRequest.current) setError((cause as Error).message);
    } finally {
      if (current === listRequest.current) setListLoading(false);
    }
  }, []);
  const loadEvents = useCallback(async (id: string, before?: number) => {
    const current = ++eventsRequest.current;
    setEventsLoading(true); setError("");
    try {
      const result = await api<IssueEventPage>(`/station/issues/${id}/events${before ? `?before=${before}` : ""}`);
      if (current !== eventsRequest.current) return;
      setEvents((previous) => before ? [...previous, ...result.events] : result.events);
      setEventCursor(result.next_cursor);
    } catch (cause) {
      if (current === eventsRequest.current) setError((cause as Error).message);
    } finally {
      if (current === eventsRequest.current) setEventsLoading(false);
    }
  }, []);
  const loadDetail = useCallback(async (id: string) => {
    setLoading(true); setError("");
    try {
      const result = await api<{ issue: Issue }>(`/station/issues/${id}`);
      setIssue(result.issue);
      await loadEvents(id);
    } catch (cause) { setError((cause as Error).message); }
    finally { setLoading(false); }
  }, [loadEvents]);

  useEffect(() => {
    void refreshCount();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refreshCount(); }, 30000);
    const focus = () => void refreshCount();
    window.addEventListener("focus", focus);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", focus); };
  }, [refreshCount]);
  useEffect(() => {
    if (!open) return;
    const former = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = document.getElementById("root");
    const previousInert = root?.inert ?? false;
    const previousOverflow = document.body.style.overflow;
    if (root) root.inert = true;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]),input:not([disabled]),textarea:not([disabled])")].filter((node) => node.getClientRects().length);
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); if (root) root.inert = previousInert; document.body.style.overflow = previousOverflow; former?.focus(); };
  }, [open]);
  useEffect(() => { if (open && view !== "list") backRef.current?.focus(); }, [open, view]);

  function show() { setOpen(true); setView("list"); setTab("open"); setItems([]); void loadList("open"); void refreshCount(); }
  function switchTab(status: Tab) { setTab(status); setItems([]); setListCursor(null); void loadList(status); }
  function startCreate() { setIssue(null); setTitle(""); setDescription(""); setLocation(""); setView("create"); setError(""); }
  function startEdit() { if (!issue) return; setTitle(issue.title); setDescription(issue.description); setLocation(issue.location); setView("edit"); setError(""); }
  function showDetail(id: string) { setIssue(null); setEvents([]); setView("detail"); void loadDetail(id); }
  function back() {
    setError("");
    if (view === "edit") { setView("detail"); return; }
    setView("list"); setIssue(null); setItems([]); void loadList(tab);
  }
  async function saveIssue(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try {
      if (view === "edit" && issue) {
        await api(`/station/issues/${issue.id}`, send("PUT", { title, description, location, expected_revision: issue.revision }));
        setView("detail"); await loadDetail(issue.id);
      } else {
        const created = await api<{ id: string }>("/station/issues", send("POST", { title, description, location }));
        setTab("open"); setView("detail"); await loadDetail(created.id);
      }
      await refreshCount();
    } catch (cause) {
      if (issue && cause instanceof HttpError && cause.status === 409) {
        setView("detail");
        await loadDetail(issue.id);
      }
      setError((cause as Error).message);
    } finally { setBusy(false); }
  }
  async function saveNote(event: React.FormEvent) {
    event.preventDefault(); if (!issue || busy) return;
    setBusy(true); setError("");
    try {
      await api(`/station/issues/${issue.id}/notes`, send("POST", { text: note }));
      setNote(""); await loadEvents(issue.id);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function toggleStatus() {
    if (!issue || busy) return;
    const current = issue;
    setBusy(true); setError("");
    try {
      await api(`/station/issues/${current.id}/status`, send("PUT", { completed: !current.completed, expected_revision: current.revision }));
      await loadDetail(current.id);
      await refreshCount();
    } catch (cause) {
      await loadDetail(current.id);
      setError((cause as Error).message);
    } finally { setBusy(false); }
  }

  return <>
    <button type="button" className={`issues-trigger${count !== null && count > 0 ? " has-open" : ""}`} aria-label={`Fel & åtgärder${count !== null ? `, ${count} ej slutförda` : ""}`} onClick={show}>
      <Wrench size={18} aria-hidden="true" /><span className="issues-trigger-label">Fel & åtgärder</span><span className="issues-count" aria-hidden="true">{count ?? "–"}</span>
    </button>
    {open && createPortal(<div className="issues-overlay"><section className="issues-dialog" role="dialog" aria-modal="true" aria-labelledby="issues-dialog-title" ref={dialogRef}>
      <header className="issues-dialog-header"><div><span>{stationNameUpper}</span><h2 id="issues-dialog-title">Fel & åtgärder</h2></div><button ref={closeRef} className="issues-close" aria-label="Stäng Fel & åtgärder" onClick={() => setOpen(false)}><X size={21} /></button></header>
      <div className="issues-body">
        {view === "list" ? <>
          <div className="issues-list-toolbar"><div><h3>Ärenden</h3><p>Gemensamt för hela stationen</p></div><button className="issues-primary" onClick={startCreate}><Plus size={17} /> Registrera fel</button></div>
          <div className="issues-tabs" role="tablist" aria-label="Ärendestatus"><button role="tab" aria-selected={tab === "open"} onClick={() => switchTab("open")}>Ej slutförda{count !== null ? ` (${count})` : ""}</button><button role="tab" aria-selected={tab === "completed"} onClick={() => switchTab("completed")}>Slutförda / Historik</button></div>
          <div className="issues-list">{items.map((item) => <button className="issues-list-item" key={item.id} onClick={() => showDetail(item.id)}><span className={`issues-check${item.completed ? " done" : ""}`}>{item.completed && <Check size={16} />}</span><span className="issues-list-copy"><strong>{item.title}</strong><small>{item.location && `${item.location} · `}{item.completed && item.completed_at ? `Slutfört ${issueDateTime(item.completed_at)}` : `Registrerat ${issueDateTime(item.created_at)}`}</small></span><ChevronRight size={18} aria-hidden="true" /></button>)}</div>
          {!listLoading && !items.length && !error && <p className="issues-empty">{tab === "open" ? "Inga olösta ärenden." : "Inga slutförda ärenden ännu."}</p>}
          {listLoading && <p role="status">Hämtar ärenden…</p>}
          {listCursor && <button className="issues-more" disabled={listLoading} onClick={() => void loadList(tab, listCursor)}>Visa fler ärenden</button>}
        </> : <>
          <button ref={backRef} className="issues-back" onClick={back}><ArrowLeft size={17} /> {view === "edit" ? "Till ärendet" : "Till ärendelistan"}</button>
          {(view === "create" || view === "edit") ? <form className="issues-form" onSubmit={(event) => void saveIssue(event)}><h3>{view === "create" ? "Registrera fel" : "Korrigera ärendet"}</h3><label>Rubrik eller kort beskrivning *<input required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Exempel: Kaffemaskin 2 läcker vatten" /></label><label>Mer detaljerad beskrivning<textarea maxLength={2000} rows={4} value={description} onChange={(event) => setDescription(event.target.value)} /></label><label>Plats eller utrustning<input maxLength={120} value={location} onChange={(event) => setLocation(event.target.value)} /></label><button className="issues-primary" disabled={busy || !title.trim()}>{busy ? "Sparar…" : view === "create" ? "Spara ärende" : "Spara ändringar"}</button></form> : issue ? <>
            <div className="issues-detail-title"><div><span className="issues-eyebrow">ÄRENDE · {issue.id.slice(-8)}</span><h3>{issue.title}</h3><p>Registrerat {issueDateTime(issue.created_at)}{issue.location && ` · ${issue.location}`}</p></div><span className={`issues-status${issue.completed ? " completed" : ""}`}>{issue.completed ? <><Check size={16} /> Slutfört</> : "Ej slutfört"}</span></div>
            <div className="issues-detail-grid"><div className="issues-detail-main">
            {issue.description && <p className="issues-description">{issue.description}</p>}
            <div className="issues-detail-actions"><button className={`issues-complete${issue.completed ? " is-done" : ""}`} disabled={busy} aria-pressed={Boolean(issue.completed)} onClick={() => void toggleStatus()}><span className="issues-check">{issue.completed && <Check size={17} />}</span>{issue.completed ? "Ångra slutförande" : "Slutfört"}</button><button className="issues-edit" disabled={busy} onClick={startEdit}>Korrigera uppgifter</button></div>
            <section className="issues-notes"><h4>Åtgärder</h4><form onSubmit={(event) => void saveNote(event)}><label htmlFor="issue-new-note">Ny åtgärdsanteckning</label><textarea id="issue-new-note" required maxLength={1000} rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Exempel: Felanmält till service. Väntar på tekniker." /><button className="issues-primary" disabled={busy || !note.trim()}>Spara åtgärd</button></form></section></div>
            <section className="issues-events"><h4>Händelsehistorik</h4><ol>{events.map((entry) => <li key={entry.id}><time dateTime={entry.occurred_at}>{issueDateTime(entry.occurred_at)}</time><span>{issueEventDescription(entry)}</span></li>)}</ol>{eventsLoading && <p role="status">Hämtar historik…</p>}{eventCursor && <button className="issues-more" disabled={eventsLoading} onClick={() => void loadEvents(issue.id, eventCursor)}>Visa äldre händelser</button>}</section>
            </div>
          </> : loading ? <p role="status">Hämtar ärende…</p> : null}
        </>}
        {error && <p className="issues-error" role="alert">{error}</p>}
      </div>
    </section></div>, document.body)}
  </>;
}
