// Writes secrets only to an ignored, private local file, NEVER terminal output.
import { writeFileSync, existsSync, rmSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const output = new URL("../.vapid-keys.json", import.meta.url);
function protectWindowsFile(path) {
  const user = spawnSync("whoami.exe", ["/user", "/fo", "csv", "/nh"], {
    encoding: "utf8", windowsHide: true,
  });
  const sid = user.stdout?.match(/\bS-1-\d+(?:-\d+)+\b/)?.[0];
  if (user.status !== 0 || !sid) throw new Error("Windows user SID unavailable");
  const inheritance = spawnSync("icacls.exe", [path, "/inheritance:r"], {
    encoding: "utf8", windowsHide: true,
  });
  if (inheritance.status !== 0) throw new Error("Windows ACL inheritance removal failed");
  const grant = spawnSync("icacls.exe", [path, "/grant:r", `*${sid}:(F)`], {
    encoding: "utf8", windowsHide: true,
  });
  if (grant.status !== 0) throw new Error("Windows private ACL grant failed");
}
if (existsSync(output)) {
  console.error(
    "Nyckelfilen finns redan. Bevara den: nyckelrotation gör befintliga prenumerationer ogiltiga.",
  );
  process.exitCode = 1;
} else {
  const { privateKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const jwk = privateKey.export({ format: "jwk" });
  const publicKey = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(jwk.x, "base64url"),
    Buffer.from(jwk.y, "base64url"),
  ]).toString("base64url");
  let created = false;
  try {
    writeFileSync(
      output,
      JSON.stringify(
        { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: jwk.d },
        null,
        2,
      ) + "\n",
      { mode: 0o600, flag: "wx" },
    );
    created = true;
    if (process.platform === "win32") protectWindowsFile(fileURLToPath(output));
    console.log(
      "Nycklar skapade i .vapid-keys.json (lokal, Git-ignorerad, privat fil). Dela inte filen eller privata nyckeln. Läs värdena i din lokala editor och ange dem i Wranglers hemlighetsprompter.",
    );
  } catch {
    if (created) rmSync(output, { force: true });
    console.error("Nyckelfilen kunde inte skapas med privata rättigheter. Ingen nyckel behölls.");
    process.exitCode = 1;
  }
}
