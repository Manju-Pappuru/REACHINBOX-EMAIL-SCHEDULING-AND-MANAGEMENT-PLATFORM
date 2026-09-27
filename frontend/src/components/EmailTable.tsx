import React, { useState } from 'react';
import { ExternalLink, Eye, AlertCircle, RefreshCw, Mail } from 'lucide-react';
import type { EmailRecipient } from '../types';
import StatusBadge from './StatusBadge';
import Loading from './Loading';
import EmptyState from './EmptyState';
import Modal from './Modal';
import Button from './Button';
import { formatDateTime } from '../utils/date';

export interface EmailTableProps {
  type: 'scheduled' | 'sent';
  emails: EmailRecipient[];
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  onComposeClick?: () => void;
}

export const EmailTable: React.FC<EmailTableProps> = ({
  type,
  emails,
  loading,
  error,
  onRetry,
  onComposeClick,
}) => {
  const [selectedEmail, setSelectedEmail] = useState<EmailRecipient | null>(null);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8">
        <Loading
          message={`Loading ${type === 'scheduled' ? 'scheduled' : 'sent'} emails...`}
          size="md"
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-6 text-center">
        <div className="flex flex-col items-center justify-center space-y-3">
          <AlertCircle className="w-8 h-8 text-rose-400" />
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-rose-300">Failed to load emails</h4>
            <p className="text-xs text-rose-400/80 max-w-md">{error}</p>
          </div>
          {onRetry && (
            <Button
              variant="outline"
              size="sm"
              icon={<RefreshCw className="w-3.5 h-3.5" />}
              onClick={onRetry}
            >
              Try Again
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <EmptyState
        title={type === 'scheduled' ? 'No scheduled emails' : 'No sent emails yet'}
        description={
          type === 'scheduled'
            ? 'You have not scheduled any emails. Create a campaign to start queueing deliveries.'
            : 'Sent emails will appear here once the worker processes and delivers them.'
        }
        actionLabel={type === 'scheduled' ? 'Compose New Email' : undefined}
        onAction={onComposeClick}
      />
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60 shadow-lg">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-800 bg-slate-950/60 text-xs uppercase font-semibold text-slate-400">
            <tr>
              <th scope="col" className="px-6 py-4">
                Recipient
              </th>
              <th scope="col" className="px-6 py-4">
                Subject
              </th>
              <th scope="col" className="px-6 py-4">
                {type === 'scheduled' ? 'Scheduled Time' : 'Sent Time'}
              </th>
              <th scope="col" className="px-6 py-4">
                Status
              </th>
              {type === 'sent' && (
                <th scope="col" className="px-6 py-4 text-right">
                  Action
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80 text-slate-200">
            {emails.map((email) => {
              const subject = email.campaign?.subject || '(No Subject)';
              const timeDisplay =
                type === 'scheduled'
                  ? formatDateTime(email.scheduledAt)
                  : formatDateTime(email.sentAt || email.updatedAt);

              return (
                <tr
                  key={email.id}
                  className="hover:bg-slate-800/40 transition-colors group cursor-pointer"
                  onClick={() => setSelectedEmail(email)}
                >
                  <td className="px-6 py-4 font-medium text-slate-100 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center shrink-0">
                        <Mail className="w-3.5 h-3.5" />
                      </div>
                      <span className="truncate max-w-[220px]" title={email.email}>
                        {email.email}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-300">
                    <span className="truncate max-w-[280px] block" title={subject}>
                      {subject}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-400 whitespace-nowrap text-xs">
                    {timeDisplay}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge status={email.status} />
                  </td>
                  {type === 'sent' && (
                    <td
                      className="px-6 py-4 whitespace-nowrap text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {email.etherealPreviewUrl ? (
                        <a
                          href={email.etherealPreviewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 transition-colors"
                        >
                          <span>View Email</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      ) : (
                        <button
                          onClick={() => setSelectedEmail(email)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Details</span>
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Email Details Modal */}
      {selectedEmail && (
        <Modal
          isOpen={Boolean(selectedEmail)}
          onClose={() => setSelectedEmail(null)}
          title="Email Details"
          maxWidth="lg"
          footer={
            <div className="flex items-center justify-between w-full">
              {selectedEmail.etherealPreviewUrl ? (
                <a
                  href={selectedEmail.etherealPreviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:underline"
                >
                  <span>Open Ethereal Preview</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              ) : (
                <span />
              )}
              <Button variant="secondary" size="sm" onClick={() => setSelectedEmail(null)}>
                Close
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 bg-slate-950/60 p-4 rounded-lg border border-slate-800 text-xs">
              <div>
                <span className="text-slate-400 block mb-0.5">Recipient</span>
                <span className="font-semibold text-slate-200 break-all">{selectedEmail.email}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">Status</span>
                <StatusBadge status={selectedEmail.status} />
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">Scheduled At</span>
                <span className="text-slate-200">{formatDateTime(selectedEmail.scheduledAt)}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">Sent At</span>
                <span className="text-slate-200">
                  {selectedEmail.sentAt ? formatDateTime(selectedEmail.sentAt) : 'Pending send'}
                </span>
              </div>
            </div>

            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                Subject
              </span>
              <p className="text-sm font-medium text-slate-100 bg-slate-950/60 px-3 py-2 rounded-lg border border-slate-800">
                {selectedEmail.campaign?.subject || '(No Subject)'}
              </p>
            </div>

            {selectedEmail.errorMessage && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs text-rose-400">
                <span className="font-semibold block mb-0.5">Delivery Error:</span>
                {selectedEmail.errorMessage}
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
};

export default EmailTable;
