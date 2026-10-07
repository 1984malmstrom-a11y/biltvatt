// Writes secrets only to an ignored, private local file, NEVER terminal output.
import { writeFileSync, existsSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";
const output = new URL("../.vapid-keys.json", import.meta.url);
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
  writeFileSync(
    output,
    JSON.stringify(
      { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: jwk.d },
      null,
      2,
    ) + "\n",
    { mode: 0o600, flag: "wx" },
  );
  console.log(
    "Nycklar skapade i .vapid-keys.json (lokal, Git-ignorerad, privat fil). Dela inte filen eller privata nyckeln. Läs värdena i din lokala editor och ange dem i Wranglers hemlighetsprompter.",
  );
}
