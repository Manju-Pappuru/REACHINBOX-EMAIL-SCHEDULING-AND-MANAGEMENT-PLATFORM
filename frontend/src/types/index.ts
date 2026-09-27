export type EmailStatus =
  | 'SCHEDULED'
  | 'PROCESSING'
  | 'SENT'
  | 'FAILED'
  | 'RATE_LIMITED'
  | 'CANCELLED';

export type CampaignStatus = 'SCHEDULED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface Sender {
  id: string;
  email: string;
  displayName?: string | null;
  createdAt: string;
}

export interface User {
  id: string;
  googleId: string;
  name: string;
  email: string;
  avatar: string | null;
  senderId?: string;
}

export interface EmailRecipient {
  id: string;
  campaignId: string;
  email: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt?: string | null;
  failedAt?: string | null;
  errorMessage?: string | null;
  bullJobId?: string | null;
  etherealPreviewUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  campaign?: {
    id?: string;
    subject: string;
    body?: string;
  };
}

export interface CreateCampaignPayload {
  subject: string;
  body: string;
  startTime: string; // ISO string
  delayBetweenEmails: number; // in milliseconds
  hourlyLimit: number;
  senderId?: string;
  recipients: string[];
}

export interface SlackStatus {
  connected: boolean;
  teamId?: string | null;
  teamName: string | null;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title?: string;
  message: string;
}
