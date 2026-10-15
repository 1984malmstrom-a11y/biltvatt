import {fail} from './http';
export function arenaRequestPath(request:Request){try{return decodeURIComponent(new URL(request.url).pathname);}catch{return fail(400,'Ogiltig adress.');}}
