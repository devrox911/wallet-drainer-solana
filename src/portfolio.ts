import { BitcoinAdapter } from './chains/bitcoin';
import { EVM_CHAINS, EvmAdapter } from './chains/evm';
import { SolanaAdapter } from './chains/solana';
import { AddressPortfolio, AssetBalance, ChainAdapter, ChainId, Portfolio } from './chains/types';
import { PriceService } from './pricing/priceService';

export interface AddressQuery {
  chain: ChainId;
  address: string;
}

export interface PortfolioOptions {
  /** Override the default public RPC for a chain, e.g. { ethereum: '<url>' }. */
  rpcUrls?: Partial<Record<ChainId, string>>;
}

/** Build the full set of read-only chain adapters. */
export function createAdapters(options: PortfolioOptions = {}): Map<ChainId, ChainAdapter> {
  const adapters = new Map<ChainId, ChainAdapter>();

  adapters.set('bitcoin', new BitcoinAdapter());
  adapters.set('solana', new SolanaAdapter(options.rpcUrls?.solana));

  for (const config of EVM_CHAINS) {
    adapters.set(config.chain, new EvmAdapter(config, options.rpcUrls?.[config.chain]));
  }

  return adapters;
}

/**
 * Guess which chains an address could belong to, by format alone.
 *
 * An EVM address is valid on every EVM chain at once, so this returns all of
 * them and lets the caller query each.
 */
export function detectChains(address: string, adapters: Map<ChainId, ChainAdapter>): ChainId[] {
  const value = address.trim();
  const matches: ChainId[] = [];

  for (const [chain, adapter] of adapters) {
    if (adapter.isValidAddress(value)) matches.push(chain);
  }

  // Base58 Bitcoin and Solana addresses can both satisfy the other's format
  // check. Bitcoin's version prefixes are the reliable discriminator.
  if (matches.includes('solana') && matches.includes('bitcoin')) {
    const looksBitcoin = /^(1|3|bc1)/.test(value);
    const ambiguous: ChainId = looksBitcoin ? 'solana' : 'bitcoin';
    return matches.filter((chain) => chain !== ambiguous);
  }

  return matches;
}

/**
 * Read balances for each address and attach USD valuations.
 *
 * A chain that fails is recorded on its own entry; the rest of the portfolio
 * still reports, so one unreachable RPC never blanks the whole view.
 */
export async function inspectPortfolio(queries: AddressQuery[], options: PortfolioOptions = {}): Promise<Portfolio> {
  const adapters = createAdapters(options);
  const priceService = PriceService.getInstance();

  const entries = await Promise.all(
    queries.map(async (query): Promise<AddressPortfolio> => {
      const adapter = adapters.get(query.chain);
      if (!adapter) {
        return { chain: query.chain, address: query.address, assets: [], totalValueUsd: 0, unpricedCount: 0, error: `Unsupported chain: ${query.chain}` };
      }

      try {
        const balances = await adapter.getBalances(query.address);
        return summarize(query.chain, query.address, await priceService.priceAssets(balances));
      } catch (error) {
        return {
          chain: query.chain,
          address: query.address,
          assets: [],
          totalValueUsd: 0,
          unpricedCount: 0,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    })
  );

  return {
    addresses: entries,
    totalValueUsd: entries.reduce((sum, entry) => sum + entry.totalValueUsd, 0),
    generatedAt: new Date().toISOString(),
  };
}

function summarize(chain: ChainId, address: string, assets: AssetBalance[]): AddressPortfolio {
  const sorted = [...assets].sort((a, b) => (b.valueUsd ?? -1) - (a.valueUsd ?? -1));

  return {
    chain,
    address,
    assets: sorted,
    totalValueUsd: sorted.reduce((sum, asset) => sum + (asset.valueUsd ?? 0), 0),
    unpricedCount: sorted.filter((asset) => asset.valueUsd === null).length,
  };
}
