// ─── app/api/history/route.ts ─────────────────────────────────────────────────
// POST /api/history — Save a completed transaction
// GET /api/history?wallet=<address> — Retrieve past transactions for a wallet

import { NextRequest, NextResponse } from 'next/server'

// Types
export interface TransactionHistoryEntry {
  id: string
  wallet: string
  timestamp: string
  chains: string[]
  totalValue: string
  status: 'completed' | 'failed' | 'pending'
  txHashes: {
    chain: string
    hash: string
  }[]
}

// In-memory store (replace with Supabase in production)
const transactionHistory: TransactionHistoryEntry[] = []

// POST handler - Save a new transaction
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate required fields
    if (!body.wallet || !body.chains || !body.totalValue || !body.status) {
      return NextResponse.json(
        { error: 'Missing required fields: wallet, chains, totalValue, status' },
        { status: 400 }
      )
    }

    // Create new transaction entry
    const newTransaction: TransactionHistoryEntry = {
      id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      wallet: body.wallet,
      timestamp: body.timestamp || new Date().toISOString(),
      chains: body.chains,
      totalValue: body.totalValue,
      status: body.status,
      txHashes: body.txHashes || [],
    }

    // Save to in-memory store
    transactionHistory.push(newTransaction)

    return NextResponse.json({ success: true, transaction: newTransaction })
  } catch (error) {
    console.error('[/api/history POST] Error:', error)
    return NextResponse.json(
      { error: 'Failed to save transaction' },
      { status: 500 }
    )
  }
}

// GET handler - Retrieve transactions for a wallet
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const wallet = searchParams.get('wallet')

    if (!wallet) {
      return NextResponse.json(
        { error: 'Wallet address is required. Use ?wallet=<address>' },
        { status: 400 }
      )
    }

    // Filter transactions by wallet
    const walletTransactions = transactionHistory
      .filter((tx) => tx.wallet.toLowerCase() === wallet.toLowerCase())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    return NextResponse.json({ transactions: walletTransactions })
  } catch (error) {
    console.error('[/api/history GET] Error:', error)
    return NextResponse.json(
      { error: 'Failed to retrieve transactions' },
      { status: 500 }
    )
  }
}