export const PILOT:{account:string;worker:string;database:string;mailer:string;backupSha256:string};
export const STEPS:string[];
export function assertPilotReleaseConfig(config:any,root:string):any;
export function runPilotStep(step:string, options?:any, dependencies?:any):Promise<any>;
export function command(root:string,kind:string,args:string[],options?:{interactive?:boolean;input?:string}):string;
