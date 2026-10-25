import axios, { AxiosInstance } from 'axios';
import { AssetBalance, ChainAdapter, ChainId } from './types';
import { scaleUnits } from './evm';

/** Esplora-compatible endpoints, tried in order. */
const DEFAULT_ENDPOINTS = ['https://mempool.space/api', 'https://blockstream.info/api'];

interface EsploraStats {
  funded_txo_sum: number;
  spent_txo_sum: number;
}

interface EsploraAddress {
  chain_stats?: EsploraStats;
  mempool_stats?: EsploraStats;
}

/**
 * Watch-only Bitcoin reader backed by public Esplora instances.
 *
 * Balance is derived from funded/spent output sums, with unconfirmed mempool
 * activity folded in so a just-sent transaction is reflected immediately.
 */
export class BitcoinAdapter implements ChainAdapter {
  readonly chain: ChainId = 'bitcoin';
  readonly displayName = 'Bitcoin';
  readonly nativeSymbol = 'BTC';

  private readonly endpoints: string[];
  private readonly http: AxiosInstance;

  constructor(endpoints: string[] = DEFAULT_ENDPOINTS) {
    this.endpoints = endpoints;
    this.http = axios.create({ timeout: 20000 });
  }

  isValidAddress(address: string): boolean {
    const value = address.trim();
    // P2PKH / P2SH base58, and bech32(m) v0-v1 segwit.
    return /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(value) || /^bc1[023456789acdefghjklmnpqrstuvwxyz]{11,71}$/.test(value.toLowerCase());
  }

  async getBalances(address: string): Promise<AssetBalance[]> {
    const normalized = address.trim();
    if (!this.isValidAddress(normalized)) {
      throw new Error(
        `Not a valid Bitcoin address: ${address}. ` +
          'Extended public keys (xpub/ypub/zpub) are not supported yet -- pass individual addresses.'
      );
    }

    const data = await this.fetchAddress(normalized);
    const confirmed = this.netSum(data.chain_stats);
    const unconfirmed = this.netSum(data.mempool_stats);
    const satoshis = confirmed + unconfirmed;

    if (satoshis <= 0n) return [];

    return [
      {
        chain: this.chain,
        symbol: 'BTC',
        name: 'Bitcoin',
        amount: scaleUnits(satoshis, 8),
        rawAmount: satoshis.toString(),
        decimals: 8,
        priceUsd: null,
        valueUsd: null,
        isNative: true,
      },
    ];
  }

  private netSum(stats?: EsploraStats): bigint {
    if (!stats) return 0n;
    return BigInt(stats.funded_txo_sum ?? 0) - BigInt(stats.spent_txo_sum ?? 0);
  }

  private async fetchAddress(address: string): Promise<EsploraAddress> {
    let lastError: unknown;
    for (const endpoint of this.endpoints) {
      try {
        const response = await this.http.get<EsploraAddress>(`${endpoint}/address/${address}`);
        if (response.data && typeof response.data === 'object') return response.data;
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error(
      `Could not reach a Bitcoin API for ${address}: ${lastError instanceof Error ? lastError.message : 'all endpoints failed'}`
    );
  }
}
