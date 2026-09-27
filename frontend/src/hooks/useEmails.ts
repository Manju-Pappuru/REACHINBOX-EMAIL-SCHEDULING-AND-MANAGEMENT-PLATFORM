import { useState, useCallback, useEffect } from 'react';
import emailService from '../services/email.service';
import type { EmailRecipient } from '../types';

export function useEmails() {
  const [scheduledEmails, setScheduledEmails] = useState<EmailRecipient[]>([]);
  const [sentEmails, setSentEmails] = useState<EmailRecipient[]>([]);
  const [loadingScheduled, setLoadingScheduled] = useState<boolean>(true);
  const [loadingSent, setLoadingSent] = useState<boolean>(true);
  const [errorScheduled, setErrorScheduled] = useState<string | null>(null);
  const [errorSent, setErrorSent] = useState<string | null>(null);

  const fetchScheduled = useCallback(async () => {
    setLoadingScheduled(true);
    setErrorScheduled(null);
    try {
      const data = await emailService.getScheduledEmails();
      setScheduledEmails(data);
    } catch (err: any) {
      setErrorScheduled(err.message || 'Failed to load scheduled emails');
    } finally {
      setLoadingScheduled(false);
    }
  }, []);

  const fetchSent = useCallback(async () => {
    setLoadingSent(true);
    setErrorSent(null);
    try {
      const data = await emailService.getSentEmails();
      setSentEmails(data);
    } catch (err: any) {
      setErrorSent(err.message || 'Failed to load sent emails');
    } finally {
      setLoadingSent(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchScheduled(), fetchSent()]);
  }, [fetchScheduled, fetchSent]);

  useEffect(() => {
    void fetchScheduled();
    void fetchSent();
  }, [fetchScheduled, fetchSent]);

  const search = useCallback(async (query: string): Promise<EmailRecipient[]> => {
    if (!query.trim()) {
      return [];
    }
    return await emailService.searchEmails(query);
  }, []);

  return {
    scheduledEmails,
    sentEmails,
    loadingScheduled,
    loadingSent,
    errorScheduled,
    errorSent,
    fetchScheduled,
    fetchSent,
    refreshAll,
    search,
  };
}
