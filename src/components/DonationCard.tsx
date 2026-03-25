'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BorderBeam } from '@/components/magicui/border-beam';
import { Heart, Gift, X } from 'lucide-react';
import DonationModal from './DonationModal';

interface DonationCardProps {
  /** Amount available for donation (e.g., "$1.59") */
  amount: string;
  /** Whether the withdrawal was successful */
  showDonationCard?: boolean;
  /** Callback when donation card is dismissed */
  onDismiss?: () => void;
  /** Callback when donation is completed */
  onDonationComplete?: (txHash: string, amount: string) => void;
}

export default function DonationCard({
  amount,
  showDonationCard = true,
  onDismiss,
  onDonationComplete,
}: DonationCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  if (!showDonationCard || isDismissed) {
    return null;
  }

  const handleDismiss = () => {
    setIsDismissed(true);
    onDismiss?.();
  };

  const handleDonationComplete = (txHash: string, donatedAmount: string) => {
    setIsModalOpen(false);
    onDonationComplete?.(txHash, donatedAmount);
  };

  return (
    <>
      <Card className="relative overflow-hidden mt-4 border-2 border-dashed border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-full bg-primary/10">
                <Gift className="w-5 h-5 text-primary" />
              </div>
              <CardTitle className="text-lg">Donate your dust instead?</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="h-8 w-8 p-0"
              aria-label="Dismiss donation card"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          <CardDescription className="pt-2">
            Your aggregated dust ({amount}) could make a difference. Support a curated
            Stellar-based cause and turn worthless dust into meaningful impact.
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="flex flex-wrap gap-2 mb-4">
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Heart className="w-4 h-4 text-red-500" />
              <span>Education</span>
            </div>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Heart className="w-4 h-4 text-green-500" />
              <span>Healthcare</span>
            </div>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Heart className="w-4 h-4 text-blue-500" />
              <span>Environment</span>
            </div>
          </div>
        </CardContent>
        <CardFooter className="pt-0">
          <Button
            onClick={() => setIsModalOpen(true)}
            className="w-full relative overflow-hidden"
            variant="default"
            size="lg"
          >
            Choose a Cause to Support
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
        </CardFooter>

        {/* Subtle decorative element */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/10 to-transparent rounded-bl-full pointer-events-none" />
      </Card>

      <DonationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        availableAmount={amount}
        onDonationComplete={handleDonationComplete}
      />
    </>
  );
}
