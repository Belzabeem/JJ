'use client'

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { connect as connectStarknet } from 'starknetkit'
import { RpcProvider, uint256 } from 'starknet'
import {
  StellarWalletsKit,
  WalletNetwork,
  XBULL_ID,
} from '@creit.tech/stellar-wallets-kit'
import {
  WalletConnectAllowedMethods,
  WalletConnectModule,
} from '@creit.tech/stellar-wallets-kit/modules/walletconnect.module'
import {
  xBullModule,
  FreighterModule,
  AlbedoModule,
} from '@creit.tech/stellar-wallets-kit'

import { validateBatch, buildTransactionSummary } from '@/lib/validation'
import { createStellarContract, StellarContract } from '@/lib/stellar/contract'
import { createStarknetContract, StarknetContract } from '@/lib/starknet/contract'
import { useWallet } from '@/context/WalletContext'

import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Card,
  CardAction,
  CardDescription,
  CardContent,
  CardTitle,
  CardHeader,
  CardFooter
} from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Progress } from "@/components/ui/progress"
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BorderBeam } from '@/components/magicui/border-beam'
import { Loader2, CheckCircle, AlertCircle, Settings2, Info } from 'lucide-react'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_MIN_THRESHOLD = 0.01
const LOCALSTORAGE_THRESHOLD_KEY = 'dustAggregator_minThreshold'

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface TokenInfo {
  address: string
  decimals: number
  symbol: string
}

interface Balances {
  [symbol: string]: number
}

interface StellarBalance {
  asset_type: string
  asset_code?: string
  balance: string
}

interface DustBalance {
  id: string
  asset: string
  symbol: string
  amount: number
  usdValue: number
  network: 'starknet' | 'stellar'
}

interface BatchGroup {
  assets: DustBalance[]
  totalValue: number
  batchId: number
}

interface BatchResult {
  batchId: number
  success: boolean
  targetAsset?: string
  totalReceived?: number
  assetsProcessed: number
  originalValue: number
  error?: string
}

interface TransferResult {
  asset: string
  amount: number
  success: boolean
  txHash: string
}

interface ProcessingResults {
  batchResults: BatchResult[]
  transferResults: TransferResult[]
  totalBatches: number
  successfulBatches: number
}

interface WalletLike {
  selectedAddress?: string
  selectedAccount?: { address: string }
  account?: { address: string }
}

// ─── Token Definitions ────────────────────────────────────────────────────────

const TOKENS: Record<string, TokenInfo> = {
  ETH: {
    address: '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7',
    decimals: 18,
    symbol: 'ETH',
  },
  STRK: {
    address: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
    decimals: 18,
    symbol: 'STRK',
  },
  USDC: {
    address: '0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8',
    decimals: 6,
    symbol: 'USDC',
  },
  USDT: {
    address: '0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8',
    decimals: 6,
    symbol: 'USDT',
  },
  DAI: {
    address: '0x00da114221cb83fa859dbdb4c44beeaa0bb37c7537ad5ae66fe5e0efd20e6eb3',
    decimals: 18,
    symbol: 'DAI',
  },
  WBTC: {
    address: '0x012d537dc323c439dc65c976fad242d5610d27cfb5f31689a0a319b8be7f3d56',
    decimals: 8,
    symbol: 'WBTC',
  },
}

// ERC20_ABI is now in src/lib/starknet/contract.ts

const DUST_AGGREGATOR_CONTRACT = 'CAENNM2HHYAKX4V3LSQM4BEPHZ6DUSPSGPQOW6QXDY5FOHB2HMB6TMNX'

// ─── Processing Steps ─────────────────────────────────────────────────────────

const ProcessingStep = {
  IDLE: 0,
  COLLECTING_DUST: 1,
  OPTIMIZING_BATCH: 2,
  PROCESSING_BATCH: 3,
  TRANSFERRING: 4,
  COMPLETE: 5
} as const

type ProcessingStepType = typeof ProcessingStep[keyof typeof ProcessingStep]

const stepLabels: Record<ProcessingStepType, string> = {
  [ProcessingStep.IDLE]: 'Idle',
  [ProcessingStep.COLLECTING_DUST]: 'Collecting dust from connected wallets',
  [ProcessingStep.OPTIMIZING_BATCH]: 'Optimizing batch transactions',
  [ProcessingStep.PROCESSING_BATCH]: 'Processing batch transactions',
  [ProcessingStep.TRANSFERRING]: 'Transferring via Stellar contract',
  [ProcessingStep.COMPLETE]: 'Complete',
}

// ─── Stellar Wallet Kit ───────────────────────────────────────────────────────

let stellarWalletKit: StellarWalletsKit | null = null

const WALLETCONNECT_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '2f05a7cde26b5eebb89f0a82b4b95e25'

function initStellarKit(): StellarWalletsKit {
  if (stellarWalletKit) return stellarWalletKit

  const modules = [
    new xBullModule(),
    new FreighterModule(),
    new AlbedoModule(),
  ]

  if (WALLETCONNECT_PROJECT_ID && WALLETCONNECT_PROJECT_ID !== 'your-walletconnect-project-id') {
    modules.push(new WalletConnectModule({
      url: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
      projectId: WALLETCONNECT_PROJECT_ID,
      method: WalletConnectAllowedMethods.SIGN,
      description: 'Connect your Stellar wallet to interact with our dApp',
      name: 'Dust Aggregator',
      icons: ['https://stellar.org/favicon.ico'],
      network: WalletNetwork.TESTNET,
    }))
  }

  stellarWalletKit = new StellarWalletsKit({
    network: WalletNetwork.TESTNET,
    selectedWalletId: XBULL_ID,
    modules,
  })
  return stellarWalletKit
}

// createStellarContract is now imported from @/lib/stellar/contract

// ─── useDustAggregator Hook ───────────────────────────────────────────────────

const useDustAggregator = (
  starknetContract: StarknetContract | null,
  stellarContract: StellarContract | null,
  userAddress: string | null,
  dustBalances: DustBalance[],
  minThreshold: number
) => {
  const [currentStep, setCurrentStep] = useState<ProcessingStepType>(ProcessingStep.IDLE)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [batchTransactions, setBatchTransactions] = useState<BatchGroup[]>([])
  const [processedResults, setProcessedResults] = useState<BatchResult[]>([])

  // Step 1: Collect dust — now uses the configurable minThreshold
  const collectDust = useCallback(async (): Promise<DustBalance[]> => {
    if (!dustBalances || dustBalances.length === 0) {
      throw new Error('No dust balances selected')
    }

    const validBalances = dustBalances.filter(balance => {
      const usdValue = balance.usdValue || 0
      return usdValue > minThreshold
    })

    if (validBalances.length === 0) {
      throw new Error(`No valid dust balances meet the $${minThreshold.toFixed(2)} minimum threshold`)
    }

    return validBalances
  }, [dustBalances, minThreshold])

  // Step 2: Optimise batch transactions
  const optimizeBatch = useCallback(async (balances: DustBalance[]): Promise<BatchGroup[]> => {
    const batchGroups: BatchGroup[] = []
    const sortedBalances = [...balances].sort((a, b) => (b.usdValue || 0) - (a.usdValue || 0))

    let currentBatch: DustBalance[] = []
    let currentBatchValue = 0
    const MAX_BATCH_VALUE = 100
    const MAX_BATCH_SIZE = 5

    for (const balance of sortedBalances) {
      const balanceValue = balance.usdValue || 0

      if (
        currentBatch.length >= MAX_BATCH_SIZE ||
        (currentBatch.length > 0 && currentBatchValue + balanceValue > MAX_BATCH_VALUE)
      ) {
        batchGroups.push({
          assets: [...currentBatch],
          totalValue: currentBatchValue,
          batchId: batchGroups.length + 1
        })
        currentBatch = []
        currentBatchValue = 0
      }

      currentBatch.push(balance)
      currentBatchValue += balanceValue
    }

    if (currentBatch.length > 0) {
      batchGroups.push({
        assets: [...currentBatch],
        totalValue: currentBatchValue,
        batchId: batchGroups.length + 1
      })
    }

    setBatchTransactions(batchGroups)
    return batchGroups
  }, [])

  // Step 3: Process batch transactions
  const processBatch = useCallback(async (batchGroups: BatchGroup[]): Promise<BatchResult[]> => {
    if (!starknetContract && !stellarContract) {
      throw new Error('No contract instance available')
    }
    if (!userAddress) {
      throw new Error('User address not available')
    }

    const results: BatchResult[] = []

    for (const batch of batchGroups) {
      try {
        const targetAsset = batch.assets.reduce((prev: DustBalance, current: DustBalance) =>
          (prev.usdValue || 0) > (current.usdValue || 0) ? prev : current
        )

        const hasStellarAssets = batch.assets.some(a => a.network === 'stellar')
        const hasStarknetAssets = batch.assets.some(a => a.network === 'starknet')

        if (hasStellarAssets && stellarContract) {
          await new Promise(resolve => setTimeout(resolve, 1500))
          results.push({
            batchId: batch.batchId,
            success: true,
            targetAsset: targetAsset.asset,
            totalReceived: batch.totalValue * 0.95,
            assetsProcessed: batch.assets.length,
            originalValue: batch.totalValue
          })
        } else if (hasStarknetAssets && starknetContract) {
          await new Promise(resolve => setTimeout(resolve, 1500))
          results.push({
            batchId: batch.batchId,
            success: true,
            targetAsset: targetAsset.asset,
            totalReceived: batch.totalValue * 0.95,
            assetsProcessed: batch.assets.length,
            originalValue: batch.totalValue
          })
        } else {
          throw new Error(`No suitable contract available for batch ${batch.batchId}`)
        }
      } catch (err) {
        const error = err as Error
        results.push({
          batchId: batch.batchId,
          success: false,
          error: error.message,
          assetsProcessed: batch.assets.length,
          originalValue: batch.totalValue
        })
      }
    }

    setProcessedResults(results)
    return results
  }, [starknetContract, stellarContract, userAddress])

  // Step 4: Transfer aggregated assets
  const transferToTarget = useCallback(async (results: BatchResult[]): Promise<TransferResult[]> => {
    const successfulBatches = results.filter(r => r.success)
    if (successfulBatches.length === 0) {
      throw new Error('No successful batches to transfer')
    }

    await new Promise(resolve => setTimeout(resolve, 1500))

    return successfulBatches.map(batch => ({
      asset: batch.targetAsset || 'Unknown',
      amount: batch.totalReceived || 0,
      success: true,
      txHash: `0x${Math.random().toString(16).substr(2, 64)}`
    }))
  }, [])

  // Main processing orchestrator
  const startProcessing = useCallback(async (
    onRequestConfirm: (summary: string) => Promise<boolean>
  ): Promise<ProcessingResults> => {
    if (isProcessing) throw new Error('Processing already in progress')

    setIsProcessing(true)
    setError(null)
    setCurrentStep(ProcessingStep.COLLECTING_DUST)

    try {
      // ── Step 0a: Frontend batch validation ──────────────────────────────
      const frontendCheck = validateBatch(dustBalances)
      if (!frontendCheck.valid) {
        throw new Error(
          `Validation failed:\n• ${frontendCheck.errors.join('\n• ')}`
        )
      }

      // ── Step 0b: Show transaction summary — wait for user confirmation ──
      const summary = buildTransactionSummary(dustBalances)
      const confirmed = await onRequestConfirm(summary)
      if (!confirmed) {
        throw new Error('Transaction cancelled by user.')
      }

      // ── Step 0c: Server-side validation gate (/api/validate) ─────────────
      const validateRes = await fetch('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dustBalances }),
      })
      const validateData = await validateRes.json()
      if (!validateData.valid) {
        const msgs: string[] = validateData.errors ?? ['Server rejected the transaction.']
        throw new Error(`Server validation failed:\n• ${msgs.join('\n• ')}`)
      }

      // ── Step 1–4: Normal processing pipeline ─────────────────────────────
      const validBalances = await collectDust()
      await new Promise(resolve => setTimeout(resolve, 1000))

      setCurrentStep(ProcessingStep.OPTIMIZING_BATCH)
      const batchGroups = await optimizeBatch(validBalances)
      await new Promise(resolve => setTimeout(resolve, 1500))

      setCurrentStep(ProcessingStep.PROCESSING_BATCH)
      const batchResults = await processBatch(batchGroups)
      await new Promise(resolve => setTimeout(resolve, 2000))

      setCurrentStep(ProcessingStep.TRANSFERRING)
      const transferResults = await transferToTarget(batchResults)
      await new Promise(resolve => setTimeout(resolve, 1500))

      setCurrentStep(ProcessingStep.COMPLETE)

      return {
        batchResults,
        transferResults,
        totalBatches: batchGroups.length,
        successfulBatches: batchResults.filter(r => r.success).length
      }
    } catch (err) {
      const error = err as Error
      setError(error.message)
      throw error
    } finally {
      setIsProcessing(false)
    }
  }, [isProcessing, dustBalances, collectDust, optimizeBatch, processBatch, transferToTarget])

  const resetProcess = useCallback(() => {
    setCurrentStep(ProcessingStep.IDLE)
    setError(null)
    setBatchTransactions([])
    setProcessedResults([])
  }, [])

  return {
    currentStep,
    isProcessing,
    error,
    batchTransactions,
    processedResults,
    startProcessing,
    resetProcess,
    collectDust,
    optimizeBatch,
    processBatch,
    transferToTarget
  }
}

// ─── CardSection Component ────────────────────────────────────────────────────
// Now accepts belowThreshold + minThreshold props to grey out and disable tokens
// that are too small to process, with a tooltip explaining why.

const CardSection: React.FC<{
  token: string
  tokenShort: string
  price: number
  isSelected: boolean
  onSelectionChange: (selected: boolean) => void
  belowThreshold: boolean
  minThreshold: number
}> = ({ token, tokenShort, price, isSelected, onSelectionChange, belowThreshold, minThreshold }) => (
  <Card
    className={`p-2 mb-2 transition-opacity duration-200 ${belowThreshold ? 'opacity-40 grayscale' : 'opacity-100'
      }`}
  >
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        {price} {tokenShort}
        {belowThreshold && (
          <span className="text-xs font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
            Below threshold
          </span>
        )}
      </CardTitle>

      <CardAction className="flex items-center gap-2 mt-2">
        ${price}{' '}
        {belowThreshold ? (
          // Disabled checkbox + info tooltip for below-threshold tokens
          <HoverCard>
            <HoverCardTrigger asChild>
              <span className="inline-flex items-center gap-1 cursor-not-allowed">
                <Checkbox
                  className="!bg-muted"
                  checked={false}
                  disabled
                  aria-label="Balance too small to process"
                />
                <Info className="w-3.5 h-3.5 text-muted-foreground" />
              </span>
            </HoverCardTrigger>
            <HoverCardContent side="left" className="w-64 text-sm">
              Balance too small to process (${minThreshold.toFixed(2)} minimum)
            </HoverCardContent>
          </HoverCard>
        ) : (
          <Checkbox
            className="!bg-accent"
            checked={isSelected}
            onCheckedChange={(checked) => onSelectionChange(checked === true)}
          />
        )}
      </CardAction>

      <CardDescription>{token}</CardDescription>
    </CardHeader>
  </Card>
)

// ─── ThresholdSettings Component ─────────────────────────────────────────────
// A collapsible settings panel that lets the user configure the minimum
// threshold and persists it to localStorage.

const ThresholdSettings: React.FC<{
  minThreshold: number
  onThresholdChange: (value: number) => void
}> = ({ minThreshold, onThresholdChange }) => {
  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState(String(minThreshold))

  // Keep input in sync if threshold is changed externally
  useEffect(() => {
    setInputValue(String(minThreshold))
  }, [minThreshold])

  const handleApply = () => {
    const parsed = parseFloat(inputValue)
    if (!isNaN(parsed) && parsed >= 0) {
      onThresholdChange(parsed)
    }
    setOpen(false)
  }

  return (
    <div className="mb-2">
      <Button
        variant="ghost"
        size="sm"
        className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(prev => !prev)}
      >
        <Settings2 className="w-4 h-4" />
        Threshold settings
      </Button>

      {open && (
        <Card className="mt-2 p-3">
          <CardContent className="flex items-end gap-3 p-0">
            <div className="flex flex-col gap-1 flex-1">
              <Label htmlFor="threshold-input" className="text-sm">
                Minimum value (USD)
              </Label>
              <Input
                id="threshold-input"
                type="number"
                min="0"
                step="0.001"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                className="w-full"
                placeholder="0.01"
              />
            </div>
            <Button size="sm" onClick={handleApply}>
              Apply
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ─── EligibilityBanner Component ─────────────────────────────────────────────
// Shows "X of Y tokens are eligible for processing" above the balance list.

const EligibilityBanner: React.FC<{
  eligible: number
  total: number
  minThreshold: number
}> = ({ eligible, total, minThreshold }) => {
  if (total === 0) return null

  const allEligible = eligible === total
  const noneEligible = eligible === 0

  return (
    <div
      className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg mb-3 ${noneEligible
          ? 'bg-destructive/10 text-destructive'
          : allEligible
            ? 'bg-green-500/10 text-green-600'
            : 'bg-yellow-500/10 text-yellow-600'
        }`}
    >
      <Info className="w-4 h-4 shrink-0" />
      <span>
        <strong>{eligible} of {total}</strong> token{total !== 1 ? 's are' : ' is'} eligible for
        processing{' '}
        <span className="opacity-70">(${minThreshold.toFixed(2)} minimum)</span>
      </span>
    </div>
  )
}

// ─── WalletBalances (main export) ─────────────────────────────────────────────

export default function WalletBalances() {
  const { state } = useWallet()
  const [starknetBalances, setStarknetBalances] = useState<Balances>({})
  const [stellarBalances, setStellarBalances] = useState<StellarBalance[]>([])
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(new Set())

  // Get addresses from context
  const starknetAddress = state.starknet.address
  const stellarAddress = state.stellar.address

  // ── Threshold state — initialised from localStorage, persisted on change ──
  const [minThreshold, setMinThreshold] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_MIN_THRESHOLD
    const stored = localStorage.getItem(LOCALSTORAGE_THRESHOLD_KEY)
    const parsed = stored !== null ? parseFloat(stored) : NaN
    return !isNaN(parsed) && parsed >= 0 ? parsed : DEFAULT_MIN_THRESHOLD
  })

  const handleThresholdChange = (value: number) => {
    setMinThreshold(value)
    localStorage.setItem(LOCALSTORAGE_THRESHOLD_KEY, String(value))
  }

  // ── Starknet wallet ────────────────────────────────────────────────────────

  const fetchStarknetBalances = async () => {
    try {
      const provider = new RpcProvider({
        nodeUrl: 'https://starknet-sepolia.public.blastapi.io',
      })
      const { wallet } = await connectStarknet({
        webWalletUrl: 'https://web.hydrogen.argent47.net',
        dappName: 'Dust Aggregator',
        modalMode: 'canAsk',
      })

      const w = wallet as WalletLike
      const address =
        w.selectedAddress || w.selectedAccount?.address || w.account?.address

      // Address is now managed by WalletContext via StarknetWallet component
      // Just fetch balances if we have an address
      if (!address) return

      const balancesObj: Balances = {}
      for (const [, token] of Object.entries(TOKENS)) {
        const contract = createStarknetContract(token.address, provider)
        const result = await contract.balanceOf(address)
        const balance = uint256.uint256ToBN(result.balance as Parameters<typeof uint256.uint256ToBN>[0])
        balancesObj[token.symbol] = Number(balance.toString()) / 10 ** token.decimals
      }
      setStarknetBalances(balancesObj)
    } catch (error) {
      console.error('Error connecting to Starknet:', error)
    }
  }

  // ── Stellar wallet ─────────────────────────────────────────────────────────

  const fetchStellarBalances = async () => {
    try {
      const kit = initStellarKit()
      return new Promise<void>((resolve, reject) => {
        kit.openModal({
          onWalletSelected: async (wallet) => {
            try {
              kit.setWallet(wallet.id)
              const { address } = await kit.getAddress()
              // Address is now managed by WalletContext via StellarWallet component
              // Just fetch balances if we have an address
              const res = await fetch(
                `https://horizon-testnet.stellar.org/accounts/${address}`
              )
              if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
              const data = await res.json()
              setStellarBalances(data.balances || [])
              resolve()
            } catch (err) {
              console.error('Error fetching Stellar balances:', err)
              reject(err)
            }
          },
          onClosed: () => {
            reject(new Error('Wallet selection cancelled'))
          },
        })
      })
    } catch (error) {
      console.error('Error initializing Stellar wallet:', error)
      throw error
    }
  }

  // ── Token selection ────────────────────────────────────────────────────────

  const handleTokenSelection = (tokenId: string, selected: boolean) => {
    setSelectedTokens(prev => {
      const next = new Set(prev)
      if (selected) next.add(tokenId)
      else next.delete(tokenId)
      return next
    })
  }

  // ── Derived values ─────────────────────────────────────────────────────────

  const calculateTotalSelectedValue = (): number => {
    let total = 0
    Object.entries(starknetBalances).forEach(([symbol, amount]) => {
      if (selectedTokens.has(`starknet-${symbol}`)) total += amount
    })
    stellarBalances.forEach((bal, idx) => {
      if (selectedTokens.has(`stellar-${idx}`)) total += parseFloat(bal.balance)
    })
    return total
  }

  // Build all token rows (Starknet + Stellar) with threshold flag
  const allTokenRows = [
    ...Object.entries(starknetBalances).map(([symbol, amount]) => ({
      id: `starknet-${symbol}`,
      symbol,
      shortSymbol: symbol,
      price: Number(amount.toFixed(4)),
      usdValue: amount,
      network: 'starknet' as const,
    })),
    ...stellarBalances.map((bal, idx) => {
      const symbol = bal.asset_type === 'native' ? 'XLM' : bal.asset_code || 'Unknown'
      const shortSymbol = bal.asset_type === 'native' ? 'XLM' : bal.asset_code || '??'
      const price = Number(parseFloat(bal.balance).toFixed(4))
      return {
        id: `stellar-${idx}`,
        symbol,
        shortSymbol,
        price,
        usdValue: price,
        network: 'stellar' as const,
      }
    }),
  ]

  const totalTokenCount = allTokenRows.length
  const eligibleTokenCount = allTokenRows.filter(t => t.usdValue > minThreshold).length

  const getSelectedDustBalances = (): DustBalance[] => {
    const dustBalances: DustBalance[] = []

    Object.entries(starknetBalances).forEach(([symbol, amount]) => {
      const tokenId = `starknet-${symbol}`
      if (selectedTokens.has(tokenId)) {
        dustBalances.push({
          id: tokenId,
          asset: TOKENS[symbol]?.address || symbol,
          symbol,
          amount,
          usdValue: amount,
          network: 'starknet',
        })
      }
    })

    stellarBalances.forEach((bal, idx) => {
      const tokenId = `stellar-${idx}`
      if (selectedTokens.has(tokenId)) {
        const symbol = bal.asset_type === 'native' ? 'XLM' : bal.asset_code || 'Unknown'
        dustBalances.push({
          id: tokenId,
          asset: bal.asset_code || 'XLM',
          symbol,
          amount: parseFloat(bal.balance),
          usdValue: parseFloat(bal.balance),
          network: 'stellar',
        })
      }
    })

    return dustBalances
  }

  const selectedDustBalances = getSelectedDustBalances()
  const userAddress = starknetAddress || stellarAddress
  const starknetContract: StarknetContract | null = null
  const stellarContract: StellarContract | null = stellarAddress
    ? createStellarContract(DUST_AGGREGATOR_CONTRACT)
    : null

  const {
    currentStep,
    isProcessing,
    error,
    batchTransactions,
    processedResults,
    startProcessing,
    resetProcess,
  } = useDustAggregator(starknetContract, stellarContract, userAddress, selectedDustBalances, minThreshold)

  // ── Transaction confirmation dialog ─────────────────────────────────────
  const [pendingSummary, setPendingSummary] = useState<string | null>(null)
  const resolveConfirm = useRef<((confirmed: boolean) => void) | null>(null)

  /**
   * Called by startProcessing() to surface the summary dialog.
   * Returns a Promise<boolean> that resolves when the user clicks
   * Confirm (true) or Cancel (false).
   */
  const requestConfirm = useCallback((summary: string): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      resolveConfirm.current = resolve
      setPendingSummary(summary)
    })
  }, [])

  const handleConfirm = () => {
    setPendingSummary(null)
    resolveConfirm.current?.(true)
    resolveConfirm.current = null
  }

  const handleCancelConfirm = () => {
    setPendingSummary(null)
    resolveConfirm.current?.(false)
    resolveConfirm.current = null
  }

  const handleStartProcessing = async () => {
    try {
      const results = await startProcessing(requestConfirm)
      console.log('Processing completed:', results)
    } catch (err) {
      // Error is already surfaced in `error` state via useDustAggregator.
      // Log here for debugging; never swallow silently.
      console.error('Processing failed:', err)
    }
  }

  const progress = currentStep === ProcessingStep.IDLE ? 0 : (currentStep / 5) * 100
  const hasBalances = starknetAddress || stellarAddress

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">

      {/* Transaction confirmation dialog */}
      <AlertDialog open={pendingSummary !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Transaction</AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-line">
              {pendingSummary}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelConfirm}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>Confirm &amp; Sign</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Wallet connect buttons */}
      <div className="flex flex-wrap max-w-full gap-4">
        <Button className=" w-auto bg-card text-foreground" onClick={fetchStarknetBalances}>
          Connect Starknet Wallet
        </Button>
        <Button className=" w-auto bg-card text-foreground" onClick={fetchStellarBalances}>
          Connect Stellar Wallet
        </Button>
      </div>

      {hasBalances ? (
        <>
          {/* ── Threshold settings + eligibility banner ── */}
          <div>
            <ThresholdSettings
              minThreshold={minThreshold}
              onThresholdChange={handleThresholdChange}
            />
            <EligibilityBanner
              eligible={eligibleTokenCount}
              total={totalTokenCount}
              minThreshold={minThreshold}
            />
          </div>

          {/* ── Balance list ── */}
          <ScrollArea className="h-[400px] rounded-md border w-full p-4">
            {starknetAddress && (
              <>
                <h2 className="text-xl font-bold mb-2">Starknet Balances</h2>
                {Object.entries(starknetBalances).map(([symbol, amount]) => {
                  const tokenId = `starknet-${symbol}`
                  const usdValue = amount
                  const belowThreshold = usdValue <= minThreshold
                  return (
                    <CardSection
                      key={symbol}
                      token={symbol}
                      tokenShort={symbol}
                      price={Number(amount.toFixed(4))}
                      isSelected={selectedTokens.has(tokenId)}
                      onSelectionChange={selected => handleTokenSelection(tokenId, selected)}
                      belowThreshold={belowThreshold}
                      minThreshold={minThreshold}
                    />
                  )
                })}
                <Separator className="my-4" />
              </>
            )}

            {stellarAddress && (
              <>
                <h2 className="text-xl font-bold mb-2">Stellar Balances</h2>
                {stellarBalances.map((bal, idx) => {
                  const tokenId = `stellar-${idx}`
                  const symbol = bal.asset_type === 'native' ? 'XLM' : bal.asset_code || 'Unknown'
                  const shortSymbol = bal.asset_type === 'native' ? 'XLM' : bal.asset_code || '??'
                  const price = Number(parseFloat(bal.balance).toFixed(4))
                  const belowThreshold = price <= minThreshold
                  return (
                    <CardSection
                      key={idx}
                      token={symbol}
                      tokenShort={shortSymbol}
                      price={price}
                      isSelected={selectedTokens.has(tokenId)}
                      onSelectionChange={selected => handleTokenSelection(tokenId, selected)}
                      belowThreshold={belowThreshold}
                      minThreshold={minThreshold}
                    />
                  )
                })}
              </>
            )}
          </ScrollArea>
        </>
      ) : (
        <p className="text-center text-gray-400">
          Connect wallet to see your balances
        </p>
      )}

      {/* ── Bottom card: total value + processing status ── */}
      <Card className="relative overflow-hidden p-2 mt-2">
        <CardContent className=" flex items-center justify-between ">
          <div>
            <CardDescription>Total Selected Dust Value</CardDescription>
            <CardTitle>${calculateTotalSelectedValue().toFixed(2)}</CardTitle>
          </div>
          <div>
            {selectedDustBalances.length > 0 && (
              <div className="space-y-4">
                <Card className="mb-4">
                  <CardHeader>
                    <CardTitle>Processing Status</CardTitle>
                    <Progress value={progress} className="mt-4" />
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-sm text-gray-600">
                        Step {currentStep} of 5
                      </span>
                      {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ol className="list-decimal pl-4 space-y-2">
                      {Object.entries(stepLabels).map(([step, label]) => {
                        const stepNum = parseInt(step)
                        return (
                          <li
                            key={step}
                            className={`flex items-center gap-2 ${currentStep > stepNum
                                ? 'text-green-600'
                                : currentStep === stepNum
                                  ? 'text-blue-600 font-semibold'
                                  : 'text-gray-400'
                              }`}
                          >
                            {currentStep > stepNum && <CheckCircle className="w-4 h-4" />}
                            {currentStep === stepNum && isProcessing && (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            )}
                            <span>{label}</span>
                          </li>
                        )
                      })}
                    </ol>
                  </CardContent>
                  <CardFooter className="flex flex-col gap-2">
                    {error && (
                      <div className="flex items-center gap-2 text-red-600 text-sm">
                        <AlertCircle className="w-4 h-4" />
                        <span>{error}</span>
                      </div>
                    )}
                    <div className="flex gap-2 w-full">
                      <Button
                        className="relative overflow-hidden flex-1 !bg-accent"
                        size="lg"
                        variant="outline"
                        onClick={handleStartProcessing}
                        disabled={
                          isProcessing ||
                          !userAddress ||
                          currentStep === ProcessingStep.COMPLETE ||
                          selectedDustBalances.length === 0
                        }
                      >
                        {isProcessing ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            Processing...
                          </>
                        ) : currentStep === ProcessingStep.COMPLETE ? (
                          <>
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Complete
                          </>
                        ) : (
                          `Process ${selectedDustBalances.length} Selected Tokens`
                        )}
                        {!isProcessing &&
                          currentStep !== ProcessingStep.COMPLETE &&
                          selectedDustBalances.length > 0 && (
                            <BorderBeam
                              size={40}
                              initialOffset={20}
                              className="from-transparent via-yellow-500 to-transparent"
                            />
                          )}
                      </Button>
                      {currentStep === ProcessingStep.COMPLETE && (
                        <Button onClick={resetProcess} variant="outline" size="lg">
                          Reset
                        </Button>
                      )}
                    </div>
                  </CardFooter>
                </Card>

                {/* Batch Preview */}
                {batchTransactions.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Batch Transactions ({batchTransactions.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {batchTransactions.map(batch => (
                          <div key={batch.batchId} className="border rounded-lg p-3">
                            <div className="flex justify-between items-center mb-2">
                              <h4 className="font-semibold">Batch {batch.batchId}</h4>
                              <span className="text-sm text-gray-600">
                                ${batch.totalValue.toFixed(2)} • {batch.assets.length} assets
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 space-y-1">
                              {batch.assets.map((asset: DustBalance, idx: number) => (
                                <div key={idx} className="flex justify-between">
                                  <span className="font-mono">{asset.symbol}</span>
                                  <span>${(asset.usdValue || 0).toFixed(2)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Results Summary */}
                {processedResults.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Processing Results</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {processedResults.map(result => (
                          <div
                            key={result.batchId}
                            className="flex justify-between items-center p-2 border rounded"
                          >
                            <span>Batch {result.batchId}</span>
                            <div className="flex items-center gap-2">
                              {result.success ? (
                                <CheckCircle className="w-4 h-4 text-green-500" />
                              ) : (
                                <AlertCircle className="w-4 h-4 text-red-500" />
                              )}
                              <span className="text-sm">
                                {result.success
                                  ? `$${result.originalValue.toFixed(2)} processed`
                                  : result.error}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}