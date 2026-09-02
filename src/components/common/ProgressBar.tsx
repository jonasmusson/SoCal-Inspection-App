interface ProgressBarProps { percent: number; }

export function ProgressBar({ percent }: ProgressBarProps) {
  const color = percent === 100 ? 'bg-success-500' : percent >= 50 ? 'bg-primary-500' : 'bg-warning-500';
  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm font-medium text-gray-700">Progress</span>
        <span className="text-sm font-semibold text-gray-900">{percent}%</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all duration-500`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
