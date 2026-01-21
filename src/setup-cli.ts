#!/usr/bin/env node
/**
 * CLI entry point for setup script
 */

import { setup } from "./setup.js";

setup().catch((error) => {
  console.error(`\n❌ Fatal error: ${error}`);
  process.exit(1);
});
