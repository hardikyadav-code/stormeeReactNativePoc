// src/services/stormee/native/StateManager.ts

/**
 * Streaming states
 */
export enum StreamingState {
  IDLE = 'IDLE',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  STREAM_STARTING = 'STREAM_STARTING',
  STREAMING = 'STREAMING',
  BUFFERING = 'BUFFERING',
  PAUSED = 'PAUSED',
  STOPPING = 'STOPPING',
  ERROR = 'ERROR',
  RECONNECTING = 'RECONNECTING',
}

type StateCallback = (state: StreamingState) => void;

/**
 * Manages streaming state transitions
 */
export class StateManager {
  private currentState = StreamingState.IDLE;
  private stateHistory: StreamingState[] = [];
  private listeners: Map<StreamingState, Set<StateCallback>> = new Map();

  private validTransitions: Record<StreamingState, StreamingState[]> = {
    [StreamingState.IDLE]: [StreamingState.CONNECTING],
    [StreamingState.CONNECTING]: [StreamingState.CONNECTED, StreamingState.ERROR],
    [StreamingState.CONNECTED]: [
      StreamingState.STREAM_STARTING,
      StreamingState.STOPPING,
      StreamingState.ERROR,
    ],
    [StreamingState.STREAM_STARTING]: [StreamingState.STREAMING, StreamingState.ERROR],
    [StreamingState.STREAMING]: [
      StreamingState.BUFFERING,
      StreamingState.PAUSED,
      StreamingState.STOPPING,
      StreamingState.ERROR,
    ],
    [StreamingState.BUFFERING]: [
      StreamingState.STREAMING,
      StreamingState.STOPPING,
      StreamingState.ERROR,
    ],
    [StreamingState.PAUSED]: [
      StreamingState.STREAMING,
      StreamingState.STOPPING,
      StreamingState.ERROR,
    ],
    [StreamingState.STOPPING]: [StreamingState.IDLE, StreamingState.ERROR],
    [StreamingState.ERROR]: [StreamingState.RECONNECTING, StreamingState.IDLE],
    [StreamingState.RECONNECTING]: [StreamingState.CONNECTING, StreamingState.ERROR],
  };

  /**
   * Transition to new state
   */
  transition(newState: StreamingState, context?: string): boolean {
    if (!this.validTransitions[this.currentState]?.includes(newState)) {
      console.warn(`[StateManager] Invalid transition: ${this.currentState} → ${newState}`);
      return false;
    }

    const oldState = this.currentState;
    this.currentState = newState;
    this.stateHistory.push(newState);

    console.log(`[StateManager] ${oldState} → ${newState}${context ? ` (${context})` : ''}`);

    this.notifyListeners(newState);
    return true;
  }

  /**
   * Get current state
   */
  getState(): StreamingState {
    return this.currentState;
  }

  /**
   * Listen to state changes
   */
  on(state: StreamingState, callback: StateCallback): () => void {
    if (!this.listeners.has(state)) {
      this.listeners.set(state, new Set());
    }
    this.listeners.get(state)!.add(callback);

    return () => {
      this.listeners.get(state)?.delete(callback);
    };
  }

  /**
   * Notify listeners
   */
  private notifyListeners(state: StreamingState): void {
    this.listeners.get(state)?.forEach(cb => {
      try {
        cb(state);
      } catch (e) {
        console.error('[StateManager] Listener error:', e);
      }
    });
  }

  /**
   * Get history
   */
  getHistory(): StreamingState[] {
    return [...this.stateHistory];
  }
}

export default StateManager;