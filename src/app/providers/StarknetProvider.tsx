'use client';

import { StarknetConfig } from '@starknet-react/core';
import { publicProvider } from '@starknet-react/core';

const starknetSepolia = {
  id: 393402131332719809025n,
  name: 'Starknet Sepolia',
  network: 'starknet-sepolia',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
    address: '0x0000000000000000000000000000000000000000' as `0x${string}`,
  },
  rpcUrls: {
    default: {
      http: ['https://starknet-sepolia.public.blastapi.io'],
    },
    public: {
      http: ['https://starknet-sepolia.public.blastapi.io'],
    },
  },
};




export default function StarknetProviderWrapper({ children }: { children: React.ReactNode }) {
  return (
    <StarknetConfig
      chains={[starknetSepolia]}
      provider={publicProvider()}
    >
      {children}
    </StarknetConfig>
  );
}
