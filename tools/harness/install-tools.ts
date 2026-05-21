#!/usr/bin/env node
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const TOOLS = [
  { name: 'semgrep', package: 'semgrep' },
  { name: 'gitleaks', package: 'gitleaks' },
  { name: 'checkov', package: 'checkov' },
  { name: 'bandit', package: 'bandit' },
  { name: 'gosec', package: 'gosec' },
  {
    name: 'jscpd',
    package: 'jscpd',
    cmd: 'jscpd --version',
    installCmd: 'npm install -g jscpd',
  },
  {
    name: 'radon',
    package: 'radon',
    cmd: 'radon --version',
    installCmd: 'pip install radon',
    platform: 'python',
  },
  {
    name: 'gocyclo',
    package: 'gocyclo',
    cmd: 'gocyclo -version',
    installCmd: 'go install github.com/fzipp/gocyclo/cmd/gocyclo@latest',
    platform: 'go',
  },
];

async function main() {
  const args = process.argv.slice(2);
  const toolName = args[0];

  if (toolName) {
    const tool = TOOLS.find(t => t.name === toolName);
    if (!tool) {
      console.error(`Unknown tool: ${toolName}`);
      process.exit(1);
    }
    console.log(`Installing ${tool.name}...`);
    await execAsync(`npm install -g ${tool.package}`);
    console.log(`${tool.name} installed`);
  } else {
    console.log('Installing all harness tools...');
    for (const tool of TOOLS) {
      try {
        console.log(`Installing ${tool.name}...`);
        await execAsync(`npm install -g ${tool.package}`);
        console.log(`${tool.name}`);
      } catch (error: any) {
        console.log(`${tool.name}: ${error.message}`);
      }
    }
    console.log('\nDone!');
  }
}

main();
