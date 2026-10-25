import axios, { AxiosInstance } from 'axios';
import { AssetBalance, ChainAdapter, ChainId, TokenDefinition } from './types';
import { EVM_TOKENS } from './tokenRegistry';

export interface EvmChainConfig {
  chain: ChainId;
  displayName: string;
  nativeSymbol: string;
  nativeName: string;
  nativeCoingeckoId: string;
  defaultRpcUrl: string;
}

export const EVM_CHAINS: EvmChainConfig[] = [
  {
    chain: 'ethereum',
    displayName: 'Ethereum',
    nativeSymbol: 'ETH',
    nativeName: 'Ether',
    nativeCoingeckoId: 'ethereum',
    defaultRpcUrl: 'https://eth.llamarpc.com',
  },
  {
    chain: 'polygon',
    displayName: 'Polygon',
    nativeSymbol: 'POL',
    nativeName: 'Polygon Ecosystem Token',
    nativeCoingeckoId: 'matic-network',
    defaultRpcUrl: 'https://polygon-rpc.com',
  },
  {
    chain: 'arbitrum',
    displayName: 'Arbitrum One',
    nativeSymbol: 'ETH',
    nativeName: 'Ether',
    nativeCoingeckoId: 'ethereum',
    defaultRpcUrl: 'https://arb1.arbitrum.io/rpc',
  },
  {
    chain: 'optimism',
    displayName: 'Optimism',
    nativeSymbol: 'ETH',
    nativeName: 'Ether',
    nativeCoingeckoId: 'ethereum',
    defaultRpcUrl: 'https://mainnet.optimism.io',
  },
  {
    chain: 'base',
    displayName: 'Base',
    nativeSymbol: 'ETH',
    nativeName: 'Ether',
    nativeCoingeckoId: 'ethereum',
    defaultRpcUrl: 'https://mainnet.base.org',
  },
];

/** ERC-20 balanceOf(address) selector. */
const BALANCE_OF_SELECTOR = '0x70a08231';

interface JsonRpcCall {
  method: string;
  params: unknown[];
}

/**
 * Scale an integer balance down by its decimals.
 *
 * Done via BigInt so balances beyond 2^53 stay exact until the final, purely
 * cosmetic conversion to a float.
 */
export function scaleUnits(raw: bigint, decimals: number): number {
  const negative = raw < 0n;
  const magnitude = negative ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = magnitude / base;
  const fraction = magnitude % base;
  const result = Number(whole) + Number(fraction) / Number(base);
  return negative ? -result : result;
}

/**
 * Watch-only reader for an EVM chain.
 *
 * Talks raw JSON-RPC so no wallet library is pulled in; there is no code path
 * here that can construct, sign, or broadcast a transaction.
 */
export class EvmAdapter implements ChainAdapter {
  readonly chain: ChainId;
  readonly displayName: string;
  readonly nativeSymbol: string;

  private readonly config: EvmChainConfig;
  private readonly rpcUrl: string;
  private readonly http: AxiosInstance;
  private readonly tokens: TokenDefinition[];
  private nextId = 1;

  constructor(config: EvmChainConfig, rpcUrl?: string, extraTokens: TokenDefinition[] = []) {
    this.config = config;
    this.chain = config.chain;
    this.displayName = config.displayName;
    this.nativeSymbol = config.nativeSymbol;
    this.rpcUrl = rpcUrl || config.defaultRpcUrl;
    this.http = axios.create({ timeout: 20000 });
    this.tokens = [...(EVM_TOKENS[config.chain] || []), ...extraTokens];
  }

  get nativeCoingeckoId(): string {
    return this.config.nativeCoingeckoId;
  }

  isValidAddress(address: string): boolean {
    return /^0x[0-9a-fA-F]{40}$/.test(address.trim());
  }

  async getBalances(address: string): Promise<AssetBalance[]> {
    const normalized = address.trim();
    if (!this.isValidAddress(normalized)) {
      throw new Error(`Not a valid ${this.displayName} address: ${address}`);
    }

    const calls: JsonRpcCall[] = [
      { method: 'eth_getBalance', params: [normalized, 'latest'] },
      ...this.tokens.map((token) => ({
        method: 'eth_call',
        params: [{ to: token.contract, data: BALANCE_OF_SELECTOR + normalized.slice(2).toLowerCase().padStart(64, '0') }, 'latest'],
      })),
    ];

    const results = await this.rpcBatch(calls);
    const assets: AssetBalance[] = [];

    const nativeRaw = this.parseHexResult(results[0]);
    if (nativeRaw > 0n) {
      assets.push({
        chain: this.chain,
        symbol: this.config.nativeSymbol,
        name: this.config.nativeName,
        amount: scaleUnits(nativeRaw, 18),
        rawAmount: nativeRaw.toString(),
        decimals: 18,
        priceUsd: null,
        valueUsd: null,
        isNative: true,
      });
    }

    this.tokens.forEach((token, index) => {
      const raw = this.parseHexResult(results[index + 1]);
      if (raw <= 0n) return;
      assets.push({
        chain: this.chain,
        symbol: token.symbol,
        name: token.name,
        contract: token.contract,
        amount: scaleUnits(raw, token.decimals),
        rawAmount: raw.toString(),
        decimals: token.decimals,
        priceUsd: null,
        valueUsd: null,
        isNative: false,
      });
    });

    return assets;
  }

  /** A failed or empty call reads as a zero balance rather than aborting the run. */
  private parseHexResult(result: unknown): bigint {
    if (typeof result !== 'string' || !result.startsWith('0x') || result === '0x') {
      return 0n;
    }
    try {
      return BigInt(result);
    } catch {
      return 0n;
    }
  }

  /**
   * Issue calls as a single JSON-RPC batch, falling back to sequential
   * requests for endpoints that reject batched payloads.
   */
  private async rpcBatch(calls: JsonRpcCall[]): Promise<unknown[]> {
    const payload = calls.map((call) => ({ jsonrpc: '2.0', id: this.nextId++, ...call }));

    try {
      const response = await this.http.post(this.rpcUrl, payload);
      if (Array.isArray(response.data)) {
        const byId = new Map<number, unknown>();
        for (const entry of response.data) {
          if (entry && typeof entry.id === 'number') byId.set(entry.id, entry.result);
        }
        return payload.map((request) => byId.get(request.id));
      }
    } catch {
      // Fall through to sequential mode below.
    }

    const results: unknown[] = [];
    for (const call of calls) {
      try {
        const response = await this.http.post(this.rpcUrl, { jsonrpc: '2.0', id: this.nextId++, ...call });
        results.push(response.data?.result);
      } catch (error) {
        if (call.method === 'eth_getBalance') {
          throw new Error(`${this.displayName} RPC request failed: ${error instanceof Error ? error.message : 'unknown error'}`);
        }
        results.push(undefined);
      }
    }
    return results;
  }
}
