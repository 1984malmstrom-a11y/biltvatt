// Per-view, in-flight only: no data cache, no changed polling cadence. Invalidating
// at a sale/undo boundary prevents sharing a pre-mutation server response.
export function arenaRequests<T>(load:(key:string,signal:AbortSignal)=>Promise<T>){
 const pending=new Map<string,{controller:AbortController;promise:Promise<T>}>();
 return {
  request(key:string){const existing=pending.get(key);if(existing)return existing.promise;const controller=new AbortController();const promise=load(key,controller.signal).finally(()=>{if(pending.get(key)?.controller===controller)pending.delete(key);});pending.set(key,{controller,promise});return promise;},
  invalidate(){for(const entry of pending.values())entry.controller.abort();pending.clear();},
 };
}
