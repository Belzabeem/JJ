// ─── stellar/swap.ts ───────────────────────────────────────────────────────────
// Handles the full Stellar DEX swap flow using PathPaymentStrictReceiveBuilder
// and Horizon API path discovery

import {
  Asset,
  Keypair,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
} from 'stellar-sdk';
import Server from 'stellar-sdk';

// ─── Configuration ───────────────────────────────────────────────────────────

export const HORIZON_TESTNET_URL = 'https://horizon-testnet.stellar.org';
export const STELLAR_EXPERT_TESTNET_URL = 'https://stellar.expert/explorer/testnet/tx';

export const STELLAR_NETWORK_PASSAGE = 'Test SDF Network ; September 2015';
export const STELLAR_NETWORK_TESTNET = Networks.TESTNET;

// Default slippage tolerance (1%)
const DEFAULT_SLIPPAGE = 0.01;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SwapConfig {
  /** Source asset to swap from (e.g., native XLM) */
  sourceAsset: Asset;
  /** Amount of source asset to send */
  sourceAmount: string;
  /** Destination asset to receive */
  destAsset: Asset;
  /** Destination wallet address */
  destinationAddress: string;
  /** Optional wallet keypair for direct signing (legacy) */
  walletKeypair?: Keypair;
  /** Optional signed XDR for wallet-signed transactions */
  signedXdr?: string;
  /** Slippage tolerance (default 1%) */
  slippage?: number;
}

export interface PathPaymentResult {
  success: boolean;
  txHash?: string;
  amountReceived?: string;
  sourceAmountSent?: string;
  path?: Asset[];
  error?: string;
  explorerUrl?: string;
}

export interface ExchangeRate {
  sourceAmount: string;
  destAmount: string;
  path: Asset[];
  sourceAsset: Asset;
  destAsset: Asset;
}

export interface TokenBalance {
  asset: Asset;
  balance: string;
  isNative: boolean;
}

// ─── Helper Functions ───────────────────────────────────────────────────────

/**
 * Creates a Stellar Asset from code and issuer
 */
export function createAsset(code: string, issuer?: string): Asset {
  if (code === 'XLM' || !issuer) {
    return new Asset('XLM');
  }
  return new Asset(code, issuer);
}

/**
 * Creates a native XLM asset
 */
export function createNativeAsset(): Asset {
  return new Asset('XLM');
}

/**
 * Formats an asset for display
 */
export function formatAsset(asset: Asset): string {
  if (asset.isNative()) {
    return 'XLM';
  }
  return `${asset.getCode()}`;
}

// ─── API Functions ──────────────────────────────────────────────────────────

/**
 * Fetches available paths for a swap using Horizon's /paths/strict-receive endpoint
 */
export async function fetchExchangeRate(
  sourceAsset: Asset,
  sourceAmount: string,
  destAsset: Asset,
  destinationAddress: string
): Promise<ExchangeRate | null> {
  try {
    const server = new Server(HORIZON_TESTNET_URL);
    
    const sourceAssetString = sourceAsset.isNative() 
      ? 'native' 
      : `${sourceAsset.getCode()}:${sourceAsset.getIssuer()}`;
    const destAssetString = destAsset.isNative() 
      ? 'native' 
      : `${destAsset.getCode()}:${destAsset.getIssuer()}`;

    const url = new URL(`${HORIZON_TESTNET_URL}/paths/strict-receive`);
    url.searchParams.set('source_asset_type', sourceAsset.isNative() ? 'native' : 'credit_alphanum4');
    url.searchParams.set('source_asset_code', sourceAsset.isNative() ? '' : sourceAsset.getCode());
    url.searchParams.set('source_asset_issuer', sourceAsset.isNative() ? '' : sourceAsset.getIssuer());
    url.searchParams.set('source_amount', sourceAmount);
    url.searchParams.set('destination_asset_type', destAsset.isNative() ? 'native' : 'credit_alphanum4');
    url.searchParams.set('destination_asset_code', destAsset.isNative() ? '' : destAsset.getCode());
    url.searchParams.set('destination_asset_issuer', destAsset.isNative() ? '' : destAsset.getIssuer());
    url.searchParams.set('destination_account', destinationAddress);

    const response = await fetch(url.toString());
    
    if (!response.ok) {
      console.error('Failed to fetch paths:', await response.text());
      return null;
    }

    const data = await response.json();
    
    if (!data.records || data.records.length === 0) {
      console.error('No paths found');
      return null;
    }

    // Get the best path (first record has the best rate)
    const bestPath = data.records[0];
    
    // Parse the path assets
    const xlmAsset = new Asset('XLM');
    const pathAssets: Asset[] = [];
    if (bestPath.source_asset_type === 'native') {
      pathAssets.push(xlmAsset);
    } else {
      pathAssets.push(new Asset(bestPath.source_asset_code, bestPath.source_asset_issuer));
    }
    
    for (const pathAsset of bestPath.path || []) {
      if (pathAsset.asset_type === 'native') {
        pathAssets.push(xlmAsset);
      } else {
        pathAssets.push(new Asset(pathAsset.asset_code, pathAsset.asset_issuer));
      }
    }

    return {
      sourceAmount: bestPath.source_amount,
      destAmount: bestPath.destination_amount,
      path: pathAssets,
      sourceAsset,
      destAsset,
    };
  } catch (error) {
    console.error('Error fetching exchange rate:', error);
    return null;
  }
}

/**
 * Gets token balances for a wallet address from the Soroban contract
 * This uses the contract's get_balance() function post-aggregation
 */
export async function getContractBalance(
  contractAddress: string,
  walletAddress: string
): Promise<TokenBalance[]> {
  // In a real implementation, this would call the Soroban contract's get_balance()
  // For now, we'll fetch from Horizon and filter for tokens held
  try {
    const server = new Server(HORIZON_TESTNET_URL);
    const account = await server.loadAccount(walletAddress);
    
    const balances: TokenBalance[] = [];
    
    const xlmAsset = new Asset('XLM');
    for (const balance of account.balances) {
      if (balance.asset_type === 'native') {
        balances.push({
          asset: xlmAsset,
          balance: balance.balance,
          isNative: true,
        });
      } else if (balance.asset_code && balance.asset_issuer) {
        const asset = new Asset(balance.asset_code, balance.asset_issuer);
        // Only include if balance is positive
        if (parseFloat(balance.balance) > 0) {
          balances.push({
            asset,
            balance: balance.balance,
            isNative: false,
          });
        }
      }
    }
    
    return balances;
  } catch (error) {
    console.error('Error fetching balances:', error);
    return [];
  }
}

/**
 * Gets all available balances for a wallet (from Horizon)
 */
export async function getWalletBalances(address: string): Promise<TokenBalance[]> {
  try {
    const server = new Server(HORIZON_TESTNET_URL);
    const account = await server.loadAccount(address);
    
    const balances: TokenBalance[] = [];
    
    const xlmAsset = new Asset('XLM');
    for (const balance of account.balances) {
      if (balance.asset_type === 'native') {
        balances.push({
          asset: xlmAsset,
          balance: balance.balance || '0',
          isNative: true,
        });
      } else if (balance.asset_code && balance.asset_issuer) {
        const asset = new Asset(balance.asset_code, balance.asset_issuer);
        const balanceValue = parseFloat(balance.balance || '0');
        if (balanceValue > 0) {
          balances.push({
            asset,
            balance: balance.balance || '0',
            isNative: false,
          });
        }
      }
    }
    
    return balances;
  } catch (error) {
    console.error('Error fetching wallet balances:', error);
    return [];
  }
}

// ─── Swap Execution ─────────────────────────────────────────────────────────

/**
 * Executes a swap using PathPaymentStrictReceive
 */
export async function executeSwap(config: SwapConfig): Promise<PathPaymentResult> {
  const {
    sourceAsset,
    sourceAmount,
    destAsset,
    destinationAddress,
    walletKeypair,
    slippage = DEFAULT_SLIPPAGE,
  } = config;

  try {
    const server = new Server(HORIZON_TESTNET_URL);
    
    // First, fetch the path to get the actual destination amount
    const exchangeRate = await fetchExchangeRate(
      sourceAsset,
      sourceAmount,
      destAsset,
      destinationAddress
    );

    if (!exchangeRate) {
      return {
        success: false,
        error: 'No path found for this swap. Try a different amount or asset pair.',
      };
    }

    // Calculate minimum destination amount with slippage tolerance
    const destAmountNum = parseFloat(exchangeRate.destAmount);
    const minDestAmount = (destAmountNum * (1 - slippage)).toFixed(7);
    
    // Get the source account - use destination address as source for path payment
    const sourceAccount = await server.loadAccount(destinationAddress);
    
    // Build the transaction
    const fee = await server.fetchBaseFee();
    
    const transaction = new TransactionBuilder(sourceAccount, {
      fee: fee.toString(),
      networkPassphrase: STELLAR_NETWORK_PASSAGE,
    })
      .addOperation(
        Operation.pathPaymentStrictReceive({
          sendAsset: sourceAsset,
          sendMax: sourceAmount,
          destination: destinationAddress,
          destAsset: destAsset,
          destAmount: minDestAmount,
          path: exchangeRate.path.slice(1), // Exclude source asset
        })
      )
      .setTimeout(30) // 30 second timeout
      .build();

    // Sign the transaction (if keypair provided)
    if (walletKeypair) {
      transaction.sign(walletKeypair);
    }

    // Submit to the network
    const response = await server.submitTransaction(transaction);
    
    // Parse the response to get amount received
    let amountReceived = minDestAmount;
    if (response.successful) {
      // The actual amount received might differ due to path finding
      // For PathPaymentStrictReceive, we get at least minDestAmount
      amountReceived = minDestAmount;
    }

    return {
      success: true,
      txHash: response.hash,
      amountReceived,
      sourceAmountSent: sourceAmount,
      path: exchangeRate.path,
      explorerUrl: `${STELLAR_EXPERT_TESTNET_URL}/${response.hash}`,
    };
  } catch (error) {
    // Handle common Stellar error codes
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    let userFriendlyError = 'Swap failed. Please try again.';
    
    if (errorMessage.includes('op_under_dest_min')) {
      userFriendlyError = 'Swap failed: The exchange rate changed. Please try again with a higher minimum amount.';
    } else if (errorMessage.includes('op_no_destination')) {
      userFriendlyError = 'Swap failed: Destination account does not exist.';
    } else if (errorMessage.includes('op_no_trust')) {
      userFriendlyError = 'Swap failed: Destination account does not trust the source asset.';
    } else if (errorMessage.includes('op_underfunded')) {
      userFriendlyError = 'Swap failed: Insufficient funds for swap.';
    } else if (errorMessage.includes('tx_too_late')) {
      userFriendlyError = 'Swap failed: Transaction timed out. Please try again.';
    }
    
    console.error('Swap error:', error);
    
    return {
      success: false,
      error: userFriendlyError,
    };
  }
}

/**
 * Builds a swap transaction without submitting (for signing)
 */
export async function buildSwapTransaction(
  config: SwapConfig
): Promise<{ transaction: any; minDestAmount: string } | null> {
  const {
    sourceAsset,
    sourceAmount,
    destAsset,
    destinationAddress,
    slippage = DEFAULT_SLIPPAGE,
  } = config;

  try {
    const server = new Server(HORIZON_TESTNET_URL);
    
    // Fetch the path
    const exchangeRate = await fetchExchangeRate(
      sourceAsset,
      sourceAmount,
      destAsset,
      destinationAddress
    );

    if (!exchangeRate) {
      return null;
    }

    // Calculate minimum destination amount with slippage
    const destAmountNum = parseFloat(exchangeRate.destAmount);
    const minDestAmount = (destAmountNum * (1 - slippage)).toFixed(7);
    
    // Get source account - use destination address as source
    const sourceAccount = await server.loadAccount(destinationAddress);
    
    // Build transaction
    const fee = await server.fetchBaseFee();
    
    const transaction = new TransactionBuilder(sourceAccount, {
      fee: fee.toString(),
      networkPassphrase: STELLAR_NETWORK_PASSAGE,
    })
      .addOperation(
        Operation.pathPaymentStrictReceive({
          sendAsset: sourceAsset,
          sendMax: sourceAmount,
          destination: destinationAddress,
          destAsset: destAsset,
          destAmount: minDestAmount,
          path: exchangeRate.path.slice(1),
        })
      )
      .setTimeout(30)
      .build();

    return {
      transaction,
      minDestAmount,
    };
  } catch (error) {
    console.error('Error building transaction:', error);
    return null;
  }
}

// ─── External Signing Support ──────────────────────────────────────────────

/**
 * Builds an unsigned transaction and returns the XDR for wallet signing
 */
export async function buildSwapTransactionForSigning(
  sourceAsset: Asset,
  sourceAmount: string,
  destAsset: Asset,
  destinationAddress: string,
  slippage: number = DEFAULT_SLIPPAGE
): Promise<{ xdr: string; minDestAmount: string } | null> {
  try {
    const server = new Server(HORIZON_TESTNET_URL);
    
    // Fetch the path
    const exchangeRate = await fetchExchangeRate(
      sourceAsset,
      sourceAmount,
      destAsset,
      destinationAddress
    );

    if (!exchangeRate) {
      return null;
    }

    // Calculate minimum destination amount with slippage
    const destAmountNum = parseFloat(exchangeRate.destAmount);
    const minDestAmount = (destAmountNum * (1 - slippage)).toFixed(7);
    
    // Get source account
    const sourceAccount = await server.loadAccount(destinationAddress);
    
    // Build transaction
    const fee = await server.fetchBaseFee();
    
    const transaction = new TransactionBuilder(sourceAccount, {
      fee: fee.toString(),
      networkPassphrase: STELLAR_NETWORK_PASSAGE,
    })
      .addOperation(
        Operation.pathPaymentStrictReceive({
          sendAsset: sourceAsset,
          sendMax: sourceAmount,
          destination: destinationAddress,
          destAsset: destAsset,
          destAmount: minDestAmount,
          path: exchangeRate.path.slice(1),
        })
      )
      .setTimeout(30)
      .build();

    return {
      xdr: transaction.toXDR(),
      minDestAmount,
    };
  } catch (error) {
    console.error('Error building transaction for signing:', error);
    return null;
  }
}

/**
 * Submits a signed transaction to the network
 */
export async function submitSignedTransaction(
  signedXdr: string
): Promise<PathPaymentResult> {
  try {
    const server = new Server(HORIZON_TESTNET_URL);
    
    // Parse and submit the signed transaction
    const transaction = TransactionBuilder.fromXDR(
      signedXdr,
      STELLAR_NETWORK_PASSAGE
    );
    
    const response = await server.submitTransaction(transaction);
    
    return {
      success: true,
      txHash: response.hash,
      amountReceived: '', // Will be determined from response
      explorerUrl: `${STELLAR_EXPERT_TESTNET_URL}/${response.hash}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    let userFriendlyError = 'Swap failed. Please try again.';
    
    if (errorMessage.includes('op_under_dest_min')) {
      userFriendlyError = 'Swap failed: The exchange rate changed. Please try again with a higher minimum amount.';
    } else if (errorMessage.includes('op_no_destination')) {
      userFriendlyError = 'Swap failed: Destination account does not exist.';
    } else if (errorMessage.includes('op_no_trust')) {
      userFriendlyError = 'Swap failed: Destination account does not trust the source asset.';
    } else if (errorMessage.includes('op_underfunded')) {
      userFriendlyError = 'Swap failed: Insufficient funds for swap.';
    } else if (errorMessage.includes('tx_too_late')) {
      userFriendlyError = 'Swap failed: Transaction timed out. Please try again.';
    }
    
    console.error('Submit transaction error:', error);
    
    return {
      success: false,
      error: userFriendlyError,
    };
  }
}

// ─── Utility Functions ─────────────────────────────────────────────────────

/**
 * Formats a Stellar address for display (truncates)
 */
export function formatAddress(address: string): string {
  if (!address) return '';
  if (address.length <= 12) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

/**
 * Formats a token amount for display
 */
export function formatAmount(amount: string, decimals: number = 7): string {
  const num = parseFloat(amount);
  if (isNaN(num)) return '0';
  return num.toFixed(decimals);
}

/**
 * Validates a Stellar address
 */
export function isValidStellarAddress(address: string): boolean {
  if (!address) return false;
  // Stellar addresses are 56 characters base32
  const stellarAddressRegex = /^[G-Z][A-Z0-9]{55}$/;
  return stellarAddressRegex.test(address);
}
