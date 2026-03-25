'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from './ui/button'
import { RefreshCcw, ExternalLink, Clock, DollarSign, Link2, CheckCircle, XCircle, Loader2 } from 'lucide-react'

// Types
interface TxHash {
  chain: string
  hash: string
}

interface TransactionEntry {
  id: string
  wallet: string
  timestamp: string
  chains: string[]
  totalValue: string
  status: 'completed' | 'failed' | 'pending'
  txHashes: TxHash[]
}

// Block explorer URLs
const EXPLORER_URLS: Record<string, (hash: string) => string> = {
  stellar: (hash: string) => `https://stellar.expert/explorer/testnet/tx/${hash}`,
  starknet: (hash: string) => `https://sepolia.starkscan.co/tx/${hash}`,
  ethereum: (hash: string) => `https://sepolia.etherscan.io/tx/${hash}`,
}

// Chain display names
const CHAIN_NAMES: Record<string, string> = {
  stellar: 'Stellar',
  starknet: 'StarkNet',
  ethereum: 'Ethereum',
  solana: 'Solana',
}

// Helper to format timestamp
function formatTimestamp(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Helper to truncate hash for display
function truncateHash(hash: string): string {
  if (!hash) return ''
  if (hash.length <= 12) return hash
  return `${hash.slice(0, 6)}...${hash.slice(-6)}`
}

// Transaction entry component
const TransactionEntryCard = ({ transaction }: { transaction: TransactionEntry }) => {
  const getStatusIcon = () => {
    switch (transaction.status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />
      case 'pending':
        return <Loader2 className="w-4 h-4 text-yellow-500 animate-spin" />
      default:
        return null
    }
  }

  const getStatusColor = () => {
    switch (transaction.status) {
      case 'completed':
        return 'text-green-500'
      case 'failed':
        return 'text-red-500'
      case 'pending':
        return 'text-yellow-500'
      default:
        return 'text-muted-foreground'
    }
  }

  return (
    <Card className="mb-3 bg-accent/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {formatTimestamp(transaction.timestamp)}
            </span>
          </div>
          <div className={`flex items-center gap-1 text-sm font-medium capitalize ${getStatusColor()}`}>
            {getStatusIcon()}
            {transaction.status}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Chains involved */}
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Chains:</span>
          <div className="flex gap-1">
            {transaction.chains.map((chain) => (
              <span
                key={chain}
                className="px-2 py-0.5 text-xs bg-primary/10 rounded-full text-foreground"
              >
                {CHAIN_NAMES[chain] || chain}
              </span>
            ))}
          </div>
        </div>

        {/* Total value */}
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Total Value:</span>
          <span className="text-sm font-medium text-foreground">
            {transaction.totalValue}
          </span>
        </div>

        {/* Transaction hashes */}
        {transaction.txHashes.length > 0 && (
          <div className="space-y-2">
            <span className="text-sm text-muted-foreground">Transaction Hashes:</span>
            {transaction.txHashes.map((txHash, index) => {
              const explorerUrl = EXPLORER_URLS[txHash.chain]?.(txHash.hash)
              return (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 bg-secondary rounded text-secondary-foreground">
                    {CHAIN_NAMES[txHash.chain] || txHash.chain}
                  </span>
                  {explorerUrl ? (
                    <a
                      href={explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-400 hover:underline flex items-center gap-1 font-mono"
                    >
                      {truncateHash(txHash.hash)}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="text-sm font-mono text-foreground">
                      {truncateHash(txHash.hash)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Main component
export default function TransactionHistory() {
  const [transactions, setTransactions] = useState<TransactionEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [walletAddress, setWalletAddress] = useState<string>('')

  // Load wallet address from localStorage
  useEffect(() => {
    const storedAddress = localStorage.getItem('stellar_address') || localStorage.getItem('walletAddress')
    if (storedAddress) {
      setWalletAddress(storedAddress)
    }
  }, [])

  // Fetch transaction history
  const fetchHistory = useCallback(async () => {
    if (!walletAddress) {
      setError('No wallet connected')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/history?wallet=${encodeURIComponent(walletAddress)}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch transactions')
      }

      setTransactions(data.transactions || [])
    } catch (err) {
      console.error('Error fetching transaction history:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch transactions')
    } finally {
      setIsLoading(false)
    }
  }, [walletAddress])

  // Fetch on mount and when wallet changes
  useEffect(() => {
    if (walletAddress) {
      fetchHistory()
    }
  }, [walletAddress, fetchHistory])

  // Listen for wallet changes
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'stellar_address' || e.key === 'walletAddress') {
        const newAddress = e.newValue
        if (newAddress) {
          setWalletAddress(newAddress)
        }
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Transaction History</CardTitle>
            <CardDescription>
              View your past transactions and withdrawal receipts
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchHistory}
            disabled={isLoading || !walletAddress}
          >
            <RefreshCcw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!walletAddress ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>Connect your wallet to view transaction history</p>
          </div>
        ) : isLoading ? (
          <div className="text-center py-8">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
            <p className="mt-2 text-muted-foreground">Loading transactions...</p>
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-red-500">{error}</p>
            <Button variant="outline" className="mt-2" onClick={fetchHistory}>
              Try Again
            </Button>
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No transactions found</p>
            <p className="text-sm mt-1">Your transaction history will appear here after processing</p>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto pr-2">
            {transactions.map((transaction) => (
              <TransactionEntryCard key={transaction.id} transaction={transaction} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Helper function to save a transaction (to be called from other components)
export async function saveTransaction(transaction: Omit<TransactionEntry, 'id'>): Promise<TransactionEntry | null> {
  try {
    const response = await fetch('/api/history', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(transaction),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || 'Failed to save transaction')
    }

    return data.transaction
  } catch (error) {
    console.error('Error saving transaction:', error)
    return null
  }
}
