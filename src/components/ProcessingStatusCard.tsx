'use client'

import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Progress } from "@/components/ui/progress"
import { Button } from './ui/button'
import { BorderBeam } from './magicui/border-beam'
import { useUI } from '@/app/contexts/UIContext'
import { useState } from 'react'

export default function ProcessingStatusCardComponent() {
  const { setActiveTab } = useUI()
  const [progress, setProgress] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)

  const handleStartProcessing = () => {
    setIsProcessing(true)
    
    // Simulate processing progress
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval)
          // Auto-advance to Swap on Stellar when complete
          setActiveTab('swap')
          return 100
        }
        return prev + 10
      })
    }, 500)
  }

  return (
    <Card className=' mb-4'>
      <CardHeader>
        <CardTitle>Processing Status</CardTitle>
        <Progress value={progress} className=' mt-4' />
        <CardAction>Step {Math.ceil(progress / 20)} of 5</CardAction>
      </CardHeader>
      <CardContent>
        <ol className=' list-decimal pl-4 space-y-2'>
          <li className={progress >= 20 ? 'text-green-500' : ''}>Collecting dust from connected wallets</li>
          <li className={progress >= 40 ? 'text-green-500' : ''}>Optimizing batch transactions</li>
          <li className={progress >= 60 ? 'text-green-500' : ''}>Processing batch transactions </li>
          <li className={progress >= 80 ? 'text-green-500' : ''}>Transferring to Stellar via Soroban</li>
          <li className={progress >= 100 ? 'text-green-500' : ''}>Complete</li>
        </ol>
      </CardContent>
      <CardFooter>
        <Button
          className="relative overflow-hidden w-full !bg-accent"
          size="lg"
          variant="outline"
          onClick={handleStartProcessing}
          disabled={isProcessing && progress < 100}
        >
          {progress >= 100 ? 'Processing Complete!' : isProcessing ? 'Processing...' : 'Start Processing'}
          <BorderBeam
            size={40}
            initialOffset={20}
            className="from-transparent via-yellow-500 to-transparent"
            transition={{
              type: 'tween',
              stiffness: 60,
              damping: 20,
            }}
          />
        </Button>
      </CardFooter>
    </Card>
  )
}
