'use client';

import React, { createContext, useContext, useReducer, ReactNode, useEffect, useCallback } from 'react';

// Types
export type Network = 'testnet' | 'mainnet';

export interface ChainWallet {
  address: string | null;
  isConnected: boolean;
  walletId: string | null;
  network: Network;
}

export type ChainKey = 'stellar' | 'starknet' | 'ethereum' | 'solana';

export interface WalletState {
  stellar: ChainWallet;
  starknet: ChainWallet;
  ethereum: ChainWallet;
  solana: ChainWallet;
}

// Action types
type WalletAction =
  | { type: 'CONNECT_WALLET'; chain: ChainKey; address: string; walletId: string; network?: Network }
  | { type: 'DISCONNECT_WALLET'; chain: ChainKey }
  | { type: 'SET_NETWORK'; chain: ChainKey; network: Network };

// Initial state
const initialChainWallet: ChainWallet = {
  address: null,
  isConnected: false,
  walletId: null,
  network: 'testnet',
};

const initialState: WalletState = {
  stellar: { ...initialChainWallet },
  starknet: { ...initialChainWallet },
  ethereum: { ...initialChainWallet },
  solana: { ...initialChainWallet },
};

// Reducer
function walletReducer(state: WalletState, action: WalletAction): WalletState {
  switch (action.type) {
    case 'CONNECT_WALLET':
      return {
        ...state,
        [action.chain]: {
          ...state[action.chain],
          address: action.address,
          isConnected: true,
          walletId: action.walletId,
          network: action.network || state[action.chain].network,
        },
      };
    case 'DISCONNECT_WALLET':
      return {
        ...state,
        [action.chain]: {
          ...state[action.chain],
          address: null,
          isConnected: false,
          walletId: null,
        },
      };
    case 'SET_NETWORK':
      return {
        ...state,
        [action.chain]: {
          ...state[action.chain],
          network: action.network,
        },
      };
    default:
      return state;
  }
}

// Context
interface WalletContextType {
  state: WalletState;
  dispatch: React.Dispatch<WalletAction>;
  // Convenience methods for components
  connectStellar: () => Promise<{ address: string; walletId: string }>;
  disconnectStellar: () => void;
  connectStarknet: (address: string, walletId?: string) => void;
  disconnectStarknet: () => void;
  // Getters
  getStellarAddress: () => string | null;
  getStarknetAddress: () => string | null;
  isStellarConnected: () => boolean;
  isStarknetConnected: () => boolean;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

// Provider
interface WalletProviderProps {
  children: ReactNode;
}

export function WalletProvider({ children }: WalletProviderProps) {
  const [state, dispatch] = useReducer(walletReducer, initialState);

  // Stellar wallet functions (using existing logic from RootWallet.tsx)
  const connectStellar = useCallback(async (): Promise<{ address: string; walletId: string }> => {
    const {
      StellarWalletsKit,
      WalletNetwork,
      XBULL_ID,
    } = await import('@creit.tech/stellar-wallets-kit');
    const { WalletConnectAllowedMethods, WalletConnectModule } = await import(
      '@creit.tech/stellar-wallets-kit/modules/walletconnect.module'
    );
    const { xBullModule, FreighterModule, AlbedoModule } = await import(
      '@creit.tech/stellar-wallets-kit'
    );

    // Initialize kit
    const kit = new StellarWalletsKit({
      network: WalletNetwork.TESTNET,
      selectedWalletId: XBULL_ID,
      modules: [
        new xBullModule(),
        new FreighterModule(),
        new AlbedoModule(),
        new WalletConnectModule({
          url: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
          projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '2f05a7cde26b5eebb89f0a82b4b95e25',
          method: WalletConnectAllowedMethods.SIGN,
          description: 'Connect your Stellar wallet to interact with our dApp',
          name: 'Dust Aggregator',
          icons: ['https://stellar.org/favicon.ico'],
          network: WalletNetwork.TESTNET,
        }),
      ],
    });

    return new Promise((resolve, reject) => {
      kit.openModal({
        onWalletSelected: async (option) => {
          try {
            kit.setWallet(option.id);
            const { address } = await kit.getAddress();
            
            // Store in localStorage for persistence
            if (typeof window !== 'undefined') {
              localStorage.setItem('stellar_address', address);
              localStorage.setItem('stellar_walletId', option.id);
            }
            
            dispatch({
              type: 'CONNECT_WALLET',
              chain: 'stellar',
              address,
              walletId: option.id,
            });
            
            resolve({ address, walletId: option.id });
          } catch (error) {
            reject(error);
          }
        },
        onClosed: (err: Error) => {
          reject(err || new Error('Modal closed without wallet selection'));
        },
      });
    });
  }, []);

  const disconnectStellar = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('stellar_address');
      localStorage.removeItem('stellar_walletId');
    }
    dispatch({ type: 'DISCONNECT_WALLET', chain: 'stellar' });
  }, []);

  // Starknet wallet functions (delegate to existing hooks)
  const connectStarknet = useCallback((address: string, walletId?: string) => {
    dispatch({
      type: 'CONNECT_WALLET',
      chain: 'starknet',
      address,
      walletId: walletId || 'starknet-wallet',
    });
  }, []);

  const disconnectStarknet = useCallback(() => {
    dispatch({ type: 'DISCONNECT_WALLET', chain: 'starknet' });
  }, []);

  // Getters
  const getStellarAddress = useCallback(() => state.stellar.address, [state.stellar.address]);
  const getStarknetAddress = useCallback(() => state.starknet.address, [state.starknet.address]);
  const isStellarConnected = useCallback(() => state.stellar.isConnected, [state.stellar.isConnected]);
  const isStarknetConnected = useCallback(() => state.starknet.isConnected, [state.starknet.isConnected]);

  // Check for existing connections on mount (for Stellar)
  useEffect(() => {
    const checkExistingConnection = async () => {
      if (typeof window === 'undefined') return;
      
      const storedAddress = localStorage.getItem('stellar_address');
      const storedWalletId = localStorage.getItem('stellar_walletId');
      
      if (storedAddress && storedWalletId) {
        dispatch({
          type: 'CONNECT_WALLET',
          chain: 'stellar',
          address: storedAddress,
          walletId: storedWalletId,
        });
      }
    };
    
    checkExistingConnection();
  }, []);

  const value: WalletContextType = {
    state,
    dispatch,
    connectStellar,
    disconnectStellar,
    connectStarknet,
    disconnectStarknet,
    getStellarAddress,
    getStarknetAddress,
    isStellarConnected,
    isStarknetConnected,
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

// Custom hook
export function useWallet(): WalletContextType {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}

// Selector hooks for convenience
export function useStellarWallet() {
  const { state, connectStellar, disconnectStellar, getStellarAddress, isStellarConnected } = useWallet();
  return {
    ...state.stellar,
    connect: connectStellar,
    disconnect: disconnectStellar,
    getAddress: getStellarAddress,
    isConnected: isStellarConnected,
  };
}

export function useStarknetWallet() {
  const { state, connectStarknet, disconnectStarknet, getStarknetAddress, isStarknetConnected } = useWallet();
  return {
    ...state.starknet,
    connect: connectStarknet,
    disconnect: disconnectStarknet,
    getAddress: getStarknetAddress,
    isConnected: isStarknetConnected,
  };
}