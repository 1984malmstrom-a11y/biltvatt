import { expect, it } from "vitest";
import { arenaStartActivities } from "../src/arena-start";
import type { ArenaActivity } from "../shared/arena";

const activity = (id: string, name: string, points = 1): ArenaActivity => ({ id,name,points,offer_text:"",price_text:"",image_key:null,category:"",sort_order:0,active:1 });

it("låser sju platser i referensens ordning och bevarar register-ID och poäng", () => {
  const input = [activity("30","Två för 30",0.5),activity("food","Korv",3),activity("wash","Biltvätt",2),activity("fluid","Spolarvätska"),activity("salad","Räksallad"),activity("coffee","Kaffe + bulle"),{ ...activity("25","Två för"),price_text:"25:-" },activity("extra","Extra dryck"),activity("scraper","Isskrapa")];
  const before = structuredClone(input), slots = arenaStartActivities(input);
  expect(slots.map(s => s.view.name)).toEqual(["Biltvätt","Korv med mos","Två för 25:-","Kaffe + bulle","Spolarvätska","Räksallad","Två för 30:-"]);
  expect(slots.map(s => s.activity?.id)).toEqual(["wash","food","25","coffee","fluid","salad","30"]);
  expect(slots[1].view.points).toBe(3); expect(slots[6].view.points).toBe(0.5);
  expect(input).toEqual(before);
});

it("ersätter aldrig ett saknat erbjudande med Extra dryck eller Isskrapa", () => {
  const slots = arenaStartActivities([activity("extra","Extra dryck"),activity("scraper","Isskrapa"),{ ...activity("wash","Biltvätt"),active:0 }]);
  expect(slots).toHaveLength(7);
  expect(slots.every(s => s.activity === null && s.view.id === "")).toBe(true);
});

it("väljer den exakta aktiviteten före ett äldre namn-alias", () => {
  const slots = arenaStartActivities([activity("old","Korv",1),activity("correct","Korv med mos",2)]);
  expect(slots[1].activity?.id).toBe("correct"); expect(slots[1].view.points).toBe(2);
});
