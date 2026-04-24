import { Scissors } from 'lucide-react';

export default function EmptyState({ label }: { label: string }) {
  return (
    <div className="empty-state">
      <Scissors className="empty-state-icon h-10 w-10" strokeWidth={1.6} />
      <p className="empty-state-label">{label}</p>
    </div>
  );
}
