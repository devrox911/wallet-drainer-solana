import axios, { AxiosInstance } from 'axios';
import { AssetBalance, ChainId } from '../chains/types';
import { EVM_TOKENS, SOLANA_TOKENS } from '../chains/tokenRegistry';

/** CoinGecko id for each chain's native asset. */
const NATIVE_COINGECKO_IDS: Record<ChainId, string> = {
  bitcoin: 'bitcoin',
  ethereum: 'ethereum',
  polygon: 'matic-network',
  arbitrum: 'ethereum',
  optimism: 'ethereum',
  base: 'ethereum',
  solana: 'solana',
};

/** Binance spot symbols, used when CoinGecko is unreachable or rate-limited. */
const BINANCE_SYMBOLS: Record<string, string> = {
  bitcoin: 'BTCUSDT',
  ethereum: 'ETHUSDT',
  solana: 'SOLUSDT',
  'matic-network': 'POLUSDT',
};

/** DexScreener's chain slugs, for pricing tokens absent from the registry. */
const DEXSCREENER_CHAINS: Partial<Record<ChainId, string>> = {
  ethereum: 'ethereum',
  polygon: 'polygon',
  arbitrum: 'arbitrum',
  optimism: 'optimism',
  base: 'base',
  solana: 'solana',
};

interface CacheEntry {
  price: number;
  timestamp: number;
}

/**
 * Resolves USD prices for assets across chains.
 *
 * Prices are best-effort: an asset whose price cannot be established keeps a
 * null price rather than a guessed one, so it is reported as unpriced instead
 * of silently contributing a wrong number to a portfolio total.
 */
export class PriceService {
  private static instance: PriceService;

  private readonly cache = new Map<string, CacheEntry>();
  private readonly cacheDuration = 5 * 60 * 1000;
  private readonly http: AxiosInstance;

  private constructor() {
    this.http = axios.create({ timeout: 15000 });
  }

  static getInstance(): PriceService {
    if (!PriceService.instance) {
      PriceService.instance = new PriceService();
    }
    return PriceService.instance;
  }

  /** Return a copy of `assets` with priceUsd and valueUsd filled in where resolvable. */
  async priceAssets(assets: AssetBalance[]): Promise<AssetBalance[]> {
    const ids = new Set<string>();
    for (const asset of assets) {
      const id = this.coingeckoIdFor(asset);
      if (id) ids.add(id);
    }

    const byId = await this.fetchCoingeckoPrices([...ids]);

    return Promise.all(
      assets.map(async (asset) => {
        const id = this.coingeckoIdFor(asset);
        let price = id ? byId.get(id) ?? null : null;

        if (price === null && id && BINANCE_SYMBOLS[id]) {
          price = await this.fetchBinancePrice(BINANCE_SYMBOLS[id]);
        }
        if (price === null && asset.contract) {
          price = await this.fetchDexScreenerPrice(asset.chain, asset.contract);
        }

        return {
          ...asset,
          priceUsd: price,
          valueUsd: price === null ? null : asset.amount * price,
        };
      })
    );
  }

  /** Map an asset onto a CoinGecko id via the native table or the token registries. */
  private coingeckoIdFor(asset: AssetBalance): string | undefined {
    if (asset.isNative) return NATIVE_COINGECKO_IDS[asset.chain];

    if (asset.chain === 'solana' && asset.contract) {
      return SOLANA_TOKENS[asset.contract]?.coingeckoId;
    }
    if (asset.contract) {
      const target = asset.contract.toLowerCase();
      return (EVM_TOKENS[asset.chain] || []).find((token) => token.contract.toLowerCase() === target)?.coingeckoId;
    }
    return undefined;
  }

  private async fetchCoingeckoPrices(ids: string[]): Promise<Map<string, number>> {
    const prices = new Map<string, number>();
    const missing: string[] = [];

    for (const id of ids) {
      const cached = this.cache.get(id);
      if (cached && Date.now() - cached.timestamp < this.cacheDuration) {
        prices.set(id, cached.price);
      } else {
        missing.push(id);
      }
    }

    if (missing.length === 0) return prices;

    try {
      const response = await this.http.get('https://api.coingecko.com/api/v3/simple/price', {
        params: { ids: missing.join(','), vs_currencies: 'usd' },
      });
      for (const id of missing) {
        const price = response.data?.[id]?.usd;
        if (typeof price === 'number' && price > 0) {
          prices.set(id, price);
          this.cache.set(id, { price, timestamp: Date.now() });
        }
      }
    } catch {
      // Callers fall back to Binance or DexScreener for whatever is unresolved.
    }

    return prices;
  }

  private async fetchBinancePrice(symbol: string): Promise<number | null> {
    const cacheKey = `binance:${symbol}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheDuration) return cached.price;

    try {
      const response = await this.http.get('https://api.binance.com/api/v3/ticker/price', { params: { symbol } });
      const price = parseFloat(response.data?.price);
      if (Number.isFinite(price) && price > 0) {
        this.cache.set(cacheKey, { price, timestamp: Date.now() });
        return price;
      }
    } catch {
      // Unresolved; reported as unpriced.
    }
    return null;
  }

  private async fetchDexScreenerPrice(chain: ChainId, contract: string): Promise<number | null> {
    const cacheKey = `dex:${chain}:${contract.toLowerCase()}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheDuration) return cached.price;

    const slug = DEXSCREENER_CHAINS[chain];
    if (!slug) return null;

    try {
      const response = await this.http.get(`https://api.dexscreener.com/latest/dex/tokens/${contract}`);
      const pairs: Array<{ chainId?: string; priceUsd?: string; liquidity?: { usd?: number } }> = response.data?.pairs || [];

      // Prefer the deepest pool on the chain the asset actually came from; a
      // same-symbol pool elsewhere can be an unrelated token.
      const candidates = pairs
        .filter((pair) => pair.chainId === slug && pair.priceUsd)
        .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));

      const price = parseFloat(candidates[0]?.priceUsd ?? '');
      if (Number.isFinite(price) && price > 0) {
        this.cache.set(cacheKey, { price, timestamp: Date.now() });
        return price;
      }
    } catch {
      // Unresolved; reported as unpriced.
    }
    return null;
  }
}
