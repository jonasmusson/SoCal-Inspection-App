import { Inspection } from '../types';

/**
 * Returns the net labor seconds for an inspection:
 * elapsed wall-clock time minus any paused duration.
 */
export function laborSeconds(insp: Inspection): number {
  if (!insp.work_started_at) return 0;
  const start = new Date(insp.work_started_at).getTime();
  const end = insp.work_completed_at
    ? new Date(insp.work_completed_at).getTime()
    : insp.paused_at
      ? new Date(insp.paused_at).getTime()
      : Date.now();
  const elapsed = Math.max(0, (end - start) / 1000);
  return Math.max(0, elapsed - (insp.paused_duration_seconds ?? 0));
}

export function formatLaborTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
}
