interface ProgressBarProps { percent: number; compact?: boolean; }

export function ProgressBar({ percent, compact = false }: ProgressBarProps) {
  const color = percent === 100 ? 'bg-success-500' : percent >= 50 ? 'bg-accent-500' : 'bg-primary-400';
  return (
    <div className="w-full">
      {!compact && (
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary-500">Progress</span>
          <span className="text-xs font-bold tabular-nums text-primary-900">{percent}%</span>
        </div>
      )}
      <div className={`${compact ? 'h-1' : 'h-1.5'} bg-primary-100 rounded-full overflow-hidden`}>
        <div
          className={`h-full ${color} rounded-full transition-all duration-500 ease-out`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
