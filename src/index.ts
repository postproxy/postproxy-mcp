#!/usr/bin/env node
/**
 * Entry point for PostProxy MCP Server
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getApiKey, getBaseUrl } from "./auth/credentials.js";
import { PostProxyClient } from "./api/client.js";
import { createMCPServer } from "./server.js";
import { log, logError } from "./utils/logger.js";
import { createError, ErrorCodes } from "./utils/errors.js";

async function main() {
  // Check if setup command was called
  if (process.argv[2] === "setup") {
    const { setup } = await import("./setup.js");
    await setup();
    return;
  }

  try {
    // Read environment variables
    const apiKey = getApiKey();
    const baseUrl = getBaseUrl();

    if (!apiKey) {
      logError(
        createError(
          ErrorCodes.AUTH_MISSING,
          "POSTPROXY_API_KEY environment variable is not set"
        ),
        "startup"
      );
      process.exit(1);
    }

    // Create API client
    const client = new PostProxyClient(apiKey, baseUrl);

    // Create MCP server
    const server = await createMCPServer(client);

    // Setup stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);

    log("PostProxy MCP Server started");
  } catch (error) {
    logError(error as Error, "startup");
    process.exit(1);
  }
}

main().catch((error) => {
  logError(error as Error, "main");
  process.exit(1);
});
