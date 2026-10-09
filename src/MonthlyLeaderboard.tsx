import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { percent, sek } from "./api";
import type { PersonStats, Staff, Stats } from "./types";
import { AVERAGE_LEAGUE_MINIMUM_SALES } from "../shared/business";

const rankings = [
  ["average", "Högst snittköp"],
  ["count", "Flest sålda tvättar"],
  ["revenue", "Högst omsättning"],
  ["premiumShare", "Högst Preemium-andel"],
] as const;
type Field = (typeof rankings)[number][0];

const medal = (index: number) => index < 3 ? ["🥇", "🥈", "🥉"][index] : String(index + 1);
const value = (person: PersonStats, field: Field) =>
  field === "count" ? `${person.count} tvättar` :
    field === "premiumShare" ? percent(person.premiumShare) : sek(person[field]);

function RankedList({ people, field, limit }: { people: PersonStats[]; field: Field; limit?: number }) {
  const eligible = people.filter((person) => person.count >= AVERAGE_LEAGUE_MINIMUM_SALES);
  return eligible.length ? (
    <ol className="monthly-leader-list" aria-label="Rankade säljare">
      {eligible.slice(0, limit).map((person, index) => (
        <li key={person.id}>
          <span className="monthly-rank" aria-label={`Plats ${index + 1}`}>{medal(index)}</span>
          {index < 3 ? <strong className="monthly-name">{person.name}</strong> : <span className="monthly-name">{person.name}</span>}
          <span className="monthly-value">{value(person, field)}</span>
        </li>
      ))}
    </ol>
  ) : <p className="monthly-empty">Ingen har nått tre giltiga tvättar den här månaden ännu.</p>;
}

export function MonthlyLeaderboard({ stats, month, team, error }: {
  stats: Stats | null;
  month: string;
  team: Staff[];
  error: boolean;
}) {
  const [open, setOpen] = useState(false);
  const openButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const monthName = new Intl.DateTimeFormat("sv-SE", { month: "long", timeZone: "UTC" })
    .format(new Date(`${month}-01T12:00:00Z`));
  const current = stats?.range.start.slice(0, 7) === month ? stats : null;
  const counts = new Map(current?.staff.map((person) => [person.id, person.count]) ?? []);
  const unqualified = team
    .filter((person) => (counts.get(person.id) ?? 0) < AVERAGE_LEAGUE_MINIMUM_SALES)
    .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.name.localeCompare(b.name, "sv"));

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key !== "Tab") return;
      const focusable = [...(panel.current?.querySelectorAll<HTMLElement>("button:not(:disabled), a[href]") ?? [])];
      if (!focusable.length) return;
      if (event.shiftKey && document.activeElement === focusable[0]) {
        event.preventDefault();
        focusable.at(-1)?.focus();
      } else if (!event.shiftKey && document.activeElement === focusable.at(-1)) {
        event.preventDefault();
        focusable[0].focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      openButton.current?.focus();
    };
  }, [open]);

  return (
    <section className="subpanel monthly-league" aria-label={`Topplista snittköp i ${monthName}`}>
      <h3>Topplista snittköp i {monthName}</h3>
      <p className="muted small-text league-caption">Innevarande månad · minst 3 giltiga tvättar</p>
      {current ? (
        <RankedList people={current.leaders.average} field="average" limit={5} />
      ) : (
        <p className="monthly-empty" role="status">{error ? "Månadsstatistiken kunde inte hämtas." : "Hämtar månadens topplista…"}</p>
      )}
      {current && current.leaders.average.filter((person) => person.count >= AVERAGE_LEAGUE_MINIMUM_SALES).length < 5 && (
        <p className="league-shortfall">Fler platser öppnas efter tre giltiga tvättar.</p>
      )}
      <button ref={openButton} className="monthly-more" disabled={!current} onClick={() => setOpen(true)}>
        Mer statistik
      </button>
      {open && current && (
        <div className="monthly-modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <div className="monthly-modal" ref={panel} role="dialog" aria-modal="true" aria-labelledby="monthly-modal-title">
            <header>
              <div>
                <h2 id="monthly-modal-title">Hela lagets statistik i {monthName}</h2>
                <p>Giltiga tvättar under innevarande månad</p>
              </div>
              <button ref={closeButton} onClick={() => setOpen(false)} aria-label="Stäng mer statistik"><X size={20} /></button>
            </header>
            <div className="monthly-modal-grid">
              {rankings.map(([field, label]) => (
                <section key={field}>
                  <h3>{label}</h3>
                  <RankedList people={current.leaders[field]} field={field} />
                </section>
              ))}
            </div>
            {!!unqualified.length && (
              <section className="monthly-unqualified">
                <h3>På väg in i listorna</h3>
                <ul>{unqualified.map((person) => (
                  <li key={person.id}><span>{person.name}</span><span>{AVERAGE_LEAGUE_MINIMUM_SALES - (counts.get(person.id) ?? 0)} tvättar kvar</span></li>
                ))}</ul>
              </section>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
