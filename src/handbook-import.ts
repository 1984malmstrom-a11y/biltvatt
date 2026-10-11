import { emptyHandbookContent, WEEKDAY_LABELS, WEEKDAYS, type HandbookBlock, type HandbookContent, type HandbookKind, type Weekday } from "../shared/handbook";

const asText = (element: Element) => (element.textContent ?? "").replace(/\s+/g, " ").trim();
const weekday = (value: string): Weekday | null => {
  const normalized = value.toLocaleLowerCase("sv-SE").replace(/[^a-zåäö]/g, "");
  const index = WEEKDAY_LABELS.findIndex((label) => normalized === label.toLocaleLowerCase("sv-SE") || normalized === label.toLocaleLowerCase("sv-SE").slice(0, 3));
  return index < 0 ? null : WEEKDAYS[index];
};
const quantity = (value: string) => /^\d+(?:[,.]\d+)?(?:\s*[A-Za-zÅÄÖåäö]+)?$/.test(value.trim());
const item = (value: string) => value.match(/^(.+?)\s+(\d+(?:[,.]\d+)?(?:\s*[A-Za-zÅÄÖåäö]+)?)$/);

export function parseHandbookHtml(html: string, kind: HandbookKind, previous?: HandbookContent | null) {
  const document = new DOMParser().parseFromString(html, "text/html");
  const content = emptyHandbookContent();
  const warnings: string[] = [];
  const oldChecks = new Map<string, string[]>();
  for (const block of previous?.blocks ?? []) if (block.type === "check") {
    const list = oldChecks.get(block.text) ?? [];
    list.push(block.id);
    oldChecks.set(block.text, list);
  }
  const check = (value: string): HandbookBlock => ({ type: "check", id: oldChecks.get(value)?.shift() ?? crypto.randomUUID(), text: value });
  let activeDay: Weekday | null = null;
  const addDayRow = (day: Weekday, product: string, amount: string) => {
    if (product && quantity(amount)) content.days[day].push({ product, quantity: amount.trim() });
    else warnings.push(`Kontrollera produkt och antal för ${WEEKDAY_LABELS[WEEKDAYS.indexOf(day)]}.`);
  };
  const sectionLine = (line: string) => {
    if (!activeDay) return;
    const match = item(line);
    if (match && quantity(match[2])) addDayRow(activeDay, match[1].trim(), match[2]);
    else warnings.push(`Kunde inte säkert tolka en rad för ${WEEKDAY_LABELS[WEEKDAYS.indexOf(activeDay)]}: ${line.slice(0, 90)}`);
  };
  for (const element of Array.from(document.body.children)) {
    const tag = element.tagName.toLowerCase();
    const value = asText(element);
    if (!value) continue;
    if (/^h[1-6]$/.test(tag)) {
      content.blocks.push({ type: "heading", text: value.slice(0, 180), level: Math.min(Number(tag[1]), 4) });
      if (kind === "bakeoff") activeDay = weekday(value);
    } else if (tag === "table") {
      const rows = Array.from(element.querySelectorAll("tr")).map((row) => Array.from(row.children)
        .filter((cell) => /^(TD|TH)$/.test(cell.tagName)).map((cell) => asText(cell).slice(0, 300))).filter((row) => row.length);
      if (!rows.length) continue;
      let schedule = false;
      if (kind === "bakeoff") {
        const dayColumns = rows[0].map((cell, index) => ({ day: weekday(cell), index })).filter((entry) => entry.day !== null);
        if (dayColumns.length >= 2) {
          schedule = true;
          for (const row of rows.slice(1)) for (const { day, index } of dayColumns) {
            if (!row[index]?.trim()) continue;
            addDayRow(day!, row[0]?.trim() ?? "", row[index]);
          }
        } else if (activeDay) {
          schedule = true;
          for (const row of rows.slice(1)) {
            if (row.length >= 2) addDayRow(activeDay, row[0]?.trim() ?? "", row[1]);
            else if (row[0]) sectionLine(row[0]);
          }
        } else warnings.push("En tabell saknar tydliga veckodagar. Fyll i dagarnas mängder manuellt.");
      }
      content.blocks.push({ type: "table", rows, schedule });
    } else if (tag === "ul" || tag === "ol") {
      const items = Array.from(element.children).filter((child) => child.tagName === "LI").map(asText).filter(Boolean);
      if (!items.length) continue;
      if (kind === "bakeoff") {
        content.blocks.push({ type: "list", items });
        items.forEach(sectionLine);
      } else content.blocks.push(...items.map(check));
    } else if (tag === "p" || tag === "div") {
      content.blocks.push({ type: "paragraph", text: value.slice(0, 3000) });
      if (kind === "bakeoff") sectionLine(value);
    }
  }
  if (kind === "bakeoff" && !Object.values(content.days).some((rows) => rows.length))
    warnings.push("Inga säkra antal hittades. Fyll i veckodagarna manuellt före publicering.");
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
  return { ...parsed, warnings: [...parsed.warnings, ...result.messages.map((message) => message.message)] };
}
