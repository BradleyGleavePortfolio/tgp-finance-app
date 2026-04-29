// Unit tests for the Sentry release-identifier resolver. The release tag
// the running app sends with each event must match the release tagged by
// the EAS build at source-map upload time, otherwise stack traces stay
// minified.

const mockExpoConfig: {
  version?: string;
  ios?: { buildNumber?: string };
  android?: { versionCode?: number };
} = {};
let mockPlatformOS: 'ios' | 'android' = 'ios';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return mockExpoConfig;
    },
  },
}));

jest.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mockPlatformOS;
    },
    select<T>(spec: { ios?: T; android?: T; default?: T }): T | undefined {
      if (mockPlatformOS === 'ios') return spec.ios ?? spec.default;
      if (mockPlatformOS === 'android') return spec.android ?? spec.default;
      return spec.default;
    },
  },
}));

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  wrap: <T>(c: T): T => c,
  withScope: jest.fn(),
  captureException: jest.fn(),
  setUser: jest.fn(),
}));

import { resolveRelease } from './sentry';

describe('resolveRelease', () => {
  beforeEach(() => {
    mockExpoConfig.version = undefined;
    mockExpoConfig.ios = undefined;
    mockExpoConfig.android = undefined;
    mockPlatformOS = 'ios';
  });

  it('returns version+buildNumber on iOS when both are set', () => {
    mockExpoConfig.version = '1.0.0';
    mockExpoConfig.ios = { buildNumber: '3' };
    mockPlatformOS = 'ios';
    expect(resolveRelease()).toBe('1.0.0+3');
  });

  it('returns version+versionCode on Android when both are set', () => {
    mockExpoConfig.version = '1.0.0';
    mockExpoConfig.android = { versionCode: 7 };
    mockPlatformOS = 'android';
    expect(resolveRelease()).toBe('1.0.0+7');
  });

  it('falls back to plain version when the platform-specific build number is unset', () => {
    mockExpoConfig.version = '1.0.0';
    mockPlatformOS = 'ios';
    expect(resolveRelease()).toBe('1.0.0');
  });

  it('returns undefined when version itself is unset', () => {
    mockPlatformOS = 'ios';
    expect(resolveRelease()).toBeUndefined();
  });
});
