import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { readSession, writeSession, sessionPath, SessionData } from '../src/session.js';

const TEST_HOME = path.join(os.tmpdir(), 'ubereats-mcp-test-' + Date.now());

beforeEach(async () => {
  process.env.UBEREATS_MCP_HOME = TEST_HOME;
  await fs.rm(TEST_HOME, { recursive: true, force: true });
});

afterEach(async () => {
  await fs.rm(TEST_HOME, { recursive: true, force: true });
  delete process.env.UBEREATS_MCP_HOME;
});

describe('session', () => {
  const sample: SessionData = {
    cookies: [{ name: 'sid', value: 'abc', domain: '.uber.com', path: '/', expires: 1234567890, httpOnly: true, secure: true }],
    user_agent: 'Mozilla/5.0',
    account_email: 'test@example.com',
    client_gitref: 'c2d04b17',
    captured_at: '2026-04-11T00:00:00Z',
  };

  it('returns null when no session file exists', async () => {
    const result = await readSession();
    expect(result).toBeNull();
  });

  it('writes and reads back a session', async () => {
    await writeSession(sample);
    const loaded = await readSession();
    expect(loaded).toEqual(sample);
  });

  it('writes session file with mode 0600', async () => {
    await writeSession(sample);
    const stat = await fs.stat(sessionPath());
    const mode = stat.mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('creates parent directory if missing', async () => {
    await writeSession(sample);
    const dirStat = await fs.stat(path.dirname(sessionPath()));
    expect(dirStat.isDirectory()).toBe(true);
  });
});
