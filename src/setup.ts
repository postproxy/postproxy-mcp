#!/usr/bin/env node
/**
 * Interactive setup script for PostProxy MCP Server
 * Makes it easy for non-technical users to configure Claude Code integration
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import * as readline from "readline";

interface ClaudeConfig {
  mcpServers?: {
    [key: string]: {
      command: string;
      env?: {
        POSTPROXY_API_KEY?: string;
        POSTPROXY_BASE_URL?: string;
      };
    };
  };
}

function getConfigPath(): string {
  const platform = process.platform;
  
  if (platform === "win32") {
    return join(process.env.APPDATA || "", "Claude", "claude_desktop_config.json");
  } else {
    return join(homedir(), ".config", "claude", "claude_desktop_config.json");
  }
}

function readConfig(): ClaudeConfig {
  const configPath = getConfigPath();
  
  if (!existsSync(configPath)) {
    return {};
  }
  
  try {
    const content = readFileSync(configPath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    console.error(`⚠️  Error reading config file: ${error}`);
    return {};
  }
}

function writeConfig(config: ClaudeConfig): void {
  const configPath = getConfigPath();
  const configDir = dirname(configPath);
  
  // Create directory if it doesn't exist
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  
  try {
    writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
    console.log(`✅ Configuration saved to: ${configPath}`);
  } catch (error) {
    console.error(`❌ Error writing config file: ${error}`);
    process.exit(1);
  }
}

function question(rl: readline.Interface, query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

function questionWithDefault(rl: readline.Interface, query: string, defaultValue: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(`${query} [${defaultValue}]: `, (answer) => {
      resolve(answer.trim() || defaultValue);
    });
  });
}

async function main() {
  console.log("\n🚀 PostProxy MCP Server Setup");
  console.log("=" .repeat(50));
  console.log("This script will help you configure Claude Code to use PostProxy MCP Server.\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    // Get API key
    console.log("📝 Step 1: PostProxy API Configuration");
    console.log("-" .repeat(50));
    
    const apiKey = await question(
      rl,
      "Enter your PostProxy API key: "
    );

    if (!apiKey || apiKey.trim().length === 0) {
      console.error("❌ API key is required!");
      process.exit(1);
    }

    const baseUrl = await questionWithDefault(
      rl,
      "Enter PostProxy API base URL",
      "https://api.postproxy.dev/api"
    );

    // Determine command path
    console.log("\n📦 Step 2: Installation Path");
    console.log("-" .repeat(50));
    
    console.log("\nHow did you install PostProxy MCP Server?");
    console.log("1. Installed globally via npm (npm install -g postproxy-mcp)");
    console.log("2. Using local development build");
    console.log("3. Custom path");
    
    const installType = await question(rl, "\nSelect option (1-3): ");

    let command: string;
    
    if (installType === "1") {
      command = "postproxy-mcp";
    } else if (installType === "2") {
      // Try to detect current location
      const currentDir = process.cwd();
      const possiblePath = join(currentDir, "dist", "index.js");
      
      if (existsSync(possiblePath)) {
        command = possiblePath;
        console.log(`✅ Detected local build at: ${command}`);
      } else {
        const customPath = await question(
          rl,
          "Enter path to dist/index.js: "
        );
        command = customPath;
      }
    } else {
      command = await question(rl, "Enter full path to postproxy-mcp command: ");
    }

    // Read existing config
    const config = readConfig();
    
    // Update config
    if (!config.mcpServers) {
      config.mcpServers = {};
    }

    config.mcpServers.postproxy = {
      command: command,
      env: {
        POSTPROXY_API_KEY: apiKey.trim(),
        POSTPROXY_BASE_URL: baseUrl.trim(),
      },
    };

    // Write config
    console.log("\n💾 Step 3: Saving Configuration");
    console.log("-" .repeat(50));
    
    writeConfig(config);

    // Final instructions
    console.log("\n✨ Setup Complete!");
    console.log("=" .repeat(50));
    console.log("\n📋 Next steps:");
    console.log("1. Restart your Claude Code session");
    console.log("2. Test the connection by asking Claude: 'Check my PostProxy authentication status'");
    console.log("3. If configured correctly, Claude will automatically use PostProxy tools");
    console.log("\n💡 Tip: You can run this setup again anytime with: postproxy-mcp setup");
    console.log("");

  } catch (error) {
    console.error(`\n❌ Setup failed: ${error}`);
    process.exit(1);
  } finally {
    rl.close();
  }
}

export { main as setup };
