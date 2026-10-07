import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Download } from "lucide-react";
import { api, HttpError, send } from "./api";
import type { Staff } from "./types";
import { readyServiceWorker, supportsPush } from "./pwa";

interface Owner {
  id: string;
  token: string;
}
interface Device {
  id: string;
  staff_id: string | null;
  device_label: string | null;
  active: boolean;
}
interface Config {
  configured: boolean;
  publicKey: string | null;
  enabled: boolean;
}
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
const storedKey = "tvattligan-push-owner";
const standalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  !!(navigator as Navigator & { standalone?: boolean }).standalone;
function readOwner(): Owner | null {
  try {
    const value = JSON.parse(localStorage.getItem(storedKey) ?? "null");
    return value &&
      typeof value.id === "string" &&
      /^[A-Za-z0-9_-]{43}$/.test(value.token)
      ? value
      : null;
  } catch {
    return null;
  }
}
const headers = (owner: Owner) => ({
  "X-Push-Id": owner.id,
  "X-Push-Token": owner.token,
});
function applicationKey(value: string) {
  return Uint8Array.from(
    atob(
      value.replaceAll("-", "+").replaceAll("_", "/") +
        "=".repeat((4 - (value.length % 4)) % 4),
    ),
    (c) => c.charCodeAt(0),
  );
}
export function deliveryMessage(result: {
  state: string;
  sent: number;
  total: number;
  failed: number;
}) {
  if (result.state === "sending" || result.state === "pending")
    return "Notisen bearbetas. Uppdatera status om en stund; skicka inte en ny kopia.";
  if (result.state === "skipped")
    return "Notisen skickades inte eftersom push är avstängt.";
  if (!result.total) return "Ingen aktiv enhet kunde ta emot notisen.";
  return `Skickat till ${result.sent} av ${result.total} enheter${result.failed ? ` · ${result.failed} leveranser misslyckades.` : "."}`;
}
export function PushControls({
  staff,
  disabled,
}: {
  staff: Staff[];
  disabled: boolean;
}) {
  const [install, setInstall] = useState<InstallPrompt | null>(null),
    [installed, setInstalled] = useState(standalone);
  const [config, setConfig] = useState<Config | null>(null),
    [owner, setOwner] = useState<Owner | null>(readOwner),
    [device, setDevice] = useState<Device | null>(null);
  const [association, setAssociation] = useState(""),
    [label, setLabel] = useState("");
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    supportsPush() ? Notification.permission : "default",
  );
  const [native, setNative] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const lock = useRef(false),
    testRequest = useRef<string | null>(null);
  const supported = supportsPush();
  useEffect(() => {
    if (!supported) return;
    // Read permission on return from browser settings; never ask for it here.
    const refresh = () => setPermission(Notification.permission);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [supported]);
  useEffect(() => {
    const before = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallPrompt);
    };
    const done = () => {
      setInstalled(true);
      setInstall(null);
    };
    window.addEventListener("beforeinstallprompt", before);
    window.addEventListener("appinstalled", done);
    return () => {
      window.removeEventListener("beforeinstallprompt", before);
      window.removeEventListener("appinstalled", done);
    };
  }, []);
  useEffect(() => {
    let alive = true;
    void api<Config>("/push/public-key")
      .then((value) => {
        if (alive) setConfig(value);
      })
      .catch(() => {
        if (alive)
          setError(
            "Pushstatus kunde inte hämtas. Ladda om för att försöka igen.",
          );
      });
    if (supported)
      void readyServiceWorker()
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => {
          if (alive) setNative(!!sub);
        })
        .catch(() => {});
    if (owner)
      void api<Device>("/push/subscription", { headers: headers(owner) })
        .then((value) => {
          if (alive) {
            setDevice(value);
            setAssociation(value.staff_id ?? "shared");
            setLabel(value.device_label ?? "");
          }
        })
        .catch(() => {
          if (alive) setDevice(null);
        });
    return () => {
      alive = false;
    };
  }, [owner, supported]);
  const run = async (action: () => Promise<void>) => {
    if (lock.current || disabled) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof HttpError
          ? e.message
          : "Åtgärden kunde inte slutföras. Kontrollera internetanslutningen och webbläsarens inställningar och försök igen.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const active = !!device?.active && native && permission === "granted";
  const enable = () =>
    void run(async () => {
      if (!config?.configured || !config.publicKey) {
        setMessage(
          "Admin behöver konfigurera pushnycklar innan enheten kan kopplas.",
        );
        return;
      }
      if (!association) {
        setError("Välj Gemensam enhet eller en aktiv säljare först.");
        return;
      }
      // This is called directly from the click handler, never from an effect or page load.
      const allowed =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
      setPermission(allowed);
      if (allowed !== "granted") {
        setMessage(
          allowed === "denied"
            ? "Pushnotiser är blockerade. Tillåt notiser i webbläsarens webbplatsinställningar."
            : "Du kan slå på pushnotiser när du vill.",
        );
        return;
      }
      const reg = await readyServiceWorker();
      let sub = await reg.pushManager.getSubscription();
      const publicKey = applicationKey(config.publicKey);
      if (sub) {
        const previous = sub.options.applicationServerKey;
        if (
          previous &&
          ![...new Uint8Array(previous)].every((b, i) => b === publicKey[i])
        ) {
          await sub.unsubscribe();
          sub = null;
        }
      }
      if (!sub)
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: publicKey,
        });
      const result = await api<Device & { token: string }>(
        "/push/subscribe",
        send("POST", {
          subscription: sub.toJSON(),
          staff_id: association === "shared" ? null : association,
          ...(label.trim() ? { device_label: label.trim() } : {}),
        }),
      );
      const next = { id: result.id, token: result.token };
      localStorage.setItem(storedKey, JSON.stringify(next));
      setOwner(next);
      setDevice(result);
      setNative(true);
      setMessage(
        config.enabled
          ? "Pushnotiser är aktiverade för den här enheten."
          : "Enheten är kopplad. Push är tills vidare avstängt av Admin.",
      );
    });
  return (
    <details className="device-push-panel">
      <summary>
        <Bell size={16} /> App och notiser
      </summary>
      <div className="device-push-content">
        <div className="install-controls">
          <h3>Tvättligan på din enhet</h3>
          {installed ? (
            <p className="muted">Tvättligan körs som installerad app.</p>
          ) : install ? (
            <button
              className="button secondary"
              disabled={busy || disabled}
              onClick={() =>
                void run(async () => {
                  await install.prompt();
                  const choice = await install.userChoice;
                  setInstall(null);
                  setMessage(
                    choice.outcome === "accepted"
                      ? "Installationen har startats."
                      : "Du kan installera senare via webbläsarmenyn.",
                  );
                })
              }
            >
              <Download size={16} /> Installera Tvättligan
            </button>
          ) : (
            <p className="muted small-text">
              Om webbläsaren stöder installation: välj Installera app eller Lägg
              till på hemskärmen i webbläsarmenyn.
            </p>
          )}
          {!installed && (
            <p className="muted small-text">
              På iPhone/iPad: lägg Tvättligan på hemskärmen för att kunna
              aktivera pushnotiser (iOS/iPadOS 16.4 eller senare).
            </p>
          )}
        </div>
        <div>
          <h3>Pushnotiser</h3>
          <p className="muted">
            Få mål, resultat och viktiga meddelanden från Tvättligan.
          </p>
          {!supported ? (
            <p>
              Den här webbläsaren stöder inte Web Push i nuvarande läge. Prova
              en kompatibel webbläsare eller den installerade appen.
            </p>
          ) : (
            <>
              <p className="small-text">
                {permission === "denied"
                  ? "Notiser är blockerade. Tillåt dem i webbläsarens webbplatsinställningar."
                  : active
                    ? "Aktiv prenumeration på den här enheten."
                    : permission === "granted"
                      ? "Notiser är tillåtna, men enheten behöver kopplas eller aktiveras."
                      : "Notiser begärs bara när du själv väljer att slå på dem."}
              </p>
              {config && !config.configured && (
                <p className="muted small-text">
                  Pushnycklar är ännu inte konfigurerade av Admin.
                </p>
              )}
              {config?.configured && !config.enabled && (
                <p className="muted small-text">
                  Pushnotiser är globalt avstängda av Admin. Enhetskopplingen
                  kan ändå sparas.
                </p>
              )}
              <div className="notification-form-row">
                <label>
                  Enhetskoppling
                  <select
                    value={association}
                    disabled={busy || disabled}
                    onChange={(e) => setAssociation(e.target.value)}
                  >
                    <option value="">Välj koppling</option>
                    <option value="shared">Gemensam enhet</option>
                    {device?.staff_id &&
                      !staff.some((p) => p.id === device.staff_id) && (
                        <option value={device.staff_id} disabled>
                          Tidigare säljare (inaktiv)
                        </option>
                      )}
                    {staff.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Enhetsnamn (valfritt)
                  <input
                    value={label}
                    maxLength={60}
                    disabled={busy || disabled}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="T.ex. kassan"
                  />
                </label>
              </div>
              <p className="muted small-text">
                Enhetskopplingen är separat från namnvalet vid försäljning och
                ändras aldrig automatiskt.
              </p>
              <div className="notification-actions">
                {!active ? (
                  <button
                    className="button secondary"
                    disabled={
                      busy ||
                      disabled ||
                      permission === "denied" ||
                      !config?.configured ||
                      !association
                    }
                    onClick={enable}
                  >
                    Slå på pushnotiser
                  </button>
                ) : (
                  <button
                    className="button secondary"
                    disabled={busy || disabled || !association}
                    onClick={() =>
                      void run(async () => {
                        const result = await api<Device>("/push/subscription", {
                          ...send("PATCH", {
                            staff_id:
                              association === "shared" ? null : association,
                            device_label: label.trim() || null,
                          }),
                          headers: headers(owner!),
                        });
                        setDevice(result);
                        setMessage(
                          "Enhetskopplingen är sparad. Notisbehörigheten är oförändrad.",
                        );
                      })
                    }
                  >
                    Spara enhetskoppling
                  </button>
                )}
                {(owner || native) && (
                  <button
                    className="text-button"
                    disabled={busy || disabled}
                    onClick={() =>
                      void run(async () => {
                        let serverDisabled = !owner;
                        if (owner) {
                          try {
                            await api("/push/unsubscribe", {
                              method: "DELETE",
                              headers: headers(owner),
                            });
                            serverDisabled = true;
                          } catch {
                            // Still revoke the native subscription if offline or the owner token is stale.
                          }
                        }
                        const reg =
                          await navigator.serviceWorker.getRegistration("/");
                        const sub = await reg?.pushManager.getSubscription();
                        if (sub && !(await sub.unsubscribe()))
                          throw new Error("Native unsubscribe failed");
                        setNative(false);
                        if (!serverDisabled) {
                          setMessage(
                            "Push är avstängt i webbläsaren. Serverkopplingen kunde inte uppdateras; prova igen när du är online.",
                          );
                          return; // Retain the owner capability so server deactivation can be retried.
                        }
                        setDevice((value) =>
                          value ? { ...value, active: false } : null,
                        );
                        localStorage.removeItem(storedKey);
                        setOwner(null);
                        setMessage(
                          "Pushnotiser är avstängda på den här enheten.",
                        );
                      })
                    }
                  >
                    Stäng av pushnotiser
                  </button>
                )}
                {active && (
                  <button
                    className="text-button"
                    disabled={busy || disabled || !config?.enabled}
                    onClick={() =>
                      void run(async () => {
                        testRequest.current ??= crypto.randomUUID();
                        const result = await api<{
                          state: string;
                          sent: number;
                          total: number;
                          failed: number;
                        }>("/push/test", {
                          ...send("POST", { request_id: testRequest.current }),
                          headers: headers(owner!),
                        });
                        setMessage(deliveryMessage(result));
                        if (
                          result.state === "complete" ||
                          result.state === "skipped"
                        )
                          testRequest.current = null;
                      })
                    }
                  >
                    Skicka testnotis till den här enheten
                  </button>
                )}
              </div>
            </>
          )}
        </div>
        {busy && <p role="status">Arbetar…</p>}
        {message && (
          <p role="status" className="notification-feedback">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}

interface NotificationSettings {
  push_enabled: number;
  push_goal_close_enabled: number;
  push_goal_close_threshold: number;
  push_goal_reached_enabled: number;
}
interface NotificationStatus {
  configured: boolean;
  settings: NotificationSettings;
  counts: { active: number; shared: number };
  staff: { id: string; name: string; devices: number }[];
  events: {
    event_type: string;
    event_date: string;
    title: string;
    state: string;
    total: number;
    sent: number;
    failed: number;
    created_at: string;
  }[];
}
export function AdminNotifications({
  staff,
  dailyGoal,
  onUnauthorized,
}: {
  staff: Staff[];
  dailyGoal: number;
  onUnauthorized: () => void;
}) {
  const [status, setStatus] = useState<NotificationStatus | null>(null),
    [draft, setDraft] = useState<NotificationSettings | null>(null);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(""),
    [message, setMessage] = useState(""),
    [audience, setAudience] = useState("all"),
    [staffId, setStaffId] = useState(""),
    [destination, setDestination] = useState("start");
  const lock = useRef(false),
    pending = useRef<{ data: string; id: string } | null>(null);
  const load = useCallback(async () => {
    const result = await api<NotificationStatus>("/admin/notifications");
    setStatus(result);
    setDraft(result.settings);
  }, []);
  const problem = useCallback(
    (e: unknown) => {
      setError(
        e instanceof HttpError
          ? e.message
          : "Notisstatus kunde inte hämtas. Kontrollera internetanslutningen.",
      );
      if (e instanceof HttpError && e.status === 401) onUnauthorized();
    },
    [onUnauthorized],
  );
  useEffect(() => {
    void load().catch(problem);
  }, [load, problem]);
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      await load();
    } catch (e) {
      problem(e);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  if (!status || !draft)
    return (
      <section>
        {error ? (
          <p role="alert" className="error-text">
            {error}
          </p>
        ) : (
          <p>Hämtar pushstatus…</p>
        )}
        <button
          className="button secondary"
          onClick={() => void run(load)}
          disabled={busy}
        >
          Uppdatera pushstatus
        </button>
      </section>
    );
  return (
    <section className="notifications-admin">
      <div className="notification-status-grid">
        <div className="notification-status-card">
          <span>Pushstatus</span>
          <strong>
            {!status.configured
              ? "VAPID saknas"
              : status.settings.push_enabled
                ? "På"
                : "Av"}
          </strong>
        </div>
        <div className="notification-status-card">
          <span>Aktiva enheter</span>
          <strong>{status.counts.active}</strong>
        </div>
        <div className="notification-status-card">
          <span>Gemensamma enheter</span>
          <strong>{status.counts.shared}</strong>
        </div>
      </div>
      <button
        className="text-button"
        disabled={busy}
        onClick={() => void run(load)}
      >
        Uppdatera pushstatus
      </button>
      {!status.configured && (
        <p className="info-box">
          Konfigurera VAPID-nycklar som Worker-hemligheter före aktivering.
          Privata nycklar eller enhetsadresser visas aldrig här.
        </p>
      )}
      <div className="notification-admin-grid">
        <form
          className="subpanel notification-settings"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api("/admin/notifications/settings", send("PUT", draft));
              setNotice("Notisinställningarna är sparade.");
            });
          }}
        >
          <h2>Automatiska notiser</h2>
          <label className="notification-toggle">
            <input
              type="checkbox"
              checked={!!draft.push_enabled}
              disabled={busy || !status.configured}
              onChange={(e) =>
                setDraft({ ...draft, push_enabled: e.target.checked ? 1 : 0 })
              }
            />{" "}
            Pushnotiser globalt
          </label>
          <p className="muted small-text">
            När push är av skickas inga automatiska, manuella eller testnotiser.
          </p>
          <label className="notification-toggle">
            <input
              type="checkbox"
              checked={!!draft.push_goal_close_enabled}
              disabled={busy}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  push_goal_close_enabled: e.target.checked ? 1 : 0,
                })
              }
            />{" "}
            Nära dagens mål
          </label>
          <label>
            Tvättar kvar till målet
            <input
              type="number"
              min="1"
              max="10000"
              step="1"
              value={draft.push_goal_close_threshold}
              disabled={busy}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  push_goal_close_threshold: Number(e.target.value),
                })
              }
              required
            />
          </label>
          <p className="muted small-text">
            Dagens mål: {dailyGoal} tvättar.{" "}
            {dailyGoal <= draft.push_goal_close_threshold
              ? "Nära-målet-notisen är inte aktuell när tröskeln är lika stor som eller större än målet."
              : "En notis när laget först når tröskeln."}
          </p>
          <label className="notification-toggle">
            <input
              type="checkbox"
              checked={!!draft.push_goal_reached_enabled}
              disabled={busy}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  push_goal_reached_enabled: e.target.checked ? 1 : 0,
                })
              }
            />{" "}
            Dagens mål uppnått
          </label>
          <p className="muted small-text">
            Högst en notis av varje måltyp per Stockholmsdygn, även efter
            ångring eller nollställning. Ledningsbyte är av och inte
            automatiserat i V1.
          </p>
          <button className="button secondary" disabled={busy}>
            Spara notisinställningar
          </button>
        </form>
        <form
          className="subpanel notification-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const data = {
                title,
                body: message,
                audience,
                ...(audience === "staff" ? { staff_id: staffId } : {}),
                destination,
              };
              const serial = JSON.stringify(data);
              if (!pending.current || pending.current.data !== serial)
                pending.current = { data: serial, id: crypto.randomUUID() };
              const result = await api<{
                state: string;
                sent: number;
                total: number;
                failed: number;
              }>(
                "/admin/notifications/send",
                send("POST", { ...data, request_id: pending.current.id }),
              );
              setNotice(deliveryMessage(result));
              if (result.state === "complete" || result.state === "skipped")
                pending.current = null;
            });
          }}
        >
          <h2>Skicka meddelande</h2>
          <label>
            Rubrik
            <input
              value={title}
              maxLength={100}
              disabled={busy}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </label>
          <label>
            Meddelande
            <textarea
              value={message}
              maxLength={500}
              disabled={busy}
              onChange={(e) => setMessage(e.target.value)}
              required
            />
          </label>
          <label>
            Mottagare
            <select
              value={audience}
              disabled={busy}
              onChange={(e) => setAudience(e.target.value)}
            >
              <option value="all">Alla enheter</option>
              <option value="shared">Gemensamma enheter</option>
              <option value="staff">Specifik säljare</option>
            </select>
          </label>
          {audience === "staff" && (
            <label>
              Notisens säljare
              <select
                value={staffId}
                disabled={busy}
                required
                onChange={(e) => setStaffId(e.target.value)}
              >
                <option value="">Välj säljare</option>
                {staff
                  .filter((p) => p.active && !p.deleted_at)
                  .map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label>
            Destination
            <select
              value={destination}
              disabled={busy}
              onChange={(e) => setDestination(e.target.value)}
            >
              <option value="start">Start</option>
              <option value="stats">Statistik</option>
            </select>
          </label>
          <p className="muted small-text">
            Meddelandet kan visas på låsskärmen. Inga kunduppgifter, PIN-koder
            eller tekniska uppgifter. Leveransresultatet avser pushleverantörens
            mottagning, inte att användaren läst notisen.
          </p>
          <button
            className="button"
            disabled={
              busy || !status.configured || !status.settings.push_enabled
            }
          >
            Skicka notis
          </button>
        </form>
      </div>
      <div className="notification-staff-counts subpanel">
        <h3>Enhetskopplingar</h3>
        {status.staff.map((p) => (
          <div key={p.id}>
            <span>{p.name}</span>
            <strong>{p.devices} enheter</strong>
          </div>
        ))}
      </div>
      {!!status.events.length && (
        <div className="subpanel notification-history">
          <h3>Senaste notisförsök</h3>
          {status.events.map((event, i) => (
            <article key={event.created_at + "-" + i}>
              <strong>{event.title}</strong>
              <p>
                {event.event_date} · {deliveryMessage(event)}
              </p>
            </article>
          ))}
        </div>
      )}
      {notice && (
        <p role="status" className="notification-feedback">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </section>
  );
}
