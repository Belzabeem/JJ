'use client'

import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from './ui/button'
import { BorderBeam } from './magicui/border-beam'
import { Input } from './ui/input'
import { Asset } from 'stellar-sdk';
import {
  fetchExchangeRate,
  getWalletBalances,
  buildSwapTransactionForSigning,
  submitSignedTransaction,
  formatAmount,
  formatAddress,
  STELLAR_EXPERT_TESTNET_URL,
  TokenBalance,
  ExchangeRate,
  PathPaymentResult,
} from '@/lib/stellar/swap';
import {
  StellarWalletsKit,
  WalletNetwork,
  XBULL_ID,
} from '@creit.tech/stellar-wallets-kit';
import {
  xBullModule,
  FreighterModule,
  AlbedoModule
} from '@creit.tech/stellar-wallets-kit';

// ─── Types ─────────────────────────────────────────────────────────────────

interface SwapState {
  isLoading: boolean;
  error: string | null;
  success: boolean;
  txHash: string | null;
  amountReceived: string | null;
  explorerUrl: string | null;
}

// ─── Component ────────────────────────────────────────────────────────────

const SelectToken = ({ 
  value, 
  onChange, 
  balances 
}: { 
  value: string; 
  onChange: (value: string) => void;
  balances: TokenBalance[];
}) => {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full !bg-accent !text-foreground">
        <SelectValue placeholder="Select Token" />
      </SelectTrigger>
      <SelectContent>
        {balances.length === 0 ? (
          <SelectItem value="xlm" disabled>No tokens available</SelectItem>
        ) : (
          balances.map((bal) => (
            <SelectItem 
              key={bal.isNative ? 'xlm' : `${bal.asset.getCode()}:${bal.asset.getIssuer()}`} 
              value={bal.isNative ? 'xlm' : `${bal.asset.getCode()}:${bal.asset.getIssuer()}`}
            >
              {bal.isNative ? 'XLM' : bal.asset.getCode()} ({formatAmount(bal.balance, 2)})
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}

const WalletBalance = ({ 
  exchangeRate, 
  isLoading 
}: { 
  exchangeRate: ExchangeRate | null; 
  isLoading: boolean;
}) => {
  return (
    <Card className="p-2 mt-4 bg-accent">
      <CardHeader>
        <CardDescription className="text-foreground">
          You'll receive approximately
        </CardDescription>
        <CardAction>
          {isLoading ? (
            <span className="text-muted-foreground">Loading...</span>
          ) : exchangeRate ? (
            formatAmount(exchangeRate.destAmount, 2)
          ) : (
            '~0.00'
          )}
        </CardAction>
        <CardDescription className="text-foreground">
          Exchange rate
        </CardDescription>
        <CardAction className="mt-6">
          {exchangeRate ? (
            `1 ${exchangeRate.sourceAsset.isNative() ? 'XLM' : exchangeRate.sourceAsset.getCode()} = ${formatAmount(exchangeRate.destAmount, 4)} ${exchangeRate.destAsset.isNative() ? 'XLM' : exchangeRate.destAsset.getCode()}`
          ) : (
            'Loading...'
          )}
        </CardAction>
      </CardHeader>
    </Card>
  );
}

const SwapResult = ({ 
  result, 
  onClose 
}: { 
  result: PathPaymentResult; 
  onClose: () => void;
}) => {
  if (!result.success) {
    return (
      <Card className="p-4 mt-4 bg-red-900/20 border-red-500">
        <CardHeader>
          <CardTitle className="text-red-400">Swap Failed</CardTitle>
          <CardDescription className="text-red-300">{result.error}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button onClick={onClose} variant="outline" className="w-full">
            Try Again
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="p-4 mt-4 bg-green-900/20 border-green-500">
      <CardHeader>
        <CardTitle className="text-green-400">Swap Successful!</CardTitle>
        <CardDescription className="text-green-300">
          Received {result.amountReceived} XLM
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-sm text-muted-foreground">
          <span className="text-foreground">Transaction Hash: </span>
          <span className="font-mono">{result.txHash?.slice(0, 8)}...{result.txHash?.slice(-8)}</span>
        </div>
        {result.explorerUrl && (
          <a 
            href={result.explorerUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-sm text-blue-400 hover:underline"
          >
            View on Stellar Expert →
          </a>
        )}
      </CardContent>
      <CardFooter>
        <Button onClick={onClose} variant="outline" className="w-full">
          Swap Again
        </Button>
      </CardFooter>
    </Card>
  );
}

export default function SwapOnStellarCardSection() {
  // Wallet address from localStorage (set by RootWallet)
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [isWalletConnected, setIsWalletConnected] = useState(false);
  
  // Token balances
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [selectedToken, setSelectedToken] = useState<string>('xlm');
  const [sourceAmount, setSourceAmount] = useState<string>('1');
  
  // Exchange rate
  const [exchangeRate, setExchangeRate] = useState<ExchangeRate | null>(null);
  const [isLoadingRate, setIsLoadingRate] = useState(false);
  
  // Swap state
  const [swapState, setSwapState] = useState<SwapState>({
    isLoading: false,
    error: null,
    success: false,
    txHash: null,
    amountReceived: null,
    explorerUrl: null,
  });

  // Load wallet address from localStorage on mount
  useEffect(() => {
    const loadWallet = async () => {
      // Try to get wallet address from localStorage
      const storedAddress = localStorage.getItem('walletAddress');
      
      if (storedAddress) {
        setWalletAddress(storedAddress);
        setIsWalletConnected(true);
        
        // Load balances for the connected wallet
        const walletBalances = await getWalletBalances(storedAddress);
        setBalances(walletBalances);
      } else {
        setIsWalletConnected(false);
      }
    };
    
    loadWallet();
    
    // Also set up a listener for storage changes (in case wallet is connected in another tab)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'walletAddress') {
        if (e.newValue) {
          setWalletAddress(e.newValue);
          setIsWalletConnected(true);
          getWalletBalances(e.newValue).then(setBalances);
        } else {
          setWalletAddress('');
          setIsWalletConnected(false);
          setBalances([]);
        }
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Fetch exchange rate when token or amount changes
  useEffect(() => {
    const fetchRate = async () => {
      if (!walletAddress || !sourceAmount || parseFloat(sourceAmount) <= 0) {
        setExchangeRate(null);
        return;
      }

      setIsLoadingRate(true);
      
      try {
        // Parse selected token
        let sourceAsset: Asset;
        if (selectedToken === 'xlm') {
          sourceAsset = new Asset('XLM');
        } else {
          const [code, issuer] = selectedToken.split(':');
          sourceAsset = new Asset(code, issuer);
        }

        // Destination is always XLM for this demo
        const destAsset = new Asset('XLM');

        const rate = await fetchExchangeRate(
          sourceAsset,
          sourceAmount,
          destAsset,
          walletAddress
        );
        
        setExchangeRate(rate);
      } catch (error) {
        console.error('Error fetching rate:', error);
        setExchangeRate(null);
      } finally {
        setIsLoadingRate(false);
      }
    };

    // Debounce the rate fetch
    const timer = setTimeout(fetchRate, 500);
    return () => clearTimeout(timer);
  }, [selectedToken, sourceAmount, walletAddress]);

  // Handle swap
  const handleSwap = useCallback(async () => {
    if (!isWalletConnected || !walletAddress) {
      setSwapState(prev => ({ ...prev, error: 'Please connect your Stellar wallet first' }));
      return;
    }

    if (!exchangeRate || !sourceAmount) {
      setSwapState(prev => ({ ...prev, error: 'Missing required information' }));
      return;
    }

    setSwapState({
      isLoading: true,
      error: null,
      success: false,
      txHash: null,
      amountReceived: null,
      explorerUrl: null,
    });

    try {
      // Build the transaction for signing
      const txData = await buildSwapTransactionForSigning(
        exchangeRate.sourceAsset,
        sourceAmount,
        exchangeRate.destAsset,
        walletAddress
      );

      if (!txData) {
        setSwapState({
          isLoading: false,
          error: 'Failed to build swap transaction. Please try again.',
          success: false,
          txHash: null,
          amountReceived: null,
          explorerUrl: null,
        });
        return;
      }

      // Initialize wallet kit for signing
      const walletKit = new StellarWalletsKit({
        network: WalletNetwork.TESTNET,
        selectedWalletId: XBULL_ID,
        modules: [
          new xBullModule(),
          new FreighterModule(),
          new AlbedoModule(),
        ],
      });

      // Sign the transaction using the connected wallet
      const { signedTxXdr } = await walletKit.signTransaction(txData.xdr, {
        address: walletAddress,
        networkPassphrase: 'Test SDF Network ; September 2015',
      });

      // Submit the signed transaction
      const result = await submitSignedTransaction(signedTxXdr);

      setSwapState({
        isLoading: false,
        error: result.error || null,
        success: result.success,
        txHash: result.txHash || null,
        amountReceived: result.amountReceived || txData.minDestAmount,
        explorerUrl: result.explorerUrl || null,
      });
    } catch (error) {
      setSwapState({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Swap failed',
        success: false,
        txHash: null,
        amountReceived: null,
        explorerUrl: null,
      });
    }
  }, [walletAddress, exchangeRate, sourceAmount]);

  // Reset swap state
  const handleClose = useCallback(() => {
    setSwapState({
      isLoading: false,
      error: null,
      success: false,
      txHash: null,
      amountReceived: null,
      explorerUrl: null,
    });
  }, []);

  // Show result if swap was attempted
  if (swapState.success || swapState.error) {
    return (
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Swap Result</CardTitle>
        </CardHeader>
        <CardContent>
          <SwapResult 
            result={{
              success: swapState.success,
              error: swapState.error || undefined,
              txHash: swapState.txHash || undefined,
              amountReceived: swapState.amountReceived || undefined,
              explorerUrl: swapState.explorerUrl || undefined,
            }} 
            onClose={handleClose}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardDescription>Available Balance</CardDescription>
        <CardTitle className="font-bold text-2xl">
          {balances.length > 0 
            ? formatAmount(balances.find(b => b.isNative)?.balance || '0', 2)
            : '$ 0.00'
          } XLM
        </CardTitle>
        <hr color="white" className="mt-2 w-full" />
      </CardHeader>
      <CardContent>
        <h1 className="font-bold text-lg mb-2">Swap From</h1>
        
        {/* Token selector */}
        <SelectToken 
          value={selectedToken} 
          onChange={setSelectedToken}
          balances={balances}
        />
        
        {/* Amount input */}
        <div className="mt-4">
          <label className="text-sm text-muted-foreground mb-1 block">
            Amount to swap
          </label>
          <Input
            type="number"
            value={sourceAmount}
            onChange={(e) => setSourceAmount(e.target.value)}
            placeholder="Enter amount"
            min="0"
            step="0.01"
            className="!bg-accent !text-foreground"
          />
        </div>
        
        <WalletBalance exchangeRate={exchangeRate} isLoading={isLoadingRate} />
      </CardContent>
      <CardFooter>
        <Button
          className="relative overflow-hidden w-full !bg-accent"
          size="lg"
          variant="outline"
          onClick={handleSwap}
          disabled={swapState.isLoading || isLoadingRate || !exchangeRate || !isWalletConnected}
        >
          {swapState.isLoading ? 'Swapping...' : !isWalletConnected ? 'Connect Wallet to Swap' : 'Swap Now'}
          <BorderBeam
            size={40}
            initialOffset={20}
            className="from-transparent via-yellow-500 to-transparent"
            transition={{
              type: 'tween',
              stiffness: 60,
              damping: 20,
            }}
          />
        </Button>
      </CardFooter>
    </Card>
  )
}