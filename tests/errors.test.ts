import { describe, it, expect } from 'vitest';
import { McpError, ERROR_CODES, toToolErrorResult } from '../src/errors.js';

describe('McpError', () => {
  it('constructs with code, message, and recommended action', () => {
    const err = new McpError('AUTH_REQUIRED', 'Session expired', 'call_login');
    expect(err.code).toBe('AUTH_REQUIRED');
    expect(err.message).toBe('Session expired');
    expect(err.recommendedAction).toBe('call_login');
  });

  it('ERROR_CODES contains exactly the four public codes', () => {
    expect([...ERROR_CODES].sort()).toEqual([
      'AUTH_REQUIRED',
      'GRAPHQL_ERROR',
      'RATE_LIMITED',
      'UPSTREAM_ERROR',
    ]);
  });

  it('toToolErrorResult returns an MCP tool error payload', () => {
    const err = new McpError('RATE_LIMITED', 'Too many requests', 'wait_and_retry');
    const result = toToolErrorResult(err);
    expect(result.isError).toBe(true);
    expect(result.content[0].type).toBe('text');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toEqual({
      error_code: 'RATE_LIMITED',
      message: 'Too many requests',
      recommended_action: 'wait_and_retry',
    });
  });
});
