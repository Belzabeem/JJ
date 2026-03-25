// ─── Curated Stellar-based charities / public-good addresses ──────────────────
// These are verified Stellar addresses for donations after dust withdrawal.

export interface Charity {
  id: string;
  name: string;
  description: string;
  address: string;
  category: 'education' | 'healthcare' | 'environment' | 'community';
  logo?: string;
}

// Curated list of Stellar-based charity addresses (testnet addresses for demo)
export const CURATED_CHARITIES: Charity[] = [
  {
    id: 'water-project',
    name: 'The Water Project',
    description: 'Providing clean, safe water to communities in sub-Saharan Africa through sustainable solutions.',
    address: 'GCFUCZJHDKMKHBKLLWSBF7DZHCEDOYQBYGLSBK7SEDK5V3WSLCM4E5ZZ',
    category: 'healthcare',
  },
  {
    id: 'khan-academy',
    name: 'Khan Academy',
    description: 'Free world-class education for anyone, anywhere. Empowering learners worldwide.',
    address: 'GDEMOOS2J3TSYQBOKBTO55S3DSZXGDB7GSFGE4TW7XGGXAWLBZZTQSLP',
    category: 'education',
  },
  {
    id: 'trees-for-all',
    name: 'Trees for All',
    description: 'Planting trees worldwide to combat deforestation and climate change. Every XLM plants hope.',
    address: 'GCTREE4LLGZQBJOUY5Z2BQJQVTDNSSXEWBZGSKQ43LMFQVNBODNBQNZE',
    category: 'environment',
  },
];

// Default donation amount (can be customized by user)
export const DEFAULT_DONATION_PERCENTAGE = 10; // 10% of withdrawal amount

// Helper to format Stellar address for display
export function formatStellarAddress(address: string): string {
  if (address.length <= 8) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

// Helper to get category color
export function getCategoryColor(category: Charity['category']): string {
  const colors = {
    education: 'text-blue-500',
    healthcare: 'text-red-500',
    environment: 'text-green-500',
    community: 'text-purple-500',
  };
  return colors[category];
}

// Helper to get category label
export function getCategoryLabel(category: Charity['category']): string {
  const labels = {
    education: 'Education',
    healthcare: 'Healthcare',
    environment: 'Environment',
    community: 'Community',
  };
  return labels[category];
}
