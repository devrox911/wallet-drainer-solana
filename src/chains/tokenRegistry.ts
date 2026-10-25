import { ChainId, TokenDefinition } from './types';

/**
 * Canonical contract addresses for widely-held tokens, per EVM chain.
 *
 * These are checked at query time with a balanceOf call, so an address that is
 * wrong or stale simply reports a zero balance rather than failing the run.
 * Verify any address you care about against the issuer or a block explorer
 * before trusting a number here, and extend the lists as needed.
 */
export const EVM_TOKENS: Partial<Record<ChainId, TokenDefinition[]>> = {
  ethereum: [
    { symbol: 'USDT', name: 'Tether USD', contract: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6, coingeckoId: 'tether' },
    { symbol: 'USDC', name: 'USD Coin', contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6, coingeckoId: 'usd-coin' },
    { symbol: 'DAI', name: 'Dai Stablecoin', contract: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18, coingeckoId: 'dai' },
    { symbol: 'WBTC', name: 'Wrapped Bitcoin', contract: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8, coingeckoId: 'wrapped-bitcoin' },
    { symbol: 'WETH', name: 'Wrapped Ether', contract: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18, coingeckoId: 'weth' },
    { symbol: 'LINK', name: 'Chainlink', contract: '0x514910771AF9Ca656af840dff83E8264EcF986CA', decimals: 18, coingeckoId: 'chainlink' },
  ],
  polygon: [
    { symbol: 'USDT', name: 'Tether USD', contract: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6, coingeckoId: 'tether' },
    { symbol: 'USDC', name: 'USD Coin', contract: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6, coingeckoId: 'usd-coin' },
    { symbol: 'USDC.e', name: 'USD Coin (bridged)', contract: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', decimals: 6, coingeckoId: 'usd-coin' },
    { symbol: 'DAI', name: 'Dai Stablecoin', contract: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', decimals: 18, coingeckoId: 'dai' },
    { symbol: 'WETH', name: 'Wrapped Ether', contract: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18, coingeckoId: 'weth' },
  ],
  arbitrum: [
    { symbol: 'USDT', name: 'Tether USD', contract: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6, coingeckoId: 'tether' },
    { symbol: 'USDC', name: 'USD Coin', contract: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6, coingeckoId: 'usd-coin' },
    { symbol: 'DAI', name: 'Dai Stablecoin', contract: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18, coingeckoId: 'dai' },
    { symbol: 'WETH', name: 'Wrapped Ether', contract: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18, coingeckoId: 'weth' },
  ],
  optimism: [
    { symbol: 'USDT', name: 'Tether USD', contract: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', decimals: 6, coingeckoId: 'tether' },
    { symbol: 'USDC', name: 'USD Coin', contract: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6, coingeckoId: 'usd-coin' },
    { symbol: 'DAI', name: 'Dai Stablecoin', contract: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18, coingeckoId: 'dai' },
    { symbol: 'WETH', name: 'Wrapped Ether', contract: '0x4200000000000000000000000000000000000006', decimals: 18, coingeckoId: 'weth' },
  ],
  base: [
    { symbol: 'USDC', name: 'USD Coin', contract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, coingeckoId: 'usd-coin' },
    { symbol: 'USDT', name: 'Tether USD', contract: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6, coingeckoId: 'tether' },
    { symbol: 'DAI', name: 'Dai Stablecoin', contract: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18, coingeckoId: 'dai' },
    { symbol: 'WETH', name: 'Wrapped Ether', contract: '0x4200000000000000000000000000000000000006', decimals: 18, coingeckoId: 'weth' },
  ],
};

/** Well-known SPL mints, so common Solana holdings get a symbol and price. */
export const SOLANA_TOKENS: Record<string, { symbol: string; name: string; coingeckoId?: string }> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { symbol: 'USDC', name: 'USD Coin', coingeckoId: 'usd-coin' },
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: { symbol: 'USDT', name: 'Tether USD', coingeckoId: 'tether' },
  So11111111111111111111111111111111111111112: { symbol: 'wSOL', name: 'Wrapped SOL', coingeckoId: 'solana' },
  mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: { symbol: 'mSOL', name: 'Marinade staked SOL', coingeckoId: 'msol' },
  '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs': { symbol: 'ETH', name: 'Wrapped Ether (Wormhole)', coingeckoId: 'ethereum' },
};
