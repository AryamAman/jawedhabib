import { clsx } from 'clsx';
import { DisplaySlotStatus, getStatusClasses } from '../lib/scheduling';

const statusLabels: Record<DisplaySlotStatus, string> = {
  AVAILABLE: 'Available',
  BOOKED: 'Already Booked',
  UNAVAILABLE: 'Unavailable',
  RESCHEDULED: 'Rescheduled',
};

const orderedStatuses: DisplaySlotStatus[] = ['AVAILABLE', 'BOOKED', 'UNAVAILABLE', 'RESCHEDULED'];

export default function ScheduleLegend() {
  return (
    <div className="flex flex-wrap gap-3">
      {orderedStatuses.map((status) => (
        <div
          key={status}
          className={clsx(
            'inline-flex items-center gap-2 border px-3 py-2 text-[11px] uppercase tracking-[0.22em]',
            getStatusClasses(status),
          )}
        >
          <span className="h-2.5 w-2.5 rounded-full bg-current" />
          <span>{statusLabels[status]}</span>
        </div>
      ))}
    </div>
  );
}
