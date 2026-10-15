// One request in flight, no background polling, immediate reconciliation on return.
export const ARENA_SYNC_MS = 12_000;
export const ARENA_FIGHT_SYNC_MS = 5_000;
export function visibleArenaPolling(load:()=>Promise<unknown>, interval:()=>number, doc:Pick<Document,'hidden'|'addEventListener'|'removeEventListener'>=document) {
  let stopped=false,running=false,resume=false,timer:ReturnType<typeof setTimeout>|undefined;
  const schedule=()=>{clearTimeout(timer);if(!stopped&&!doc.hidden)timer=setTimeout(()=>void run(),interval());};
  const run=async()=>{
    if(stopped||doc.hidden)return;
    if(running){resume=true;return;}
    running=true;
    try{await load();}finally{running=false;if(resume&&!stopped&&!doc.hidden){resume=false;void run();}else schedule();}
  };
  const visible=()=>{clearTimeout(timer);if(!doc.hidden)void run();};
  doc.addEventListener('visibilitychange',visible);schedule();
  return ()=>{stopped=true;clearTimeout(timer);doc.removeEventListener('visibilitychange',visible);};
}
