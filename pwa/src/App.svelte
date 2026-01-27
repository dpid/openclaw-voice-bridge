<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { appState, transcript, response, errorMessage, connected } from './lib/stores';
  import { unlockAudioContext } from './lib/audio';
  import { ProxyWebSocket } from './lib/websocket';
  import { AudioPlayer } from './lib/audio';
  import { WakeLock } from './lib/wakelock';
  import { VoiceActivityDetector, audioToWav } from './lib/vad';
  import type { AppState } from './lib/types';

  // Configuration - uses env vars in production, falls back to localhost for dev
  const PROXY_URL = import.meta.env.VITE_PROXY_URL || 'ws://localhost:3001/ws';
  const isProxyConfigured = !!import.meta.env.VITE_PROXY_URL;
  
  // Auth token from localStorage (user enters once)
  const AUTH_STORAGE_KEY = 'ear_auth_token';
  let authToken = localStorage.getItem(AUTH_STORAGE_KEY) || '';
  let showAuthPrompt = !authToken;

  // State
  let vad: VoiceActivityDetector | null = null;
  let ws: ProxyWebSocket | null = null;
  let player: AudioPlayer | null = null;
  let wakeLock: WakeLock | null = null;
  let sessionActive = false;
  
  // Mute states
  let micMuted = false;   // Mute Me - stops sending audio
  let ttsEnabled = true;  // Mute You - stops TTS playback

  // Reactive state from stores
  let currentState: AppState = 'idle';
  let currentTranscript = '';
  let currentResponse = '';
  let currentError = '';
  let isConnected = false;

  // Subscribe to stores
  appState.subscribe(v => currentState = v);
  transcript.subscribe(v => currentTranscript = v);
  response.subscribe(v => currentResponse = v);
  errorMessage.subscribe(v => currentError = v);
  connected.subscribe(v => isConnected = v);

  // Initialize WebSocket with handlers
  function initWebSocket(): void {
    ws = new ProxyWebSocket(PROXY_URL, {
      onConnect: () => {
        connected.set(true);
        console.log('[App] WebSocket connected');
        // Authenticate first
        if (authToken) {
          ws?.sendAuth(authToken);
        }
        // Then send initial TTS state
        ws?.sendTtsState(ttsEnabled);
      },
      onDisconnect: () => {
        connected.set(false);
        console.log('[App] WebSocket disconnected');
      },
      onTranscript: (text) => {
        transcript.set(text);
      },
      onResponse: (text) => {
        response.set(text);
      },
      onAudioChunk: (base64) => {
        player?.addChunk(base64);
      },
      onAudioEnd: () => {
        if (ttsEnabled) {
          appState.set('speaking');
          player?.play();
        } else {
          // TTS disabled - skip to listening
          appState.set('listening');
          vad?.resume();
        }
      },
      onStatus: (state) => {
        if (state === 'transcribing' || state === 'thinking') {
          appState.set('processing');
        } else if (state === 'speaking') {
          appState.set('speaking');
        }
      },
      onError: (message) => {
        errorMessage.set(message);
        appState.set('error');
        // Resume listening after error
        setTimeout(() => {
          if (sessionActive) {
            appState.set('listening');
            vad?.resume();
          }
        }, 2000);
      },
    });
  }

  // Initialize Audio Player
  function initPlayer(): void {
    player = new AudioPlayer(() => {
      console.log('[App] Playback ended, resuming VAD');
      if (sessionActive) {
        appState.set('listening');
        vad?.resume();
      }
    });
  }

  // Initialize VAD with handlers
  function initVAD(): void {
    vad = new VoiceActivityDetector({
      onSpeechStart: () => {
        if (!micMuted) {
          appState.set('recording');
        }
      },
      onSpeechEnd: (audio) => {
        if (!sessionActive || micMuted) return;
        
        // Pause VAD while processing
        vad?.pause();
        appState.set('processing');
        
        // Convert to WAV and send
        const base64 = audioToWav(audio);
        ws?.sendAudio(base64);
      },
    });
  }
  
  // Toggle mic mute
  function toggleMicMute(): void {
    micMuted = !micMuted;
    if (micMuted && currentState === 'recording') {
      appState.set('listening');
    }
  }
  
  // Toggle TTS
  function toggleTTS(): void {
    ttsEnabled = !ttsEnabled;
    if (!ttsEnabled) {
      player?.stop();
    }
    // Notify server of TTS state change
    ws?.sendTtsState(ttsEnabled);
  }
  
  // Auth token management
  let tokenInput = '';
  
  function saveAuthToken(): void {
    if (tokenInput.trim()) {
      authToken = tokenInput.trim();
      localStorage.setItem(AUTH_STORAGE_KEY, authToken);
      showAuthPrompt = false;
      tokenInput = '';
    }
  }
  
  function clearAuthToken(): void {
    authToken = '';
    localStorage.removeItem(AUTH_STORAGE_KEY);
    showAuthPrompt = true;
    endSession();
  }

  // Start session
  async function startSession(): Promise<void> {
    console.log('[App] Starting session...');
    
    try {
      // Unlock audio on user gesture (must be first!)
      await unlockAudioContext();
      
      // Clear any previous state
      transcript.set('');
      response.set('');
      errorMessage.set('');
      
      // Acquire wake lock
      wakeLock = new WakeLock();
      await wakeLock.acquire();
      
      // Connect WebSocket
      ws?.connect();
      
      // Start VAD
      await vad?.start();
      
      sessionActive = true;
      appState.set('listening');
      
      console.log('[App] Session started');
    } catch (err) {
      console.error('[App] Failed to start session:', err);
      errorMessage.set(err instanceof Error ? err.message : 'Failed to start session');
      appState.set('error');
    }
  }

  // End session
  function endSession(): void {
    console.log('[App] Ending session...');
    
    sessionActive = false;
    
    // Stop VAD
    vad?.stop();
    
    // Stop audio playback
    player?.stop();
    
    // Disconnect WebSocket
    ws?.disconnect();
    
    // Release wake lock
    wakeLock?.release();
    wakeLock = null;
    
    appState.set('idle');
    
    console.log('[App] Session ended');
  }

  // Lifecycle
  onMount(() => {
    initWebSocket();
    initPlayer();
    initVAD();
  });

  onDestroy(() => {
    endSession();
  });

  // State-based styling
  function getStateClass(state: AppState): string {
    switch (state) {
      case 'listening': return 'state-listening';
      case 'recording': return 'state-recording';
      case 'processing': return 'state-processing';
      case 'speaking': return 'state-speaking';
      case 'error': return 'state-error';
      default: return 'state-idle';
    }
  }

  function getStateText(state: AppState): string {
    switch (state) {
      case 'idle': return 'Tap to Start';
      case 'listening': return 'Listening...';
      case 'recording': return 'Recording...';
      case 'processing': return 'Thinking...';
      case 'speaking': return 'Speaking...';
      case 'error': return 'Error';
      default: return '';
    }
  }
</script>

<main class={getStateClass(currentState)}>
  <div class="container">
    <!-- Status Indicator -->
    <div class="indicator">
      <div class="icon">🌀</div>
    </div>
    
    <!-- State Text -->
    <div class="status">
      {getStateText(currentState)}
    </div>
    
    <!-- Connection Status -->
    {#if currentState !== 'idle'}
      <div class="connection" class:connected={isConnected}>
        {#if !isProxyConfigured}
          ⚠ Proxy not configured
        {:else if isConnected}
          ● Connected
        {:else}
          ○ Disconnected
        {/if}
      </div>
    {/if}
    
    <!-- Auth prompt -->
    {#if showAuthPrompt}
      <div class="auth-prompt">
        <div class="auth-title">🔐 Enter Access Token</div>
        <input 
          type="password" 
          class="auth-input" 
          placeholder="Token"
          bind:value={tokenInput}
          onkeydown={(e) => e.key === 'Enter' && saveAuthToken()}
        />
        <button class="btn auth-btn" onclick={saveAuthToken}>
          Unlock
        </button>
      </div>
    {/if}
    
    <!-- Demo mode notice -->
    {#if !isProxyConfigured && currentState === 'idle' && !showAuthPrompt}
      <div class="demo-notice">
        Demo Mode — proxy URL not configured.<br/>
        VAD and UI can be tested, but voice won't connect.
      </div>
    {/if}
    
    <!-- Transcript -->
    {#if currentTranscript}
      <div class="transcript">
        <span class="label">You:</span>
        <span class="text">{currentTranscript}</span>
      </div>
    {/if}
    
    <!-- Response -->
    {#if currentResponse}
      <div class="response">
        <span class="label">Vincent:</span>
        <span class="text">{currentResponse}</span>
      </div>
    {/if}
    
    <!-- Error -->
    {#if currentError}
      <div class="error">
        {currentError}
      </div>
    {/if}
    
    <!-- Controls -->
    <div class="controls">
      {#if currentState === 'idle' && !showAuthPrompt}
        <button class="btn start" onclick={startSession}>
          Start Session
        </button>
        <button class="btn-logout" onclick={clearAuthToken} title="Change token">
          🔓
        </button>
      {:else}
        <!-- Mute toggles -->
        <div class="mute-controls">
          <button 
            class="btn-mute" 
            class:muted={micMuted}
            onclick={toggleMicMute}
            title={micMuted ? 'Unmute mic' : 'Mute mic'}
          >
            {micMuted ? '🔇' : '🎤'}
            <span class="mute-label">{micMuted ? 'Mic Off' : 'Mic On'}</span>
          </button>
          <button 
            class="btn-mute" 
            class:muted={!ttsEnabled}
            onclick={toggleTTS}
            title={ttsEnabled ? 'Mute TTS' : 'Unmute TTS'}
          >
            {ttsEnabled ? '🔊' : '🔇'}
            <span class="mute-label">{ttsEnabled ? 'TTS On' : 'TTS Off'}</span>
          </button>
        </div>
        
        <button class="btn end" onclick={endSession}>
          End Session
        </button>
      {/if}
    </div>
  </div>
  
</main>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #1a1a2e;
    color: #eee;
    min-height: 100vh;
    min-height: 100dvh;
  }

  :global(#app) {
    min-height: 100vh;
    min-height: 100dvh;
  }

  main {
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    box-sizing: border-box;
    transition: background-color 0.3s ease;
  }

  .container {
    text-align: center;
    max-width: 400px;
    width: 100%;
  }

  /* Indicator */
  .indicator {
    margin-bottom: 24px;
  }

  .icon {
    font-size: 80px;
    animation: pulse 2s ease-in-out infinite;
  }

  /* State-based backgrounds */
  .state-idle {
    background: #1a1a2e;
  }

  .state-listening {
    background: #1a2a3e;
  }

  .state-recording {
    background: #2a1a3e;
  }

  .state-processing {
    background: #1a3a3e;
  }

  .state-speaking {
    background: #2a3a1e;
  }

  .state-error {
    background: #3a1a1e;
  }

  /* State-based animations */
  .state-idle .icon {
    animation: none;
    opacity: 0.6;
  }

  .state-listening .icon {
    animation: pulse 2s ease-in-out infinite;
  }

  .state-recording .icon {
    animation: bounce 0.5s ease-in-out infinite;
  }

  .state-processing .icon {
    animation: spin 1s linear infinite;
  }

  .state-speaking .icon {
    animation: wave 0.5s ease-in-out infinite;
  }

  .state-error .icon {
    animation: shake 0.5s ease-in-out;
  }

  @keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 0.8; }
    50% { transform: scale(1.05); opacity: 1; }
  }

  @keyframes bounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-10px); }
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @keyframes wave {
    0%, 100% { transform: scale(1); }
    25% { transform: scale(1.1) rotate(-5deg); }
    75% { transform: scale(1.1) rotate(5deg); }
  }

  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-5px); }
    75% { transform: translateX(5px); }
  }

  /* Status text */
  .status {
    font-size: 24px;
    font-weight: 500;
    margin-bottom: 16px;
    color: #fff;
  }

  /* Connection indicator */
  .connection {
    font-size: 12px;
    color: #f55;
    margin-bottom: 24px;
  }

  .connection.connected {
    color: #5f5;
  }

  /* Demo mode notice */
  .demo-notice {
    background: rgba(255, 200, 50, 0.1);
    border: 1px solid rgba(255, 200, 50, 0.3);
    border-radius: 12px;
    padding: 12px 16px;
    margin-bottom: 16px;
    color: #fc8;
    font-size: 13px;
    line-height: 1.4;
  }

  /* Transcript and Response */
  .transcript, .response {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 12px;
    text-align: left;
  }

  .label {
    display: block;
    font-size: 12px;
    color: #888;
    margin-bottom: 4px;
    text-transform: uppercase;
  }

  .text {
    font-size: 16px;
    line-height: 1.4;
    color: #ddd;
  }

  .response .label {
    color: #7af;
  }

  /* Error */
  .error {
    background: rgba(255, 50, 50, 0.1);
    border: 1px solid rgba(255, 50, 50, 0.3);
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 12px;
    color: #f88;
    font-size: 14px;
  }

  /* Controls */
  .controls {
    margin-top: 32px;
  }

  .btn {
    background: transparent;
    border: 2px solid #fff;
    color: #fff;
    font-size: 18px;
    font-weight: 500;
    padding: 16px 48px;
    border-radius: 50px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .btn:active {
    transform: scale(0.98);
  }

  .btn.start {
    border-color: #5f5;
    color: #5f5;
  }

  .btn.start:hover {
    background: rgba(80, 255, 80, 0.1);
  }

  .btn.end {
    border-color: #f55;
    color: #f55;
  }

  .btn.end:hover {
    background: rgba(255, 80, 80, 0.1);
  }

  /* Mute controls */
  .mute-controls {
    display: flex;
    justify-content: center;
    gap: 16px;
    margin-bottom: 24px;
  }

  .btn-mute {
    background: rgba(255, 255, 255, 0.1);
    border: 2px solid rgba(255, 255, 255, 0.3);
    color: #fff;
    font-size: 24px;
    padding: 12px 20px;
    border-radius: 16px;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .btn-mute:hover {
    background: rgba(255, 255, 255, 0.15);
  }

  .btn-mute.muted {
    background: rgba(255, 80, 80, 0.2);
    border-color: rgba(255, 80, 80, 0.5);
  }

  .mute-label {
    font-size: 11px;
    text-transform: uppercase;
    opacity: 0.7;
  }

  /* Auth prompt */
  .auth-prompt {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 16px;
    padding: 24px;
    margin-bottom: 24px;
  }

  .auth-title {
    font-size: 18px;
    margin-bottom: 16px;
  }

  .auth-input {
    width: 100%;
    padding: 12px 16px;
    font-size: 16px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    color: #fff;
    margin-bottom: 12px;
    box-sizing: border-box;
  }

  .auth-input:focus {
    outline: none;
    border-color: rgba(255, 255, 255, 0.5);
  }

  .auth-btn {
    width: 100%;
    background: rgba(80, 200, 120, 0.2);
    border-color: rgba(80, 200, 120, 0.5);
    color: #5c8;
  }

  .btn-logout {
    background: transparent;
    border: none;
    font-size: 20px;
    cursor: pointer;
    opacity: 0.5;
    margin-left: 16px;
    padding: 8px;
  }

  .btn-logout:hover {
    opacity: 1;
  }

  /* Safe area for notched devices */
  @supports (padding-top: env(safe-area-inset-top)) {
    main {
      padding-top: calc(20px + env(safe-area-inset-top));
      padding-bottom: calc(20px + env(safe-area-inset-bottom));
    }
  }

</style>
