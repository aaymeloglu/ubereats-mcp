import { Impit } from 'impit';
import type { SessionData } from '../session.js';
import type { OperationDef } from './operations.js';

interface FetchLike {
  (url: string, init: { method: string; headers: Record<string, string>; body: string }): Promise<{
    status: number;
    text: () => Promise<string>;
  }>;
}

interface ClientOptions {
  /** Injected for tests. Defaults to a real impit instance. */
  fetch?: FetchLike;
}

const UBER_API_BASE = 'https://www.ubereats.com/_p/api';

function defaultFetch(): FetchLike {
  const impit = new Impit({ browser: 'chrome', ignoreTlsErrors: false });
  return async (url, init) => {
    // impit's RequestInit narrows `method` to an HttpMethod union; cast via unknown
    // since our FetchLike uses a plain `string`.
    const res = await impit.fetch(url, { ...init, method: init.method as 'POST' });
    return { status: res.status, text: () => res.text() };
  };
}

export class UberClient {
  private fetch: FetchLike;

  constructor(private session: SessionData, opts: ClientOptions = {}) {
    this.fetch = opts.fetch ?? defaultFetch();
  }

  async execute<Vars, Resp>(op: OperationDef<Vars, Resp>, vars: Vars): Promise<Resp> {
    const body = JSON.stringify(op.buildBody(vars));
    const headers = this.buildHeaders();
    const url = `${UBER_API_BASE}/${op.name}`;

    const res = await this.fetch(url, { method: 'POST', headers, body });
    const text = await res.text();

    // Status-code handling is added in Task 8. For now, assume 200 success
    // and a { status: "success", data } envelope.
    const parsed = JSON.parse(text) as { status?: string; data?: unknown };
    if (!parsed.data) throw new Error('UberClient: no data field in response');
    return op.parseData(parsed.data);
  }

  private buildHeaders(): Record<string, string> {
    const cookieHeader = this.session.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    return {
      'content-type': 'application/json',
      'cookie': cookieHeader,
      'user-agent': this.session.user_agent,
      'x-csrf-token': 'x',
      'x-uber-client-gitref': this.session.client_gitref ?? '',
      'accept': '*/*',
      'accept-language': 'en-US',
      'origin': 'https://www.ubereats.com',
      'referer': 'https://www.ubereats.com/',
    };
  }
}
