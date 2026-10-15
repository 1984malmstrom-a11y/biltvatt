import { expect, it } from "vitest";
import { arenaProductImage } from "../src/arena-product-images";

it("byter Biltvätts demomotiv, känner igen Korv-alias och skiljer erbjudandena", () => {
  expect(arenaProductImage({ name:"BILTVÄTT", image_key:"demo-image" })).toBe("/arena-products/01_arena-biltvatt.webp");
  expect(arenaProductImage({ name:"  Korv   med mos ", image_key:null })).toBe(arenaProductImage({ name:"Korv", image_key:null }));
  expect(arenaProductImage({ name:"Två för 25", image_key:null })).not.toBe(arenaProductImage({ name:"Två för 30", image_key:null }));
  expect(arenaProductImage({ name:"Två för 250", image_key:null })).toBeNull();
});

it("hittar 25-erbjudandet med prisnotation eller separat prisfält utan att gissa andra belopp", () => {
  const expected = "/arena-products/03_arena-tva-for-25.webp";
  for (const name of ["Två för 25:-", "TVÅ FÖR 25:–", "Två för 25 kr", "2 för 25"])
    expect(arenaProductImage({ name, image_key:null })).toBe(expected);
  expect(arenaProductImage({ name:"Två för", price_text:"25:-", image_key:null })).toBe(expected);
  expect(arenaProductImage({ name:"Två för", price_text:"30:–", image_key:null })).toBe("/arena-products/07_arena-tva-for-30.webp");
  expect(arenaProductImage({ name:"Två för", price_text:"250:-", image_key:null })).toBeNull();
  expect(arenaProductImage({ name:"Två för", image_key:null })).toBeNull();
});

it("visar det valda energidrycksmotivet för Extra dryck och gissar ingen bild för Isskrapa", () => {
  expect(arenaProductImage({ name:"Extra dryck", image_key:null })).toBe("/arena-products/08_arena-extra-dryck.webp");
  expect(arenaProductImage({ name:"Extra dryck", image_key:null })).not.toBe(arenaProductImage({ name:"Två för 30", image_key:null }));
  expect(arenaProductImage({ name:"Isskrapa", image_key:null })).toBeNull();
});

it("behåller uppladdningspreview och stationens bilder för andra aktiviteter", () => {
  expect(arenaProductImage({ name:"Biltvätt", image_key:"old-image" }, "blob:preview")).toBe("blob:preview");
  expect(arenaProductImage({ name:"Isskrapa", image_key:"own-image" })).toBe("/api/arena/activity-images/own-image");
  expect(arenaProductImage({ name:"Isskrapa", image_key:null })).toBeNull();
  expect(arenaProductImage({ name:"constructor", image_key:null })).toBeNull();
});
