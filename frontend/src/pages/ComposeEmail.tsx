import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Send,
  Clock,
  Sparkles,
  Users,
  AlertCircle,
  Upload,
  X,
  ChevronDown,
  Mail,
  FileText,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import emailService from '../services/email.service';
import type { Sender } from '../types';
import Header from '../components/Header';
import Button from '../components/Button';
import { Input, Textarea } from '../components/Input';
import { parseRecipients, parseCSVFileContent, isValidEmail } from '../utils/format';
import { toLocalDatetimeInputValue, formatDateTime } from '../utils/date';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Sender dropdown
// ---------------------------------------------------------------------------
interface SenderSelectProps {
  senders: Sender[];
  value: string;
  onChange: (id: string) => void;
  loading: boolean;
}

const SenderSelect: React.FC<SenderSelectProps> = ({ senders, value, onChange, loading }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = senders.find((s) => s.id === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => !loading && setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 px-3.5 py-2.5 text-sm text-slate-100 transition-colors focus:outline-none"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 truncate">
          <Mail className="w-4 h-4 text-indigo-400 shrink-0" />
          {loading ? (
            <span className="text-slate-400 animate-pulse">Loading sendersâ€¦</span>
          ) : selected ? (
            <span className="truncate">
              {selected.displayName ? `${selected.displayName} ` : ''}
              <span className="text-slate-400">&lt;{selected.email}&gt;</span>
            </span>
          ) : (
            <span className="text-slate-400">Select a senderâ€¦</span>
          )}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && senders.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg shadow-xl py-1 max-h-52 overflow-auto"
        >
          {senders.map((s) => (
            <li
              key={s.id}
              role="option"
              aria-selected={s.id === value}
              onClick={() => { onChange(s.id); setOpen(false); }}
              className={`px-3.5 py-2.5 text-sm cursor-pointer flex items-center gap-2 transition-colors ${
                s.id === value ? 'bg-indigo-600/30 text-indigo-300' : 'text-slate-200 hover:bg-slate-800'
              }`}
            >
              <CheckCircle2
                className={`w-4 h-4 shrink-0 ${s.id === value ? 'opacity-100 text-indigo-400' : 'opacity-0'}`}
              />
              <span className="truncate">
                {s.displayName ? `${s.displayName} ` : ''}
                <span className="text-slate-400">&lt;{s.email}&gt;</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {open && senders.length === 0 && !loading && (
        <div className="absolute z-50 mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-3 text-xs text-slate-400">
          No senders found.
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export const ComposeEmail: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Senders
  const [senders, setSenders] = useState<Sender[]>([]);
  const [sendersLoading, setSendersLoading] = useState(true);
  const [selectedSenderId, setSelectedSenderId] = useState('');

  useEffect(() => {
    let cancelled = false;
    emailService
      .getSenders()
      .then((data) => {
        if (cancelled) return;
        setSenders(data);
        if (data.length > 0) setSelectedSenderId(data[0].id);
      })
      .catch(() => { if (!cancelled) toast.error('Could not load senders.'); })
      .finally(() => { if (!cancelled) setSendersLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Form fields
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [startTimeLocal, setStartTimeLocal] = useState(() =>
    toLocalDatetimeInputValue(new Date(Date.now() + 60 * 1000)),
  );
  const [delaySeconds, setDelaySeconds] = useState(2);
  const [hourlyLimit, setHourlyLimit] = useState(200);

  // Recipients (text area + CSV file)
  const [recipientsRaw, setRecipientsRaw] = useState('');
  const [fileEmails, setFileEmails] = useState<string[]>([]);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allRecipients = React.useMemo<string[]>(() => {
    const textList = parseRecipients(recipientsRaw);
    const combined = [...textList];
    const seen = new Set(textList.map((e) => e.toLowerCase()));
    for (const e of fileEmails) {
      const lc = e.toLowerCase();
      if (!seen.has(lc)) { seen.add(lc); combined.push(e); }
    }
    return combined;
  }, [recipientsRaw, fileEmails]);

  const invalidEmails = allRecipients.filter((e) => !isValidEmail(e));

  const processFile = useCallback((file: File) => {
    setFileError(null);
    if (!file.name.match(/\.(csv|txt)$/i)) {
      setFileError('Only .csv or .txt files are supported.');
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setFileError('File too large. Maximum is 5 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCSVFileContent(text);
      setFileEmails(parsed);
      setUploadedFile(file);
    };
    reader.onerror = () => setFileError('Could not read the file.');
    reader.readAsText(file);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const clearFile = () => {
    setUploadedFile(null);
    setFileEmails([]);
    setFileError(null);
  };

  // Estimated end time
  const estimatedEndTime = React.useMemo(() => {
    if (allRecipients.length === 0) return null;
    const start = new Date(startTimeLocal);
    if (Number.isNaN(start.getTime())) return null;
    const delayMs = Math.max(0, delaySeconds * 1000);
    const limit = Math.max(1, hourlyLimit);
    const lastIdx = allRecipients.length - 1;
    const batch = Math.floor(lastIdx / limit);
    const pos = lastIdx % limit;
    const batchDuration = Math.max(3_600_000, limit * delayMs);
    return new Date(start.getTime() + batch * batchDuration + pos * delayMs);
  }, [allRecipients.length, startTimeLocal, delaySeconds, hourlyLimit]);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (allRecipients.length === 0) {
      setFormError('Add at least one recipient â€” paste emails or upload a CSV/TXT file.');
      return;
    }
    if (invalidEmails.length > 0) {
      setFormError(
        `Invalid emails detected: ${invalidEmails.slice(0, 3).join(', ')}${invalidEmails.length > 3 ? 'â€¦' : ''}`,
      );
      return;
    }
    if (!subject.trim()) { setFormError('Subject is required.'); return; }
    if (!body.trim()) { setFormError('Email body is required.'); return; }
    const startDate = new Date(startTimeLocal);
    if (Number.isNaN(startDate.getTime())) {
      setFormError('Please select a valid scheduled start time.');
      return;
    }

    setSubmitting(true);
    try {
      await emailService.createCampaign({
        subject: subject.trim(),
        body: body.trim(),
        startTime: startDate.toISOString(),
        delayBetweenEmails: Math.max(0, Math.floor(delaySeconds * 1000)),
        hourlyLimit: Math.max(1, Math.floor(hourlyLimit)),
        senderId: selectedSenderId || user?.senderId,
        recipients: allRecipients,
      });
      toast.success(
        `${allRecipients.length} recipient${allRecipients.length !== 1 ? 's' : ''} scheduled!`,
        'Campaign Created',
      );
      navigate('/dashboard');
    } catch (err: any) {
      const msg = err.response?.data?.error ?? err.message ?? 'Failed to schedule campaign.';
      setFormError(msg);
      toast.error(msg, 'Scheduling Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const previewList = allRecipients.slice(0, 5);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Header />
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Dashboard
          </Link>
        </div>

        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl backdrop-blur-md">
          {/* Title */}
          <div className="border-b border-slate-800 pb-6 mb-6">
            <h1 className="text-xl font-bold text-white flex items-center gap-2 flex-wrap">
              <span>Compose Email Campaign</span>
              <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                BullMQ Delayed Queues
              </span>
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Set your audience, configure rate limits, and schedule delayed queue dispatch.
            </p>
          </div>

          {/* Error banner */}
          {formError && (
            <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-3 text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block mb-0.5">Submission Error</span>
                <span>{formError}</span>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Sender */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-300">
                Sender <span className="text-rose-400">*</span>
              </label>
              <SenderSelect
                senders={senders}
                value={selectedSenderId}
                onChange={setSelectedSenderId}
                loading={sendersLoading}
              />
            </div>

            {/* Recipients */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className="block text-sm font-medium text-slate-300">
                  Recipients <span className="text-rose-400">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-md ${
                      allRecipients.length > 0
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {allRecipients.length} recipient{allRecipients.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              <textarea
                value={recipientsRaw}
                onChange={(e) => setRecipientsRaw(e.target.value)}
                rows={3}
                placeholder="alice@example.com, bob@example.com&#10;charlie@example.com"
                className="w-full rounded-lg bg-slate-900 border border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-100 placeholder-slate-500 px-3.5 py-2.5 text-sm transition-colors focus:outline-none resize-y"
              />

              {/* File upload zone */}
              <div onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
                {uploadedFile ? (
                  <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300">
                    <div className="flex items-center gap-2 truncate">
                      <FileText className="w-4 h-4 shrink-0" />
                      <span className="truncate font-medium">{uploadedFile.name}</span>
                      <span className="text-emerald-400/70 shrink-0">
                        â€” {fileEmails.length} email{fileEmails.length !== 1 ? 's' : ''} found
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={clearFile}
                      className="p-1 rounded-md hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 transition-colors shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center gap-3 p-3.5 rounded-lg bg-slate-900/60 border border-dashed border-slate-700 hover:border-indigo-500 hover:bg-indigo-500/5 transition-colors group text-left"
                  >
                    <Upload className="w-4 h-4 text-slate-400 group-hover:text-indigo-400 transition-colors shrink-0" />
                    <span className="text-xs text-slate-400 group-hover:text-slate-300 transition-colors">
                      Upload .csv or .txt â€” or drag &amp; drop here
                    </span>
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  className="sr-only"
                  onChange={handleFileChange}
                  aria-label="Upload recipient CSV or TXT file"
                />
              </div>

              {fileError && (
                <p className="text-xs text-rose-400 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {fileError}
                </p>
              )}
              {invalidEmails.length > 0 && (
                <p className="text-xs text-amber-400">
                  âš  Invalid emails detected:{' '}
                  {invalidEmails.slice(0, 3).join(', ')}
                  {invalidEmails.length > 3 ? ` â€¦(+${invalidEmails.length - 3} more)` : ''}
                </p>
              )}

              {/* Preview */}
              {allRecipients.length > 0 && (
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 overflow-hidden">
                  <div className="px-3 py-2 border-b border-slate-800 text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                    Recipient Preview
                  </div>
                  <ul className="divide-y divide-slate-800/60">
                    {previewList.map((email) => (
                      <li key={email} className="px-3 py-2 text-xs text-slate-300 font-mono flex items-center gap-2">
                        <Mail className="w-3 h-3 text-slate-500 shrink-0" />
                        {email}
                      </li>
                    ))}
                  </ul>
                  {allRecipients.length > 5 && (
                    <div className="px-3 py-2 text-[11px] text-slate-500 border-t border-slate-800">
                      â€¦ and {allRecipients.length - 5} more recipient{allRecipients.length - 5 !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Subject */}
            <Input
              label="Subject"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Exciting product update from ReachInbox"
            />

            {/* Body */}
            <Textarea
              label="Email Body"
              required
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={`Hi there,\n\nWe wanted to reach outâ€¦`}
            />

            {/* Scheduling */}
            <div className="p-5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <span className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-400" />
                  Scheduling &amp; Dispatch Controls
                </span>
                <span className="text-[11px] text-slate-400 hidden sm:block">
                  Redis atomic rate limiting
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Start Time <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={startTimeLocal}
                    onChange={(e) => setStartTimeLocal(e.target.value)}
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Gap Between Sends (seconds)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={delaySeconds}
                    onChange={(e) => setDelaySeconds(Math.max(0, Number(e.target.value)))}
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                    required
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">Default: 2 s</span>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Hourly Limit (per sender)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    step="1"
                    value={hourlyLimit}
                    onChange={(e) => setHourlyLimit(Math.max(1, Number(e.target.value)))}
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                    required
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">Max 200/hr recommended</span>
                </div>
              </div>

              {estimatedEndTime && (
                <div className="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-xs flex items-center justify-between text-indigo-300">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    Estimated completion:
                  </span>
                  <span className="font-semibold text-indigo-200">{formatDateTime(estimatedEndTime)}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => navigate('/dashboard')}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="md"
                loading={submitting}
                icon={<Send className="w-4 h-4" />}
                disabled={submitting || allRecipients.length === 0}
              >
                Schedule Campaign
              </Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
};

export default ComposeEmail;

