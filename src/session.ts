import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
}

export interface SessionData {
  cookies: Cookie[];
  user_agent: string;
  account_email: string;
  /** Value of the x-uber-client-gitref header observed at login time. Helps
   *  match the request to a known client version, but not strictly required. */
  client_gitref: string;
  captured_at: string;
}

function homeDir(): string {
  return process.env.UBEREATS_MCP_HOME ?? path.join(os.homedir(), '.ubereats-mcp');
}

export function sessionPath(): string {
  return path.join(homeDir(), 'session.json');
}

export async function readSession(): Promise<SessionData | null> {
  try {
    const raw = await fs.readFile(sessionPath(), 'utf8');
    return JSON.parse(raw) as SessionData;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export async function writeSession(data: SessionData): Promise<void> {
  const dir = homeDir();
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const tmpFile = sessionPath() + '.tmp';
  await fs.writeFile(tmpFile, JSON.stringify(data, null, 2), { mode: 0o600 });
  await fs.rename(tmpFile, sessionPath());
  await fs.chmod(sessionPath(), 0o600);
}
