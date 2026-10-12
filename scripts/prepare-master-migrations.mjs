// Creates a fresh station's migration set without copying Tingsryd's staff.
// Output directory is generated, never the live station's migrations folder.
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = resolve(root, "migrations");
const destination = resolve(root, "migrations-master");
const names = (await readdir(source)).filter((name) => /^\d+_.*\.sql$/.test(name)).sort();
if (!names.includes("0001_initial.sql") || names.length < 9) {
  throw new Error("Master: migrationsuppsättningen är ofullständig. Stoppar.");
}
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const name of names) {
  let sql = await readFile(join(source, name), "utf8");
  if (name === "0001_initial.sql") {
    const start = sql.indexOf("INSERT INTO staff (id,name,color) VALUES");
    const end = sql.indexOf("INSERT INTO wash_programs (id,name,price_sek,sort_order) VALUES");
    if (start < 0 || end <= start) {
      throw new Error("Master: personalens startdata har ändrats. Kontrollera innan drift.");
    }
    sql = sql.slice(0, start) +
      "-- MASTER: ingen personal skapas automatiskt. Lägg till personal via Admin.\n" +
      sql.slice(end);
    if (/INSERT\s+INTO\s+staff\b/i.test(sql))
      throw new Error("Master: personalens startdata finns kvar.");
  }
  await writeFile(join(destination, name), sql);
}
console.log(`Master-migreringar skapade: ${names.length} filer, utan förifylld personal.`);
