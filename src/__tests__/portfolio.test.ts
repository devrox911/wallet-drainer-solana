import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BitcoinAdapter } from '../chains/bitcoin';
import { EVM_CHAINS, EvmAdapter, scaleUnits } from '../chains/evm';
import { SolanaAdapter } from '../chains/solana';
import { AssetBalance, Portfolio } from '../chains/types';
import { buildQueries, renderPortfolio } from '../cli';
import { createAdapters, detectChains } from '../portfolio';

const ETH_ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const BTC_P2PKH = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
const BTC_BECH32 = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const SOL_ADDRESS = 'So11111111111111111111111111111111111111112';

test('scaleUnits keeps precision beyond 2^53', () => {
  // 12345678.123456789012345678 ETH -- far past float integer precision.
  const raw = 12345678123456789012345678n;
  assert.equal(Math.round(scaleUnits(raw, 18)), 12345678);

  assert.equal(scaleUnits(0n, 18), 0);
  assert.equal(scaleUnits(1n, 8), 1e-8);
  assert.equal(scaleUnits(100000000n, 8), 1);
  assert.equal(scaleUnits(1000000n, 6), 1);
});

test('EVM address validation accepts checksummed and lowercase, rejects malformed', () => {
  const adapter = new EvmAdapter(EVM_CHAINS[0]);

  assert.ok(adapter.isValidAddress(ETH_ADDRESS));
  assert.ok(adapter.isValidAddress(ETH_ADDRESS.toLowerCase()));
  assert.ok(adapter.isValidAddress(`  ${ETH_ADDRESS}  `));

  assert.ok(!adapter.isValidAddress(ETH_ADDRESS.slice(0, -1)));
  assert.ok(!adapter.isValidAddress(ETH_ADDRESS + 'a'));
  assert.ok(!adapter.isValidAddress(ETH_ADDRESS.replace('0x', '')));
  assert.ok(!adapter.isValidAddress('0xZZZZ6BF26964aF9D7eEd9e03E53415D37aA96045'));
  assert.ok(!adapter.isValidAddress(''));
});

test('Bitcoin address validation covers P2PKH, P2SH and bech32', () => {
  const adapter = new BitcoinAdapter();

  assert.ok(adapter.isValidAddress(BTC_P2PKH));
  assert.ok(adapter.isValidAddress('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy'));
  assert.ok(adapter.isValidAddress(BTC_BECH32));
  assert.ok(adapter.isValidAddress(BTC_BECH32.toUpperCase()));

  assert.ok(!adapter.isValidAddress(ETH_ADDRESS));
  assert.ok(!adapter.isValidAddress('not-an-address'));
  assert.ok(!adapter.isValidAddress(''));
});

test('Bitcoin rejects extended public keys with an actionable message', async () => {
  const adapter = new BitcoinAdapter();
  await assert.rejects(
    () => adapter.getBalances('xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWKiKrhko4egpiMZbpiaQL2jkwSB1icqYh2cfDfVxdx4df189oLKnC5fSwqPfgyP3hooxujYzAu3fDVmz'),
    /Extended public keys/
  );
});

test('Solana address validation rejects EVM and malformed input', () => {
  const adapter = new SolanaAdapter();

  assert.ok(adapter.isValidAddress(SOL_ADDRESS));
  assert.ok(!adapter.isValidAddress(ETH_ADDRESS));
  assert.ok(!adapter.isValidAddress('0'));
  assert.ok(!adapter.isValidAddress(''));
});

test('detectChains routes each address family correctly', () => {
  const adapters = createAdapters();

  // An EVM address is valid on every EVM chain simultaneously.
  const evm = detectChains(ETH_ADDRESS, adapters);
  assert.deepEqual(new Set(evm), new Set(['ethereum', 'polygon', 'arbitrum', 'optimism', 'base']));

  assert.deepEqual(detectChains(BTC_P2PKH, adapters), ['bitcoin']);
  assert.deepEqual(detectChains(BTC_BECH32, adapters), ['bitcoin']);
  assert.deepEqual(detectChains(SOL_ADDRESS, adapters), ['solana']);
  assert.deepEqual(detectChains('nonsense', adapters), []);
});

test('buildQueries honours explicit chain prefixes', () => {
  const { queries, warnings } = buildQueries([`ethereum:${ETH_ADDRESS}`, `bitcoin:${BTC_BECH32}`]);

  assert.equal(warnings.length, 0);
  assert.deepEqual(queries, [
    { chain: 'ethereum', address: ETH_ADDRESS },
    { chain: 'bitcoin', address: BTC_BECH32 },
  ]);
});

test('buildQueries warns and skips on a chain/address mismatch', () => {
  const { queries, warnings } = buildQueries([`bitcoin:${ETH_ADDRESS}`, 'garbage']);

  assert.equal(queries.length, 0);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /not a valid bitcoin address/);
  assert.match(warnings[1], /not recognised/);
});

test('buildQueries fans an unprefixed EVM address across EVM chains', () => {
  const { queries } = buildQueries([ETH_ADDRESS]);

  assert.equal(queries.length, 5);
  assert.ok(queries.every((query) => query.address === ETH_ADDRESS));
});

function asset(overrides: Partial<AssetBalance>): AssetBalance {
  return {
    chain: 'ethereum',
    symbol: 'ETH',
    name: 'Ether',
    amount: 1,
    rawAmount: '1000000000000000000',
    decimals: 18,
    priceUsd: 2000,
    valueUsd: 2000,
    isNative: true,
    ...overrides,
  };
}

test('renderPortfolio excludes unpriced assets from totals but still lists them', () => {
  const portfolio: Portfolio = {
    addresses: [
      {
        chain: 'ethereum',
        address: ETH_ADDRESS,
        assets: [asset({}), asset({ symbol: 'MYSTERY', isNative: false, contract: '0xabc', priceUsd: null, valueUsd: null })],
        totalValueUsd: 2000,
        unpricedCount: 1,
      },
    ],
    totalValueUsd: 2000,
    generatedAt: '2026-01-01T00:00:00.000Z',
  };

  const output = renderPortfolio(portfolio, 0);

  assert.match(output, /MYSTERY/);
  assert.match(output, /unpriced/);
  assert.match(output, /1 unpriced, excluded/);
  assert.match(output, /TOTAL: \$2,000\.00/);
});

test('renderPortfolio respects the minimum value filter but keeps unpriced rows', () => {
  const portfolio: Portfolio = {
    addresses: [
      {
        chain: 'ethereum',
        address: ETH_ADDRESS,
        assets: [
          asset({ symbol: 'BIG', valueUsd: 500, priceUsd: 500 }),
          asset({ symbol: 'DUST', valueUsd: 0.01, priceUsd: 0.01 }),
          asset({ symbol: 'UNKNOWN', priceUsd: null, valueUsd: null }),
        ],
        totalValueUsd: 500.01,
        unpricedCount: 1,
      },
    ],
    totalValueUsd: 500.01,
    generatedAt: '2026-01-01T00:00:00.000Z',
  };

  const output = renderPortfolio(portfolio, 5);

  assert.match(output, /BIG/);
  assert.ok(!/DUST/.test(output), 'dust below the threshold should be hidden');
  assert.match(output, /UNKNOWN/, 'unpriced assets should never be silently hidden');
});

test('renderPortfolio surfaces a per-chain error without losing other chains', () => {
  const portfolio: Portfolio = {
    addresses: [
      { chain: 'bitcoin', address: BTC_P2PKH, assets: [], totalValueUsd: 0, unpricedCount: 0, error: 'RPC unreachable' },
      { chain: 'ethereum', address: ETH_ADDRESS, assets: [asset({})], totalValueUsd: 2000, unpricedCount: 0 },
    ],
    totalValueUsd: 2000,
    generatedAt: '2026-01-01T00:00:00.000Z',
  };

  const output = renderPortfolio(portfolio, 0);

  assert.match(output, /error: RPC unreachable/);
  assert.match(output, /TOTAL: \$2,000\.00/);
});
