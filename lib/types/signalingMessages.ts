// Message types for signaling
export interface BaseSignalMessage {
  source: string;
  target?: string;
  type: string;
}

export interface OfferMessage extends BaseSignalMessage {
  type: "offer";
  data: RTCSessionDescriptionInit;
}

export interface AnswerMessage extends BaseSignalMessage {
  type: "answer";
  data: RTCSessionDescriptionInit;
}

export interface IceCandidateMessage extends BaseSignalMessage {
  type: "ice-candidate";
  data: RTCIceCandidateInit | null;
}

export type SignalingMessage =
  | OfferMessage
  | AnswerMessage
  | IceCandidateMessage;