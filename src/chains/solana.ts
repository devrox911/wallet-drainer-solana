import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { AssetBalance, ChainAdapter, ChainId } from './types';
import { SOLANA_TOKENS } from './tokenRegistry';

const DEFAULT_RPC_URL = 'https://api.mainnet-beta.solana.com';

/**
 * Watch-only Solana reader.
 *
 * Takes a public address. Unlike a keypair-backed client it cannot sign, so
 * inspecting a wallet here never requires handing over key material.
 */
export class SolanaAdapter implements ChainAdapter {
  readonly chain: ChainId = 'solana';
  readonly displayName = 'Solana';
  readonly nativeSymbol = 'SOL';

  private readonly connection: Connection;

  constructor(rpcUrl: string = DEFAULT_RPC_URL) {
    this.connection = new Connection(rpcUrl, 'confirmed');
  }

  isValidAddress(address: string): boolean {
    try {
      new PublicKey(address.trim());
      return true;
    } catch {
      return false;
    }
  }

  async getBalances(address: string): Promise<AssetBalance[]> {
    const normalized = address.trim();
    if (!this.isValidAddress(normalized)) {
      throw new Error(`Not a valid Solana address: ${address}`);
    }

    const owner = new PublicKey(normalized);
    const assets: AssetBalance[] = [];

    const lamports = await this.connection.getBalance(owner);
    if (lamports > 0) {
      assets.push({
        chain: this.chain,
        symbol: 'SOL',
        name: 'Solana',
        amount: lamports / LAMPORTS_PER_SOL,
        rawAmount: lamports.toString(),
        decimals: 9,
        priceUsd: null,
        valueUsd: null,
        isNative: true,
      });
    }

    const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(owner, {
      programId: TOKEN_PROGRAM_ID,
    });

    for (const account of tokenAccounts.value) {
      const info = account.account.data.parsed?.info;
      if (!info) continue;

      const mint: string = info.mint;
      const tokenAmount = info.tokenAmount;
      const amount = Number(tokenAmount?.uiAmount ?? 0);
      if (!(amount > 0)) continue;

      const known = SOLANA_TOKENS[mint];
      assets.push({
        chain: this.chain,
        symbol: known?.symbol ?? this.shortMint(mint),
        name: known?.name ?? 'Unknown SPL token',
        contract: mint,
        amount,
        rawAmount: String(tokenAmount?.amount ?? '0'),
        decimals: Number(tokenAmount?.decimals ?? 0),
        priceUsd: null,
        valueUsd: null,
        isNative: false,
      });
    }

    return assets;
  }

  private shortMint(mint: string): string {
    return `${mint.slice(0, 4)}…${mint.slice(-4)}`;
  }
}
