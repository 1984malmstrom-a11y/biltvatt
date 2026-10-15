import {describe,expect,it} from "vitest";
import {demoAvatarIndex,readShowcaseMode,resolveArenaAvatar} from "../src/arena-avatars";
describe("Showroom portraits are presentation only",()=>{
  it("keeps seller identity stable across list, profile and champion states",()=>{
    const person={id:"station:stable-id",name:"Peter"};
    expect(resolveArenaAvatar(person,true)).toEqual(resolveArenaAvatar({...person,name:"Nytt visningsnamn"},true));
    expect(new Set(Array.from({length:8},(_,i)=>demoAvatarIndex(`s-${i}`))).size).toBe(8);
    expect(resolveArenaAvatar(person,false)).toEqual(resolveArenaAvatar(person,true));
  });
  it("prioritizes uploaded photos and rejects unsafe/foreign URL schemes",()=>{
    expect(resolveArenaAvatar({name:"Alva",imageUrl:"/api/arena/portraits/id"},true)).toEqual({kind:"uploaded",url:"/api/arena/portraits/id"});
    expect(resolveArenaAvatar({name:"Alva",imageUrl:"https://images.example.test/photo.webp"},false).kind).toBe("uploaded");
    for(const imageUrl of ["javascript:alert(1)","//example.test/photo.png","http://example.test/photo.png"])
      expect(resolveArenaAvatar({name:"Alva",imageUrl},false).kind).toBe("demo");
  });
  it("supports the extended stable portrait pool independent of showcase",()=>{
    expect(resolveArenaAvatar({id:"p",name:"Person",avatarIndex:12},false)).toMatchObject({kind:"demo",index:12,sheet:"-extra"});
    expect(resolveArenaAvatar({id:"p",name:"Person",avatarIndex:99},false)).toEqual(resolveArenaAvatar({id:"p",name:"Person"},true));
  });
  it("requires explicit opt-in, survives local navigation and can be disabled",()=>{
    const values=new Map<string,string>(),storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}};
    expect(resolveArenaAvatar({name:""},false)).toEqual({kind:"fallback"});
    expect(readShowcaseMode("",storage)).toBe(false);expect(readShowcaseMode("?showcase=1",storage)).toBe(true);expect(readShowcaseMode("",storage)).toBe(true);expect(readShowcaseMode("?showcase=0",storage)).toBe(false);
    expect(readShowcaseMode("",{...storage,getItem:()=>{throw Error();}})).toBe(false);
  });
});
