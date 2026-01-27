<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { appState, transcript, response, errorMessage, connected } from './lib/stores';
  import { unlockAudioContext } from './lib/audio';
  import { ProxyWebSocket } from './lib/websocket';
  import { AudioPlayer } from './lib/audio';
  import { WakeLock } from './lib/wakelock';
  import { VoiceActivityDetector, audioToWav } from './lib/vad';
  import { marked } from 'marked';
  import ParticleHead from './lib/particle-head/ParticleHead.svelte';
  import type { AppState } from './lib/types';
  
  // Configure marked for safe rendering
  marked.setOptions({
    breaks: true,  // Convert \n to <br>
    gfm: true,     // GitHub Flavored Markdown
  });

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

  // Chat history
  interface ChatMessage {
    id: number;
    role: 'user' | 'assistant';
    text: string;
    html?: string;
  }
  let messages: ChatMessage[] = [];
  let messageIdCounter = 0;
  let chatContainer: HTMLElement;
  let pendingUserMessageId: number | null = null;
  let pendingAssistantMessageId: number | null = null;

  // Reactive state from stores
  let currentState: AppState = 'idle';
  let currentTranscript = '';
  let currentResponse = '';
  let currentError = '';
  let isConnected = false;

  // Subscribe to stores
  appState.subscribe(v => currentState = v);
  transcript.subscribe(v => {
    currentTranscript = v;
    if (v) {
      // Add or update user message
      if (pendingUserMessageId !== null) {
        const idx = messages.findIndex(m => m.id === pendingUserMessageId);
        if (idx >= 0) messages[idx].text = v;
      } else {
        pendingUserMessageId = ++messageIdCounter;
        messages = [...messages, { id: pendingUserMessageId, role: 'user', text: v }];
      }
      scrollToBottom();
    }
  });
  response.subscribe(v => {
    currentResponse = v;
    const stripped = stripTranscriptEcho(v);
    if (stripped) {
      const html = marked.parse(stripped) as string;
      // Finalize user message if pending
      if (pendingUserMessageId !== null) {
        pendingUserMessageId = null;
      }
      // Add or update assistant message
      if (pendingAssistantMessageId !== null) {
        const idx = messages.findIndex(m => m.id === pendingAssistantMessageId);
        if (idx >= 0) {
          messages[idx].text = stripped;
          messages[idx].html = html;
          messages = [...messages]; // trigger reactivity
        }
      } else {
        pendingAssistantMessageId = ++messageIdCounter;
        messages = [...messages, { id: pendingAssistantMessageId, role: 'assistant', text: stripped, html }];
      }
      scrollToBottom();
    }
  });
  errorMessage.subscribe(v => currentError = v);
  connected.subscribe(v => isConnected = v);

  // Strip transcript echo from response (already shown separately in PWA)
  // Matches: > 🎤 "..." or > 📖 "..." at start of response
  function stripTranscriptEcho(text: string): string {
    return text.replace(/^>\s*(?:🎤|📖)\s*"[^"]*"\s*\n*/m, '').trim();
  }
  
  function scrollToBottom(): void {
    setTimeout(() => {
      if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
    }, 50);
  }
  
  // Reset pending message trackers when response cycle completes
  function resetPendingMessages(): void {
    pendingUserMessageId = null;
    pendingAssistantMessageId = null;
  }

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
        // Response complete - reset pending trackers
        resetPendingMessages();
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
      // Don't clear messages - keep chat history across reconnects
      resetPendingMessages();
      
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
  <!-- Token settings button (top right) -->
  {#if authToken && !showAuthPrompt}
    <button class="btn-token-settings" onclick={clearAuthToken} title="Change token">
      🔓
    </button>
  {/if}
  
  <div class="container">
    <!-- Status Indicator -->
    <div class="indicator">
      <ParticleHead appState={currentState} size={120} />
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
    
    <!-- Chat History -->
    {#if messages.length > 0}
      <div class="chat-container" bind:this={chatContainer}>
        {#each messages as msg (msg.id)}
          <div class="chat-bubble {msg.role}">
            {#if msg.role === 'assistant' && msg.html}
              <div class="markdown">{@html msg.html}</div>
            {:else}
              {msg.text}
            {/if}
          </div>
        {/each}
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
    background: #0a0a14;
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
    display: flex;
    justify-content: center;
  }

  /* State-based backgrounds */
  .state-idle {
    background: #0a0a14;
  }

  .state-listening {
    background: #0a0a14;
  }

  .state-recording {
    background: #0f0a18;
  }

  .state-processing {
    background: #0a0f14;
  }

  .state-speaking {
    background: #0a100a;
  }

  .state-error {
    background: #140a0a;
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

  /* Chat Container */
  .chat-container {
    max-height: 40vh;
    overflow-y: auto;
    margin-bottom: 16px;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    scroll-behavior: smooth;
  }

  .chat-bubble {
    max-width: 85%;
    padding: 12px 16px;
    border-radius: 16px;
    font-size: 15px;
    line-height: 1.4;
    word-wrap: break-word;
  }

  .chat-bubble.user {
    align-self: flex-end;
    background: rgba(100, 150, 255, 0.25);
    border-bottom-right-radius: 4px;
    color: #ddd;
    text-align: left;
  }

  .chat-bubble.assistant {
    align-self: flex-start;
    background: rgba(255, 255, 255, 0.08);
    border-bottom-left-radius: 4px;
    color: #ddd;
    text-align: left;
  }

  /* Markdown styles */
  .markdown {
    font-size: 16px;
    line-height: 1.5;
    color: #ddd;
  }

  .markdown :global(p) {
    margin: 0 0 12px 0;
  }

  .markdown :global(p:last-child) {
    margin-bottom: 0;
  }

  .markdown :global(h1),
  .markdown :global(h2),
  .markdown :global(h3),
  .markdown :global(h4) {
    color: #fff;
    margin: 16px 0 8px 0;
    font-weight: 600;
  }

  .markdown :global(h1) { font-size: 1.4em; }
  .markdown :global(h2) { font-size: 1.2em; }
  .markdown :global(h3) { font-size: 1.1em; }
  .markdown :global(h4) { font-size: 1em; }

  .markdown :global(ul),
  .markdown :global(ol) {
    margin: 8px 0;
    padding-left: 24px;
  }

  .markdown :global(li) {
    margin: 4px 0;
  }

  .markdown :global(code) {
    background: rgba(0, 0, 0, 0.3);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 0.9em;
  }

  .markdown :global(pre) {
    background: rgba(0, 0, 0, 0.4);
    padding: 12px;
    border-radius: 8px;
    overflow-x: auto;
    margin: 12px 0;
  }

  .markdown :global(pre code) {
    background: none;
    padding: 0;
  }

  .markdown :global(blockquote) {
    border-left: 3px solid #7af;
    margin: 12px 0;
    padding-left: 12px;
    color: #aaa;
  }

  .markdown :global(a) {
    color: #7af;
    text-decoration: none;
  }

  .markdown :global(a:hover) {
    text-decoration: underline;
  }

  .markdown :global(strong) {
    color: #fff;
    font-weight: 600;
  }

  .markdown :global(em) {
    font-style: italic;
  }

  .markdown :global(hr) {
    border: none;
    border-top: 1px solid rgba(255, 255, 255, 0.2);
    margin: 16px 0;
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

  .btn-token-settings {
    position: fixed;
    top: 16px;
    right: 16px;
    background: transparent;
    border: none;
    font-size: 20px;
    cursor: pointer;
    opacity: 0.4;
    padding: 8px;
    z-index: 100;
  }

  .btn-token-settings:hover {
    opacity: 1;
  }
  
  @supports (padding-top: env(safe-area-inset-top)) {
    .btn-token-settings {
      top: calc(16px + env(safe-area-inset-top));
      right: calc(16px + env(safe-area-inset-right));
    }
  }

  /* Safe area for notched devices */
  @supports (padding-top: env(safe-area-inset-top)) {
    main {
      padding-top: calc(20px + env(safe-area-inset-top));
      padding-bottom: calc(20px + env(safe-area-inset-bottom));
    }
  }

</style>
