import type { ArenaActivity } from "../shared/arena";
import { arenaProductImage } from "./arena-product-images";

const products = [
  ["biltvatt", "Biltvätt", "01_arena-biltvatt.webp"],
  ["korv", "Korv med mos", "02_arena-korv-med-mos.webp"],
  ["25", "Två för 25:-", "03_arena-tva-for-25.webp"],
  ["kaffe", "Kaffe + bulle", "04_arena-kaffe-bulle.webp"],
  ["spolarvatska", "Spolarvätska", "05_arena-spolarvatska.webp"],
  ["raksallad", "Räksallad", "06_arena-raksallad.webp"],
  ["30", "Två för 30:-", "07_arena-tva-for-30.webp"],
] as const;
const normalized = (name: string) => name.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("sv-SE").replace(/:-$/, "");

export function arenaStartActivities(activities: ArenaActivity[]) {
  return products.map(([key, name, file]) => {
    // Resolve actual register records; never reassign an unrelated activity such as Isskrapa.
    const matches = activities.filter(a => a.active === 1 && normalized(a.name) !== "extra dryck" && arenaProductImage(a) === `/arena-products/${file}`);
    const activity = matches.find(a => normalized(a.name) === normalized(name)) ?? matches[0] ?? null;
    const view: ArenaActivity = activity ? { ...activity, name, ...(key === "25" || key === "30" ? { offer_text:"", price_text:"" } : {}) } : {
      id:"", name, offer_text:"", price_text:"", points:0, image_key:null, category:"", sort_order:0, active:0,
    };
    return { key, activity, view };
  });
}
