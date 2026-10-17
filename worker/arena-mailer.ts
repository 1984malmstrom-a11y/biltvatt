import {WorkerEntrypoint} from 'cloudflare:workers';
import {handleArenaMail, type ArenaMailerEnv} from './arena-mailer-core';

// Only a named Cloudflare Service Binding reaches this entrypoint. The request's
// hostname/headers are not credentials. Props are binding configuration, not HTTP.
export class ArenaMailer extends WorkerEntrypoint<ArenaMailerEnv, {caller?: string}> {
  fetch(request: Request) {
    if (this.ctx.props.caller !== 'arenan-pilot-vd-20261019') return Response.json({error: 'FORBIDDEN'}, {status: 403, headers: {'Cache-Control': 'no-store'}});
    return handleArenaMail(request, this.env);
  }
}

// Even accidentally enabling a public URL cannot turn the default entrypoint
// into a mail relay. No forwarding from the default to the named entrypoint.
export default {
  fetch() {return Response.json({error: 'NOT_FOUND'}, {status: 404, headers: {'Cache-Control': 'no-store'}});},
};
