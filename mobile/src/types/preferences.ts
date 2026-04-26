// UX Psychology Report #4: Preference-Controlled Personalization
// Shared types for user preferences

export type HomeModule = 'hero' | 'milestone' | 'trustcues' | 'secondary' | 'community';
export type NotificationCadence = 'daily' | 'weekly' | 'off';
export type MotivationalTone = 'gentle' | 'direct' | 'drill';
export type Currency = 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD';
export type FirstDayOfWeek = 0 | 1 | 6;

export interface UserPreferences {
  homeModules: HomeModule[];
  notificationCadence: NotificationCadence;
  motivationalTone: MotivationalTone;
  currency: Currency;
  firstDayOfWeek: FirstDayOfWeek;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  homeModules: ['hero', 'milestone', 'trustcues', 'secondary'],
  notificationCadence: 'weekly',
  motivationalTone: 'direct',
  currency: 'USD',
  firstDayOfWeek: 1,
};

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  CAD: 'CA$',
  AUD: 'A$',
};
