import { expect, it } from "vitest";
import { arenaProductImage } from "../src/arena-product-images";

it("byter Biltvätts demomotiv, känner igen Korv-alias och skiljer erbjudandena", () => {
  expect(arenaProductImage({ name:"BILTVÄTT", image_key:"demo-image" })).toBe("/arena-products/01_arena-biltvatt.png");
  expect(arenaProductImage({ name:"  Korv   med mos ", image_key:null })).toBe(arenaProductImage({ name:"Korv", image_key:null }));
  expect(arenaProductImage({ name:"Två för 25", image_key:null })).not.toBe(arenaProductImage({ name:"Två för 30", image_key:null }));
  expect(arenaProductImage({ name:"Två för 250", image_key:null })).toBeNull();
});

it("behåller uppladdningspreview och stationens bilder för andra aktiviteter", () => {
  expect(arenaProductImage({ name:"Biltvätt", image_key:"old-image" }, "blob:preview")).toBe("blob:preview");
  expect(arenaProductImage({ name:"Isskrapa", image_key:"own-image" })).toBe("/api/arena/activity-images/own-image");
  expect(arenaProductImage({ name:"Isskrapa", image_key:null })).toBeNull();
  expect(arenaProductImage({ name:"constructor", image_key:null })).toBeNull();
});
