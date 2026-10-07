import { describe, it, expect, vi } from "vitest";
import {
  readFileSync,
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  statSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runInNewContext } from "node:vm";
const source = readFileSync(
  new URL("../public/sw.js", import.meta.url),
  "utf8",
);
function serviceWorker() {
  const handlers = new Map<string, (event: unknown) => void>(),
    tasks: Promise<unknown>[] = [];
  const notification = vi.fn().mockResolvedValue(undefined),
    openWindow = vi.fn().mockResolvedValue(undefined),
    claim = vi.fn().mockResolvedValue(undefined);
  const windows: {
    url: string;
    postMessage: ReturnType<typeof vi.fn>;
    focus: ReturnType<typeof vi.fn>;
  }[] = [];
  const self = {
    location: { origin: "https://tvattligan.test" },
    skipWaiting: vi.fn().mockResolvedValue(undefined),
    addEventListener: (name: string, callback: (event: unknown) => void) =>
      handlers.set(name, callback),
    registration: { showNotification: notification },
    clients: { claim, openWindow, matchAll: vi.fn(async () => windows) },
  };
  runInNewContext(source, { self, URL });
  const run = async (name: string, event: object = {}) => {
    handlers.get(name)!({
      ...event,
      waitUntil: (p: Promise<unknown>) => tasks.push(p),
    });
    await Promise.all(tasks.splice(0));
  };
  return { handlers, notification, openWindow, claim, windows, run };
}
describe("PWA och Service Worker", () => {
  it("VAPID-verktyget skriver privata nycklar enbart i en skyddad fil och vägrar oavsiktlig rotation", () => {
    const directory = mkdtempSync(join(tmpdir(), "tvattligan-vapid-test-"));
    try {
      mkdirSync(join(directory, "scripts"));
      const script = join(directory, "scripts", "push-keys.mjs");
      copyFileSync(
        new URL("../scripts/push-keys.mjs", import.meta.url),
        script,
      );
      const result = spawnSync(process.execPath, [script], {
        encoding: "utf8",
      });
      expect(result.status).toBe(0);
      const file = join(directory, ".vapid-keys.json");
      const contents = readFileSync(file, "utf8");
      const keys = JSON.parse(contents);
      expect(Buffer.from(keys.VAPID_PUBLIC_KEY, "base64url").length).toBe(65);
      expect(Buffer.from(keys.VAPID_PRIVATE_KEY, "base64url").length).toBe(32);
      expect(statSync(file).mode & 0o777).toBe(0o600);
      expect(result.stdout + result.stderr).not.toContain(
        keys.VAPID_PRIVATE_KEY,
      );
      expect(result.stdout + result.stderr).not.toContain(
        keys.VAPID_PUBLIC_KEY,
      );
      const retry = spawnSync(process.execPath, [script], { encoding: "utf8" });
      expect(retry.status).toBe(1);
      expect(readFileSync(file, "utf8")).toBe(contents);
      expect(
        readFileSync(new URL("../.gitignore", import.meta.url), "utf8"),
      ).toContain(".vapid-keys.json");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it("manifest är svenskt, standalone och har riktiga egna standard/maskable-ikoner", () => {
    const manifest = JSON.parse(
      readFileSync(
        new URL("../public/manifest.webmanifest", import.meta.url),
        "utf8",
      ),
    );
    expect(manifest).toMatchObject({
      name: "Tvättligan",
      short_name: "Tvättligan",
      start_url: "/",
      scope: "/",
      display: "standalone",
      theme_color: "#edf6fc",
    });
    for (const icon of manifest.icons) {
      const png = readFileSync(
        new URL("../public" + icon.src, import.meta.url),
      );
      expect(png.subarray(1, 4).toString()).toBe("PNG");
      const size = Number(icon.sizes.split("x")[0]);
      const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
      expect(view.getUint32(16)).toBe(size);
      expect(view.getUint32(20)).toBe(size);
    }
    expect(manifest.icons.map((i: { purpose: string }) => i.purpose)).toContain(
      "maskable",
    );
    expect(source).not.toContain("StationLogo");
  });
  it("aktiverar kontroll men har ingen cache, fetch-interception eller offlinekö för API", async () => {
    const sw = serviceWorker();
    await sw.run("install");
    await sw.run("activate");
    expect(sw.claim).toHaveBeenCalledOnce();
    expect([...sw.handlers.keys()]).toEqual([
      "install",
      "activate",
      "push",
      "notificationclick",
    ]);
    expect(source).not.toContain("caches.");
    expect(source).not.toContain("requestPermission");
  });
  it("push hanteras med rätt payload och notification defaults", async () => {
    const sw = serviceWorker();
    await sw.run("push", {
      data: {
        json: () => ({
          title: "Dagens mål 🎉",
          body: "25 tvättar",
          url: "/?view=stats",
          tag: "daily",
          type: "goal",
        }),
      },
    });
    expect(sw.notification).toHaveBeenCalledWith(
      "Dagens mål 🎉",
      expect.objectContaining({
        body: "25 tvättar",
        data: { url: "https://tvattligan.test/?view=stats", type: "goal" },
      }),
    );
  });
  it("trasig payload/extern URL ger säkra svenska standardvärden", async () => {
    const sw = serviceWorker();
    await sw.run("push", {
      data: {
        json: () => {
          throw new Error("malformed");
        },
      },
    });
    expect(sw.notification).toHaveBeenCalledWith(
      "Tvättligan",
      expect.objectContaining({
        body: "Öppna Tvättligan för lagets senaste resultat.",
      }),
    );
    await sw.run("push", {
      data: {
        json: () => ({
          title: { bad: true },
          body: "x".repeat(600),
          url: "https://evil.test/admin",
          tag: 123,
        }),
      },
    });
    const options = sw.notification.mock.calls[1][1];
    expect(options.body.length).toBe(500);
    expect(options.data.url).toBe("https://tvattligan.test/");
  });
  it("notisklick fokuserar öppen app utan reload/navigate eller förlorad registrering", async () => {
    const sw = serviceWorker(),
      client = {
        url: "https://tvattligan.test/",
        postMessage: vi.fn(),
        focus: vi.fn().mockResolvedValue(undefined),
      };
    sw.windows.push(client);
    const close = vi.fn();
    await sw.run("notificationclick", {
      notification: { close, data: { url: "/?view=stats" } },
    });
    expect(close).toHaveBeenCalledOnce();
    expect(client.focus).toHaveBeenCalledOnce();
    expect(client.postMessage).toHaveBeenCalledWith({
      type: "TVATTLIGAN_OPEN",
      view: "stats",
    });
    expect(sw.openWindow).not.toHaveBeenCalled();
  });
  it("stängd app öppnas på en tillåten lokal sida, aldrig Admin/externt", async () => {
    const sw = serviceWorker();
    await sw.run("notificationclick", {
      notification: { close: vi.fn(), data: { url: "/?view=stats" } },
    });
    expect(sw.openWindow).toHaveBeenCalledWith(
      "https://tvattligan.test/?view=stats",
    );
    await sw.run("notificationclick", {
      notification: { close: vi.fn(), data: { url: "/api/admin/settings" } },
    });
    expect(sw.openWindow).toHaveBeenLastCalledWith("https://tvattligan.test/");
  });
});
