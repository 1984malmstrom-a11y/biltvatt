export function sha256(data:string|Uint8Array):string;
export function migrationDigest(root:string):string;
export function runLocalWrangler(root:string,args:string[]):any;
export function verifyLocalArenaRestore(options:{root:string;backupPath:string;expectedSha256:string;allowEmpty?:boolean;reportPath?:string;run?:(root:string,args:string[])=>any}):any;
