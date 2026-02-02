/**
 * OpenClaw Voice Bridge - Wake Lock
 * Keeps the screen on during a voice session
 */

export class WakeLock {
  private sentinel: WakeLockSentinel | null = null;

  async acquire(): Promise<boolean> {
    if (!('wakeLock' in navigator)) {
      console.warn('[WakeLock] Wake Lock API not supported');
      return false;
    }

    try {
      this.sentinel = await navigator.wakeLock.request('screen');
      console.log('[WakeLock] Acquired');

      // Re-acquire if visibility changes
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
      
      return true;
    } catch (err) {
      console.error('[WakeLock] Failed to acquire:', err);
      return false;
    }
  }

  release(): void {
    if (this.sentinel) {
      this.sentinel.release();
      this.sentinel = null;
      console.log('[WakeLock] Released');
    }
    
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
  }

  private handleVisibilityChange = async (): Promise<void> => {
    if (this.sentinel !== null && document.visibilityState === 'visible') {
      try {
        this.sentinel = await navigator.wakeLock.request('screen');
        console.log('[WakeLock] Re-acquired after visibility change');
      } catch (err) {
        console.error('[WakeLock] Failed to re-acquire:', err);
      }
    }
  };
}
