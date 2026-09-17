/**
 * screenCapture.ts
 *
 * JavaScript bridge for the native Android ScreenCapturePlugin.
 * On Android, uses MediaProjection API (real screen capture).
 * On web (desktop browsers), falls through to native getDisplayMedia.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

interface ScreenCapturePlugin {
  requestCapture(): Promise<{ granted: boolean }>;
  stopCapture(): Promise<{ stopped: boolean }>;
  checkOverlayPermission(): Promise<{ granted: boolean }>;
  requestOverlayPermission(): Promise<{ requested: boolean }>;
  addListener(
    event: 'screenFrame',
    listener: (data: { frame: string }) => void
  ): Promise<{ remove: () => void }>;
  addListener(
    event: 'captureStopped',
    listener: () => void
  ): Promise<{ remove: () => void }>;
  removeAllListeners(): Promise<void>;
}

const ScreenCaptureNative = registerPlugin<ScreenCapturePlugin>('ScreenCapture', {
  // Web no-op stubs — desktop will use getDisplayMedia directly
  web: {
    requestCapture: async () => ({ granted: false }),
    stopCapture: async () => ({ stopped: true }),
    checkOverlayPermission: async () => ({ granted: false }),
    requestOverlayPermission: async () => ({ requested: false }),
    addListener: async (_event: string, _listener: any) => ({ remove: () => {} }),
    removeAllListeners: async () => {},
  },
});

export const isAndroidNative = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

let frameSubscribers: Array<(base64Jpeg: string) => void> = [];

export const onScreenFrame = (callback: (base64Jpeg: string) => void) => {
  frameSubscribers.push(callback);
  return () => {
    frameSubscribers = frameSubscribers.filter((cb) => cb !== callback);
  };
};

/**
 * Captures the Android screen via MediaProjection and returns a MediaStream
 * backed by a hidden canvas that receives JPEG frames from the native service.
 */
export const getAndroidScreenStream = async (): Promise<MediaStream | null> => {
  if (!isAndroidNative()) return null;

  try {
    // Attach canvas to DOM so Chromium's paint and compositor pipeline keeps running
    let canvas = document.getElementById('mathpro-screen-canvas') as HTMLCanvasElement;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'mathpro-screen-canvas';
      canvas.style.position = 'fixed';
      canvas.style.left = '-9999px';
      canvas.style.top = '-9999px';
      canvas.style.width = '1px';
      canvas.style.height = '1px';
      canvas.style.opacity = '0';
      canvas.style.pointerEvents = 'none';
      canvas.style.zIndex = '-1';
      document.body.appendChild(canvas);
    }

    canvas.width = 360;
    canvas.height = 640;
    const ctx = canvas.getContext('2d', { alpha: false })!;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Capture the canvas as a MediaStream at 10 fps
    const stream = (canvas as any).captureStream(10) as MediaStream;
    const videoTrack = stream.getVideoTracks()[0];

    // Prepare listener BEFORE requesting capture so early frames are never missed
    await ScreenCaptureNative.removeAllListeners();

    await ScreenCaptureNative.addListener('screenFrame', (data) => {
      if (!data?.frame) return;

      // Broadcast to socket frame subscribers
      for (const cb of frameSubscribers) {
        try {
          cb(data.frame);
        } catch (e) {
          // ignore subscriber errors
        }
      }

      const img = new Image();
      img.onload = () => {
        // Only resize canvas if dimensions actually changed
        if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
        }
        ctx.drawImage(img, 0, 0);

        // Force paint into MediaStreamTrack if supported by Chromium
        if (videoTrack && typeof (videoTrack as any).requestFrame === 'function') {
          try {
            (videoTrack as any).requestFrame();
          } catch (ignored) {}
        }
      };
      img.src = 'data:image/jpeg;base64,' + data.frame;
    });

    const { granted } = await ScreenCaptureNative.requestCapture();
    if (!granted) {
      await ScreenCaptureNative.removeAllListeners();
      return null;
    }

    return stream;
  } catch (err) {
    console.error('[ScreenCapture] Failed to start native screen capture:', err);
    return null;
  }
};


export const checkOverlayPermission = async (): Promise<boolean> => {
  if (!isAndroidNative()) return false;
  try {
    const { granted } = await ScreenCaptureNative.checkOverlayPermission();
    return Boolean(granted);
  } catch (e) {
    console.warn('[ScreenCapture] Check overlay permission failed:', e);
    return false;
  }
};

export const requestOverlayPermission = async (): Promise<void> => {
  if (!isAndroidNative()) return;
  try {
    await ScreenCaptureNative.requestOverlayPermission();
  } catch (e) {
    console.warn('[ScreenCapture] Request overlay permission failed:', e);
  }
};

export const onScreenCaptureStopped = (callback: () => void) => {
  if (!isAndroidNative()) return () => {};
  let listenerHandle: { remove: () => void } | null = null;
  ScreenCaptureNative.addListener('captureStopped', () => {
    callback();
  }).then((handle) => {
    listenerHandle = handle;
  });

  return () => {
    if (listenerHandle) {
      listenerHandle.remove();
    }
  };
};

export const stopAndroidScreenCapture = async () => {
  if (!isAndroidNative()) return;
  try {
    frameSubscribers = [];
    await ScreenCaptureNative.removeAllListeners();
    await ScreenCaptureNative.stopCapture();
    const canvas = document.getElementById('mathpro-screen-canvas');
    if (canvas && canvas.parentNode) {
      canvas.parentNode.removeChild(canvas);
    }
  } catch (e) {
    console.warn('[ScreenCapture] Stop failed:', e);
  }
};

