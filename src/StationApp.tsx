import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Clock3,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { api, HttpError, send } from "./api";
import StationDashboardV2 from "./StationDashboardV2";
import StationV2Admin from "./StationV2Admin";

type Summary = {
  business_date: string;
  comparison_date: string;
  net_sales_ore: number | null;
  comparison_sales_ore: number | null;
  difference_ore: number | null;
  percent: number | null;
};
type Sale = {
  business_date: string;
  net_sales_ore: number;
  source: string;
  revision: number;
  updated_at: string;
  actor: string;
};
type Audit = {
  action: string;
  actor: string;
  old_net_sales_ore: number | null;
  new_net_sales_ore: number;
  reason: string | null;
  changed_at: string;
};
type Device = {
  id: string;
  device_label: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
};

const kronor = (ore: number) =>
  new Intl.NumberFormat("sv-SE", {
    style: "currency",
    currency: "SEK",
    minimumFractionDigits: ore % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(ore / 100);
const signed = (ore: number) => `${ore > 0 ? "+" : ""}${kronor(ore)}`;
const dated = (value: string) =>
  new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "full",
    timeZone: "Europe/Stockholm",
  }).format(new Date(`${value}T12:00:00Z`));
const time = (value: string) =>
  new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Stockholm",
  }).format(new Date(value));
function parseKronor(raw: string): number | null {
  const compact = raw.trim().replace(/[\s\u00a0\u202f]/g, "");
  if (!/^(?:0|[1-9]\d*)(?:,\d{1,2})?$/.test(compact)) return null;
  const [whole, fraction = ""] = compact.split(",");
  const ore = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(ore) && ore <= 10_000_000_000 ? ore : null;
}

function Shell({
  children,
  sub,
  onViewerLogout,
}: {
  children: React.ReactNode;
  sub: string;
  onViewerLogout?: () => void;
}) {
  return (
    <div className="station-shell">
      <header className="station-head">
        <div className="station-mark">
          <img className="station-mark-icon" src="/preem-logo-review.png" alt="Preem" />
          <div>
            <strong>PREEM TINGSRYD</strong>
            <small>BUTIKSFÖRSÄLJNING</small>
          </div>
        </div>
        <span className="station-head-sub">{sub}</span>
      </header>
      {children}
      <footer className="station-foot">
        <span>Preem Tingsryd · Tillsammans framåt</span>
        {onViewerLogout && (
          <button onClick={onViewerLogout}>Avsluta visning</button>
        )}
        <a href="/">
          Öppna Tvättligan <ArrowRight size={15} />
        </a>
      </footer>
    </div>
  );
}

function StationLogin() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        "/station/activate",
        send("POST", { code: code.trim().toLowerCase() }),
      );
      window.location.assign("/station");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Shell sub="Aktivera visning">
      <main className="station-center">
        <span className="station-auth-icon">
          <LockKeyhole size={28} />
        </span>
        <p className="station-eyebrow">PERSONAL & TV</p>
        <h1>Öppna stationsdashboarden</h1>
        <p>
          Be en administratör om en engångskod för den här enheten. Koden gäller
          i tio minuter.
        </p>
        <form onSubmit={(e) => void submit(e)}>
          <label>
            Aktiveringskod
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="one-time-code"
              maxLength={16}
              required
              placeholder="16 tecken"
            />
          </label>
          <button className="station-primary" disabled={busy}>
            Aktivera visning <ArrowRight size={18} />
          </button>
        </form>
        {error && (
          <p role="alert" className="station-error">
            {error}
          </p>
        )}
        <a className="station-subtle-link" href="/station/admin">
          Administratör? Öppna administrationen
        </a>
      </main>
    </Shell>
  );
}

function StationAdmin() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [pin, setPin] = useState("");
  const [rows, setRows] = useState<Sale[]>([]);
  const [yesterday, setYesterday] = useState("");
  const [day, setDay] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [audit, setAudit] = useState<Audit[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceLabel, setDeviceLabel] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const [sales, sessions] = await Promise.all([
        api<{ yesterday: string; rows: Sale[] }>("/admin/station/store-sales"),
        api<Device[]>("/admin/station/view-sessions"),
      ]);
      setAdmin(true);
      setRows(sales.rows);
      setDevices(sessions);
      setYesterday(sales.yesterday);
      setDay((d) => d || sales.yesterday);
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) setAdmin(false);
      else setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const selected = rows.find((r) => r.business_date === day);
  useEffect(() => {
    setAmount(
      selected
        ? (selected.net_sales_ore / 100).toFixed(2).replace(".", ",")
        : "",
    );
    setReason("");
  }, [selected?.business_date, selected?.revision, day]);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/admin/login", send("POST", { pin }));
      setPin("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    try {
      await api("/admin/logout", { method: "POST" });
      setAdmin(false);
      setRows([]);
      setDevices([]);
      setAudit([]);
      setCode("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const ore = parseKronor(amount);
    if (ore === null) {
      setError("Ange ett giltigt belopp i kronor, till exempel 12 345,67.");
      return;
    }
    if (selected && (!reason.trim() || reason.trim().length < 3)) {
      setError("Ange en kort rättningsorsak.");
      return;
    }
    if (
      selected &&
      !window.confirm(
        `Rätta ${dated(day)} från ${kronor(selected.net_sales_ore)} till ${kronor(ore)}?`,
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(
        `/admin/station/store-sales/${day}`,
        send("PUT", {
          net_sales_ore: ore,
          expected_revision: selected?.revision ?? null,
          reason: selected ? reason.trim() : undefined,
        }),
      );
      await load();
      setNotice(
        selected ? "Rättningen är sparad." : "Gårdagens försäljning är sparad.",
      );
    } catch (e) {
      setError((e as Error).message);
      await load();
    } finally {
      setBusy(false);
    }
  }
  async function history(value: string) {
    setDay(value);
    setError("");
    try {
      setAudit(await api<Audit[]>(`/admin/station/store-sales/${value}/audit`));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function activate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ code: string; expires_at: string }>(
        "/admin/station/activation-codes",
        send("POST", { device_label: deviceLabel }),
      );
      setCode(result.code);
      setDeviceLabel("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    if (!window.confirm("Återkalla visningsbehörigheten för den här enheten?"))
      return;
    try {
      await api(`/admin/station/view-sessions/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Shell sub="Administration">
      <main className="station-admin">
        <div className="station-admin-heading">
          <div>
            <p className="station-eyebrow">SKYDDAD ADMINISTRATION</p>
            <h1>Station admin</h1>
            <p>
              Registrera nettot från gårdagen och rätta historiska värden med
              spårbarhet.
            </p>
          </div>
          <div className="station-admin-actions">
            <a className="station-outline" href="/station">
              Visa dashboarden <ArrowRight size={17} />
            </a>
            {admin && <button onClick={() => void logout()}>Logga ut</button>}
          </div>
        </div>
        {admin === null ? (
          <p>Kontrollerar behörighet…</p>
        ) : admin === false ? (
          <section className="station-admin-card station-login-card">
            <ShieldCheck size={28} />
            <h2>Logga in som administratör</h2>
            <form onSubmit={(e) => void login(e)}>
              <label>
                Administratörs-PIN
                <input
                  type="password"
                  inputMode="numeric"
                  minLength={6}
                  maxLength={12}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  required
                />
              </label>
              <button className="station-primary" disabled={busy}>
                Logga in <ArrowRight size={18} />
              </button>
            </form>
          </section>
        ) : (
          <>
            <nav className="station-admin-nav" aria-label="Administrera stationen">
              <a href="#station-sales">Försäljningsdata</a>
              <a href="#station-notices">Viktig info</a>
              <a href="#station-monthly">Förra månadens siffror</a>
              <a href="#station-schedule">Arbetsschema</a>
            </nav>
            <h2 className="station-admin-sales-title">Butikens dagsresultat</h2>
            <div className="station-admin-grid" id="station-sales">
              <section className="station-admin-card">
                <span className="station-card-index">01 / REGISTRERA</span>
                <h2>{selected ? "Rätta dagsvärde" : "Registrera dagsvärde"}</h2>
                <p>
                  Endast butiksförsäljning exklusive moms. Drivmedel ska inte
                  ingå.
                </p>
                <form onSubmit={(e) => void save(e)}>
                  <label>
                    Försäljningsdatum
                    <input
                      type="date"
                      value={day}
                      max={yesterday}
                      onChange={(e) => {
                        setDay(e.target.value);
                        setAudit([]);
                      }}
                      required
                    />
                  </label>
                  <label>
                    Belopp exkl. moms, kr
                    <input
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="12 345,67"
                      required
                    />
                  </label>
                  {selected && (
                    <>
                      <p className="station-previous">
                        Tidigare värde:{" "}
                        <strong>{kronor(selected.net_sales_ore)}</strong> ·
                        version {selected.revision}
                      </p>
                      <label>
                        Orsak till rättning
                        <input
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          maxLength={200}
                          minLength={3}
                          required
                          placeholder="Kort förklaring"
                        />
                      </label>
                    </>
                  )}
                  <button className="station-primary" disabled={busy}>
                    {selected ? "Granska och rätta" : "Spara försäljning"}{" "}
                    <ArrowRight size={18} />
                  </button>
                </form>
              </section>
              <section className="station-admin-card">
                <span className="station-card-index">02 / HISTORIK</span>
                <h2>Registrerade dagar</h2>
                <div className="station-history">
                  {rows.length === 0 ? (
                    <p>Inga dagar registrerade ännu.</p>
                  ) : (
                    rows.map((row) => (
                      <button
                        key={row.business_date}
                        onClick={() => void history(row.business_date)}
                        className={day === row.business_date ? "selected" : ""}
                      >
                        <span>{row.business_date}</span>
                        <strong>{kronor(row.net_sales_ore)}</strong>
                        <span className="station-history-arrow">→</span>
                      </button>
                    ))
                  )}
                </div>
                {audit.length > 0 && (
                  <div className="station-audit">
                    <h3>Ändringar för {day}</h3>
                    {audit.map((item, index) => (
                      <p key={index}>
                        <Clock3 size={14} />
                        <span>
                          {time(item.changed_at)} ·{" "}
                          {item.action === "CREATE" ? "Registrerat" : "Rättat"}{" "}
                          av {item.actor}
                          <br />
                          {item.old_net_sales_ore === null
                            ? ""
                            : `${kronor(item.old_net_sales_ore)} → `}
                          {kronor(item.new_net_sales_ore)}
                          {item.reason ? ` · ${item.reason}` : ""}
                        </span>
                      </p>
                    ))}
                  </div>
                )}
              </section>
            </div>
            <section className="station-admin-card station-device-card">
              <div>
                <span className="station-card-index">
                  03 / VISNINGSBEHÖRIGHET
                </span>
                <h2>Aktivera en enhet</h2>
                <p>
                  Skapa en engångskod för en TV eller personaldator. Koden
                  gäller i tio minuter.
                </p>
                <form
                  onSubmit={(e) => void activate(e)}
                  className="station-device-form"
                >
                  <label>
                    Enhetens namn
                    <input
                      value={deviceLabel}
                      onChange={(e) => setDeviceLabel(e.target.value)}
                      maxLength={60}
                      placeholder="Till exempel personalrummets TV"
                      required
                    />
                  </label>
                  <button className="station-outline" disabled={busy}>
                    Skapa kod
                  </button>
                </form>
                {code && (
                  <p className="station-code" role="status">
                    Engångskod: <strong>{code}</strong>
                    <br />
                    <small>
                      Ge koden till personen vid enheten. Den visas bara här nu.
                    </small>
                  </p>
                )}
              </div>
              <div>
                <div className="station-device-heading">
                  <h3>Aktiverade enheter</h3>
                  <button
                    onClick={() => void load()}
                    aria-label="Uppdatera enheter"
                  >
                    <RefreshCw size={17} />
                  </button>
                </div>
                {devices.length === 0 ? (
                  <p>Inga enheter aktiverade ännu.</p>
                ) : (
                  <ul className="station-device-list">
                    {devices.map((d) => (
                      <li key={d.id}>
                        <span>
                          <strong>{d.device_label}</strong>
                          <small>
                            {d.revoked_at
                              ? "Återkallad"
                              : new Date(d.expires_at) <= new Date()
                                ? "Utgången"
                                : `Giltig till ${time(d.expires_at)}`}
                          </small>
                        </span>
                        {!d.revoked_at &&
                          new Date(d.expires_at) > new Date() && (
                            <button onClick={() => void revoke(d.id)}>
                              Återkalla
                            </button>
                          )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
            <StationV2Admin />
          </>
        )}
        {error && (
          <p role="alert" className="station-error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="station-notice">
            <Check size={16} />
            {notice}
          </p>
        )}
      </main>
    </Shell>
  );
}

export default function StationApp() {
  const path = window.location.pathname;
  useEffect(() => {
    document.title =
      path === "/station/admin"
        ? "Administration · Preem Tingsryd"
        : path === "/station/login"
          ? "Aktivera visning · Preem Tingsryd"
          : "Butiksförsäljning · Preem Tingsryd";
  }, [path]);
  return path === "/station/admin" ? (
    <StationAdmin />
  ) : path === "/station/login" ? (
    <StationLogin />
  ) : (
    <StationDashboardV2 />
  );
}
