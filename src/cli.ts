import * as readline from 'readline';
import { ChainId } from './chains/types';
import { AddressQuery, createAdapters, detectChains, inspectPortfolio } from './portfolio';
import { Portfolio } from './chains/types';

const SUPPORTED_CHAINS: ChainId[] = ['bitcoin', 'ethereum', 'polygon', 'arbitrum', 'optimism', 'base', 'solana'];

interface CliOptions {
  addresses: string[];
  json: boolean;
  minValue: number;
  help: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { addresses: [], json: false, minValue: 0, help: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--min-value') {
      options.minValue = parseFloat(argv[++i] ?? '0') || 0;
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      options.addresses.push(arg);
    }
  }

  return options;
}

function usage(): string {
  return [
    'Multi-chain portfolio viewer (read-only)',
    '',
    'Usage:',
    '  npm run portfolio -- <address> [address...] [options]',
    '',
    'Addresses may be bare, or prefixed with a chain to skip auto-detection:',
    '  npm run portfolio -- ethereum:0xAbC... bitcoin:bc1q... solana:7xK...',
    '',
    'Options:',
    '  --min-value <usd>   Hide holdings below this USD value (default: 0)',
    '  --json              Emit JSON instead of a table',
    '  -h, --help          Show this help',
    '',
    `Supported chains: ${SUPPORTED_CHAINS.join(', ')}`,
    '',
    'This tool reads public addresses only. It never asks for a private key,',
    'seed phrase, or any other secret, and it cannot move funds.',
  ].join('\n');
}

/** Expand user input into concrete (chain, address) queries. */
export function buildQueries(inputs: string[]): { queries: AddressQuery[]; warnings: string[] } {
  const adapters = createAdapters();
  const queries: AddressQuery[] = [];
  const warnings: string[] = [];

  for (const input of inputs) {
    const value = input.trim();
    if (!value) continue;

    const separator = value.indexOf(':');
    const maybeChain = separator > 0 ? value.slice(0, separator).toLowerCase() : '';

    if (SUPPORTED_CHAINS.includes(maybeChain as ChainId)) {
      const chain = maybeChain as ChainId;
      const address = value.slice(separator + 1).trim();
      const adapter = adapters.get(chain);

      if (adapter && !adapter.isValidAddress(address)) {
        warnings.push(`Skipping "${address}": not a valid ${chain} address.`);
        continue;
      }
      queries.push({ chain, address });
      continue;
    }

    const detected = detectChains(value, adapters);
    if (detected.length === 0) {
      warnings.push(`Skipping "${value}": address format not recognised on any supported chain.`);
      continue;
    }

    for (const chain of detected) {
      queries.push({ chain, address: value });
    }
  }

  return { queries, warnings };
}

function formatAmount(amount: number): string {
  if (amount === 0) return '0';
  if (amount < 0.0001) return amount.toExponential(2);
  if (amount < 1) return amount.toFixed(6);
  if (amount < 1000) return amount.toFixed(4);
  return amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function formatUsd(value: number | null): string {
  if (value === null) return 'unpriced';
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function renderPortfolio(portfolio: Portfolio, minValue: number): string {
  const lines: string[] = [];

  for (const entry of portfolio.addresses) {
    const header = `${entry.chain} · ${entry.address}`;
    lines.push('');
    lines.push(header);
    lines.push('─'.repeat(Math.min(header.length, 72)));

    if (entry.error) {
      lines.push(`  error: ${entry.error}`);
      continue;
    }

    const visible = entry.assets.filter((asset) => asset.valueUsd === null || asset.valueUsd >= minValue);

    if (visible.length === 0) {
      lines.push(entry.assets.length === 0 ? '  no balances found' : `  no holdings at or above ${formatUsd(minValue)}`);
    } else {
      for (const asset of visible) {
        const amount = formatAmount(asset.amount).padStart(18);
        lines.push(`  ${asset.symbol.padEnd(8)} ${amount}   ${formatUsd(asset.valueUsd).padStart(14)}`);
      }
    }

    lines.push(`  subtotal: ${formatUsd(entry.totalValueUsd)}${entry.unpricedCount > 0 ? `  (${entry.unpricedCount} unpriced, excluded)` : ''}`);
  }

  lines.push('');
  lines.push(`TOTAL: ${formatUsd(portfolio.totalValueUsd)}`);
  lines.push(`as of ${portfolio.generatedAt}`);

  return lines.join('\n');
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main(): Promise<void> {
  let options: CliOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    console.error('\n' + usage());
    process.exitCode = 1;
    return;
  }

  if (options.help) {
    console.log(usage());
    return;
  }

  if (options.addresses.length === 0) {
    const answer = await prompt('Enter one or more public addresses (space-separated): ');
    options.addresses = answer.split(/\s+/).filter(Boolean);
  }

  if (options.addresses.length === 0) {
    console.error('No addresses provided.');
    process.exitCode = 1;
    return;
  }

  const { queries, warnings } = buildQueries(options.addresses);
  for (const warning of warnings) console.error(`warning: ${warning}`);

  if (queries.length === 0) {
    console.error('Nothing to query.');
    process.exitCode = 1;
    return;
  }

  const portfolio = await inspectPortfolio(queries);

  if (options.json) {
    console.log(JSON.stringify(portfolio, null, 2));
  } else {
    console.log(renderPortfolio(portfolio, options.minValue));
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Unexpected error:', error);
    process.exitCode = 1;
  });
}
