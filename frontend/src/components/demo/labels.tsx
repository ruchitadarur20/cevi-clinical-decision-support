import { Cloud, FlaskConical, MonitorSmartphone, Presentation } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { isDemo } from '@/lib/demoConfig';

/** Small provenance labels used across the portfolio demo. They render nothing in the normal full-stack build. */

export const BrowserOnlyBadge = () =>
  isDemo ? (
    <Badge tone="blue" title="Created or edited in this browser only. Nothing is sent to a server or stored in MySQL.">
      <MonitorSmartphone className="h-3 w-3" aria-hidden /> Browser-only
    </Badge>
  ) : null;

export const RecordedBadge = () =>
  isDemo ? (
    <Badge tone="teal" title="Output recorded by the full CEVI stack (FastAPI + EfficientNet-B0). It was not generated in your browser.">
      <FlaskConical className="h-3 w-3" aria-hidden /> Recorded result
    </Badge>
  ) : null;

export const PortfolioBadge = () =>
  isDemo ? (
    <Badge tone="teal" className="uppercase tracking-wide" title="Interactive portfolio demonstration with synthetic data">
      <Presentation className="h-3 w-3" aria-hidden /> Portfolio Demo
    </Badge>
  ) : null;

export const FullStackOnlyBadge = ({ children = 'Full application only' }: { children?: string }) =>
  isDemo ? (
    <Badge tone="outline" title="Requires the Node.js API, MySQL and the Python inference service, which are not part of this static demo.">
      <Cloud className="h-3 w-3" aria-hidden /> {children}
    </Badge>
  ) : null;
