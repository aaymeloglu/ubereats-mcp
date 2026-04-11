import { Impit } from 'impit';
import type { SessionData } from '../session.js';
import type { OperationDef } from './operations.js';
import { McpError } from '../errors.js';

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

    let res = await this.fetch(url, { method: 'POST', headers, body });
    if (res.status >= 500 && res.status < 600) {
      res = await this.fetch(url, { method: 'POST', headers, body });
    }

    if (res.status === 401 || res.status === 403) {
      throw new McpError(
        'AUTH_REQUIRED',
        `Uber rejected request with HTTP ${res.status}. Session is expired or missing.`,
        'call_login',
      );
    }
    if (res.status === 429) {
      throw new McpError('RATE_LIMITED', 'Uber returned HTTP 429. Back off before retrying.', 'wait_and_retry');
    }
    if (res.status >= 500) {
      throw new McpError('UPSTREAM_ERROR', `Uber returned HTTP ${res.status} twice. Try again later.`, 'retry_later');
    }
    if (res.status !== 200) {
      throw new McpError('UPSTREAM_ERROR', `Unexpected HTTP status ${res.status}.`, 'retry_later');
    }

    const text = await res.text();
    if (text.trimStart().startsWith('<')) {
      throw new McpError(
        'AUTH_REQUIRED',
        'Uber returned an HTML page (likely a WAF challenge). Re-login with a fresh browser session.',
        'call_login',
      );
    }

    let parsed: { status?: string; data?: unknown };
    try {
      parsed = JSON.parse(text) as { status?: string; data?: unknown };
    } catch {
      throw new McpError(
        'GRAPHQL_ERROR',
        `Uber returned non-JSON body: ${text.slice(0, 200)}`,
        'surface_to_user',
      );
    }

    if (parsed.status === 'failure') {
      const d = parsed.data as { message?: string; code?: string } | undefined;
      const code = d?.code ?? '';
      const msg = d?.message ?? 'unknown failure';
      if (code === '401' || code === '403') {
        throw new McpError(
          'AUTH_REQUIRED',
          `Uber failure envelope code ${code}: ${msg}`,
          'call_login',
        );
      }
      throw new McpError('GRAPHQL_ERROR', `Uber failure envelope code ${code}: ${msg}`, 'surface_to_user');
    }

    if (!parsed.data) {
      throw new McpError('GRAPHQL_ERROR', 'Response had no data field.', 'surface_to_user');
    }

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
