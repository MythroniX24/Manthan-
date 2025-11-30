export interface Attachment {
  name: string;
  mimeType: string;
  dataUrl: string; // base64 data url
  isImage: boolean;
}

export interface Message {
  role: 'user' | 'model';
  text: string;
  sources?: GroundingSource[];
  attachments?: Attachment[];
  isError?: boolean;
  title?: string;
}

export interface GroundingSource {
    uri: string;
    title: string;
    type: 'web' | 'maps';
}

export type ChatHistoryItem = {
  title: string;
  messages: Message[];
  timestamp: number;
};

export type ChatHistory = { [id: string]: ChatHistoryItem };