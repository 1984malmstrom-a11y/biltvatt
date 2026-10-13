import type { ArenaActivity } from "../shared/arena";

const products = new Map([
  ["biltvätt", "01_arena-biltvatt.png"],
  ["korv", "02_arena-korv-med-mos.png"],
  ["korv med mos", "02_arena-korv-med-mos.png"],
  ["två för 25", "03_arena-tva-for-25.png"],
  ["kaffe + bulle", "04_arena-kaffe-bulle.png"],
  ["spolarvätska", "05_arena-spolarvatska.png"],
  ["räksallad", "06_arena-raksallad.png"],
  ["två för 30", "07_arena-tva-for-30.png"],
]);

export function arenaProductImage(activity: Pick<ArenaActivity, "name" | "image_key">, previewUrl?: string) {
  if (previewUrl) return previewUrl;
  // These named products use the supplied clean motifs, including when an old demo image is stored.
  const name = activity.name.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("sv-SE");
  const product = products.get(name);
  if (product) return `/arena-products/${product}`;
  return activity.image_key ? `/api/arena/activity-images/${activity.image_key}` : null;
}
