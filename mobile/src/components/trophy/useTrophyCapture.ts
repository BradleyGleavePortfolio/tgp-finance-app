// useTrophyCapture — captures TrophyArtifact view ref to PNG, saves + shares it.
// Gracefully no-ops if react-native-view-shot, expo-media-library, or
// expo-sharing are unavailable (e.g. Expo Go, web).
import { useRef, useCallback } from 'react';
import { View, Platform } from 'react-native';
import { track } from '../../lib/analytics';

// ─── Lazy-import wrappers (graceful no-op on missing modules) ────────────────

async function captureViewShot(ref: View): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { captureRef } = require('react-native-view-shot') as typeof import('react-native-view-shot');
    const uri = await captureRef(ref, {
      format: 'png',
      quality: 1,
      result: 'tmpfile',
      width: 1080,
      height: 1080,
    });
    return uri;
  } catch {
    return null;
  }
}

async function saveToLibrary(uri: string): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const MediaLibrary = require('expo-media-library') as {
      requestPermissionsAsync: () => Promise<{ status: string }>;
      saveToLibraryAsync: (uri: string) => Promise<void>;
    };
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') return false;
    await MediaLibrary.saveToLibraryAsync(uri);
    return true;
  } catch {
    return false;
  }
}

async function shareFile(uri: string): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Sharing = require('expo-sharing') as typeof import('expo-sharing');
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) return false;
    await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your trophy' });
    return true;
  } catch {
    return false;
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export interface TrophyCaptureResult {
  saved: boolean;
  shared: boolean;
  uri: string | null;
  error?: string;
}

/**
 * useTrophyCapture
 * Returns a ref to attach to TrophyArtifact, plus save/share helpers.
 *
 * @param surface  analytics surface label (e.g. 'milestone', 'goal', 'identity')
 */
export function useTrophyCapture(surface: string) {
  const viewRef = useRef<View>(null);

  /** Capture the trophy card to a local PNG URI */
  const capture = useCallback(async (): Promise<string | null> => {
    if (!viewRef.current) return null;
    return captureViewShot(viewRef.current as unknown as View);
  }, []);

  /** Capture → save to camera roll */
  const save = useCallback(async (): Promise<TrophyCaptureResult> => {
    const uri = await capture();
    if (!uri) return { saved: false, shared: false, uri: null, error: 'capture_failed' };
    const saved = await saveToLibrary(uri);
    track('trophy_generated', { surface, saved, shared: false });
    return { saved, shared: false, uri };
  }, [capture, surface]);

  /** Capture → share sheet */
  const share = useCallback(async (): Promise<TrophyCaptureResult> => {
    const uri = await capture();
    if (!uri) return { saved: false, shared: false, uri: null, error: 'capture_failed' };
    const shared = await shareFile(uri);
    track('trophy_shared', { surface });
    return { saved: false, shared, uri };
  }, [capture, surface]);

  /** Capture → save → share (save first so user always keeps a copy) */
  const saveAndShare = useCallback(async (): Promise<TrophyCaptureResult> => {
    const uri = await capture();
    if (!uri) return { saved: false, shared: false, uri: null, error: 'capture_failed' };
    const saved = await saveToLibrary(uri);
    const shared = await shareFile(uri);
    track('trophy_generated', { surface, saved, shared });
    if (shared) track('trophy_shared', { surface });
    return { saved, shared, uri };
  }, [capture, surface]);

  return { viewRef, capture, save, share, saveAndShare };
}
