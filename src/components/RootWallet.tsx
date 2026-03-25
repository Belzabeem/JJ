'use client';
import { useState, useEffect } from 'react'
import { RainbowButton } from './magicui/rainbow-button'
import { useWallet } from '@/context/WalletContext'

// MAIN BUTTON COMPONENT
export default function RootWalletButton() {
  const { state, connectStellar, disconnectStellar } = useWallet()
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isConnected = state.stellar.isConnected
  const walletAddress = state.stellar.address
  const walletId = state.stellar.walletId

  // Check if wallet is already connected on component mount
  // This is handled by the context's useEffect, but we can add additional checks here if needed
  useEffect(() => {
    // Any additional initialization logic can go here
    // The context already handles loading from localStorage
  }, [])

  const handleClick = async () => {
    if (isConnected) {
      // Disconnect wallet
      disconnectStellar()
      setError(null)
      console.log('Wallet disconnected')
    } else {
      // Connect wallet
      setIsConnecting(true)
      setError(null)
      
      try {
        await connectStellar()
        console.log('Wallet connected successfully')
      } catch (err) {
        console.error('Failed to connect wallet:', err)
        setError(err instanceof Error ? err.message : 'Failed to connect wallet')
      } finally {
        setIsConnecting(false)
      }
    }
  }

  // Helper function to get button text
  const getButtonText = () => {
    if (isConnecting) return 'Connecting...'
    if (isConnected && walletAddress) {
      // Show shortened address like "GA7X...Y2Z3"
      return `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`
    }
    return 'Connect Wallet'
  }

  // Helper function to get button title (tooltip)
  const getButtonTitle = () => {
    if (isConnected && walletAddress) {
      return `Connected: ${walletAddress} (${walletId || 'Unknown wallet'})`
    }
    return 'Connect your Stellar wallet'
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <RainbowButton 
        variant={'outline'} 
        className="bg-accent"
        onClick={handleClick}
        disabled={isConnecting}
        title={getButtonTitle()}
      >
        {getButtonText()}
      </RainbowButton>
      
      {error && (
        <div className="text-red-500 text-sm max-w-xs text-center">
          {error}
        </div>
      )}
    </div>
  )
}
