'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { AlertTriangle, Check, Play, ThumbsDown, ThumbsUp } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { WarningNote } from '@/components/shared/states';
import { decideApproval, executeDeployment } from '@/app/actions/deployments';
import { confirmationMatches } from '@/lib/deployment/planner';

export function ExecutePanel({
  deploymentId,
  status,
  requiresTypedConfirmation,
  confirmationPhrase,
  errors,
  liveTargetCount,
  simulatedTargetCount,
}: {
  deploymentId: string;
  status: string;
  requiresTypedConfirmation: boolean;
  confirmationPhrase: string | null;
  errors: string[];
  liveTargetCount: number;
  simulatedTargetCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmation, setConfirmation] = useState('');

  const blocked = errors.length > 0;
  const executable = ['DRAFT', 'APPROVED', 'FAILED', 'PARTIAL'].includes(status);
  const confirmationOk = !requiresTypedConfirmation || confirmationMatches(confirmationPhrase, confirmation);

  if (!executable) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Execution</CardTitle>
          <CardDescription>
            {status === 'AWAITING_APPROVAL'
              ? 'This deployment is waiting for an approval decision before it can run.'
              : `A deployment in the ${status.toLowerCase().replace(/_/g, ' ')} state cannot be executed.`}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className={requiresTypedConfirmation ? 'border-destructive/40' : undefined}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          {requiresTypedConfirmation ? (
            <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />
          ) : (
            <Play className="h-4 w-4" aria-hidden />
          )}
          Execute this deployment
        </CardTitle>
        <CardDescription>
          {liveTargetCount > 0
            ? `${liveTargetCount} live store(s) and ${simulatedTargetCount} demo store(s) are in scope.`
            : `All ${simulatedTargetCount} target(s) are demo connections — execution is simulated and no BigCommerce store is contacted.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {blocked ? (
          <WarningNote>
            <span className="font-medium">This deployment cannot run.</span>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {errors.slice(0, 5).map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </WarningNote>
        ) : null}

        {requiresTypedConfirmation && confirmationPhrase ? (
          <div className="space-y-1.5">
            <Label htmlFor="typed-confirmation">
              Type <span className="font-mono font-semibold">{confirmationPhrase}</span> to confirm
            </Label>
            <Input
              id="typed-confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder={confirmationPhrase}
              autoComplete="off"
              aria-describedby="typed-confirmation-help"
            />
            <p id="typed-confirmation-help" className="text-xs leading-relaxed text-muted-foreground">
              This deployment is destructive or wide-reaching, so it needs an explicit typed confirmation
              rather than a single click.
            </p>
          </div>
        ) : null}

        <Button
          className="w-full"
          variant={requiresTypedConfirmation ? 'destructive' : 'default'}
          loading={pending}
          disabled={blocked || !confirmationOk}
          onClick={() =>
            startTransition(async () => {
              const result = await executeDeployment({ deploymentId, confirmation });
              if (!result.ok) {
                toast.error('Could not execute', { description: result.error ?? result.hint });
                return;
              }
              toast.success('Deployment queued', {
                description: 'Progress is visible in the Sync Centre and on this page.',
              });
              router.refresh();
            })
          }
        >
          <Play className="h-4 w-4" aria-hidden />
          {requiresTypedConfirmation ? 'Confirm and execute' : 'Execute deployment'}
        </Button>

        <p className="text-xs leading-relaxed text-muted-foreground">
          Items whose write path is not enabled are recorded as blocked with the reason, rather than being
          skipped silently or reported as applied.
        </p>
      </CardContent>
    </Card>
  );
}

export function ApprovalPanel({
  approvalId,
  title,
  reason,
  changeSummary,
  targetScope,
  riskLevel,
  requesterName,
}: {
  approvalId: string;
  title: string;
  reason: string | null;
  changeSummary: string | null;
  targetScope: string | null;
  riskLevel: string;
  requesterName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [comment, setComment] = useState('');

  const decide = (decision: 'APPROVED' | 'REJECTED') => {
    startTransition(async () => {
      const result = await decideApproval({ approvalId, decision, comment: comment || undefined });
      if (!result.ok) {
        toast.error('Could not record the decision', { description: result.error });
        return;
      }
      toast.success(decision === 'APPROVED' ? 'Approved' : 'Rejected', {
        description: 'The decision is recorded in the audit log.',
      });
      router.refresh();
    });
  };

  return (
    <Card className="border-warning/40">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-sm">Awaiting approval</CardTitle>
          <Badge variant={riskLevel === 'HIGH' || riskLevel === 'CRITICAL' ? 'destructive' : 'warning'} size="sm">
            {riskLevel} risk
          </Badge>
        </div>
        <CardDescription>Requested by {requesterName}. Nothing runs until this is decided.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Request</dt>
            <dd className="mt-0.5">{title}</dd>
          </div>
          {reason ? (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Reason</dt>
              <dd className="mt-0.5 leading-relaxed text-muted-foreground">{reason}</dd>
            </div>
          ) : null}
          {changeSummary ? (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Change</dt>
              <dd className="mt-0.5 leading-relaxed text-muted-foreground">{changeSummary}</dd>
            </div>
          ) : null}
          {targetScope ? (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Scope</dt>
              <dd className="mt-0.5 leading-relaxed text-muted-foreground">{targetScope}</dd>
            </div>
          ) : null}
        </dl>

        <div className="space-y-1.5">
          <Label htmlFor="approval-comment">Comment</Label>
          <Textarea
            id="approval-comment"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Record the reasoning behind your decision."
            rows={2}
          />
        </div>

        <div className="flex gap-2">
          <Button className="flex-1" loading={pending} onClick={() => decide('APPROVED')}>
            <ThumbsUp className="h-4 w-4" aria-hidden />
            Approve
          </Button>
          <Button
            className="flex-1"
            variant="outline"
            loading={pending}
            onClick={() => decide('REJECTED')}
          >
            <ThumbsDown className="h-4 w-4" aria-hidden />
            Reject
          </Button>
        </div>

        <p className="flex gap-1.5 text-xs leading-relaxed text-muted-foreground">
          <Check className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          In this release the requester and approver may be the same person. The data model already separates
          them, so a real segregation-of-duties policy is a configuration change rather than a rewrite.
        </p>
      </CardContent>
    </Card>
  );
}
