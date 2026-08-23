export interface MonitoringConfig {
  sessionCode?: string;
  teacherId?: string;
  signalingServer?: string;
}

export interface StreamInfo {
  peerId: string;
  timestamp: number;
  active: boolean;
}

class MonitoringService {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private screenStream: MediaStream | null = null;
  private config: MonitoringConfig = {};
  private wsConnection: WebSocket | null = null;
  private isSharing = false;
  private sessionCode: string | null = null;

  async initialize(config: MonitoringConfig = {}) {
    this.config = config;
    console.info("[Monitoring] Initializing student monitoring service...");
  }

  async startSharing(sessionCode: string): Promise<boolean> {
    if (this.isSharing) {
      console.warn("[Monitoring] Already sharing");
      return true;
    }

    this.sessionCode = sessionCode;
    console.info(`[Monitoring] Starting screen share for session: ${sessionCode}`);

    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "monitor",
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 15 },
        },
        audio: false,
      });

      this.screenStream.getVideoTracks()[0].onended = () => {
        console.info("[Monitoring] Screen sharing stopped by user");
        this.stopSharing();
      };

      this.setupPeerConnection();

      this.isSharing = true;
      console.info("[Monitoring] Screen sharing started successfully");
      return true;
    } catch (err) {
      console.error("[Monitoring] Failed to start screen sharing:", err);
      return false;
    }
  }

  private setupPeerConnection() {
    const config: RTCConfiguration = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    };

    this.peerConnection = new RTCPeerConnection(config);

    this.screenStream?.getTracks().forEach((track) => {
      this.peerConnection?.addTrack(track, this.screenStream!);
    });

    this.peerConnection.oniceconnectionstatechange = () => {
      console.info(`[Monitoring] ICE state: ${this.peerConnection?.iceConnectionState}`);
    };

    this.peerConnection.ontrack = (event) => {
      console.info("[Monitoring] Received track from peer");
    };

    this.dataChannel = this.peerConnection.createDataChannel("monitoring", {
      ordered: false,
      maxRetransmits: 0,
    });

    this.dataChannel.onopen = () => {
      console.info("[Monitoring] Data channel opened");
      this.sendMetadata();
    };

    this.dataChannel.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    this.createOffer();
  }

  private async createOffer() {
    if (!this.peerConnection) return;

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    console.info("[Monitoring] Offer created, waiting for answer...");
  }

  private sendMetadata() {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") return;

    const metadata = {
      type: "student_info",
      sessionCode: this.sessionCode,
      timestamp: Date.now(),
      screenInfo: {
        width: window.screen.width,
        height: window.screen.height,
      },
    };

    this.dataChannel.send(JSON.stringify(metadata));
  }

  private handleMessage(data: string) {
    try {
      const msg = JSON.parse(data);
      console.info("[Monitoring] Received message:", msg.type);

      switch (msg.type) {
        case "ping":
          this.sendPong();
          break;
        case "stop_sharing":
          this.stopSharing();
          break;
      }
    } catch (err) {
      console.error("[Monitoring] Failed to parse message:", err);
    }
  }

  private sendPong() {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") return;

    this.dataChannel.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
  }

  stopSharing() {
    console.info("[Monitoring] Stopping screen share...");

    if (this.screenStream) {
      this.screenStream.getTracks().forEach((track) => track.stop());
      this.screenStream = null;
    }

    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.isSharing = false;
    console.info("[Monitoring] Screen sharing stopped");
  }

  getStatus(): { isSharing: boolean; sessionCode: string | null } {
    return {
      isSharing: this.isSharing,
      sessionCode: this.sessionCode,
    };
  }
}

export const monitoringService = new MonitoringService();
