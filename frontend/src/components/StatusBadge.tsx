import React from 'react';
import { Clock, CheckCircle2, AlertTriangle, XCircle, Loader2, Ban } from 'lucide-react';
import type { EmailStatus } from '../types';

export interface StatusBadgeProps {
  status: EmailStatus;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'sm' }) => {
  const configs: Record<
    EmailStatus,
    { label: string; icon: React.ReactNode; bg: string; text: string; border: string }
  > = {
    SCHEDULED: {
      label: 'Scheduled',
      icon: <Clock className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />,
      bg: 'bg-indigo-500/10',
      text: 'text-indigo-400',
      border: 'border-indigo-500/20',
    },
    PROCESSING: {
      label: 'Processing',
      icon: <Loader2 className={`${size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} animate-spin`} />,
      bg: 'bg-amber-500/10',
      text: 'text-amber-400',
      border: 'border-amber-500/20',
    },
    SENT: {
      label: 'Sent',
      icon: <CheckCircle2 className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />,
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-400',
      border: 'border-emerald-500/20',
    },
    RATE_LIMITED: {
      label: 'Rate Limited',
      icon: <AlertTriangle className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />,
      bg: 'bg-orange-500/10',
      text: 'text-orange-400',
      border: 'border-orange-500/20',
    },
    FAILED: {
      label: 'Failed',
      icon: <XCircle className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />,
      bg: 'bg-rose-500/10',
      text: 'text-rose-400',
      border: 'border-rose-500/20',
    },
    CANCELLED: {
      label: 'Cancelled',
      icon: <Ban className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />,
      bg: 'bg-slate-500/10',
      text: 'text-slate-400',
      border: 'border-slate-500/20',
    },
  };

  const config = configs[status] || configs.SCHEDULED;

  const sizeClasses = size === 'sm' ? 'px-2.5 py-0.5 text-xs gap-1.5' : 'px-3 py-1 text-sm gap-2';

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border ${sizeClasses} ${config.bg} ${config.text} ${config.border}`}
    >
      {config.icon}
      <span>{config.label}</span>
    </span>
  );
};

export default StatusBadge;
