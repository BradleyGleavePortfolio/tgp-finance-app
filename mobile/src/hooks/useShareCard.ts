// useShareCard — wraps react-native-view-shot + expo-sharing into a single call.
// Captures a referenced View into a PNG and hands it to the native share sheet.
import { useCallback, useRef } from 'react';
import { Alert, Platform, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

interface ShareOptions {
  dialogTitle?: string;
  mimeType?: string;
  filename?: string;
}

export function useShareCard() {
  const viewRef = useRef<View>(null);

  const share = useCallback(async (opts: ShareOptions = {}) => {
    if (!viewRef.current) {
      Alert.alert('Share unavailable', 'The card is still rendering. Try again in a moment.');
      return false;
    }

    try {
      const uri = await captureRef(viewRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
        // Android occasionally misses the first capture right after layout; a small
        // re-attempt inside the view-shot API is handled upstream — if this throws
        // on Android, the catch will surface a friendly message.
      });

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert(
          'Sharing not available',
          Platform.OS === 'android'
            ? 'No compatible sharing app is installed.'
            : 'Sharing is not available on this device.',
        );
        return false;
      }

      await Sharing.shareAsync(uri, {
        dialogTitle: opts.dialogTitle ?? 'Share',
        mimeType: opts.mimeType ?? 'image/png',
        UTI: 'public.png',
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Could not share', message);
      return false;
    }
  }, []);

  return { viewRef, share };
}
