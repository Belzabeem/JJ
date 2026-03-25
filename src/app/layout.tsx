import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'
import HeaderSection from '@/components/Header'
import StarknetProviderWrapper from './providers/StarknetProvider'
import { WalletProvider } from '@/context/WalletContext'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

const defaultUrl = process.env.VERCEL_URL
  ? `https://dustaggregator.vercel.app/`
  : 'http://localhost:3002'

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: 'Dust Accelerator',
  description:
    'A platform that allows you to collect small, unusable balances from different wallets, batch process them to reduce gas fees, and transfer to Stellar via Soroban.',

  keywords: [
    'crypto',
    'dust aggregation',
    'wallet aggregator',
    'batch processing',
    'gas fee optimization',
    'Stellar',
    'Soroban',
    'micro crypto balances',
    'crypto wallet cleaner',
    'cross-chain transactions',
    'crypto batching',
    'reduce gas fees',
    'Stellar integration',
    'Soroban transfer',
    'crypto efficiency',
    'blockchain tools',
    'wallet balance manager',
  ],

  authors: [{ name: 'Dust Accelerator Team' }],
  creator: 'Dust Accelerator',

  openGraph: {
    title: 'Dust Accelerator - Batch dust and send via Stellar.',
    description:
      'A platform that allows you to collect small, unusable balances from different wallets, batch process them to reduce gas fees, and transfer to Stellar via Soroban.',
    url: 'https://dustaggregator.vercel.app/',
    siteName: 'Dust-Accelerator',
    images: [
      {
        url: '/images/dustLogo.png', // Ensure this path works in prod
        width: 1200,
        height: 630,
        alt: 'Dust-Accelerator Logo',
      },
    ],
    locale: 'en_KE',
    type: 'website',
  },

  twitter: {
    card: 'summary_large_image',
    title:
      'Dust Accelerator - Batch dust and send via Stellar.',
    description:
      'A platform that allows you to collect small, unusable balances from different wallets, batch process them to reduce gas fees, and transfer to Stellar via Soroban.',
    images: ['/images/dustLogo.png'],
    creator: 'https://x.com/JJ638055109535', // optional if you have a Twitter/X handle
  },

  icons: {
    icon: '/images/dustLogo.png',
    shortcut: '/images/dustLogo.png',
    apple: '/images/dustLogo.png', // optional
  },

  alternates: {
    canonical: 'https://dustaggregator.vercel.app/',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <WalletProvider>
            <StarknetProviderWrapper>
              <HeaderSection />
              {children}
            </StarknetProviderWrapper>
          </WalletProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
