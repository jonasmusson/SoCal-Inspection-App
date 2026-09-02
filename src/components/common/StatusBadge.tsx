import { InspectionStatus, STATUS_LABELS } from '../../types';
import { Clock, Play, AlertCircle, CheckCircle, Send } from 'lucide-react';

interface StatusBadgeProps { status: InspectionStatus; size?: 'sm' | 'md'; }

const config: Record<InspectionStatus, { bg: string; text: string; icon: typeof Clock }> = {
  not_started: { bg: 'bg-gray-100', text: 'text-gray-700', icon: Clock },
  in_progress: { bg: 'bg-primary-100', text: 'text-primary-700', icon: Play },
  pending_review: { bg: 'bg-warning-100', text: 'text-warning-700', icon: AlertCircle },
  approved: { bg: 'bg-success-100', text: 'text-success-700', icon: CheckCircle },
  sent: { bg: 'bg-primary-100', text: 'text-primary-700', icon: Send },
};

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const c = config[status];
  const Icon = c.icon;
  const sizes = { sm: 'px-2 py-0.5 text-xs', md: 'px-3 py-1 text-sm' };
  const iconSizes = { sm: 'w-3 h-3', md: 'w-4 h-4' };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium ${c.bg} ${c.text} ${sizes[size]}`}>
      <Icon className={iconSizes[size]} />
      {STATUS_LABELS[status]}
    </span>
  );
}
