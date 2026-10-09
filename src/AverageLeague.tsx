import type { Stats } from "./types";
import { sek } from "./api";
import { Empty } from "./components";
import {
  AVERAGE_LEAGUE_MINIMUM_SALES,
  benchmarkComparison,
} from "../shared/business";

export function BenchmarkDelta({
  average,
  count,
  explanation = false,
}: {
  average: number;
  count: number;
  explanation?: boolean;
}) {
  const delta = benchmarkComparison(average, count);
  return (
    <div className="benchmark-comparison">
      {delta ? (
        <small className={`benchmark-delta ${delta.tone}`}>{delta.text}</small>
      ) : (
        <small className="muted">Ingen jämförelse ännu</small>
      )}
      {explanation && (
        <small className="benchmark-caption">mot jan–sep 2026 (250 kr)</small>
      )}
    </div>
  );
}
export function AverageLeague({
  stats,
  periodLabel,
}: {
  stats: Stats;
  periodLabel: string;
}) {
  const qualifying = stats.leaders.average.filter(
    (person) => person.count >= AVERAGE_LEAGUE_MINIMUM_SALES,
  ).slice(0, 5);
  const progress = stats.staff
    .filter((p) => p.count > 0 && p.count < AVERAGE_LEAGUE_MINIMUM_SALES)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "sv"));
  return (
    <section className="subpanel average-league" aria-label="Topplista snittköp">
      <h3>
        Topplista snittköp <span className="league-period">· {periodLabel}</span>
      </h3>
      <p className="muted small-text league-caption">
        Minst 3 giltiga tvättar · jämförelse mot jan–sep 2026 (250 kr)
      </p>
      {!qualifying.length ? (
        <Empty>
          {progress.length
            ? "Minst 3 tvättar krävs för att ta plats i listan."
            : "Snart börjar kampen om förstaplatsen."}
        </Empty>
      ) : (
        <ol className="average-league-list" aria-label="Rankade säljare">
          {qualifying.map((p, i) => (
            <li key={p.id} className={`league-place-${i + 1}`}>
              <span className="league-rank" aria-label={`Plats ${i + 1}`}>
                {i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}
              </span>
              <div className="league-person">
                {i < 3 ? <strong>{p.name}</strong> : <span>{p.name}</span>}
                <small>{p.count} tvättar</small>
              </div>
              <div className="league-result">
                <strong>{sek(p.average)}</strong>
                <BenchmarkDelta average={p.average} count={p.count} />
              </div>
            </li>
          ))}
        </ol>
      )}
      {qualifying.length > 0 && qualifying.length < 5 && (
        <p className="league-shortfall">{qualifying.length} av 5 platser tillsatta · minst 3 giltiga tvättar krävs</p>
      )}
      {!!progress.length && (
        <div className="league-progress">
          <h4>På väg in i listan</h4>
          {progress.slice(0, 1).map((p) => (
            <div key={p.id}>
              <span>{p.name}</span>
              <strong>{p.count}/3 tvättar</strong>
            </div>
          ))}
          {progress.length > 1 && (
            <p className="league-shortfall">Ytterligare {progress.length - 1} säljare är på väg in.</p>
          )}
        </div>
      )}
    </section>
  );
}
