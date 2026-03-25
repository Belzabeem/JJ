'use client';
import { useState } from 'react';
import { useStellarWallet } from '@/context/WalletContext';
import { Button } from './ui/button';
import { BorderBeam } from './magicui/border-beam';

export default function StellarWalletButton() {
  const { address, isConnected, connect, disconnect } = useStellarWallet();
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    if (address) {
      disconnect();
    } else {
      setIsConnecting(true);
      setError(null);
      try {
        await connect();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to connect wallet');
      } finally {
        setIsConnecting(false);
      }
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        variant={'outline'}
        className="bg-accent cursor-pointer"
        onClick={handleClick}
        disabled={isConnecting}
        title={address || 'Connect your Stellar wallet'}
      >
        {isConnecting ? 'Connecting...' : (address ? `${address.slice(0, 4)}...${address.slice(-4)}` : 'Connect')}
        <BorderBeam
          size={40}
          initialOffset={20}
          className="from-transparent via-yellow-500 to-transparent"
          transition={{
            type: 'spring',
            stiffness: 60,
            damping: 20,
          }}
        />
      </Button>

      {error && <div className="text-red-500 text-sm text-center">{error}</div>}
    </div>
  );
}
