export const ERROR_CODES = [
  'AUTH_REQUIRED',
  'RATE_LIMITED',
  'GRAPHQL_ERROR',
  'UPSTREAM_ERROR',
] as const;

export type ErrorCode = typeof ERROR_CODES[number];

export type RecommendedAction =
  | 'call_login'
  | 'wait_and_retry'
  | 'surface_to_user'
  | 'retry_later';

export class McpError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly recommendedAction: RecommendedAction,
  ) {
    super(message);
    this.name = 'McpError';
  }
}

export function toToolErrorResult(err: McpError) {
  return {
    isError: true,
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          error_code: err.code,
          message: err.message,
          recommended_action: err.recommendedAction,
        }),
      },
    ],
  };
}
