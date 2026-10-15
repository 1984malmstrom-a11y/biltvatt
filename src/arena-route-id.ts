// Static hosts may normalize ':' to '%3A'. Keep application IDs stable across
// full navigations, without ever accepting a decoded slash or malformed escape.
export function arenaRouteId(pathname:string){try{const id=decodeURIComponent(pathname.split('/').at(-1)??'');return /^[a-zA-Z0-9:_-]{1,120}$/.test(id)?id:'invalid-route';}catch{return 'invalid-route';}}
