// Formatters for currency, percentage, dates, and numbers

// UX Psychology Report #4: Preference-Controlled Personalization — currency symbols
export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', CAD: 'CA$', AUD: 'A$',
};

/**
 * Format a number as currency, respecting the user's currency preference.
 * Defaults to USD ($) when no currency option is provided.
 * e.g. formatCurrency(12345.67) → "$12,345.67"
 * e.g. formatCurrency(12345.67, { currency: 'EUR' }) → "€12,345.67"
 */
export function formatCurrency(
  value: number,
  options?: { compact?: boolean; decimals?: number; showSign?: boolean; currency?: string }
): string {
  const { compact = false, decimals = 2, showSign = false, currency = 'USD' } = options || {};
  const sym = CURRENCY_SYMBOLS[currency] ?? '$';
  const abs = Math.abs(value);
  const sign = showSign ? (value >= 0 ? '+' : '-') : value < 0 ? '-' : '';

  if (compact) {
    if (abs >= 1_000_000) {
      return `${sign}${sym}${(abs / 1_000_000).toFixed(1)}M`;
    }
    if (abs >= 1_000) {
      return `${sign}${sym}${(abs / 1_000).toFixed(1)}K`;
    }
  }

  return `${sign}${sym}${abs.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/**
 * Format a number as a percentage
 * e.g. 0.1567 → "15.67%"
 * e.g. 15.67 (raw percent) → "15.67%" (pass asDecimal=false)
 */
export function formatPercent(value: number, decimals = 1, asDecimal = false): string {
  const percent = asDecimal ? value * 100 : value;
  return `${percent.toFixed(decimals)}%`;
}

/**
 * Format months into human readable duration
 * e.g. 18 → "1 yr 6 mo"
 */
export function formatMonths(months: number): string {
  if (months <= 0) return 'Now';
  if (months < 1) return 'This month';
  const years = Math.floor(months / 12);
  const remainingMonths = Math.round(months % 12);

  if (years === 0) return `${remainingMonths} mo`;
  if (remainingMonths === 0) return `${years} yr`;
  return `${years} yr ${remainingMonths} mo`;
}

/**
 * Format a date string
 * e.g. "2026-03-13" → "Mar 13, 2026"
 */
export function formatDate(dateStr: string, style: 'short' | 'medium' | 'long' = 'medium'): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'Invalid date';

  const options: Intl.DateTimeFormatOptions = {
    short: { month: 'numeric' as const, day: 'numeric' as const },
    medium: { month: 'short' as const, day: 'numeric' as const, year: 'numeric' as const },
    long: { month: 'long' as const, day: 'numeric' as const, year: 'numeric' as const },
  }[style];

  return date.toLocaleDateString('en-US', options);
}

/**
 * Format relative time
 * e.g. "2 hours ago", "Yesterday", "3 days ago"
 */
export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 30) return `${diffDays} days ago`;
  return formatDate(dateStr);
}

/**
 * Format APR as string with % sign
 * e.g. 24.99 → "24.99% APR"
 */
export function formatAPR(apr: number): string {
  return `${apr.toFixed(2)}% APR`;
}

/**
 * Get greeting based on time of day
 */
export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Format a large number with commas
 */
export function formatNumber(value: number, decimals = 0): string {
  return value.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Format net worth change
 */
export function formatChange(value: number): { text: string; isPositive: boolean } {
  const isPositive = value >= 0;
  const text = `${isPositive ? '+' : ''}${formatCurrency(value, { decimals: 0 })} today`;
  return { text, isPositive };
}

/**
 * Truncate text to a given length
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Format interest bleed per second
 */
export function formatInterestPerSecond(dailyInterest: number): string {
  const perSecond = dailyInterest / 86400;
  if (perSecond < 0.01) return '$0.00';
  return `$${perSecond.toFixed(4)}`;
}
