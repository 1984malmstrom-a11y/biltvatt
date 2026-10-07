import { writeFile } from "node:fs/promises";
import { randomInt } from "node:crypto";
try {
  await writeFile(
    new URL("../.dev.vars", import.meta.url),
    `ADMIN_PIN=${randomInt(100000, 1000000)}\n`,
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    "En slumpmässig lokal PIN skapades i .dev.vars. Filen är ignorerad av Git.",
  );
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.log("Befintlig .dev.vars bevarades.");
}
