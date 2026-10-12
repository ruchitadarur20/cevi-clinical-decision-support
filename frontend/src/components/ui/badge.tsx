import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap', {
  variants: {
    tone: {
      neutral: 'border-transparent bg-secondary text-secondary-foreground',
      blue: 'border-primary/20 bg-primary/10 text-primary',
      teal: 'border-teal/25 bg-teal/10 text-teal',
      success: 'border-success/25 bg-success/10 text-success',
      warning: 'border-warning/30 bg-warning/10 text-warning',
      danger: 'border-destructive/25 bg-destructive/10 text-destructive',
      outline: 'bg-transparent text-muted-foreground',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
