import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from './button';

export const Skeleton = ({ className }: { className?: string }) => <div className={cn('animate-pulse rounded-md bg-muted', className)} aria-hidden />;

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}…
    </div>
  );
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">{icon ?? <Inbox className="h-5 w-5" />}</div>
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof ApiError || error instanceof Error ? error.message : 'Something went wrong';
  const forbidden = error instanceof ApiError && error.status === 403;
  return (
    <div role="alert" className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 text-destructive"><AlertTriangle className="h-5 w-5" /></div>
      <p className="text-sm font-medium">{forbidden ? 'Access restricted' : 'Unable to load data'}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      {onRetry && !forbidden && <Button variant="outline" size="sm" onClick={onRetry}>Try again</Button>}
    </div>
  );
}
