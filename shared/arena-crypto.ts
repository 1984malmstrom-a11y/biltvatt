const encoder=new TextEncoder();
export const PASSWORD_ITERATIONS=100000;
export const hex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
const unhex=(s:string)=>new Uint8Array(s.match(/.{2}/g)!.map(c=>parseInt(c,16)));
export const randomToken=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
export const tokenHash=async(value:string)=>hex(new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(value))));
export async function passwordHash(password:string,salt=randomToken(),iterations=PASSWORD_ITERATIONS) {
  const key=await crypto.subtle.importKey("raw",encoder.encode(password),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:unhex(salt),iterations},key,256);
  return {hash:hex(new Uint8Array(bits)),salt,iterations};
}
export function constantEqual(a:string,b:string) {
  let difference=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++) difference|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
  return difference===0;
}
export async function passwordMatches(password:string,hash:string,salt:string,iterations:number) {
  return constantEqual((await passwordHash(password,salt,iterations)).hash,hash);
}
