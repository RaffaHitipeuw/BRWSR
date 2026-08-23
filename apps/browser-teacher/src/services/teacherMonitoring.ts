export interface StudentStream {
  peerId: string;
  stream: MediaStream | null;
  info: {
    sessionCode: string;
    timestamp: number;
    screenInfo: { width: number; height: number };
  };
  connection: RTCPeerConnection;
}

export interface MonitoringState {
  isListening: boolean;
  sessionCode: string | null;
  students: StudentStream[];
}

class TeacherMonitoringService {
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private studentStreams: Map<string, StudentStream> = new Map();
  private wsConnection: WebSocket | null = null;
  private state: MonitoringState = {
    isListening: false,
    sessionCode: null,
    students: [],
  };
  private listeners: Set<(state: MonitoringState) => void> = new Set();
  private sessionCode: string | null = null;

  generateSessionCode(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => listener({ ...this.state }));
  }

  subscribe(listener: (state: MonitoringState) => void): () => void {
    this.listeners.add(listener);
    listener({ ...this.state });
    return () => { this.listeners.delete(listener); };
  }

  async startListening(sessionCode: string): Promise<boolean> {
    if (this.state.isListening) {
      console.warn("[TeacherMonitoring] Already listening");
      return true;
    }

    this.sessionCode = sessionCode;
    console.info(`[TeacherMonitoring] Starting listener for session: ${sessionCode}`);

    try {
      this.setupWebSocket(sessionCode);
      this.state.isListening = true;
      this.state.sessionCode = sessionCode;
      this.notifyListeners();
      return true;
    } catch (err) {
      console.error("[TeacherMonitoring] Failed to start listening:", err);
      return false;
    }
  }

  private setupWebSocket(sessionCode: string) {
    const wsUrl = `wss://monitoring.eduos.local/session/${sessionCode}`;

    try {
      this.wsConnection = new WebSocket(wsUrl);

      this.wsConnection.onopen = () => {
        console.info("[TeacherMonitoring] WebSocket connected");
        this.wsConnection?.send(JSON.stringify({
          type: "teacher_register",
          sessionCode: sessionCode,
        }));
      };

      this.wsConnection.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleSignalingMessage(data);
        } catch (err) {
          console.error("[TeacherMonitoring] Failed to parse message:", err);
        }
      };

      this.wsConnection.onerror = (error) => {
        console.error("[TeacherMonitoring] WebSocket error:", error);
      };

      this.wsConnection.onclose = () => {
        console.info("[TeacherMonitoring] WebSocket closed");
      };
    } catch (err) {
      console.error("[TeacherMonitoring] WebSocket setup failed:", err);
    }
  }

  private handleSignalingMessage(data: any) {
    switch (data.type) {
      case "student_offer":
        this.handleStudentOffer(data.peerId, data.offer);
        break;
      case "ice_candidate":
        this.handleIceCandidate(data.peerId, data.candidate);
        break;
    }
  }

  private async handleStudentOffer(peerId: string, offer: RTCSessionDescriptionInit) {
    console.info(`[TeacherMonitoring] Received offer from student: ${peerId}`);

    const config: RTCConfiguration = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    };

    const pc = new RTCPeerConnection(config);
    this.peerConnections.set(peerId, pc);

    pc.ontrack = (event) => {
      console.info(`[TeacherMonitoring] Received track from: ${peerId}`);
      const studentStream: StudentStream = {
        peerId,
        stream: event.streams[0],
        info: {
          sessionCode: this.sessionCode || "",
          timestamp: Date.now(),
          screenInfo: { width: 1920, height: 1080 },
        },
        connection: pc,
      };
      this.studentStreams.set(peerId, studentStream);
      this.state.students = Array.from(this.studentStreams.values());
      this.notifyListeners();
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && this.wsConnection) {
        this.wsConnection.send(JSON.stringify({
          type: "ice_candidate",
          peerId,
          candidate: event.candidate,
        }));
      }
    };

    pc.ondatachannel = (event) => {
      console.info(`[TeacherMonitoring] Data channel from: ${peerId}`);
      const channel = event.channel;
      this.dataChannels.set(peerId, channel);

      channel.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "student_info") {
            const student = this.studentStreams.get(peerId);
            if (student) {
              student.info = {
                sessionCode: msg.sessionCode,
                timestamp: msg.timestamp,
                screenInfo: msg.screenInfo,
              };
              this.state.students = Array.from(this.studentStreams.values());
              this.notifyListeners();
            }
          }
        } catch (err) {
          console.error("[TeacherMonitoring] Failed to parse data channel message:", err);
        }
      };

      channel.onopen = () => {
        console.info(`[TeacherMonitoring] Data channel opened: ${peerId}`);
      };
    };

    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    if (this.wsConnection) {
      this.wsConnection.send(JSON.stringify({
        type: "teacher_answer",
        peerId,
        answer,
      }));
    }
  }

  private async handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit) {
    const pc = this.peerConnections.get(peerId);
    if (pc) {
      await pc.addIceCandidate(candidate);
    }
  }

  stopListening() {
    console.info("[TeacherMonitoring] Stopping listener...");

    this.dataChannels.forEach((channel) => channel.close());
    this.dataChannels.clear();

    this.peerConnections.forEach((pc) => pc.close());
    this.peerConnections.clear();

    this.studentStreams.clear();

    if (this.wsConnection) {
      this.wsConnection.close();
      this.wsConnection = null;
    }

    this.state = {
      isListening: false,
      sessionCode: null,
      students: [],
    };
    this.notifyListeners();
    console.info("[TeacherMonitoring] Listener stopped");
  }

  getSessionCode(): string | null {
    return this.sessionCode;
  }

  isListening(): boolean {
    return this.state.isListening;
  }
}

export const teacherMonitoringService = new TeacherMonitoringService();
