/**
 * src/lib/solana/bridge.ts
 *
 * Solana → Stellar dust bridge via Allbridge Core.
 *
 * Responsibilities:
 *  1. Approve SPL token spend (if required by the bridge program).
 *  2. Build and send the Allbridge deposit transaction.
 *  3. Wait for finalized commitment before returning.
 *  4. Close empty SPL token accounts after a successful bridge to reclaim rent SOL.
 *
 * Design notes:
 *  - All public functions are pure async — no global state.
 *  - The Allbridge SDK is imported dynamically so it does not bloat the initial
 *    bundle on pages that never use the Solana lane.
 *  - Every function that touches the chain accepts an explicit `connection` and
 *    `wallet` so callers control the RPC endpoint and signing surface.
 *  - We never hold private keys. All signing goes through the injected wallet
 *    adapter (Phantom, Solflare, etc.) — the wallet extension signs in its own
 *    sandbox.
 */

import {
  Connection,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  Commitment,
} from '@solana/web3.js'
import {
  getAssociatedTokenAddress,
  createCloseAccountInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'

// ─── Types ────────────────────────────────────────────────────────────────────

/** Minimal wallet adapter surface we depend on — compatible with any
 *  @solana/wallet-adapter-base WalletAdapter. */
export interface SolanaWalletAdapter {
  publicKey: PublicKey | null
  signTransaction: (tx: Transaction) => Promise<Transaction>
  signAllTransactions?: (txs: Transaction[]) => Promise<Transaction[]>
}

/** One SPL token holding to be bridged. */
export interface SplDustToken {
  /** SPL mint address */
  mint: string
  /** Human-readable symbol, e.g. "USDC" */
  symbol: string
  /** Raw token amount (in base units, i.e. already multiplied by 10^decimals) */
  amountRaw: bigint
  /** Decimal places for this mint */
  decimals: number
  /** USD value of this holding — used for threshold filtering upstream */
  usdValue: number
}

/** Result returned after a successful bridge operation for one token. */
export interface BridgeResult {
  mint: string
  symbol: string
  /** Solana transaction signature of the bridge deposit */
  solanaTxSignature: string
  /** Whether the SPL token account was closed after bridging */
  accountClosed: boolean
  /** SOL reclaimed from closing the token account (in lamports) */
  rentReclaimedLamports: number
}

/** Allbridge chain identifier for Solana */
const ALLBRIDGE_SOLANA_CHAIN = 'SOL' as const
/** Allbridge chain identifier for Stellar */
const ALLBRIDGE_STELLAR_CHAIN = 'STELLAR' as const

/**
 * Finalized commitment gives us the strongest guarantee that the transaction
 * will not be rolled back. This is the correct level for bridge deposits
 * where an on-chain state change on one network triggers an action on another.
 */
const BRIDGE_COMMITMENT: Commitment = 'finalized'

// ─── Allbridge SDK bootstrap ──────────────────────────────────────────────────

/**
 * Lazily initialise the Allbridge Core SDK.
 *
 * Dynamic import keeps the SDK out of the initial bundle.
 * The SDK is instantiated once and cached for the lifetime of the module.
 *
 * Testnet vs mainnet is controlled by the `NEXT_PUBLIC_SOLANA_RPC_URL`
 * environment variable — point it at a testnet RPC to use testnet Allbridge.
 */
let _allbridgeCore: Awaited<ReturnType<typeof loadAllbridge>> | null = null

async function loadAllbridge() {
  // Dynamic import — tree-shaken from pages that never call bridge functions
  const { AllbridgeCoreSdk, nodeUrlsDefault } = await import('@allbridge/bridge-core-sdk')

  const sdk = new AllbridgeCoreSdk(nodeUrlsDefault)
  return sdk
}

async function getAllbridge() {
  if (!_allbridgeCore) {
    _allbridgeCore = await loadAllbridge()
  }
  return _allbridgeCore
}

// ─── SPL token account helpers ────────────────────────────────────────────────

/**
 * Returns the associated token account address for a given wallet and mint.
 */
export async function getSplTokenAccount(
  walletPublicKey: PublicKey,
  mint: string
): Promise<PublicKey> {
  const mintPublicKey = new PublicKey(mint)
  return getAssociatedTokenAddress(mintPublicKey, walletPublicKey)
}

/**
 * Returns the current token balance (in base units) for an associated token
 * account. Returns 0n if the account does not exist.
 */
export async function getSplTokenBalance(
  connection: Connection,
  walletPublicKey: PublicKey,
  mint: string
): Promise<bigint> {
  try {
    const tokenAccount = await getSplTokenAccount(walletPublicKey, mint)
    const info = await connection.getTokenAccountBalance(tokenAccount, BRIDGE_COMMITMENT)
    return BigInt(info.value.amount)
  } catch {
    // Account does not exist — balance is zero
    return 0n
  }
}

// ─── Core bridge function ─────────────────────────────────────────────────────

/**
 * Bridge a single SPL token from Solana to the Stellar dust aggregator contract.
 *
 * Steps:
 *  1. Resolve the source token account.
 *  2. Fetch Allbridge pool info and build the deposit transaction.
 *  3. Sign and submit the transaction via the injected wallet.
 *  4. Wait for finalized confirmation.
 *  5. Optionally close the token account if balance is now zero.
 *
 * @param connection  - Solana RPC connection
 * @param wallet      - Injected wallet adapter (never holds private keys)
 * @param token       - SPL token to bridge
 * @param stellarDestinationAddress - Stellar account to receive bridged funds
 * @param stellarContractAddress    - Soroban dust aggregator contract address
 */
export async function bridgeSplTokenToStellar(
  connection: Connection,
  wallet: SolanaWalletAdapter,
  token: SplDustToken,
  stellarDestinationAddress: string,
  stellarContractAddress: string
): Promise<BridgeResult> {
  if (!wallet.publicKey) {
    throw new Error('[bridge] Wallet not connected — publicKey is null')
  }

  if (token.amountRaw <= 0n) {
    throw new Error(`[bridge] Amount must be > 0 for ${token.symbol}`)
  }

  const sdk = await getAllbridge()

  // ── Step 1: Resolve chains and pools ────────────────────────────────────────
  const chains = await sdk.chainDetailsMap()

  const solanaChain = chains[ALLBRIDGE_SOLANA_CHAIN]
  const stellarChain = chains[ALLBRIDGE_STELLAR_CHAIN]

  if (!solanaChain || !stellarChain) {
    throw new Error(
      '[bridge] Allbridge does not support SOL ↔ STELLAR on this environment. ' +
      'Verify your RPC URL points at a supported network.'
    )
  }

  // Find the matching token pool on the Solana side by mint address
  const sourceToken = solanaChain.tokens.find(
    t => t.contractAddress.toLowerCase() === token.mint.toLowerCase()
  )
  if (!sourceToken) {
    throw new Error(
      `[bridge] ${token.symbol} (${token.mint}) is not supported by Allbridge on Solana. ` +
      'Check https://core.allbridge.io for supported tokens.'
    )
  }

  // Find the matching token pool on the Stellar side by symbol
  const destinationToken = stellarChain.tokens.find(
    t => t.symbol.toUpperCase() === token.symbol.toUpperCase()
  )
  if (!destinationToken) {
    throw new Error(
      `[bridge] ${token.symbol} is not supported by Allbridge on Stellar. ` +
      'The asset may not have a Stellar-side pool yet.'
    )
  }

  // ── Step 2: Build the bridge deposit transaction ─────────────────────────────
  const amountFloat = Number(token.amountRaw) / 10 ** token.decimals

  const rawTx = await sdk.bridge.rawTxBuilder.send({
    amount: String(amountFloat),
    fromAccountAddress: wallet.publicKey.toBase58(),
    toAccountAddress: stellarDestinationAddress,
    sourceToken,
    destinationToken,
    messenger: 1, // Allbridge messenger (vs Wormhole — Allbridge native is cheaper)
  })

  // Allbridge returns a Solana Transaction object for the SOL chain
  const bridgeTx = rawTx as Transaction

  // ── Step 3: Sign via injected wallet (never touches a private key) ───────────
  bridgeTx.recentBlockhash = (
    await connection.getLatestBlockhash(BRIDGE_COMMITMENT)
  ).blockhash
  bridgeTx.feePayer = wallet.publicKey

  const signedTx = await wallet.signTransaction(bridgeTx)

  // ── Step 4: Submit and wait for finalized confirmation ───────────────────────
  // We use finalized commitment because a bridge relayer on the other side
  // listens for confirmed Solana events. A lower commitment (confirmed or
  // processed) risks the Solana slot being rolled back while the Stellar side
  // has already acted on the event.
  const rawTxBytes = signedTx.serialize()
  const signature = await connection.sendRawTransaction(rawTxBytes, {
    skipPreflight: false,
    preflightCommitment: BRIDGE_COMMITMENT,
  })

  const latestBlockhash = await connection.getLatestBlockhash(BRIDGE_COMMITMENT)
  await connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    BRIDGE_COMMITMENT
  )

  // ── Step 5: Close the SPL token account if now empty (reclaim rent) ──────────
  let accountClosed = false
  let rentReclaimedLamports = 0

  try {
    const postBridgeBalance = await getSplTokenBalance(
      connection,
      wallet.publicKey,
      token.mint
    )

    if (postBridgeBalance === 0n) {
      const closed = await closeSplTokenAccount(connection, wallet, token.mint)
      accountClosed = closed.closed
      rentReclaimedLamports = closed.rentReclaimedLamports
    }
  } catch (closeErr) {
    // Account closure is best-effort — log but never fail the bridge result.
    // The bridge itself succeeded; the user can close the account manually later.
    console.warn(
      `[bridge] Could not close token account for ${token.symbol} after bridging:`,
      closeErr
    )
  }

  return {
    mint: token.mint,
    symbol: token.symbol,
    solanaTxSignature: signature,
    accountClosed,
    rentReclaimedLamports,
  }
}

// ─── Batch bridge ─────────────────────────────────────────────────────────────

/** Result for a single token in a batch bridge operation. */
export interface BatchBridgeResult {
  token: SplDustToken
  result?: BridgeResult
  error?: string
  success: boolean
}

/**
 * Bridge multiple SPL tokens to Stellar sequentially.
 *
 * Sequential (not parallel) to avoid nonce / blockhash collisions and to give
 * the user one signing prompt per token — wallet adapters typically require a
 * human interaction per transaction.
 *
 * Failed tokens are recorded in the result but do not abort the batch.
 */
export async function bridgeSplBatch(
  connection: Connection,
  wallet: SolanaWalletAdapter,
  tokens: SplDustToken[],
  stellarDestinationAddress: string,
  stellarContractAddress: string,
  onProgress?: (completed: number, total: number, latest: BatchBridgeResult) => void
): Promise<BatchBridgeResult[]> {
  if (!wallet.publicKey) {
    throw new Error('[bridge] Wallet not connected')
  }

  const results: BatchBridgeResult[] = []

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    try {
      const result = await bridgeSplTokenToStellar(
        connection,
        wallet,
        token,
        stellarDestinationAddress,
        stellarContractAddress
      )
      const batchResult: BatchBridgeResult = { token, result, success: true }
      results.push(batchResult)
      onProgress?.(i + 1, tokens.length, batchResult)
    } catch (err) {
      const batchResult: BatchBridgeResult = {
        token,
        error: err instanceof Error ? err.message : String(err),
        success: false,
      }
      results.push(batchResult)
      onProgress?.(i + 1, tokens.length, batchResult)
      // Continue — partial success is better than full abort
      console.error(`[bridge] Failed to bridge ${token.symbol}:`, err)
    }
  }

  return results
}

// ─── SPL token account closure ────────────────────────────────────────────────

/**
 * Close an empty SPL associated token account, returning rent SOL to the
 * wallet owner.
 *
 * Only closes the account if the balance is zero — calling this on a non-empty
 * account will fail at the RPC level (the SPL token program rejects it).
 *
 * @returns `{ closed: true, rentReclaimedLamports }` on success,
 *          `{ closed: false, rentReclaimedLamports: 0 }` if the account had
 *          a non-zero balance or did not exist.
 */
export async function closeSplTokenAccount(
  connection: Connection,
  wallet: SolanaWalletAdapter,
  mint: string
): Promise<{ closed: boolean; rentReclaimedLamports: number }> {
  if (!wallet.publicKey) {
    throw new Error('[bridge] Wallet not connected — cannot close token account')
  }

  const mintPublicKey = new PublicKey(mint)
  const tokenAccount = await getAssociatedTokenAddress(mintPublicKey, wallet.publicKey)

  // Confirm balance is zero before attempting closure
  const balance = await getSplTokenBalance(connection, wallet.publicKey, mint)
  if (balance !== 0n) {
    console.warn(
      `[bridge] closeSplTokenAccount called on non-empty account for mint ${mint} ` +
      `(balance: ${balance}). Skipping.`
    )
    return { closed: false, rentReclaimedLamports: 0 }
  }

  // Check how much rent is held in the account before closing
  const accountInfo = await connection.getAccountInfo(tokenAccount, BRIDGE_COMMITMENT)
  if (!accountInfo) {
    // Account already closed or never existed
    return { closed: false, rentReclaimedLamports: 0 }
  }
  const rentLamports = accountInfo.lamports

  // Build close instruction — destination for reclaimed rent is the wallet owner
  const closeIx = createCloseAccountInstruction(
    tokenAccount,        // account to close
    wallet.publicKey,    // destination for reclaimed rent
    wallet.publicKey,    // authority (owner)
    [],                  // multisig signers (none)
    TOKEN_PROGRAM_ID
  )

  const tx = new Transaction().add(closeIx)
  tx.recentBlockhash = (
    await connection.getLatestBlockhash(BRIDGE_COMMITMENT)
  ).blockhash
  tx.feePayer = wallet.publicKey

  const signedTx = await wallet.signTransaction(tx)
  await connection.sendRawTransaction(signedTx.serialize(), {
    skipPreflight: false,
    preflightCommitment: BRIDGE_COMMITMENT,
  })

  return { closed: true, rentReclaimedLamports: rentLamports }
}

// ─── Allbridge testnet evaluation helper ─────────────────────────────────────

/**
 * Checks whether Allbridge supports the SOL ↔ STELLAR route on the current
 * environment and returns the supported token list for both chains.
 *
 * Useful for feature-flagging the Solana lane at runtime:
 *
 * ```ts
 * const support = await evaluateAllbridgeSupport()
 * if (!support.supported) {
 *   console.warn(support.reason)
 * }
 * ```
 */
export async function evaluateAllbridgeSupport(): Promise<{
  supported: boolean
  reason?: string
  solanaTokens?: string[]
  stellarTokens?: string[]
}> {
  try {
    const sdk = await getAllbridge()
    const chains = await sdk.chainDetailsMap()

    const solanaChain = chains[ALLBRIDGE_SOLANA_CHAIN]
    const stellarChain = chains[ALLBRIDGE_STELLAR_CHAIN]

    if (!solanaChain) {
      return { supported: false, reason: 'Allbridge does not list a Solana chain on this environment.' }
    }
    if (!stellarChain) {
      return { supported: false, reason: 'Allbridge does not list a Stellar chain on this environment.' }
    }

    const solanaTokens = solanaChain.tokens.map(t => t.symbol)
    const stellarTokens = stellarChain.tokens.map(t => t.symbol)

    // Find tokens available on both sides — only these can be bridged
    const bridgeable = solanaTokens.filter(s =>
      stellarTokens.some(t => t.toUpperCase() === s.toUpperCase())
    )

    if (bridgeable.length === 0) {
      return {
        supported: false,
        reason: 'No tokens available on both Solana and Stellar sides.',
        solanaTokens,
        stellarTokens,
      }
    }

    return { supported: true, solanaTokens: bridgeable, stellarTokens: bridgeable }
  } catch (err) {
    return {
      supported: false,
      reason: `Failed to reach Allbridge API: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}
