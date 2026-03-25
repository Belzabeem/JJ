'use client';

import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { BorderBeam } from '@/components/magicui/border-beam';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  CURATED_CHARITIES,
  Charity,
  formatStellarAddress,
  getCategoryColor,
  getCategoryLabel,
} from '@/lib/donation/charities';
import { Heart, CheckCircle, ExternalLink, Copy, Loader2 } from 'lucide-react';

interface DonationModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableAmount: string;
  onDonationComplete: (txHash: string, amount: string) => void;
}

type DonationStep = 'select' | 'confirm' | 'processing' | 'success' | 'error';

export default function DonationModal({
  isOpen,
  onClose,
  availableAmount,
  onDonationComplete,
}: DonationModalProps) {
  const [step, setStep] = useState<DonationStep>('select');
  const [selectedCharity, setSelectedCharity] = useState<Charity | null>(null);
  const [donationAmount, setDonationAmount] = useState('');
  const [txHash, setTxHash] = useState('');
  const [error, setError] = useState<string | null>(null);

  const resetState = () => {
    setStep('select');
    setSelectedCharity(null);
    setDonationAmount('');
    setTxHash('');
    setError(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleCharitySelect = (charity: Charity) => {
    setSelectedCharity(charity);
    setStep('confirm');
  };

  const handleConfirm = async () => {
    if (!selectedCharity || !donationAmount) return;

    setStep('processing');
    setError(null);

    try {
      // Simulate Stellar transaction submission
      // In production, this would use stellar-wallets-kit to sign and submit the actual transaction
      const result = await submitDonationTransaction(
        selectedCharity.address,
        donationAmount
      );

      if (result.success) {
        setTxHash(result.txHash!);
        setStep('success');
        onDonationComplete(result.txHash!, donationAmount);
      } else {
        throw new Error(result.error || 'Transaction failed');
      }
    } catch (err) {
      console.error('Donation failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to process donation');
      setStep('error');
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const openStellarExplorer = (txHash: string) => {
    // Testnet Horizon explorer URL
    window.open(`https://stellar.expert/explorer/testnet/tx/${txHash}`, '_blank');
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={handleClose}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {step === 'select' && 'Choose a Cause'}
            {step === 'confirm' && 'Confirm Donation'}
            {step === 'processing' && 'Processing Donation'}
            {step === 'success' && 'Thank You!'}
            {step === 'error' && 'Donation Failed'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {step === 'select' && 'Select a curated Stellar-based charity to donate your dust to.'}
            {step === 'confirm' && selectedCharity && `Donate to ${selectedCharity.name}`}
            {step === 'processing' && 'Please wait while we process your donation transaction...'}
            {step === 'success' && 'Your donation has been successfully processed on the Stellar network.'}
            {step === 'error' && 'There was an error processing your donation. Please try again.'}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Step 1: Select Charity */}
        {step === 'select' && (
          <div className="space-y-3 py-2 max-h-[400px] overflow-y-auto">
            {CURATED_CHARITIES.map((charity) => (
              <button
                key={charity.id}
                onClick={() => handleCharitySelect(charity)}
                className="w-full text-left p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{charity.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full bg-muted ${getCategoryColor(charity.category)}`}>
                        {getCategoryLabel(charity.category)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {charity.description}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2 font-mono">
                      {formatStellarAddress(charity.address)}
                    </p>
                  </div>
                  <Heart className="w-5 h-5 text-primary/50 flex-shrink-0 ml-2" />
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Step 2: Confirm Donation */}
        {step === 'confirm' && selectedCharity && (
          <div className="space-y-4 py-4">
            {/* Selected Charity Info */}
            <div className="p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-semibold">{selectedCharity.name}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full bg-background ${getCategoryColor(selectedCharity.category)}`}>
                  {getCategoryLabel(selectedCharity.category)}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {selectedCharity.description}
              </p>
              <p className="text-xs text-muted-foreground mt-2 font-mono break-all">
                {selectedCharity.address}
              </p>
            </div>

            {/* Donation Amount Input */}
            <div className="space-y-2">
              <Label htmlFor="amount">Donation Amount</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={availableAmount.replace('$', '')}
                  placeholder="0.00"
                  value={donationAmount}
                  onChange={(e) => setDonationAmount(e.target.value)}
                  className="pl-7"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Available: {availableAmount} • Enter an amount up to {availableAmount}
              </p>
            </div>
          </div>
        )}

        {/* Step 3: Processing */}
        {step === 'processing' && (
          <div className="py-8 flex flex-col items-center justify-center">
            <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Submitting transaction to Stellar network...</p>
          </div>
        )}

        {/* Step 4: Success */}
        {step === 'success' && (
          <div className="py-4 space-y-4">
            <div className="flex flex-col items-center text-center">
              <div className="p-3 rounded-full bg-green-500/10 mb-2">
                <CheckCircle className="w-10 h-10 text-green-500" />
              </div>
              <h3 className="text-lg font-semibold">Donation Successful!</h3>
              <p className="text-sm text-muted-foreground">
                Thank you for your generous donation of <span className="font-semibold text-foreground">${donationAmount}</span> to {selectedCharity?.name}
              </p>
            </div>

            {/* Transaction Receipt */}
            <div className="p-4 rounded-lg bg-muted/50 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Recipient</span>
                <span className="text-sm font-medium">{selectedCharity?.name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Amount</span>
                <span className="text-sm font-medium">${donationAmount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Network</span>
                <span className="text-sm font-medium">Stellar Testnet</span>
              </div>
              <div className="border-t border-border pt-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Transaction Hash</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground">
                      {txHash.slice(0, 8)}...{txHash.slice(-6)}
                    </span>
                    <button
                      onClick={() => copyToClipboard(txHash)}
                      className="p-1 hover:bg-background rounded"
                      title="Copy tx hash"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => openStellarExplorer(txHash)}
                      className="p-1 hover:bg-background rounded"
                      title="View on explorer"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Error */}
        {step === 'error' && (
          <div className="py-4">
            <div className="flex flex-col items-center text-center">
              <div className="p-3 rounded-full bg-destructive/10 mb-2">
                <Heart className="w-10 h-10 text-destructive" />
              </div>
              <h3 className="text-lg font-semibold">Something went wrong</h3>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </div>
        )}

        <AlertDialogFooter className="gap-2 sm:gap-0">
          {step === 'select' && (
            <AlertDialogCancel asChild>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
            </AlertDialogCancel>
          )}

          {step === 'confirm' && (
            <>
              <Button variant="outline" onClick={() => setStep('select')}>
                Back
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={!donationAmount || parseFloat(donationAmount) <= 0}
                className="relative overflow-hidden"
              >
                Donate ${donationAmount || '0.00'}
                <BorderBeam
                  size={40}
                  initialOffset={20}
                  className="from-transparent via-primary/50 to-transparent"
                  transition={{
                    type: 'spring',
                    stiffness: 60,
                    damping: 20,
                  }}
                />
              </Button>
            </>
          )}

          {step === 'success' && (
            <Button onClick={handleClose} className="w-full">
              Done
            </Button>
          )}

          {step === 'error' && (
            <>
              <AlertDialogCancel asChild>
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
              </AlertDialogCancel>
              <Button onClick={() => setStep('confirm')} variant="default">
                Try Again
              </Button>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Simulated transaction submission function
// In production, this would integrate with stellar-wallets-kit
async function submitDonationTransaction(
  destinationAddress: string,
  amount: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Simulate successful transaction (in production, this would actually submit to Stellar)
  // Generate a mock transaction hash
  const mockTxHash = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;

  // For demo purposes, always succeed
  // In production, implement actual Stellar transaction submission:
  // 1. Build the transaction using Stellar SDK
  // 2. Sign with user's wallet using stellar-wallets-kit
  // 3. Submit to Horizon API
  // 4. Return the transaction hash

  return {
    success: true,
    txHash: mockTxHash,
  };
}
