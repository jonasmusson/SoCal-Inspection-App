import { InspectionItemStatus, CONDITION_LABELS } from '../../types';
import { Check, AlertTriangle, Eye, MinusCircle } from 'lucide-react';

interface ConditionButtonProps {
  condition: InspectionItemStatus;
  selected?: boolean;
  onClick: () => void;
}

const config: Record<InspectionItemStatus, { border: string; selectedBg: string; icon: typeof Check; hover: string }> = {
  good: { border: 'border-success-300', selectedBg: 'bg-success-500', icon: Check, hover: 'hover:border-success-400 hover:bg-success-50' },
  monitor: { border: 'border-warning-300', selectedBg: 'bg-warning-500', icon: Eye, hover: 'hover:border-warning-400 hover:bg-warning-50' },
  needs_attention: { border: 'border-danger-300', selectedBg: 'bg-danger-500', icon: AlertTriangle, hover: 'hover:border-danger-400 hover:bg-danger-50' },
  not_inspected: { border: 'border-gray-300', selectedBg: 'bg-gray-700', icon: MinusCircle, hover: 'hover:border-gray-400 hover:bg-gray-50' },
};

export function ConditionButton({ condition, selected, onClick }: ConditionButtonProps) {
  const c = config[condition];
  const Icon = c.icon;
  return (
    <button
      onClick={onClick}
      className={`min-w-0 flex items-center justify-center gap-1.5 px-2 py-3.5 rounded-xl text-sm font-semibold transition-all border-2 active:scale-[0.97] ${
        selected
          ? `${c.selectedBg} text-white border-transparent shadow-card`
          : `bg-white ${c.border} text-gray-600 ${c.hover}`
      }`}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      {condition === 'not_inspected' ? 'N/A' : CONDITION_LABELS[condition]}
    </button>
  );
}
