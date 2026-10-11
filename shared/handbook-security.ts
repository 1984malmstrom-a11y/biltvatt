import type { HandbookContent } from "./handbook";

export const SECURITY_PLACEHOLDER = "[SÄKERHET: ersätt med säker hänvisning]";
const accessWords = /\b(?:lösenord(?:s\w*)?|password|passord|pin-kod|[a-zåäö]{0,24}kod(?:en|er|erna)?|användarnamn|inloggningsuppgift(?:er)?|access\s*code|login)\b/i;
const isolatedCredential = /^(?=.{4,18}$)(?=.*\d)[A-Za-z0-9!@#$%^&*_.-]+$/;

export function containsSensitiveAccessText(value: string) {
  return value.includes(SECURITY_PLACEHOLDER) || accessWords.test(value) || isolatedCredential.test(value.trim());
}

export function redactImportedAccessText(value: string, afterSensitiveLine = false, conservative = false) {
  if (!accessWords.test(value) && !(afterSensitiveLine && isolatedCredential.test(value.trim())) &&
    !(conservative && (value.trim().length < 20 || /\b\d{4,8}\b/.test(value))))
    return { text: value, redacted: false };
  const match = accessWords.exec(value);
  const action = match ? value.slice(0, match.index).trim().replace(/\b(?:med|använd|ange|skriv|via)\s*$/i, "").replace(/[,:;–-]+$/, "").trim() : "";
  // Retain a clear task where the harmless action precedes a credential.
  // Ambiguous or credential-only lines remain blocked for manual admin review.
  if (action.length >= 8 && !/\b\d{4,8}\b/.test(action) && !accessWords.test(action))
    return { text: `${action.replace(/[.\s]+$/, "")} enligt gällande säkerhetsrutin.`, redacted: true };
  return { text: SECURITY_PLACEHOLDER, redacted: true };
}

export function contentHasSensitiveAccessText(content: HandbookContent) {
  return Boolean(content.weekend && Object.values(content.weekend).some((rows) => rows.some((row) => containsSensitiveAccessText(row.product) || containsSensitiveAccessText(row.quantity)))) ||
    content.blocks.some((block) => block.type === "table"
    ? block.rows.some((row) => row.some(containsSensitiveAccessText))
    : block.type === "list" ? block.items.some(containsSensitiveAccessText)
      : containsSensitiveAccessText(block.text));
}

export function contentHasUnredactedAccessText(content: HandbookContent) {
  const withoutPlaceholder = structuredClone(content);
  for (const block of withoutPlaceholder.blocks) {
    if (block.type === "table") block.rows = block.rows.map((row) => row.map((cell) => cell.replaceAll(SECURITY_PLACEHOLDER, "")));
    else if (block.type === "list") block.items = block.items.map((item) => item.replaceAll(SECURITY_PLACEHOLDER, ""));
    else block.text = block.text.replaceAll(SECURITY_PLACEHOLDER, "");
  }
  return contentHasSensitiveAccessText(withoutPlaceholder);
}
