import { useCallback, useEffect, useState } from "react";
import { FileUp, Plus, ArrowDown, ArrowUp, Trash2, Eye, Save, Send, XCircle } from "lucide-react";
import { api, send } from "./api";
import { BAKEOFF_GROUPS, emptyHandbookContent, emptyWeekend, HANDBOOK_KINDS, HANDBOOK_LABELS, WEEKDAYS, WEEKDAY_LABELS, stockholmToday, type HandbookBlock, type HandbookContent, type HandbookKind, type Weekday } from "../shared/handbook";
import { SECURITY_PLACEHOLDER } from "../shared/handbook-security";
import { importHandbookDocx } from "./handbook-import";
import { HandbookDocumentView, type LiveHandbook } from "./StationHandbook";

type Saved = { title: string; description: string; content: HandbookContent; reviewed?: boolean };
type AdminDocument = { kind: HandbookKind; revision: number; draft: Saved | null; published: (Saved & { id: string; published_at: string }) | null };
const clone = (content: HandbookContent) => structuredClone(content);
const initial = () => ({ title: "", description: "", content: emptyHandbookContent(), reviewed: false });

export default function StationHandbookAdmin() {
  const [documents, setDocuments] = useState<AdminDocument[]>([]);
  const [kind, setKind] = useState<HandbookKind>("bakeoff");
  const [draft, setDraft] = useState(initial);
  const [selectedDay, setSelectedDay] = useState<Weekday>("monday");
  const [editWeekSchedule, setEditWeekSchedule] = useState(false);
  const [bakeoffTab, setBakeoffTab] = useState<"weekday" | "weekend">("weekday");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const selected = documents.find((row) => row.kind === kind);
  const load = useCallback(async () => {
    const result = await api<{ documents: AdminDocument[] }>("/admin/station/handbook");
    setDocuments(result.documents);
    return result.documents;
  }, []);
  useEffect(() => { void load().catch((cause) => setError((cause as Error).message)); }, [load]);
  useEffect(() => {
    const row = documents.find((item) => item.kind === kind);
    const source = row?.draft ?? row?.published;
    setDraft(source ? { title: source.title, description: source.description, content: clone(source.content), reviewed: Boolean(row?.draft?.reviewed || row?.published) } : initial());
    setEditWeekSchedule(Boolean(source && Object.values(source.content.days).some((rows) => rows.length > 0)));
  }, [kind, documents]);
  function chooseKind(entry: HandbookKind) {
    setKind(entry); setEditWeekSchedule(false); setWarnings([]); setMessage(""); setError(""); setPreview(false);
  }
  function setContent(content: HandbookContent) { setDraft((current) => ({ ...current, content, reviewed: kind === "bakeoff" ? false : current.reviewed })); }
  function updateBlock(index: number, block: HandbookBlock) {
    const content = clone(draft.content); content.blocks[index] = block; setContent(content);
  }
  function moveBlock(index: number, to: number) {
    if (to < 0 || to >= draft.content.blocks.length) return;
    const content = clone(draft.content); [content.blocks[index], content.blocks[to]] = [content.blocks[to], content.blocks[index]]; setContent(content);
  }
  function removeBlock(index: number) { if (!window.confirm("Ta bort detta innehåll? Tidigare historik sparas.")) return; const content = clone(draft.content); content.blocks.splice(index, 1); setContent(content); }
  function addBlock(type: HandbookBlock["type"]) {
    const block: HandbookBlock = type === "check" ? { type, id: crypto.randomUUID(), text: "Nytt moment" } : type === "heading" ? { type, text: "Ny rubrik", level: 2 } : type === "paragraph" ? { type, text: "Ny text" } : type === "list" ? { type, items: ["Ny punkt"] } : { type: "table", rows: [["Rubrik", "Värde"], ["", ""]], schedule: false };
    setContent({ ...draft.content, blocks: [...draft.content.blocks, block] });
  }
  function dayRow(index: number, field: "product" | "quantity", value: string) {
    const content = clone(draft.content); content.days[selectedDay][index][field] = value; setContent(content);
  }
  async function importFile(file: File) {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await importHandbookDocx(file, kind, draft.content.blocks.length ? draft.content : selected?.published?.content ?? null);
      if (kind === "bakeoff") result.content.weekend = clone(draft.content).weekend ?? selected?.published?.content.weekend ?? emptyWeekend();
      setDraft((current) => ({ ...current, title: current.title || HANDBOOK_LABELS[kind], content: result.content, reviewed: false }));
      setEditWeekSchedule(Object.values(result.content.days).some((rows) => rows.length > 0));
      setWarnings(result.warnings);
      setMessage("Word-filen är importerad lokalt. Granska och spara utkastet innan publicering.");
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function save() {
    setBusy(true); setError(""); setMessage("");
    try {
      await api(`/admin/station/handbook/${kind}/draft`, send("PUT", { ...draft, expected_revision: selected?.revision ?? 0 }));
      await load(); setMessage("Utkastet är sparat. Det syns ännu inte för personalen.");
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function action(name: "publish" | "unpublish") {
    setBusy(true); setError(""); setMessage("");
    try {
      await api(`/admin/station/handbook/${kind}/${name}`, send("POST", { expected_revision: selected?.revision ?? 0 }));
      await load(); setMessage(name === "publish" ? "Dokumentet är publicerat." : "Dokumentet är avpublicerat.");
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  const before = new Map(selected?.published?.content.blocks.filter((block) => block.type === "check").map((block) => [block.id, block.text]) ?? []);
  const after = draft.content.blocks.filter((block) => block.type === "check");
  const unchanged = after.filter((block) => before.get(block.id) === block.text).length;
  const changed = after.length - unchanged;
  const changedItems = after.filter((block) => before.get(block.id) !== block.text);
  const removedItems = [...before].filter(([id]) => !after.some((block) => block.id === id));
  const removed = removedItems.length;
  const previewDoc: LiveHandbook = { kind, id: "preview", title: draft.title || HANDBOOK_LABELS[kind], description: draft.description, content: draft.content, day: stockholmToday(), checks: [] };
  const securityMarked = JSON.stringify(draft.content).includes(SECURITY_PLACEHOLDER);
  return <section className="hb-admin station-panel" aria-labelledby="hb-admin-heading"><div className="hb-admin-head"><div><span className="hb-eyebrow">DOKUMENT OCH RUTINER</span><h2 id="hb-admin-heading">Personalpärmen</h2></div><span className="hb-admin-caption">Utkast publiceras aldrig automatiskt</span></div>
    <div className="hb-admin-types" role="tablist" aria-label="Dokumenttyp">{HANDBOOK_KINDS.map((entry) => <button key={entry} type="button" role="tab" aria-selected={kind === entry} onClick={() => chooseKind(entry)}>{HANDBOOK_LABELS[entry]}</button>)}</div>
    <div className="hb-admin-status"><strong>{selected?.published ? "Publicerad" : "Ej publicerad"}</strong><span>{selected?.draft ? "Sparat utkast finns" : "Inget sparat utkast"}</span></div>
    <div className="hb-admin-fields"><label>Titel<input maxLength={120} value={draft.title} onChange={(event) => setDraft((value) => ({ ...value, title: event.target.value }))} /></label><label>Kort beskrivning<input maxLength={300} value={draft.description} onChange={(event) => setDraft((value) => ({ ...value, description: event.target.value }))} /></label><label className="hb-file"><FileUp size={18} /> Importera Word (.docx)<input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); event.target.value = ""; }} /></label></div>
    {warnings.length > 0 && <div className="hb-warning"><strong>Granska importen</strong><ul>{warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></div>}
    {securityMarked && <div className="hb-warning hb-security-warning" role="alert"><strong>Säkerhetsgranskning krävs</strong><p>Åtkomstuppgifter har ersatts med markeringar. Behåll arbetsmomenten, men skriv säkra hänvisningar innan dokumentet kan publiceras. Spara gärna ett utkast under tiden.</p></div>}
    {kind === "bakeoff" && <div className="hb-admin-types hb-bakeoff-tabs" role="tablist" aria-label="Bakeoff-schema"><button type="button" role="tab" aria-selected={bakeoffTab === "weekday"} onClick={() => setBakeoffTab("weekday")}>Vardagar (mån–fre)</button><button type="button" role="tab" aria-selected={bakeoffTab === "weekend"} onClick={() => setBakeoffTab("weekend")}>Helg (lör–sön)</button></div>}
    {(kind !== "bakeoff" || bakeoffTab === "weekday") && <div className="hb-admin-edit"><h3>Innehåll och ordning</h3>{draft.content.blocks.map((block, index) => <div className="hb-edit-row" key={block.type === "check" ? block.id : index}><span className="hb-edit-type">{block.type === "check" ? "Moment" : block.type === "heading" ? "Rubrik" : block.type === "paragraph" ? "Text" : block.type === "list" ? "Lista" : "Tabell"}</span>{block.type === "table" || block.type === "list" ? <textarea aria-label={`Redigera ${block.type} ${index + 1}`} value={block.type === "table" ? block.rows.map((row) => row.join("\t")).join("\n") : block.items.join("\n")} onChange={(event) => updateBlock(index, block.type === "table" ? { ...block, rows: event.target.value.split("\n").map((row) => row.split("\t")) } : { type: "list", items: event.target.value.split("\n") })} /> : <textarea aria-label={`Redigera ${block.type} ${index + 1}`} value={block.text} onChange={(event) => updateBlock(index, { ...block, text: event.target.value })} />}<div className="hb-edit-actions"><button type="button" onClick={() => moveBlock(index, index - 1)} disabled={index === 0} aria-label="Flytta upp"><ArrowUp size={16} /></button><button type="button" onClick={() => moveBlock(index, index + 1)} disabled={index === draft.content.blocks.length - 1} aria-label="Flytta ned"><ArrowDown size={16} /></button><button type="button" onClick={() => removeBlock(index)} aria-label="Ta bort"><Trash2 size={16} /></button></div></div>)}<div className="hb-add-buttons">{(["heading", "paragraph", "list", "table", ...(kind === "bakeoff" ? [] : ["check"])] as HandbookBlock["type"][]).map((type) => <button key={type} type="button" onClick={() => addBlock(type)}><Plus size={14} /> {type === "check" ? "Moment" : type === "heading" ? "Rubrik" : type === "paragraph" ? "Text" : type === "list" ? "Lista" : "Tabell"}</button>)}</div></div>}
    {kind === "bakeoff" && bakeoffTab === "weekend" && <div className="hb-weekend-editor"><p>Samma schema visas på lördag och söndag. Vardagsprodukterna påverkas inte.</p>{BAKEOFF_GROUPS.map((group) => <section key={group}><h3>{group}</h3>{(draft.content.weekend?.[group] ?? []).map((row, index) => <div className="hb-day-edit" key={index}><input aria-label={`${group} produkt ${index + 1}`} placeholder="Produkt" value={row.product} onChange={(event) => { const content = clone(draft.content); (content.weekend ??= emptyWeekend())[group][index].product = event.target.value; setContent(content); }} /><input aria-label={`${group} antal ${index + 1}`} placeholder="Antal" value={row.quantity} onChange={(event) => { const content = clone(draft.content); (content.weekend ??= emptyWeekend())[group][index].quantity = event.target.value; setContent(content); }} /><button type="button" aria-label={`Ta bort ${group} produkt`} onClick={() => { if (!window.confirm("Ta bort produkten från helgschemat?")) return; const content = clone(draft.content); (content.weekend ??= emptyWeekend())[group].splice(index, 1); setContent(content); }}><Trash2 size={16} /></button></div>)}<button type="button" className="hb-add-row" onClick={() => { const content = clone(draft.content); (content.weekend ??= emptyWeekend())[group].push({ product: "", quantity: "" }); setContent(content); }}><Plus size={15} /> Lägg till produkt i {group}</button></section>)}</div>}
    {kind === "bakeoff" && bakeoffTab === "weekday" && <div className="hb-day-editor"><button type="button" className="hb-week-toggle" aria-expanded={editWeekSchedule} onClick={() => setEditWeekSchedule((value) => !value)}>{editWeekSchedule ? "Dölj veckoschema" : "Använd veckoschema för framtida dokument"}</button>{editWeekSchedule && <><h3>Veckoschema – kontrollera alla dagar</h3><div className="hb-days" role="tablist" aria-label="Redigera veckodag">{WEEKDAYS.slice(0, 5).map((day, index) => <button key={day} type="button" role="tab" aria-selected={selectedDay === day} onClick={() => setSelectedDay(day)}>{WEEKDAY_LABELS[index]}</button>)}</div>{draft.content.days[selectedDay].map((row, index) => <div className="hb-day-edit" key={index}><input aria-label={`Produkt ${index + 1}`} placeholder="Produkt" value={row.product} onChange={(event) => dayRow(index, "product", event.target.value)} /><input aria-label={`Antal ${index + 1}`} placeholder="Antal" value={row.quantity} onChange={(event) => dayRow(index, "quantity", event.target.value)} /><button type="button" aria-label="Ta bort produkt" onClick={() => { const content = clone(draft.content); content.days[selectedDay].splice(index, 1); setContent(content); }}><Trash2 size={16} /></button></div>)}<button type="button" className="hb-add-row" onClick={() => { const content = clone(draft.content); content.days[selectedDay].push({ product: "", quantity: "" }); setContent(content); }}><Plus size={15} /> Lägg till produkt</button></>}<label className="hb-review"><input type="checkbox" checked={draft.reviewed} onChange={(event) => setDraft((value) => ({ ...value, reviewed: event.target.checked }))} /> Jag har granskat alla produkter och mängder mot Word-filen. Otydliga värden har rättats.</label></div>}
    {(kind === "opening" || kind === "closing") && <div className="hb-change-summary"><strong>Ändringar före publicering</strong><p>{unchanged} oförändrade moment behåller dagens färdigstatus. {changed} nya eller ändrade moment börjar obockade. {removed} borttagna moment behåller sin historik.</p>{(changedItems.length > 0 || removedItems.length > 0) && <ul>{changedItems.map((block) => <li key={block.id}>{before.has(block.id) ? `Ändrat: ${before.get(block.id)} → ${block.text}` : `Nytt: ${block.text}`}</li>)}{removedItems.map(([id, text]) => <li key={id}>Borttaget: {text}</li>)}</ul>}</div>}
    <div className="hb-admin-buttons"><button type="button" onClick={() => setPreview((value) => !value)}><Eye size={17} /> {preview ? "Stäng förhandsgranskning" : "Förhandsgranska"}</button><button type="button" onClick={() => void save()} disabled={busy}><Save size={17} /> Spara utkast</button><button type="button" className="hb-publish" onClick={() => void action("publish")} disabled={busy || !selected?.draft || securityMarked}><Send size={17} /> Publicera sparat utkast</button>{selected?.published && <button type="button" onClick={() => void action("unpublish")} disabled={busy}><XCircle size={17} /> Avpublicera</button>}</div>
    {preview && <div className="hb-admin-preview"><HandbookDocumentView document={previewDoc} preview initialBakeoffTab={kind === "bakeoff" ? bakeoffTab : undefined} /></div>}{error && <p className="hb-error" role="alert">{error}</p>}{message && <p className="hb-success" role="status">{message}</p>}
  </section>;
}
