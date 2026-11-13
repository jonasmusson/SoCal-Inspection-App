interface ProgressBarProps { percent: number; }

export function ProgressBar({ percent }: ProgressBarProps) {
  const color = percent === 100 ? 'bg-success-500' : percent >= 50 ? 'bg-accent-500' : 'bg-warning-400';
  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Progress</span>
        <span className="text-sm font-bold tabular-nums text-gray-900">{percent}%</span>
      </div>
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-500 ease-out`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
