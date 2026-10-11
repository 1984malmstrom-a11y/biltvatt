import { emptyHandbookContent, WEEKDAY_LABELS, WEEKDAYS, type HandbookBlock, type HandbookContent, type HandbookKind, type Weekday } from "../shared/handbook";
import { redactImportedAccessText } from "../shared/handbook-security";

const asText = (element: Element) => (element.textContent ?? "").replace(/\s+/g, " ").trim();
const weekday = (value: string): Weekday | null => {
  const normalized = value.toLocaleLowerCase("sv-SE").replace(/[^a-zåäö]/g, "");
  const index = WEEKDAY_LABELS.findIndex((label) => normalized === label.toLocaleLowerCase("sv-SE") || normalized === label.toLocaleLowerCase("sv-SE").slice(0, 3));
  return index < 0 ? null : WEEKDAYS[index];
};
const quantity = (value: string) => /^\d+(?:[,.]\d+)?(?:\s*[A-Za-zÅÄÖåäö]+)?$/.test(value.trim());
const item = (value: string) => value.match(/^(.+?)\s+(\d+(?:[,.]\d+)?(?:\s*[A-Za-zÅÄÖåäö]+)?)$/);
const bakeoffItem = (value: string) => value.match(/^(.+?)\s+(\d+\s*st(?:\s*[x×]\s*\d+)?|vid behov)$/i);
const bakeoffGroups = new Map([ ["HUVUD VAGN", "Huvudvagn"], ["HUVUDVAGN", "Huvudvagn"], ["RESERV VAGN", "Reservvagn"], ["RESERVVAGN", "Reservvagn"], ["FRYSEN", "Frysen"] ]);
const timeHeading = /^\d{1,2}[.:]\d{2}$/;

export function parseHandbookHtml(html: string, kind: HandbookKind, previous?: HandbookContent | null) {
  const document = new DOMParser().parseFromString(html, "text/html");
  const content = emptyHandbookContent();
  if (kind === "bakeoff") content.weekend = structuredClone(previous?.weekend ?? { Huvudvagn: [], Reservvagn: [], Frysen: [] });
  const warnings: string[] = [];
  const oldChecks = new Map<string, string[]>();
  for (const block of previous?.blocks ?? []) if (block.type === "check") {
    const list = oldChecks.get(block.text) ?? [];
    list.push(block.id);
    oldChecks.set(block.text, list);
  }
  const check = (value: string): HandbookBlock => ({ type: "check", id: oldChecks.get(value)?.shift() ?? crypto.randomUUID(), text: value });
  let activeDay: Weekday | null = null;
  let currentBakeoffTable: Extract<HandbookBlock, { type: "table" }> | null = null;
  let routineStarted = false;
  let previousWasSensitive = false;
  let sensitiveCount = 0;
  let freshfoodSection = "";
  const addDayRow = (day: Weekday, product: string, amount: string) => {
    if (product && quantity(amount)) content.days[day].push({ product, quantity: amount.trim() });
    else warnings.push(`Kontrollera produkt och antal för ${WEEKDAY_LABELS[WEEKDAYS.indexOf(day)]}.`);
  };
  const sectionLine = (line: string) => {
    if (!activeDay) return;
    const match = item(line);
    if (match && quantity(match[2])) addDayRow(activeDay, match[1].trim(), match[2]);
    else warnings.push(`En rad för ${WEEKDAY_LABELS[WEEKDAYS.indexOf(activeDay)]} behöver granskas manuellt.`);
  };
  const routineLine = (value: string) => {
    if (/^(?:öppnings?\s*rutin|rutin\s*kväll|stängnings?\s*rutin)/i.test(value) && !routineStarted) return;
    if (timeHeading.test(value)) {
      routineStarted = true;
      previousWasSensitive = false;
      content.blocks.push({ type: "heading", text: value.replace(".", ":"), level: 2 });
      return;
    }
    if (!routineStarted) {
      content.blocks.push({ type: "paragraph", text: value.slice(0, 3000) });
      return;
    }
    const redacted = redactImportedAccessText(value, previousWasSensitive, kind === "opening");
    previousWasSensitive = redacted.redacted;
    if (redacted.redacted) sensitiveCount++;
    content.blocks.push(check(redacted.text));
  };
  const bakeoffLine = (value: string) => {
    if (/^bake\s*off$/i.test(value)) return;
    const group = bakeoffGroups.get(value.toLocaleUpperCase("sv-SE"));
    if (group) {
      currentBakeoffTable = { type: "table", rows: [["Produkt", "Antal"]], schedule: false };
      content.blocks.push({ type: "heading", text: group, level: 2 }, currentBakeoffTable);
      activeDay = null;
      return;
    }
    const day = weekday(value);
    if (day) {
      activeDay = day;
      currentBakeoffTable = null;
      content.blocks.push({ type: "heading", text: value, level: 2 });
      return;
    }
    if (currentBakeoffTable) {
      const match = bakeoffItem(value);
      if (match) currentBakeoffTable.rows.push([match[1].trim(), match[2].trim()]);
      else {
        content.blocks.push({ type: "paragraph", text: value.slice(0, 3000) });
        warnings.push("En Bakeoff-rad behöver granskas manuellt mot originalfilen.");
      }
      return;
    }
    content.blocks.push({ type: "paragraph", text: value.slice(0, 3000) });
    sectionLine(value);
  };
  const freshfoodLine = (value: string) => {
    if (/^rutin\s+på\s+freshfood/i.test(value)) return;
    let section = "";
    if (/\bkväll(?:en)?\b/i.test(value) && /tas upp/i.test(value)) section = "Tas upp på kvällen";
    else if (/\b(?:dagen|morgonen)\b/i.test(value) && /tas upp|upptagna/i.test(value)) section = "Tas upp på dagen";
    if (section && section !== freshfoodSection) {
      content.blocks.push({ type: "heading", text: section, level: 2 });
      freshfoodSection = section;
    }
    content.blocks.push({ type: "paragraph", text: value.slice(0, 3000) });
  };
  const sanitizeGeneral = (value: string) => {
    const result = redactImportedAccessText(value);
    if (result.redacted) sensitiveCount++;
    return result.text;
  };
  const plainLine = (value: string) => {
    if (kind === "bakeoff") bakeoffLine(sanitizeGeneral(value));
    else if (kind === "opening" || kind === "closing") routineLine(value);
    else freshfoodLine(sanitizeGeneral(value));
  };
  for (const element of Array.from(document.body.children)) {
    const tag = element.tagName.toLowerCase();
    const value = asText(element);
    if (!value) continue;
    if (tag === "table") {
      const rows = Array.from(element.querySelectorAll("tr")).map((row) => Array.from(row.children)
        .filter((cell) => /^(TD|TH)$/.test(cell.tagName)).map((cell) => sanitizeGeneral(asText(cell).slice(0, 300)))).filter((row) => row.length);
      if (!rows.length) continue;
      let schedule = false;
      if (kind === "bakeoff") {
        const dayColumns = rows[0].map((cell, index) => ({ day: weekday(cell), index })).filter((entry) => entry.day !== null);
        if (dayColumns.length >= 2) {
          schedule = true;
          for (const row of rows.slice(1)) for (const { day, index } of dayColumns) {
            if (row[index]?.trim()) addDayRow(day!, row[0]?.trim() ?? "", row[index]);
          }
        } else if (activeDay) {
          schedule = true;
          for (const row of rows.slice(1)) {
            if (row.length >= 2) addDayRow(activeDay, row[0]?.trim() ?? "", row[1]);
            else if (row[0]) sectionLine(row[0]);
          }
        } else if (!currentBakeoffTable) warnings.push("En tabell saknar tydliga veckodagar eller grupper. Granska produkterna manuellt.");
      }
      content.blocks.push({ type: "table", rows, schedule });
    } else if (tag === "ul" || tag === "ol") {
      const entries = Array.from(element.children).filter((child) => child.tagName === "LI").map(asText).filter(Boolean);
      for (const entry of entries) plainLine(entry);
    } else if (/^h[1-6]$/.test(tag) && kind === "bakeoff") {
      plainLine(value);
    } else if (/^h[1-6]$/.test(tag)) {
      content.blocks.push({ type: "heading", text: sanitizeGeneral(value.slice(0, 180)), level: Math.min(Number(tag[1]), 4) });
    } else if (tag === "p" || tag === "div") plainLine(value);
  }
  if (kind === "bakeoff" && !Object.values(content.days).some((rows) => rows.length) && !content.blocks.some((block) => block.type === "table" && block.rows.length > 1))
    warnings.push("Inga säkra Bakeoff-mängder hittades. Granska och rätta innan publicering.");
  if (sensitiveCount) warnings.push(`${sensitiveCount} moment med möjliga åtkomstuppgifter har ersatts med säkerhetsmarkeringar. Ange säkra hänvisningar före publicering.`);
  return { content, warnings };
}

export async function importHandbookDocx(file: File, kind: HandbookKind, previous?: HandbookContent | null) {
  if (!file.name.toLocaleLowerCase("sv-SE").endsWith(".docx") || file.size > 5_000_000)
    throw new Error("Välj en .docx-fil på högst 5 MB.");
  const mammoth = await import("mammoth");
  const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() }, {
    externalFileAccess: false,
    convertImage: mammoth.images.imgElement(async () => ({ src: "" })),
  });
  const parsed = parseHandbookHtml(result.value, kind, previous);
  return { ...parsed, warnings: [...parsed.warnings, ...(result.messages.length ? [`Word-importen hade ${result.messages.length} formateringsvarning(ar). Kontrollera mot originalfilen.`] : [])] };
}
