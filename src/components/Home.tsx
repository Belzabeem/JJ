import TabsInSection from './TabsIn'
import TransactionHistory from './TransactionHistory'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { Info } from 'lucide-react'

const InfoSection = () => {
    return (
        <HoverCard>
            <HoverCardTrigger>
                <Info/>
  </HoverCardTrigger>
  <HoverCardContent>
                <h1 className=' font-bold text-lg underline'>About Dust Aggregation</h1>
                <p>Dust refers to tiny amounts of cryptocurrency that are too small to be transacted due to network fees exceeding their value. This tool helps you reclaim value from these otherwise unusable assets by batching them together and moving them to Stellar&apos;s low-fee environment.</p>
  </HoverCardContent>
</HoverCard>
    )
}

export default function HomeSection() {
  return (
    <div className=" min-h-screen mx-6 my-4 rounded-3xl bg-accent">
      <div className=" p-4">
        <h1 className=" font-bold text-2xl mb-4 flex items-center gap-4">
          Cross-Chain Dust Aggregator <InfoSection/>
        </h1>
        <p className=" text-foreground">
          Collect small, unusable balances from different wallets, batch process
          them to reduce gas fees, and transfer to Stellar via Soroban.
        </p>
      </div>
      <div className=' px-2 lg:px-20'>
        <TabsInSection />
      </div>
      <div className='px-2 lg:px-20 pb-8'>
        <TransactionHistory />
      </div>
    </div>
  )
}
