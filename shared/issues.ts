export type Issue = {
  id: string;
  title: string;
  description: string;
  location: string;
  completed: number;
  revision: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};
export type IssueEvent = {
  id: number;
  action: "created" | "edited" | "note" | "completed" | "reopened";
  note_text: string | null;
  occurred_at: string;
};
export type IssuePage = { items: Issue[]; next_cursor: string | null };
export type IssueEventPage = { events: IssueEvent[]; next_cursor: number | null };

const stockholmDateTime = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Stockholm", day: "numeric", month: "numeric", year: "numeric",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
export const issueDateTime = (iso: string) => stockholmDateTime.format(new Date(iso));
export function issueEventDescription(event: IssueEvent) {
  switch (event.action) {
    case "created": return "Fel registrerat";
    case "edited": return "Ärendets uppgifter ändrades";
    case "note": return `Åtgärd: ${event.note_text ?? ""}`;
    case "completed": return "Markerat som slutfört";
    case "reopened": return "Slutförande ångrades";
  }
}
