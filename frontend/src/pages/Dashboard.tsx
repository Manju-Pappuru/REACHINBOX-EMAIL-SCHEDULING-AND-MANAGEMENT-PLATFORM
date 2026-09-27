import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarClock,
  Send,
  PlusCircle,
  RefreshCw,
  Search,
  MessageSquare,
  CheckCircle,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useEmails } from '../hooks/useEmails';
import { useToast } from '../hooks/useToast';
import emailService from '../services/email.service';
import type { EmailRecipient, SlackStatus } from '../types';
import Header from '../components/Header';
import Button from '../components/Button';
import EmailTable from '../components/EmailTable';
import Modal from '../components/Modal';

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
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
  } = useEmails();

  const [activeTab, setActiveTab] = useState<'scheduled' | 'sent'>('scheduled');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<EmailRecipient[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Slack integration state
  const [slackStatus, setSlackStatus] = useState<SlackStatus>({ connected: false, teamName: null, teamId: null });
  const [isSlackModalOpen, setIsSlackModalOpen] = useState(false);
  const [disconnectingSlack, setDisconnectingSlack] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Debounced search effect
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    if (!searchQuery.trim()) {
      setSearchResults(null);
      setSearchError(null);
      return;
    }
    searchTimeoutRef.current = setTimeout(() => {
      performSearch(searchQuery.trim());
    }, 300);
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, search]);

  const performSearch = async (query: string) => {
    setIsSearching(true);
    setSearchError(null);
    try {
      const results = await search(query);
      setSearchResults(results);
    } catch (err: any) {
      setSearchError(err.message || 'Search failed');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    await performSearch(searchQuery.trim());
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
    setSearchError(null);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
  };

  const handleConnectSlack = () => {
    window.location.href = emailService.getSlackConnectUrl();
  };

  const handleDisconnectSlack = async () => {
    setDisconnectingSlack(true);
    try {
      await emailService.disconnectSlack();
      setSlackStatus({ connected: false, teamName: null, teamId: null });
      toast.info('Disconnected from Slack workspace', 'Slack Disconnected');
    } catch (err: any) {
      toast.error(err.message || 'Failed to disconnect Slack');
    } finally {
      setDisconnectingSlack(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshAll();
    const slack = await emailService.getSlackStatus();
    setSlackStatus(slack);
    setRefreshing(false);
    toast.info('Refreshed email list');
  };

  useEffect(() => {
    void emailService.getSlackStatus().then(setSlackStatus);

    const params = new URLSearchParams(window.location.search);
    const slackParam = params.get('slack');
    if (slackParam === 'connected') {
      toast.success('Slack workspace connected successfully!', 'Slack Connected');
      window.history.replaceState({}, '', window.location.pathname);
      void emailService.getSlackStatus().then(setSlackStatus);
    } else if (slackParam === 'error') {
      const msg = params.get('message') || 'Failed to connect Slack workspace';
      toast.error(msg, 'Slack Connection Failed');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [toast]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Top greeting and key actions */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <span>Campaign Dashboard</span>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                Live
              </span>
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Welcome back, <span className="text-slate-200 font-medium">{user?.name}</span>. Monitor scheduled queue items and delivery logs.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Connect Slack button */}
            <button
              onClick={() => setIsSlackModalOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold border transition-all bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-200 shadow-sm"
              title="Manage Slack Integration"
            >
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
              <span>{slackStatus.connected ? `Slack: ${slackStatus.teamName}` : 'Connect Slack'}</span>
            </button>

            {/* Refresh button */}
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />}
              onClick={handleRefresh}
              disabled={refreshing}
            >
              Refresh
            </Button>

            {/* Compose button */}
            <Button
              variant="primary"
              size="sm"
              icon={<PlusCircle className="w-4 h-4" />}
              onClick={() => navigate('/compose')}
            >
              Compose New Email
            </Button>
          </div>
        </div>

        {/* Quick summary stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div
            onClick={() => {
              setActiveTab('scheduled');
              setSearchResults(null);
            }}
            className={`p-5 rounded-xl border transition-all cursor-pointer ${
              activeTab === 'scheduled' && !searchResults
                ? 'bg-slate-900/90 border-indigo-500/50 ring-1 ring-indigo-500/30'
                : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Scheduled Emails</span>
              <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                <CalendarClock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white">{scheduledEmails.length}</span>
              <span className="text-xs text-slate-400">waiting in queue</span>
            </div>
          </div>

          <div
            onClick={() => {
              setActiveTab('sent');
              setSearchResults(null);
            }}
            className={`p-5 rounded-xl border transition-all cursor-pointer ${
              activeTab === 'sent' && !searchResults
                ? 'bg-slate-900/90 border-indigo-500/50 ring-1 ring-indigo-500/30'
                : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Sent Emails</span>
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                <Send className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white">{sentEmails.length}</span>
              <span className="text-xs text-slate-400">delivered</span>
            </div>
          </div>

          <div className="p-5 rounded-xl bg-slate-900/40 border border-slate-800 flex flex-col justify-between sm:col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Redis Limiter Spacing</span>
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                <Sparkles className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-xs text-slate-300 font-medium block">
                Atomic 200/hr + 2s Min Delay
              </span>
              <span className="text-[11px] text-slate-400">Ensures 100% spam-safe send rate</span>
            </div>
          </div>
        </div>

        {/* Search bar & Tabs */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            {/* Tabs */}
            <div className="flex items-center gap-2 border-b sm:border-b-0 border-slate-800 pb-2 sm:pb-0">
              <button
                onClick={() => {
                  setActiveTab('scheduled');
                  setSearchResults(null);
                }}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                  activeTab === 'scheduled' && !searchResults
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <CalendarClock className="w-4 h-4" />
                <span>Scheduled Emails</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    activeTab === 'scheduled' && !searchResults
                      ? 'bg-indigo-500 text-white'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {scheduledEmails.length}
                </span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('sent');
                  setSearchResults(null);
                }}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                  activeTab === 'sent' && !searchResults
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Send className="w-4 h-4" />
                <span>Sent Emails</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    activeTab === 'sent' && !searchResults
                      ? 'bg-indigo-500 text-white'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {sentEmails.length}
                </span>
              </button>
            </div>

            {/* Elasticsearch Search form */}
            <form onSubmit={handleSearch} className="relative max-w-sm w-full">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search subject, recipient, body..."
                className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-20 py-2 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
              />
              <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {searchQuery && (
                  <button
                    type="button"
                    onClick={clearSearch}
                    className="text-[10px] text-slate-400 hover:text-slate-200 px-1.5 py-0.5 rounded hover:bg-slate-800"
                  >
                    Clear
                  </button>
                )}
                <Button
                  type="submit"
                  size="sm"
                  variant="ghost"
                  loading={isSearching}
                  className="px-2 py-1 text-xs"
                >
                  Search
                </Button>
              </div>
            </form>
          </div>

          {/* Active Search Results Banner */}
          {searchResults && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-indigo-400" />
                <span>
                  Found <strong>{searchResults.length}</strong> email(s) matching query "{searchQuery}"
                </span>
              </div>
              <button
                onClick={clearSearch}
                className="underline hover:text-white font-medium"
              >
                Back to {activeTab} emails
              </button>
            </div>
          )}

          {/* Tables */}
          {searchResults ? (
            <EmailTable
              type={activeTab}
              emails={searchResults}
              loading={isSearching}
              error={searchError}
              onRetry={() => void handleSearch({ preventDefault: () => {} } as any)}
              onComposeClick={() => navigate('/compose')}
            />
          ) : activeTab === 'scheduled' ? (
            <EmailTable
              type="scheduled"
              emails={scheduledEmails}
              loading={loadingScheduled}
              error={errorScheduled}
              onRetry={fetchScheduled}
              onComposeClick={() => navigate('/compose')}
            />
          ) : (
            <EmailTable
              type="sent"
              emails={sentEmails}
              loading={loadingSent}
              error={errorSent}
              onRetry={fetchSent}
              onComposeClick={() => navigate('/compose')}
            />
          )}
        </div>
      </main>

      {/* Connect Slack Modal */}
      <Modal
        isOpen={isSlackModalOpen}
        onClose={() => setIsSlackModalOpen(false)}
        title="Slack Notification Integration"
        maxWidth="md"
        footer={
          <div className="flex items-center justify-between w-full">
            {slackStatus.connected ? (
              <Button
                variant="danger"
                size="sm"
                loading={disconnectingSlack}
                onClick={handleDisconnectSlack}
              >
                Disconnect Slack
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                icon={<MessageSquare className="w-3.5 h-3.5" />}
                onClick={handleConnectSlack}
              >
                Authorize with Slack
              </Button>
            )}
            <div className="flex items-center gap-2">
              {slackStatus.connected && (
                <Button variant="outline" size="sm" onClick={handleConnectSlack}>
                  Reconnect
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={() => setIsSlackModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-950/70 border border-slate-800">
            <div className="w-10 h-10 rounded-lg bg-[#4A154B]/20 border border-[#4A154B]/40 flex items-center justify-center text-[#E01E5A]">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-100">ReachInbox Slack Bot</h4>
              <p className="text-xs text-slate-400">
                Receive instant channel alerts when email campaigns complete or encounter rate limits.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-slate-950/40 border border-slate-800 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Connection Status:</span>
              <span
                className={`font-medium flex items-center gap-1.5 ${
                  slackStatus.connected ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {slackStatus.connected ? (
                  <>
                    <CheckCircle className="w-3.5 h-3.5" />
                    Connected to {slackStatus.teamName || 'Workspace'}
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3.5 h-3.5" />
                    Not Connected
                  </>
                )}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Alerts:</span>
              <span className="text-slate-200">Campaign start, send errors, rate-limit delays</span>
            </div>
          </div>

          <div className="text-xs text-slate-400">
            To connect a custom workspace, specify <code>SLACK_CLIENT_ID</code> and <code>SLACK_CLIENT_SECRET</code> in your <code>backend/.env</code>.
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Dashboard;
