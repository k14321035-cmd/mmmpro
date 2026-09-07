export type Mode = 'game' | 'mirror';

export interface RTCMessage {
  target: string;
  caller: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}
