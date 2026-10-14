const clock=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Stockholm",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
export function stockholmLocalDateTime(date=new Date()) {
  const p=Object.fromEntries(clock.formatToParts(date).map(p=>[p.type,p.value]));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function arenaInstant(value:unknown) {
  if(typeof value!=="string")throw new Error("Ange en tid med tidszon.");
  const m=value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/);
  if(!m)throw new Error("Tiden ska vara ISO-format med Z eller tidszonsoffset.");
  const [y,month,d,h,min,s]=m.slice(1,7).map(Number),millis=Number((m[7]??"").padEnd(3,"0"));
  const wall=new Date(0);wall.setUTCFullYear(y,month-1,d);wall.setUTCHours(h,min,s,millis);
  if(wall.getUTCFullYear()!==y || wall.getUTCMonth()!==month-1 || wall.getUTCDate()!==d || h>23 || min>59 || s>59)throw new Error("Datum eller klockslag är ogiltigt.");
  let offset=0;if(m[8]!=="Z") {const hours=Number(m[8].slice(1,3)),minutes=Number(m[8].slice(4));if(hours>14 || minutes>59 || (hours===14 && minutes>0))throw new Error("Tidszonsoffset är ogiltigt.");offset=(hours*60+minutes)*(m[8][0]==="-" ? -1:1);}
  return new Date(wall.getTime()-offset*60000).toISOString();
}
// Modern Stockholm dates can have UTC+1 or UTC+2. Reject ambiguous/nonexistent
// wall-clock times instead of silently choosing the wrong DST instant.
export function stockholmInstant(local:string) {
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))throw new Error("Välj datum och klockslag i Stockholm.");
  const wall=Date.parse(arenaInstant(`${local}:00Z`));
  const candidates=[60,120].map(offset=>new Date(wall-offset*60000)).filter(date=>stockholmLocalDateTime(date)===local);
  if(candidates.length!==1)throw new Error(candidates.length ? "Tiden inträffar två gånger vid vintertidsbytet. Välj en annan tid." : "Tiden finns inte vid sommartidsbytet. Välj en annan tid.");
  return candidates[0].toISOString();
}
