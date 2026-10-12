import * as React from 'react';
import * as M from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils';

export const DropdownMenu = M.Root;
export const DropdownMenuTrigger = M.Trigger;
export const DropdownMenuContent = React.forwardRef<React.ElementRef<typeof M.Content>, React.ComponentPropsWithoutRef<typeof M.Content>>(
  ({ className, sideOffset = 6, ...p }, ref) => (
    <M.Portal>
      <M.Content ref={ref} sideOffset={sideOffset} className={cn('z-50 min-w-[12rem] overflow-hidden rounded-md border bg-card p-1 shadow-pop', className)} {...p} />
    </M.Portal>
  ),
);
DropdownMenuContent.displayName = 'DropdownMenuContent';
export const DropdownMenuItem = React.forwardRef<React.ElementRef<typeof M.Item>, React.ComponentPropsWithoutRef<typeof M.Item>>(
  ({ className, ...p }, ref) => (
    <M.Item ref={ref} className={cn('flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent', className)} {...p} />
  ),
);
DropdownMenuItem.displayName = 'DropdownMenuItem';
export const DropdownMenuLabel = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('px-2 py-1.5 text-xs text-muted-foreground', className)} {...p} />;
export const DropdownMenuSeparator = () => <M.Separator className="-mx-1 my-1 h-px bg-border" />;
