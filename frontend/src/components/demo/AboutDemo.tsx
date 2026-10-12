import { ExternalLink, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { demoLinks } from '@/lib/demoConfig';
import { PortfolioBadge } from './labels';

function LinkAction({ href, primary, children, icon, missing }: { href: string | null; primary?: boolean; children: string; icon: React.ReactNode; missing: string }) {
  if (!href)
    return (
      <div className="flex flex-col items-start gap-1">
        <Button variant={primary ? 'default' : 'outline'} disabled aria-describedby={`${children.replace(/\s/g, '-')}-why`} title={missing}>
          {icon} {children}
        </Button>
        <span id={`${children.replace(/\s/g, '-')}-why`} className="text-xs text-muted-foreground">Link not configured yet</span>
      </div>
    );
  const external = /^https?:/i.test(href);
  return (
    <Button asChild variant={primary ? 'default' : 'outline'}>
      <a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{icon} {children}</a>
    </Button>
  );
}

export function AboutDemo() {
  return (
    <Card className="mb-6 overflow-hidden">
      <div className="flex flex-col gap-6 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">About This Demo</h2>
            <PortfolioBadge />
          </div>
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              This interactive demonstration showcases selected features of CEVI, a full-stack clinical decision-support research application.
            </p>
            <p>
              The complete platform integrates React, TypeScript, Node.js, MySQL, Prisma ORM, and a Python-based EfficientNet-B0 inference service.
            </p>
            <p>
              To make the project publicly accessible without paid cloud infrastructure, this version uses synthetic patient records and recorded research workflows.
            </p>
            <p className="text-foreground">
              Interested in the full implementation? I'd be happy to walk you through the architecture, machine learning integration, and engineering decisions during an interview.
            </p>
          </div>
          <ul className="mt-4 flex flex-wrap gap-2 text-xs" aria-label="How to read the labels in this demo">
            <li><Badge tone="outline">Synthetic Data</Badge> <span className="text-muted-foreground">fictional patients</span></li>
            <li><Badge tone="teal">Recorded result</Badge> <span className="text-muted-foreground">replayed model output</span></li>
            <li><Badge tone="blue">Browser-only</Badge> <span className="text-muted-foreground">your edits, kept locally</span></li>
          </ul>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-3 lg:items-end">
          <LinkAction primary href={demoLinks.contact} icon={<Mail className="h-4 w-4" />} missing="The contact link has not been configured for this build (VITE_DEMO_CONTACT_URL).">Request Full Demo</LinkAction>
          <LinkAction href={demoLinks.source} icon={<ExternalLink className="h-4 w-4" />} missing="The source repository link has not been configured for this build (VITE_DEMO_REPO_URL).">View Source Code</LinkAction>
        </div>
      </div>
    </Card>
  );
}
