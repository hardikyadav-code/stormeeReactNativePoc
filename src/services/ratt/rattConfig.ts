import { RattClientService, RattClientState } from './ratt'; // Adjust path
import utf8 from 'utf8'; // Note: Ensure you have 'utf8' installed via npm
import { makeId } from '../../utility/uuidConvertor';

export const encodeParam = (param: any): string => {
  if (param === null || param === undefined) {
    return '';
  }

  // If param is not a string, convert it to one
  const paramStr = typeof param !== 'string' ? String(param) : param;
  return utf8.encode(paramStr);
};

export class RattManager {
  private static instance: RattManager;
  private rattService: RattClientService | null = null;

  // Callbacks to send data back to your React Native UI/Broker
  private onTranscript?: (text: string) => void;
  private onState?: (state: Partial<RattClientState>) => void;
  private onError?: (error: string) => void;

  private constructor() {}

  // Singleton pattern: ensures you only ever have one active RATT manager
  public static getInstance(): RattManager {
    if (!RattManager.instance) {
      RattManager.instance = new RattManager();
    }
    return RattManager.instance;
  }

  /**
   * Bind your UI callbacks so the manager can send data back to React
   */
  public attachCallbacks(
    onTranscript: (text: string) => void,
    onState: (state: Partial<RattClientState>) => void,
    onError: (error: string) => void
  ) {
    this.onTranscript = onTranscript;
    this.onState = onState;
    this.onError = onError;
  }

  /**
   * Generates fresh agent config. 
   * Placed in a method so uuids generate fresh if you disconnect/re-init.
   */
  private async getAgentConfig() {
      const chatSessionUUID = await makeId();
  const clientUUID = await makeId();
  const requestUUID = await makeId();
    const RATT_AGENT_DETAILS = {
      conciergeId: 'e2fceecc-a300-43f0-aa33-2e3e10189385',
      conciergeName: 'stormee',
      organizationId: '684035984caaf94cc4a1d166',
      organizationName: 'techolution',
      requestId: `request-${(requestUUID)}`,
      agentSettings: {
        voiceAgentMongoId: '687507ff54d0a7db72e7a29d',
      },
      username: 'Hardik Yadav',
      useremailId: 'hardik.yadav@techolution.com',
      chatSessionId: `techolution-devlscassistant-${chatSessionUUID}`,
      rlefVoiceTaskId: '687507ba3bb9b5c033f2b82d',
      assistant_type: 'normal',
      isAudioRequest: true,
      client_id: `chat-session-${clientUUID}`,
      userId: encodeParam('0804b20a-2414-40c8-afd1-1bf0703e9d6e'),
      testQuestion: '',
      testAnswer: '',
      testVariants: JSON.stringify({ Edit: [], Add: [], Delete: [] }),
    };

    const SERVER_URL = `https://devllmstudio.creativeworkspace.ai/audioStreamingWebsocket?sessionId=${RATT_AGENT_DETAILS.chatSessionId}&clientId=${RATT_AGENT_DETAILS.client_id}`;

    return { agentDetails: RATT_AGENT_DETAILS, serverUrl: SERVER_URL };
  }

  /**
   * Initializes the RATT service and wires up internal callbacks
   */
  public async init() {
    if (this.rattService) {
      console.log('xoxo RATT service already initialized');
      return;
    }

    console.log('xoxo initializing RATT service');
    const { agentDetails, serverUrl } = await this.getAgentConfig();
    console.log('xoxo12345 RATT_AGENT_DETAILS:', agentDetails);

    this.rattService = new RattClientService(serverUrl, agentDetails);

    // Wire RATT callbacks to send messages back through our attached callbacks
    this.rattService.attachCallbacks(
      (text) => {
        console.log('xoxo \x1b[32mReceived Transcript:\x1b[0m', text);
        if (this.onTranscript) this.onTranscript(text);
      },
      (state) => {
        if (this.onState) this.onState(state);
      },
      (error) => {
        console.error('xoxo RATT Manager Error:', error);
        if (this.onError) this.onError(error);
      }
    );

    await this.rattService.init();
  }

  /**
   * Starts the audio capture session
   */
  public async startSession() {
    console.log('xoxo received start session request');
    if (this.rattService) {
      console.log('xoxo starting mic RATT session');
      await this.rattService.start();
    } else {
      console.warn('Cannot start session: RATT service not initialized');
    }
  }

  /**
   * Stops the audio capture session
   */
  public async stopSession() {
    if (this.rattService) {
      console.log('xoxo received stop session request');
      await this.rattService.stop();
    }
  }

  /**
   * Completely disconnects and tears down the service
   */
  public async disconnect() {
    if (this.rattService) {
      console.log('xoxo disconnecting RATT service');
      this.rattService.disconnect();
      await this.rattService.teardown();
      this.rattService = null;
    }
  }
}