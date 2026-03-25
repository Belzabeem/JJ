'use client'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from '@/components/ui/card'
import { BorderBeam } from '@/components/magicui/border-beam'
import { ArrowRight } from 'lucide-react'
import { useUI } from '@/app/contexts/UIContext'

export default function ProcessingButtonCardComponent() {
  const { setActiveTab } = useUI()

  return (
    <Card className="relative overflow-hidden p-2 mt-2">
      <CardContent className=' flex items-center justify-between '>
        <div>
            <CardDescription>
              Total Selected Dust Value
                  </CardDescription>
            <CardTitle>$0.00</CardTitle>
                  
        </div>
        <div>
            <Button
              className="relative overflow-hidden"
              size="lg"
              variant="outline"
              onClick={() => setActiveTab('process')}
            >
              Continue to Processing <ArrowRight/>
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
        </div>
      </CardContent>

    </Card>
  )
}
