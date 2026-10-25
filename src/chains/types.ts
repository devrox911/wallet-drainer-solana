/**
 * Core types for multi-chain, watch-only portfolio inspection.
 *
 * Design note: chain adapters are deliberately read-only. They accept public
 * addresses and never accept, store, or derive private key material. Any
 * signing capability belongs in a separate layer with its own explicit
 * confirmation flow -- not here.
 */

export type ChainId =
  | 'bitcoin'
  | 'ethereum'
  | 'polygon'
  | 'arbitrum'
  | 'optimism'
  | 'base'
  | 'solana';

export interface AssetBalance {
  /** Chain the asset lives on. */
  chain: ChainId;
  /** Ticker, e.g. BTC, ETH, USDT, SOL. */
  symbol: string;
  /** Human-readable name where known. */
  name: string;
  /** Contract address / mint. Absent for a chain's native asset. */
  contract?: string;
  /** Balance in whole units (already scaled by decimals). */
  amount: number;
  /** Raw integer balance in the asset's smallest unit, as a string. */
  rawAmount: string;
  decimals: number;
  /** USD unit price, or null when no price source resolved it. */
  priceUsd: number | null;
  /** amount * priceUsd, or null when price is unknown. */
  valueUsd: number | null;
  /** True for the chain's native asset (BTC, ETH, SOL). */
  isNative: boolean;
}

export interface AddressPortfolio {
  chain: ChainId;
  address: string;
  assets: AssetBalance[];
  /** Sum of valueUsd across assets with a known price. */
  totalValueUsd: number;
  /** Assets whose price could not be resolved, excluded from the total. */
  unpricedCount: number;
  /** Populated when the chain query failed; assets will be empty. */
  error?: string;
}

export interface Portfolio {
  addresses: AddressPortfolio[];
  totalValueUsd: number;
  generatedAt: string;
}

/**
 * A read-only view of one chain.
 *
 * Implementations must not expose transfer, sign, or key-import methods.
 */
export interface ChainAdapter {
  readonly chain: ChainId;
  /** Display name, e.g. "Ethereum". */
  readonly displayName: string;
  /** Ticker of the chain's native asset. */
  readonly nativeSymbol: string;

  /** Cheap structural check; does not hit the network. */
  isValidAddress(address: string): boolean;

  /** Fetch native + token balances for a public address. */
  getBalances(address: string): Promise<AssetBalance[]>;
}

/** A token this tool knows how to look up on an EVM chain. */
export interface TokenDefinition {
  symbol: string;
  name: string;
  contract: string;
  decimals: number;
  /** CoinGecko id, used for pricing when available. */
  coingeckoId?: string;
}
