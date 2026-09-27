import api from './api';
import type { CreateCampaignPayload, EmailRecipient, Sender, SlackStatus } from '../types';

export const emailService = {
  async getSenders(): Promise<Sender[]> {
    const response = await api.get<Sender[]>('/api/senders');
    return response.data;
  },

  async getScheduledEmails(): Promise<EmailRecipient[]> {
    const response = await api.get<EmailRecipient[]>('/api/emails/scheduled');
    return response.data;
  },

  async getSentEmails(): Promise<EmailRecipient[]> {
    const response = await api.get<EmailRecipient[]>('/api/emails/sent');
    return response.data;
  },

  async getEmailById(id: string): Promise<EmailRecipient> {
    const response = await api.get<EmailRecipient>(`/api/emails/${id}`);
    return response.data;
  },

  async createCampaign(payload: CreateCampaignPayload): Promise<any> {
    const response = await api.post('/api/campaigns', payload);
    return response.data;
  },

  async searchEmails(query: string): Promise<EmailRecipient[]> {
    const response = await api.get<EmailRecipient[]>(`/api/emails/search?q=${encodeURIComponent(query)}`);
    return response.data;
  },

  getSlackConnectUrl(): string {
    return `${api.defaults.baseURL || 'http://localhost:5000'}/api/slack/connect`;
  },

  async getSlackStatus(): Promise<SlackStatus> {
    try {
      const response = await api.get<SlackStatus>('/api/slack/status');
      return response.data;
    } catch {
      return { connected: false, teamName: null, teamId: null };
    }
  },

  async disconnectSlack(): Promise<void> {
    await api.delete('/api/slack/disconnect');
  },
};

export default emailService;
