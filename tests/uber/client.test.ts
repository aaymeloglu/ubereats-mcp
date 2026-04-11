import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UberClient } from '../../src/uber/client.js';
import type { SessionData } from '../../src/session.js';
import type { OperationDef } from '../../src/uber/operations.js';
import { McpError } from '../../src/errors.js';

const FAKE_SESSION: SessionData = {
  cookies: [
    { name: 'sid', value: 'SIDVAL', domain: '.uber.com', path: '/', expires: 9999999999, httpOnly: true, secure: true },
    { name: 'jwt-session', value: 'JWTVAL', domain: '.uber.com', path: '/', expires: 9999999999, httpOnly: true, secure: true },
  ],
  user_agent: 'TestUA/1.0',
  account_email: 'test@example.com',
  client_gitref: 'test-gitref-123',
  captured_at: '2026-04-11T00:00:00Z',
};

const TEST_OP: OperationDef<{ q: string }, { hello: string }> = {
  name: 'testOpV1',
  buildBody: ({ q }) => ({ q }),
  parseData: (data) => ({ hello: (data as { hello: string }).hello }),
};

describe('UberClient.execute', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let client: UberClient;

  beforeEach(() => {
    fetchMock = vi.fn();
    client = new UberClient(FAKE_SESSION, { fetch: fetchMock });
  });

  it('posts to /_p/api/<op> with cookies, UA, and csrf header', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      text: async () => JSON.stringify({ status: 'success', data: { hello: 'world' } }),
    });

    await client.execute(TEST_OP, { q: 'taco' });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://www.ubereats.com/_p/api/testOpV1');
    expect(opts.method).toBe('POST');
    expect(opts.headers.cookie).toContain('sid=SIDVAL');
    expect(opts.headers.cookie).toContain('jwt-session=JWTVAL');
    expect(opts.headers['user-agent']).toBe('TestUA/1.0');
    expect(opts.headers['x-csrf-token']).toBe('x');
    expect(opts.headers['content-type']).toBe('application/json');
    expect(opts.headers.origin).toBe('https://www.ubereats.com');
    expect(JSON.parse(opts.body)).toEqual({ q: 'taco' });
  });

  it('returns parsed response on 200 with { status: success, data }', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      text: async () => JSON.stringify({ status: 'success', data: { hello: 'world' } }),
    });

    const result = await client.execute(TEST_OP, { q: 'taco' });
    expect(result).toEqual({ hello: 'world' });
  });
});

describe('UberClient error mapping', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let client: UberClient;

  beforeEach(() => {
    fetchMock = vi.fn();
    client = new UberClient(FAKE_SESSION, { fetch: fetchMock });
  });

  it('maps 401 to AUTH_REQUIRED', async () => {
    fetchMock.mockResolvedValueOnce({ status: 401, text: async () => '' });
    await expect(client.execute(TEST_OP, { q: 'x' })).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
      recommendedAction: 'call_login',
    });
  });

  it('maps 403 to AUTH_REQUIRED', async () => {
    fetchMock.mockResolvedValueOnce({ status: 403, text: async () => '' });
    await expect(client.execute(TEST_OP, { q: 'x' })).rejects.toBeInstanceOf(McpError);
  });

  it('maps HTML challenge page to AUTH_REQUIRED', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      text: async () => '<!DOCTYPE html><html>access denied</html>',
    });
    await expect(client.execute(TEST_OP, { q: 'x' })).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
  });

  it('maps 429 to RATE_LIMITED', async () => {
    fetchMock.mockResolvedValueOnce({ status: 429, text: async () => '' });
    await expect(client.execute(TEST_OP, { q: 'x' })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      recommendedAction: 'wait_and_retry',
    });
  });

  it('maps 500 twice to UPSTREAM_ERROR after one retry', async () => {
    fetchMock
      .mockResolvedValueOnce({ status: 500, text: async () => '' })
      .mockResolvedValueOnce({ status: 500, text: async () => '' });
    await expect(client.execute(TEST_OP, { q: 'x' })).rejects.toMatchObject({
      code: 'UPSTREAM_ERROR',
      recommendedAction: 'retry_later',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries once on 500 and succeeds on second attempt', async () => {
    fetchMock
      .mockResolvedValueOnce({ status: 500, text: async () => '' })
      .mockResolvedValueOnce({
        status: 200,
        text: async () => JSON.stringify({ status: 'success', data: { hello: 'ok' } }),
      });
    const result = await client.execute(TEST_OP, { q: 'x' });
    expect(result).toEqual({ hello: 'ok' });
  });

  it('maps failure envelope with 401 code to AUTH_REQUIRED', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      text: async () =>
        JSON.stringify({ status: 'failure', data: { message: 'unauthorized', code: '401' } }),
    });
    await expect(client.execute(TEST_OP, { q: 'x' })).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
  });

  it('maps failure envelope with 400 code to GRAPHQL_ERROR', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      text: async () =>
        JSON.stringify({ status: 'failure', data: { message: 'status code error', code: '400' } }),
    });
    await expect(client.execute(TEST_OP, { q: 'x' })).rejects.toMatchObject({
      code: 'GRAPHQL_ERROR',
      recommendedAction: 'surface_to_user',
    });
  });
});
