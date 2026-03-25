// ─── stellar/contract.ts ──────────────────────────────────────────────────────
// Typed factory helpers for Stellar / Soroban contracts.
// Import from here rather than constructing objects inline in components.

import { WalletNetwork } from '@creit.tech/stellar-wallets-kit'
import {
  SorobanRpc,
  TransactionBuilder,
  Asset,
  Account,
  Operation,
  ScVal,
  xdr,
  Memo,
} from '@stellar/stellar-sdk' // Assuming you have stellar-sdk installed

// Define your contract ID here. This should probably be an environment variable.
const CONTRACT_ID = 'YOUR_SOROBAN_CONTRACT_ADDRESS'; // <--- IMPORTANT: REPLACE WITH YOUR ACTUAL SOROBAN CONTRACT ID

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StellarContract {
  address: string
  network: WalletNetwork
}

export interface WithdrawParams {
  tokenAddress: string; // The address of the token to withdraw
  amount: bigint;       // The amount to withdraw (as bigint for Soroban)
  toAddress: string;    // The Stellar address to send the funds to
  // Add more parameters if your contract's withdraw function requires them (e.g., commitment)
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates a typed StellarContract descriptor.
 *
 * @param address  Soroban contract address (e.g. CAENNM2HH...)
 * @param network  The Stellar network to use (defaults to TESTNET)
 */
export function createStellarContract(
  address: string,
  network: WalletNetwork = WalletNetwork.TESTNET
): StellarContract {
  return { address, network }
}

/**
 * Prepares a Soroban transaction for withdrawal.
 *
 * @param walletPublicKey The public key of the user's connected wallet (signer).
 * @param params Withdrawal parameters (token, amount, destination).
 * @param stellarWalletKit The stellarWalletKit instance to get the RPC server from.
 * @returns A Stellar SDK Transaction object ready for signing.
 */
export async function prepareWithdrawTransaction(
  walletPublicKey: string,
  params: WithdrawParams,
  stellarWalletKit: any // Replace with actual type from stellarWalletKit if available
): Promise<xdr.Transaction> {
  const server = new SorobanRpc.Server(stellarWalletKit.getRpcServerUrl());
  const account = await server.getAccount(walletPublicKey); // User's account

  const contract = new SorobanRpc.Contract(CONTRACT_ID); // Initialize with your contract ID

  // Create the withdraw invocation
  const withdrawInvocation = contract.call(
    'withdraw', // Name of your withdraw function in the contract
    ...[
      new ScVal.Address(xdr.ScAddress.forContract(params.tokenAddress)), // token: Address
      new ScVal.I128(params.amount),                                     // amount: i128
      new ScVal.Address(xdr.ScAddress.forAccountId(params.toAddress)),  // to: Address (Stellar address)
      // Add other arguments as needed by your contract's withdraw function, e.g., salt
      // For instance, if your withdraw takes (token, amount, to, salt):
      // new ScVal.Bytes(Buffer.from('some_salt_value_as_bytes')), // salt: Bytes
    ]
  );

  const transaction = new TransactionBuilder(account, {
    fee: '1000000', // Example fee, adjust as needed
    networkPassphrase: stellarWalletKit.getNetworkPassphrase(),
  })
    .addOperation(Operation.invokeHostFunction({
      hostFunction: xdr.HostFunction.invokeContract({
        contractId: CONTRACT_ID,
        functionName: withdrawInvocation.functionName,
        args: withdrawInvocation.args,
      })
    }))
    // Ensure the fee is set correctly before building
    .setBaseFee('100') // Base fee per operation, adjust as needed for network load
    .addMemo(Memo.text('QuickEx Withdrawal')) // Optional memo
    .build();

  // Simulate to get cost and required signatures
  const simulation = await server.simulateTransaction(transaction);

  if (simulation.error) {
    throw new Error(`Transaction simulation failed: ${simulation.error}`);
  }

  // Set the transaction's new fee, and add minTime/maxTime if returned by simulation
  const txBuilder = new TransactionBuilder(account, {
    fee: simulation.minFee,
    networkPassphrase: stellarWalletKit.getNetworkPassphrase(),
    timebounds: {
      minTime: simulation.minTimeBounds?.minTime || '0',
      maxTime: simulation.minTimeBounds?.maxTime || '0',
    }
  })
  .addOperation(Operation.invokeHostFunction({
    hostFunction: xdr.HostFunction.invokeContract({
      contractId: CONTRACT_ID,
      functionName: withdrawInvocation.functionName,
      args: withdrawInvocation.args,
    })
  }))
  .addMemo(Memo.text('QuickEx Withdrawal'));

  return txBuilder.build();
}