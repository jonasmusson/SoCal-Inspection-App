import { InspectionStatus, STATUS_LABELS } from '../../types';

interface StatusBadgeProps { status: InspectionStatus; size?: 'sm' | 'md'; }

const config: Record<InspectionStatus, { bg: string; text: string; dot: string }> = {
  not_started: { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-400' },
  in_progress: { bg: 'bg-accent-100', text: 'text-accent-700', dot: 'bg-accent-500' },
  pending_review: { bg: 'bg-warning-100', text: 'text-warning-700', dot: 'bg-warning-500' },
  approved: { bg: 'bg-success-100', text: 'text-success-700', dot: 'bg-success-500' },
  sent: { bg: 'bg-primary-100', text: 'text-primary-700', dot: 'bg-primary-500' },
};

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const c = config[status];
  const sizes = { sm: 'px-2.5 py-0.5 text-xs', md: 'px-3 py-1 text-sm' };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium ${c.bg} ${c.text} ${sizes[size]} animate-fade-in`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {STATUS_LABELS[status]}
    </span>
  );
}
