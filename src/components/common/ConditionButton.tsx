import { InspectionItemStatus, CONDITION_LABELS } from '../../types';
import { Check, AlertTriangle, Eye, MinusCircle } from 'lucide-react';

interface ConditionButtonProps {
  condition: InspectionItemStatus;
  selected?: boolean;
  onClick: () => void;
}

const config: Record<InspectionItemStatus, { selectedBg: string; icon: typeof Check; iconColor: string }> = {
  good: { selectedBg: 'bg-success-500', icon: Check, iconColor: 'text-success-600' },
  monitor: { selectedBg: 'bg-warning-500', icon: Eye, iconColor: 'text-warning-600' },
  needs_attention: { selectedBg: 'bg-danger-500', icon: AlertTriangle, iconColor: 'text-danger-600' },
  not_inspected: { selectedBg: 'bg-primary-200', icon: MinusCircle, iconColor: 'text-primary-400' },
};

export function ConditionButton({ condition, selected, onClick }: ConditionButtonProps) {
  const c = config[condition];
  const Icon = c.icon;
  return (
    <button
      onClick={onClick}
      className={`min-h-[52px] flex items-center justify-center gap-2 px-3 py-3 rounded-lg text-sm font-semibold transition-all border active:scale-[0.97] ${
        selected
          ? `${c.selectedBg} text-white border-transparent shadow-card`
          : `bg-white border-primary-200 text-primary-600 hover:border-primary-300 hover:bg-primary-50`
      }`}
    >
      <Icon className={`w-4 h-4 flex-shrink-0 ${selected ? 'text-white' : c.iconColor}`} />
      {condition === 'not_inspected' ? 'N/A' : CONDITION_LABELS[condition]}
    </button>
  );
}
