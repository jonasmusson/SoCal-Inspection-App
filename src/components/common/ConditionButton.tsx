import { InspectionItemStatus, CONDITION_LABELS } from '../../types';
import { Check, AlertTriangle, Eye, MinusCircle } from 'lucide-react';

interface ConditionButtonProps {
  condition: InspectionItemStatus;
  selected?: boolean;
  onClick: () => void;
}

const config: Record<InspectionItemStatus, { border: string; selectedBg: string; icon: typeof Check }> = {
  good: { border: 'border-success-300', selectedBg: 'bg-success-500', icon: Check },
  monitor: { border: 'border-warning-300', selectedBg: 'bg-warning-500', icon: Eye },
  needs_attention: { border: 'border-danger-300', selectedBg: 'bg-danger-500', icon: AlertTriangle },
  not_inspected: { border: 'border-gray-300', selectedBg: 'bg-gray-600', icon: MinusCircle },
};

export function ConditionButton({ condition, selected, onClick }: ConditionButtonProps) {
  const c = config[condition];
  const Icon = c.icon;
  return (
    <button onClick={onClick}
      className={`min-w-0 flex items-center justify-center gap-1.5 px-2 py-3 rounded-xl text-sm font-medium transition-all border-2 ${
        selected ? `${c.selectedBg} text-white border-transparent` : `bg-white ${c.border} text-gray-700 hover:bg-gray-50`
      }`}>
      <Icon className="w-4 h-4 flex-shrink-0" />
      {condition === 'not_inspected' ? 'Not Inspected' : CONDITION_LABELS[condition]}
    </button>
  );
}
