'use client';

import { CheckCircle, Copy, ExternalLink, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface DonationReceiptProps {
  txHash: string;
  amount: string;
  recipientName: string;
  recipientAddress: string;
  onClose?: () => void;
}

export default function DonationReceipt({
  txHash,
  amount,
  recipientName,
  recipientAddress,
  onClose,
}: DonationReceiptProps) {
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const openStellarExplorer = (txHash: string) => {
    window.open(`https://stellar.expert/explorer/testnet/tx/${txHash}`, '_blank');
  };

  return (
    <Card className="border-green-500/20 bg-gradient-to-br from-green-500/5 to-transparent">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-full bg-green-500/10">
            <CheckCircle className="w-5 h-5 text-green-500" />
          </div>
          <div>
            <CardTitle className="text-lg">Donation Successful!</CardTitle>
            <CardDescription>
              Thank you for supporting {recipientName}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Transaction Details */}
        <div className="p-4 rounded-lg bg-muted/50 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Amount</span>
            <span className="text-sm font-semibold text-green-500">+${amount}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Recipient</span>
            <span className="text-sm font-medium">{recipientName}</span>
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
                  className="p-1.5 hover:bg-background rounded transition-colors"
                  title="Copy tx hash"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => openStellarExplorer(txHash)}
                  className="p-1.5 hover:bg-background rounded transition-colors"
                  title="View on explorer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Share Section */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Heart className="w-4 h-4 text-primary" />
          <span>Your dust is now making a difference!</span>
        </div>
      </CardContent>
      {onClose && (
        <CardFooter>
          <Button onClick={onClose} className="w-full">
            Done
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
