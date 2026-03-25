'use client';
import SwapOnStellarCardSection from "./SwapOnStellarCard";
import { WalletProvider } from '@creit.tech/stellar-wallets-kit'; // Assuming a WalletProvider is available

export default function SwapOnStellarComponent() {
  return (
    // Ensure WalletProvider wraps components that use wallet context
    // This provider might already exist higher up in your application tree.
    // If it does, you don't need this specific <WalletProvider> here.
    // This is just to ensure the context is available for SwapOnStellarCardSection
    // <WalletProvider> 
      <div>
          <h1 className=" font-bold text-lg my-2">Swap on Stellar</h1>
          <p className=" mb-4">Your aggregated dust is now on Stellar. Choose an asset to swap into.</p>
          <SwapOnStellarCardSection/>
      </div>
    // </WalletProvider>
  )
}