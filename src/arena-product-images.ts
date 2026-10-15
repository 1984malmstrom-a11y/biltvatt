import type { ArenaActivity } from "../shared/arena";

const products = new Map([
  ["biltvätt", "01_arena-biltvatt.webp"],
  ["korv", "02_arena-korv-med-mos.webp"],
  ["korv med mos", "02_arena-korv-med-mos.webp"],
  ["två för 25", "03_arena-tva-for-25.webp"],
  ["kaffe + bulle", "04_arena-kaffe-bulle.webp"],
  ["spolarvätska", "05_arena-spolarvatska.webp"],
  ["räksallad", "06_arena-raksallad.webp"],
  ["två för 30", "07_arena-tva-for-30.webp"],
  ["extra dryck", "08_arena-extra-dryck.webp"],
]);

export function arenaProductImage(activity: Pick<ArenaActivity, "name" | "image_key"> & Partial<Pick<ArenaActivity, "price_text">>, previewUrl?: string) {
  if (previewUrl) return previewUrl;
  // These named products use the reference-matched clean motifs, including when an old demo image is stored.
  const name = activity.name.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("sv-SE");
  const offerName = name.match(/^(?:två|2)\s*för\s*(25|30)(?:\s*(?:kr|:?[–−-]|:))?$/);
  const offerPrice = /^(?:två|2)\s*för$/.test(name) ? activity.price_text?.trim().toLocaleLowerCase("sv-SE").match(/^(25|30)(?:\s*(?:kr|:?[–−-]|:))?$/) : null;
  const price = offerName?.[1] ?? offerPrice?.[1];
  const product = products.get(price ? `två för ${price}` : name);
  if (product) return `/arena-products/${product}`;
  return activity.image_key ? `/api/arena/activity-images/${activity.image_key}` : null;
}
