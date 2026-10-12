import { useState } from 'react';
import { Info, RotateCcw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { KeyValue } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { PortfolioBadge } from './labels';
import { RolePermissionMatrix } from './RolePermissionMatrix';
import { titleCase } from '@/lib/format';
import type { Role } from '@/lib/types';

const ROLES: Role[] = ['CLINICIAN', 'RESEARCHER', 'ADMINISTRATOR'];

export function DemoSettings() {
  const { user, switchRole } = useAuth();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function reset() {
    setBusy(true);
    try {
      await api.post('/demo/reset');
      qc.clear();
      toast.success('Demo reset', { description: 'Browser-only changes were discarded and the original dataset restored.' });
      setConfirm(false);
      window.location.assign(import.meta.env.BASE_URL);
    } finally { setBusy(false); }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2"><CardTitle>Demo preferences</CardTitle><PortfolioBadge /></div>
          <CardDescription>Everything in this demo runs in your browser. Changes you make are kept in local storage on this device only.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <p className="mb-2 text-sm font-medium">Simulated role</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Simulated role">
              {ROLES.map((r) => (
                <Button key={r} size="sm" variant={user?.role === r ? 'default' : 'outline'} aria-pressed={user?.role === r} onClick={() => void switchRole?.(r)}>{titleCase(r)}</Button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/40 p-4">
            <div>
              <p className="text-sm font-medium">Reset demo</p>
              <p className="text-xs text-muted-foreground">Discards browser-only records, edits, images and role choice, and restores the bundled dataset.</p>
            </div>
            <Button variant="outline" onClick={() => setConfirm(true)}><RotateCcw className="h-4 w-4" /> Reset demo</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Application information</CardTitle><CardDescription>What this static build contains, and what it does not.</CardDescription></CardHeader>
        <CardContent>
          <dl className="divide-y">
            <KeyValue label="Build">Portfolio demo (static, browser-only)</KeyValue>
            <KeyValue label="Patient data"><Badge tone="outline">Synthetic</Badge></KeyValue>
            <KeyValue label="Model results"><Badge tone="teal">Recorded</Badge></KeyValue>
            <KeyValue label="Your edits"><Badge tone="blue">Browser-only</Badge></KeyValue>
            <KeyValue label="Backend / database">Not included (Node.js API, MySQL)</KeyValue>
            <KeyValue label="Live inference">Not included (FastAPI + PyTorch)</KeyValue>
          </dl>
          <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> Research prototype only. Not intended for clinical diagnosis, treatment, or patient care. Not a medical device.</p>
        </CardContent>
      </Card>

      <RolePermissionMatrix current={user?.role} />

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reset the demo?</DialogTitle><DialogDescription>All records, patients, images and users you created or edited in this browser will be discarded.</DialogDescription></DialogHeader>
          <DialogBody><p className="text-sm text-muted-foreground">The original synthetic dataset and recorded results are restored. This cannot be undone.</p></DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>Cancel</Button>
            <Button onClick={() => void reset()} loading={busy}>Reset demo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
