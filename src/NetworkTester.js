export const CONNECTION_MODES = {
  ALL: "all", // used to gather all candidates
  STUN: "stun",
  TURN_UDP: "turn-udp",
  TURN_TCP: "turn-tcp",
  TURN_TLS: "turn-tls",
  RELAY_ONLY: "relay",
};

export const NAT_SERVICES = {
  TWILIO: "twilio",
  XIRSYS: "xirsys",
};

export const CONNECTION_STATUS = {
  CONNECTED: "connected",
  FAILED: "failed",
  STOPPED: "stopped",
};

export default class NetworkTester {
  constructor({
    natService = NAT_SERVICES.TWILIO,
    connectionMode = CONNECTION_MODES.RELAY_ONLY,
    iceServers,
  }) {
    if (natService === NAT_SERVICES.TWILIO) {
      switch (connectionMode) {
        case CONNECTION_MODES.ALL:
        case CONNECTION_MODES.RELAY_ONLY:
          this.iceServers = iceServers;
          break;
        case CONNECTION_MODES.STUN:
          this.iceServers = iceServers.filter(
            (url) =>
              url?.url.startsWith("stun:") || url?.urls.startsWith("stun:")
          );
          break;
        case CONNECTION_MODES.TURN_UDP:
          this.iceServers = iceServers.filter(
            (url) => url?.url.startsWith("turn:") && url?.url.endsWith("udp")
          );
          break;
        case CONNECTION_MODES.TURN_TCP:
          this.iceServers = iceServers.filter(
            (url) => url?.url.startsWith("turn:") && url?.url.endsWith("tcp")
          );
          break;
        case CONNECTION_MODES.TURN_TLS:
          this.iceServers = iceServers.filter((url) =>
            url?.url.includes("turns:")
          );
          break;
        default:
          this.iceServers = iceServers;
      }
    } else {
      switch (connectionMode) {
        case CONNECTION_MODES.ALL:
        case CONNECTION_MODES.RELAY_ONLY:
          // Xirsys returns an object when we need an array
          this.iceServers = [iceServers];
          break;
        case CONNECTION_MODES.STUN:
          this.iceServers = [
            {
              ...iceServers,
              urls: iceServers.urls.filter((url) => url.startsWith("stun:")),
            },
          ];
          break;
        case CONNECTION_MODES.TURN_UDP:
          this.iceServers = [
            {
              ...iceServers,
              urls: iceServers.urls.filter(
                (url) => url.startsWith("turn:") && url.endsWith("udp")
              ),
            },
          ];
          break;
        case CONNECTION_MODES.TURN_TCP:
          this.iceServers = [
            {
              ...iceServers,
              urls: iceServers.urls.filter(
                (url) => url.startsWith("turn:") && url.endsWith("tcp")
              ),
            },
          ];
          break;
        case CONNECTION_MODES.TURN_TLS:
          this.iceServers = [
            {
              ...iceServers,
              urls: iceServers.urls.filter((url) => url.startsWith("turns:")),
            },
          ];
          break;
        default:
          this.iceServers = [iceServers];
      }
    }
    this.connectionMode = connectionMode;
    this.natService = natService;
    this.localPeer = null;
    this.remotePeer = null;
    // maybe make these configurable?
    this.constraints = {
      video: {
        deviceId: "default",
        facingMode: "user",
        width: 1280,
        height: 720,
      },
      audio: {
        deviceId: "default",
      },
    };
    this.offerOptions = {
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    };
  }

  async setupRTCPeerConnection() {
    const RELAY_ONLY_CONNECTION_MODES = [
      CONNECTION_MODES.TURN_UDP,
      CONNECTION_MODES.TURN_TCP,
      CONNECTION_MODES.TURN_TLS,
      CONNECTION_MODES.RELAY_ONLY,
    ];
    const iceTransportPolicy = RELAY_ONLY_CONNECTION_MODES.includes(
      this.connectionMode
    )
      ? "relay"
      : "all";

    const rtcConfig = {
      iceServers: this.iceServers,
      iceTransportPolicy,
    };

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });

    this.localPeer = new RTCPeerConnection(rtcConfig);
    this.remotePeer = new RTCPeerConnection(rtcConfig);

    stream.getTracks().forEach((track) => {
      this.localPeer.addTrack(track, stream);
    });
    global.localPeer = this.localPeer;

    this.localPeer.bufferedIceCandidates = [];
    this.remotePeer.bufferedIceCandidates = [];

    this.localPeer.iceCandidates = [];

    this.setupPeerListeners();
    await this.start();
    return new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
      this.connectionTimeout = global.setTimeout(async () => {
        const connectionInfo = await this.getConnectionInfo();
        this.resolve(connectionInfo);
      }, 15000);
      this.flushTimeout = global.setTimeout(async () => {
        // always flush candidates after 7 seconds of gathering
        this.flushIceCandidates(this.localPeer);
        this.flushIceCandidates(this.remotePeer);
      }, 7500);
    });
  }

  setupPeerListeners() {
    this.localPeer.onicecandidate = (event) => {
      if (
        this.connectionMode === CONNECTION_MODES.STUN &&
        // Firefox doesn't support the "type" property, so better be safe and parse
        event.candidate?.candidate.includes("host")
      ) {
        // Don't allow host candidates in STUN mode.
        return;
      }

      if (!event.candidate || !event.candidate.candidate) {
        this.flushIceCandidates(this.remotePeer);
        return;
      }
      this.localPeer.iceCandidates.push(event.candidate);
      this.remotePeer.bufferedIceCandidates.push(event.candidate);
    };

    this.remotePeer.onicecandidate = (event) => {
      if (!event.candidate || !event.candidate.candidate) {
        this.flushIceCandidates(this.localPeer);
        return;
      }
      this.localPeer.bufferedIceCandidates.push(event.candidate);
    };

    if (this.localPeer.connectionState) {
      this.localPeer.onconnectionstatechange = () =>
        this.onConnectionStateChange(this.localPeer.connectionState);
    } else {
      // Legacy connection state
      this.localPeer.oniceconnectionstatechange = (event) =>
        this.onIceConnectionStateChange(event);
    }
  }

  async start() {
    await this.createOffer();
    await this.createAnswer();
  }

  flushIceCandidates(peer) {
    peer.bufferedIceCandidates.forEach((c) => peer.addIceCandidate(c));
    peer.bufferedIceCandidates = [];
  }

  createOffer() {
    return this.localPeer
      .createOffer(this.offerOptions)
      .then((desc) =>
        this.setDescription(desc, this.localPeer, this.remotePeer)
      );
  }

  async setDescription(desc, local, remote) {
    await local.setLocalDescription(desc);
    await remote.setRemoteDescription(desc);
  }

  createAnswer() {
    return this.remotePeer
      .createAnswer(this.offerOptions)
      .then((desc) =>
        this.setDescription(desc, this.remotePeer, this.localPeer)
      );
  }

  async getConnectionInfo() {
    const { iceCandidates } = this.localPeer;
    // need to check both because of Firefox
    const connectionState =
      this.localPeer.connectionState || this.localPeer.iceConnectionState;
    return {
      iceCandidates,
      status:
        connectionState === "connected" || connectionState === "completed"
          ? CONNECTION_STATUS.CONNECTED
          : CONNECTION_STATUS.FAILED,
    };
  }

  async onConnectionStateChange() {
    if (
      this.localPeer.connectionState === "failed" ||
      this.localPeer.connectionState === "connected"
    ) {
      const connectionInfo = await this.getConnectionInfo();
      this.resolve(connectionInfo);
      this.stop();
    }
  }

  // We need this for Firefox, since it doesn't support connectionState, only iceConnectionState.
  async onIceConnectionStateChange() {
    const { iceConnectionState } = this.localPeer;
    if (iceConnectionState === "failed") {
      const connectionInfo = await this.getConnectionInfo();
      this.resolve(connectionInfo);
      this.stop();
    }
    if (
      iceConnectionState === "connected" ||
      iceConnectionState === "completed"
    ) {
      const connectionInfo = await this.getConnectionInfo();
      this.resolve(connectionInfo);
      global.clearTimeout(this.connectionTimeout);
      global.clearTimeout(this.flushTimeout);
    }
  }

  stop() {
    try {
      this.localPeer.close();
      this.remotePeer.close();
      global.clearTimeout(this.connectionTimeout);
      global.clearTimeout(this.flushTimeout);
    } catch (e) {
      // ignore errors from close
    }
  }
}
