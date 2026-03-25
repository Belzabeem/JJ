'use client'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import CollectDustComponent from './CollectDust'
import SwapOnStellarComponent from './SwapOnStellar'
import ProcessAndTransferComponent from './Process&Transfer'
import { useUI } from '@/app/contexts/UIContext'

export default function TabsInSection() {
  const { activeTab, setActiveTab } = useUI()

  return (
    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'dust' | 'process' | 'swap')} className="w-full">
      <TabsList className="w-full">
        <TabsTrigger value="dust">Collect Dust</TabsTrigger>
        <TabsTrigger value="process">Process & Transfer</TabsTrigger>
        <TabsTrigger value="swap">Swap on Stellar</TabsTrigger>
      </TabsList>
      <TabsContent value="dust">
        <CollectDustComponent />
      </TabsContent>
      <TabsContent value="process">
        <ProcessAndTransferComponent />
      </TabsContent>
      <TabsContent value="swap">
        <SwapOnStellarComponent />
      </TabsContent>
    </Tabs>
  )
}
