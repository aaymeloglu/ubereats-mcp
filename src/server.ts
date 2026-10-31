#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { Server } from '@modelcontextprotocol/server';

const server = new Server(
  { name: 'ubereats-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler('tools/list', async () => ({ tools: [] }));

server.setRequestHandler('tools/call', async (request) => {
  return {
    content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }],
    isError: true,
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
