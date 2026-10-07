import {
  CarFront,
  Droplets,
  UserRound,
  Sparkles,
  ArrowRight,
  CalendarDays,
  Trophy,
  LockKeyhole,
} from "lucide-react";
import type { CSSProperties } from "react";
import type { Staff, Stats } from "./types";
import { percent, sek } from "./api";

export function StationLogo() {
  return (
    <div className="station-logo" aria-label="Stationslogotyp, platshållare">
      <Droplets size={22} />
      <span>STATION</span>
    </div>
  );
}
export function Brand() {
  return (
    <div className="brand">
      <div className="brand-icon">
        <Droplets className="brand-drops" size={32} />
        <CarFront size={47} strokeWidth={2.6} />
      </div>
      <div>
        <strong>Tvättligan</strong>
        <span>Preem Tingsryd – Biltvättsförsäljning</span>
      </div>
    </div>
  );
}
export function Avatar({
  person,
  small = false,
}: {
  person: Staff;
  small?: boolean;
}) {
  return (
    <span
      className={`avatar ${small ? "small" : ""}`}
      style={{ "--accent": person.color } as CSSProperties}
    >
      <UserRound fill="currentColor" strokeWidth={1.8} />
    </span>
  );
}
export function CarArt({
  tone = "blue",
  hero = false,
}: {
  tone?: string;
  hero?: boolean;
}) {
  // Original vector illustration, independent of corporate assets or paid imagery.
  return (
    <svg
      className={`car-art ${hero ? "hero-art" : ""}`}
      viewBox="0 0 520 220"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`paint-${tone}`} x1="0" y1="0" x2="0.5" y2="1">
          <stop stopColor="#f7fbff" />
          <stop offset=".3" stopColor="#b9cedd" />
          <stop offset=".6" stopColor="#3f586f" />
          <stop offset="1" stopColor="#142938" />
        </linearGradient>
        <linearGradient id={`glass-${tone}`}>
          <stop stopColor="#12344d" />
          <stop offset="1" stopColor="#5e9ec0" />
        </linearGradient>
      </defs>
      <ellipse
        cx="278"
        cy="191"
        rx="171"
        ry="12"
        fill="#082238"
        opacity=".24"
      />
      <path
        d="M88 148 116 124 164 110 204 56 Q214 45 235 45 L338 46 Q358 47 374 65 L423 114 452 128 457 165 431 180 112 180 83 169Z"
        fill={`url(#paint-${tone})`}
        stroke="#cce2ed"
        strokeWidth="2"
      />
      <path
        d="m171 108 42-52h51l-6 54Zm100 2 5-54h61q12 0 21 11l34 45Z"
        fill={`url(#glass-${tone})`}
        stroke="#d1e6ee"
        strokeWidth="3"
      />
      <path d="m112 125 144-9 171 5-160 8Z" fill="#e3f2f8" opacity=".55" />
      <path d="m99 141 49-8 7 12-52 7Z" fill="#f0faff" />
      <path d="m424 134 24 5 3 12-29-5Z" fill="#a8dafa" />
      <path d="m111 155 44-3-6 16-39 1Z" fill="#102f44" />
      <path
        d="m162 134 101-6-8 27-87 8Z"
        fill="#0d263b"
        stroke="#68899f"
        strokeWidth="3"
      />
      <path
        d="m274 125 114-2 29 40-131 2Z"
        fill="none"
        stroke="#e2eff6"
        opacity=".3"
      />
      <rect x="211" y="141" width="25" height="6" rx="3" fill="#dcebf2" />
      <rect x="301" y="121" width="18" height="4" rx="2" fill="#effaff" />
      <g fill="#112435" stroke="#324e64" strokeWidth="6">
        <circle cx="167" cy="170" r="31" />
        <circle cx="394" cy="170" r="31" />
      </g>
      <g fill="#a8c0d1" stroke="#d1e2ec" strokeWidth="3">
        <circle cx="167" cy="170" r="19" />
        <circle cx="394" cy="170" r="19" />
      </g>
      <g fill="#304b60">
        <circle cx="167" cy="170" r="8" />
        <circle cx="394" cy="170" r="8" />
      </g>
      <g fill="#fff" opacity=".65">
        <circle cx="66" cy="140" r="4" />
        <circle cx="74" cy="104" r="3" />
        <circle cx="458" cy="91" r="5" />
        <circle cx="435" cy="62" r="3" />
        <circle cx="114" cy="77" r="4" />
      </g>
      <path
        d="m60 183 68-21m316 14 43 12M86 192l38-6m324 12 39-2"
        stroke="#d9f5ff"
        strokeWidth="3"
        opacity=".65"
      />
    </svg>
  );
}
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="empty">
      <Sparkles size={27} />
      <p>{children}</p>
    </div>
  );
}
export function PeriodPicker({
  period,
  setPeriod,
  start,
  end,
  setStart,
  setEnd,
}: {
  period: string;
  setPeriod: (v: string) => void;
  start: string;
  end: string;
  setStart: (v: string) => void;
  setEnd: (v: string) => void;
}) {
  return (
    <div className="period-picker">
      <div className="segmented">
        {[
          ["today", "Idag"],
          ["week", "Vecka"],
          ["month", "Månad"],
          ["custom", "Valfri period"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={period === key ? "selected" : ""}
            onClick={() => setPeriod(key)}
            aria-pressed={period === key}
          >
            {label}
          </button>
        ))}
      </div>
      {period === "custom" && (
        <div className="date-fields">
          <CalendarDays size={17} />
          <label>
            Från
            <input
              aria-label="Från datum"
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            Till
            <input
              aria-label="Till datum"
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>
      )}
    </div>
  );
}
export function Goals({ stats }: { stats: Stats }) {
  return (
    <div className="goal-grid">
      {[
        ["Dagens mål", stats.goals.dailyCount, stats.goals.daily],
        ["Månadens mål", stats.goals.monthlyCount, stats.goals.monthly],
      ].map(([label, count, target]) => (
        <div className="goal" key={label}>
          <div>
            <span>
              <Trophy size={18} /> {label}
            </span>
            <strong>
              {count} / {target} tvättar
            </strong>
          </div>
          <progress
            aria-label={String(label)}
            value={Number(count)}
            max={Number(target) || 1}
          />
          {!target && <small>Inget mål angivet</small>}
        </div>
      ))}
    </div>
  );
}
export function Dashboard({ stats }: { stats: Stats }) {
  const kpis = [
    ["Antal tvättar", String(stats.count), "blue", CarFront],
    ["Omsättning", sek(stats.revenue), "cyan", Droplets],
    ["Snittköp", sek(stats.average), "purple", ArrowRight],
    ["Preemium-andel", percent(stats.premiumShare), "gold", Trophy],
  ] as const;
  const leaderFields = [
    ["count", "Flest sålda tvättar"],
    ["revenue", "Högst omsättning"],
    ["average", "Högst snittköp"],
    ["premiumShare", "Högst Preemium-andel"],
  ] as const;
  return (
    <>
      <div className="kpi-grid">
        {kpis.map(([label, value, tone, Icon]) => (
          <div className={`kpi ${tone}`} key={label}>
            <span className="kpi-icon">
              <Icon size={24} />
            </span>
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
              <small>
                {stats.count ? "Vald period" : "Inga registreringar ännu"}
              </small>
            </div>
          </div>
        ))}
      </div>
      <Goals stats={stats} />
      <div className="dashboard-grid">
        <section className="subpanel">
          <h3>Sålda tvättprogram</h3>
          {!stats.programs.length ? (
            <Empty>Här visas tvättarna när laget börjar sälja.</Empty>
          ) : (
            <div className="bar-chart">
              {stats.programs.map((p) => (
                <div className="bar-column" key={p.id}>
                  <strong>{p.count}</strong>
                  <div
                    className={`bar ${p.id}`}
                    style={{
                      height: `${Math.max(6, (p.count / Math.max(...stats.programs.map((x) => x.count))) * 150)}px`,
                    }}
                  />
                  <span>{p.name}</span>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="subpanel">
          <h3>
            Topplista <span className="tag">Säljare</span>
          </h3>
          <div className="leader-grid">
            {leaderFields.map(([field, label]) => (
              <div key={field}>
                <h4>{label}</h4>
                {!stats.leaders[field].length ? (
                  <p className="muted small-text">
                    {field === "average" || field === "premiumShare"
                      ? "Minst 3 tvättar krävs för att kvalificera."
                      : "Inga försäljningar i perioden."}
                  </p>
                ) : (
                  <ol className="leader-list">
                    {stats.leaders[field].slice(0, 5).map((p, i) => (
                      <li key={p.id}>
                        <span className={`rank rank-${i}`}>{i + 1}</span>
                        <span>{p.name}</span>
                        <strong>
                          {field === "count"
                            ? p.count
                            : field === "premiumShare"
                              ? percent(p[field])
                              : sek(p[field])}
                        </strong>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
export function RestrictedNote() {
  return (
    <p className="restricted-note">
      <LockKeyhole size={15} /> Endast behörig personal
    </p>
  );
}
