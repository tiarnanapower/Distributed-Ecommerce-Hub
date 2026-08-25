import Link from 'next/link';
import type { Metadata } from 'next';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Section } from '@/components/shared/page-header';
import { EmptyState, InfoNote } from '@/components/shared/states';
import { RiskBadge } from '@/components/shared/status-badges';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { scopeFromAuth } from '@/lib/tenancy';
import { prisma } from '@/lib/db';
import { formatRelativeTime, titleCase } from '@/lib/utils';

export const metadata: Metadata = { title: 'Approval policies' };
export const dynamic = 'force-dynamic';

export default async function ApprovalSettingsPage() {
  const auth = await requireAuthOrRedirect('/settings/approvals');
  const scope = scopeFromAuth(auth);

  const [approvals, requireApprovalPolicies] = await Promise.all([
    prisma.approvalRequest.findMany({
      where: { organisationId: scope.organisationId },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: { requester: { select: { name: true } }, approver: { select: { name: true } } },
    }),
    prisma.inheritancePolicy.findMany({
      where: { organisationId: scope.organisationId, mode: 'REQUIRE_APPROVAL' },
    }),
  ]);

  return (
    <div className="space-y-4">
      <InfoNote>
        Approval is triggered by the inheritance mode of a resource category. Setting a category to{' '}
        <span className="font-medium">Require approval before updates</span> means any deployment touching it
        must be decided before it can run.
      </InfoNote>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Categories that require approval</CardTitle>
          <CardDescription>
            {requireApprovalPolicies.length === 0
              ? 'No category currently requires approval.'
              : `${requireApprovalPolicies.length} categories are gated.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {requireApprovalPolicies.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Change a category&rsquo;s mode under Inheritance policies to gate it.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {requireApprovalPolicies.map((policy) => (
                <Badge key={policy.id} variant="warning" size="sm">
                  {titleCase(policy.resourceCategory)} · {titleCase(policy.scopeType)}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Segregation of duties</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-muted-foreground">
            In this release every user is a Company Admin, so a requester can approve their own request. The
            approval record already stores the requester and the approver as separate fields, and the role
            matrix already distinguishes <code className="font-mono text-xs">deployment:create</code> from{' '}
            <code className="font-mono text-xs">deployment:approve</code> — enforcing genuine separation is a
            role assignment, not a schema change.
          </p>
        </CardContent>
      </Card>

      <Section title="Approval history">
        {approvals.length === 0 ? (
          <EmptyState title="No approval requests" description="Nothing has required approval yet." />
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Request</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requester</TableHead>
                  <TableHead>Approver</TableHead>
                  <TableHead>Decided</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {approvals.map((approval) => (
                  <TableRow key={approval.id}>
                    <TableCell className="max-w-sm">
                      {approval.subjectType === 'DEPLOYMENT' ? (
                        <Link href={`/deployments/${approval.subjectId}`} className="font-medium hover:underline">
                          {approval.title}
                        </Link>
                      ) : (
                        <p className="font-medium">{approval.title}</p>
                      )}
                      <p className="text-xs leading-relaxed text-muted-foreground">{approval.reason}</p>
                      {approval.decisionComment ? (
                        <p className="mt-0.5 text-xs italic leading-relaxed text-muted-foreground">
                          &ldquo;{approval.decisionComment}&rdquo;
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" size="sm">
                        {titleCase(approval.subjectType)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <RiskBadge level={approval.riskLevel} />
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          approval.status === 'APPROVED'
                            ? 'success'
                            : approval.status === 'REJECTED'
                              ? 'destructive'
                              : approval.status === 'PENDING'
                                ? 'warning'
                                : 'muted'
                        }
                        size="sm"
                      >
                        {titleCase(approval.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{approval.requester.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {approval.approver?.name ?? '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatRelativeTime(approval.decidedAt ?? approval.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </Section>
    </div>
  );
}
