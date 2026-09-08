/**
 * backgroundStreaming.ts
 * 
 * Calls the native Android BackgroundStreamingPlugin to start/stop a
 * foreground service that keeps the WebRTC stream alive when the app is
 * sent to the background.
 * 
 * On non-Android platforms (desktop browser) these are no-ops.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

interface BackgroundStreamingPlugin {
  startStreaming(): Promise<{ started: boolean }>;
  stopStreaming(): Promise<{ stopped: boolean }>;
}

const BackgroundStreaming = registerPlugin<BackgroundStreamingPlugin>('BackgroundStreaming', {
  // Web no-op shim — the browser app runs continuously on its own
  web: {
    startStreaming: async () => ({ started: true }),
    stopStreaming: async () => ({ stopped: true }),
  },
});

export const startBackgroundStreaming = async () => {
  if (Capacitor.isNativePlatform()) {
    try {
      await BackgroundStreaming.startStreaming();
      console.log('[BackgroundStreaming] Foreground service started');
    } catch (e) {
      console.warn('[BackgroundStreaming] Failed to start service:', e);
    }
  }
};

export const stopBackgroundStreaming = async () => {
  if (Capacitor.isNativePlatform()) {
    try {
      await BackgroundStreaming.stopStreaming();
      console.log('[BackgroundStreaming] Foreground service stopped');
    } catch (e) {
      console.warn('[BackgroundStreaming] Failed to stop service:', e);
    }
  }
};
