import Link from 'next/link';
import type { Metadata } from 'next';
import { AlertTriangle, Download, FileCode2, GitBranch, Rocket, Upload } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MetricCard } from '@/components/shared/metric-card';
import { PageHeader, Section } from '@/components/shared/page-header';
import { EmptyState, InfoNote, UnavailableState, WarningNote } from '@/components/shared/states';
import { CapabilityBadge, HealthDot } from '@/components/shared/status-badges';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { scopeFromAuth } from '@/lib/tenancy';
import { prisma } from '@/lib/db';
import { parseJsonLoose } from '@/lib/json';
import { CAPABILITY_DEFINITIONS } from '@/lib/commerce/capability-registry';
import { THEME_LOCAL_CHANGE_RESOLUTION_LABELS, type ThemeLocalChangeResolution } from '@/lib/enums';
import { countryFlag, formatNumber, formatRelativeTime, titleCase } from '@/lib/utils';

export const metadata: Metadata = { title: 'Themes' };
export const dynamic = 'force-dynamic';

const RESOLUTION_NOTES: Record<ThemeLocalChangeResolution, string> = {
  PRESERVE_LOCAL:
    'Leave the store on its current theme. The managed release is not applied and the divergence stays visible.',
  REPLACE_WITH_MANAGED:
    'Apply the managed release and discard the local template changes. Destructive — requires a typed confirmation.',
  DOWNLOAD_COMPARISON:
    'Export both versions so a developer can diff them properly in their own tooling.',
  MARK_FOR_DEVELOPER_REVIEW:
    'Record that the two need reconciling and hold the store back from this rollout.',
};

export default async function ThemesPage() {
  const auth = await requireAuthOrRedirect('/themes');
  const scope = scopeFromAuth(auth);

  const [releases, assignments] = await Promise.all([
    prisma.themeRelease.findMany({
      where: { organisationId: scope.organisationId },
      orderBy: [{ name: 'asc' }, { version: 'desc' }],
      include: {
        uploadedBy: { select: { name: true } },
        _count: { select: { assignments: true } },
      },
    }),
    prisma.themeAssignment.findMany({
      where: { organisationId: scope.organisationId },
      include: {
        connection: {
          select: { id: true, name: true, countryCode: true, healthStatus: true, hierarchyMode: true },
        },
        release: { select: { id: true, name: true, version: true, status: true } },
      },
      orderBy: { connection: { name: 'asc' } },
    }),
  ]);

  const publishedByName = new Map<string, string>();
  for (const release of releases) {
    if (release.status === 'PUBLISHED') publishedByName.set(release.name, release.version);
  }

  const behind = assignments.filter((assignment) => {
    const current = publishedByName.get(assignment.activeThemeName);
    return current && current !== assignment.activeThemeVersion;
  });
  const withLocalChanges = assignments.filter((assignment) => assignment.hasLocalModifications);

  const byName = new Map<string, typeof releases>();
  for (const release of releases) {
    byName.set(release.name, [...(byName.get(release.name) ?? []), release]);
  }

  return (
    <>
      <PageHeader
        title="Themes"
        breadcrumbs={[{ label: 'Experience' }, { label: 'Themes' }]}
        description="Managed theme releases, what each store is actually running, and where local template changes stand in the way of a rollout."
        actions={
          <>
            <Button variant="outline" size="sm" disabled title="Theme upload is not enabled in this release">
              <Upload className="h-4 w-4" aria-hidden />
              Upload a theme
            </Button>
            <Button size="sm" asChild>
              <Link href="/deployments/new?category=THEMES">
                <Rocket className="h-4 w-4" aria-hidden />
                Plan a theme rollout
              </Link>
            </Button>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Managed releases" value={formatNumber(releases.length)} />
        <MetricCard label="Stores with a theme" value={formatNumber(assignments.length)} />
        <MetricCard
          label="Behind the published release"
          value={formatNumber(behind.length)}
          tone={behind.length > 0 ? 'warning' : 'default'}
        />
        <MetricCard
          label="With local modifications"
          value={formatNumber(withLocalChanges.length)}
          tone={withLocalChanges.length > 0 ? 'warning' : 'default'}
          tooltip="Templates edited directly in the store. A managed rollout would discard them unless handled deliberately."
        />
      </div>

      {withLocalChanges.length > 0 ? (
        <WarningNote className="mb-6">
          <span className="font-medium">
            {withLocalChanges.length} store{withLocalChanges.length === 1 ? '' : 's'} carry local template
            changes.
          </span>{' '}
          This platform will not attempt to merge theme code — that is a developer&rsquo;s job with a proper
          diff. A rollout holds these stores back and asks you to choose explicitly.
        </WarningNote>
      ) : null}

      <Section title="Store assignments" description="What each store is running right now.">
        {assignments.length === 0 ? (
          <EmptyState title="No theme assignments" description="Run a metadata sync to capture active themes." />
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Store</TableHead>
                  <TableHead>Active theme</TableHead>
                  <TableHead>Managed release</TableHead>
                  <TableHead>Version status</TableHead>
                  <TableHead>Local changes</TableHead>
                  <TableHead>Deployed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((assignment) => {
                  const published = publishedByName.get(assignment.activeThemeName);
                  const isBehind = Boolean(published && published !== assignment.activeThemeVersion);

                  return (
                    <TableRow key={assignment.id}>
                      <TableCell>
                        <Link
                          href={`/stores/${assignment.connectionId}?tab=theme`}
                          className="flex items-center gap-1.5 font-medium hover:underline"
                        >
                          <HealthDot status={assignment.connection.healthStatus} />
                          <span aria-hidden>{countryFlag(assignment.connection.countryCode)}</span>
                          {assignment.connection.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm">{assignment.activeThemeName}</p>
                        <code className="font-mono text-xs text-muted-foreground">
                          {assignment.activeThemeVersion}
                        </code>
                      </TableCell>
                      <TableCell>
                        {assignment.release ? (
                          <Badge variant="secondary" size="sm">
                            {assignment.release.name} {assignment.release.version}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Unmanaged</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {isBehind ? (
                          <Badge variant="warning" size="sm">
                            Behind {published}
                          </Badge>
                        ) : published ? (
                          <Badge variant="success" size="sm">
                            Current
                          </Badge>
                        ) : (
                          <Badge variant="muted" size="sm">
                            No published release
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="max-w-sm">
                        {assignment.hasLocalModifications ? (
                          <>
                            <Badge variant="warning" size="sm">
                              <AlertTriangle aria-hidden />
                              Modified
                            </Badge>
                            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                              {assignment.localModificationSummary}
                            </p>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">None</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatRelativeTime(assignment.deployedAt)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </Section>

      <Section title="Release library" description="Theme packages tracked as managed releases.">
        {releases.length === 0 ? (
          <EmptyState title="No releases" description="No managed theme release has been created yet." />
        ) : (
          <div className="space-y-4">
            {[...byName.entries()].map(([name, versions]) => (
              <Card key={name}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileCode2 className="h-4 w-4 text-muted-foreground" aria-hidden />
                    {name}
                  </CardTitle>
                  <CardDescription>
                    {versions.length} tracked version{versions.length === 1 ? '' : 's'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Version</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="max-w-md">Release notes</TableHead>
                        <TableHead className="text-right">Stores</TableHead>
                        <TableHead>Package</TableHead>
                        <TableHead>Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {versions.map((release) => {
                        const compatibility = parseJsonLoose<{ stencilCli?: string; testedOn?: string[] }>(
                          release.compatibilityJson,
                          {},
                        );
                        return (
                          <TableRow key={release.id}>
                            <TableCell>
                              <code className="font-mono text-sm font-medium">{release.version}</code>
                              {release.isSimulated ? (
                                <Badge variant="info" size="sm" className="ml-2">
                                  Simulated
                                </Badge>
                              ) : null}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  release.status === 'PUBLISHED'
                                    ? 'success'
                                    : release.status === 'MANAGED'
                                      ? 'info'
                                      : 'muted'
                                }
                                size="sm"
                              >
                                {titleCase(release.status)}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-md">
                              <p className="text-xs leading-relaxed text-muted-foreground">
                                {release.releaseNotes}
                              </p>
                              {compatibility.stencilCli ? (
                                <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                                  Stencil CLI {compatibility.stencilCli}
                                </p>
                              ) : null}
                            </TableCell>
                            <TableCell className="tabular text-right">{release._count.assignments}</TableCell>
                            <TableCell>
                              <p className="font-mono text-xs text-muted-foreground">
                                {release.packageFileName}
                              </p>
                              {release.packageSizeBytes ? (
                                <p className="text-xs text-muted-foreground">
                                  {(release.packageSizeBytes / 1_048_576).toFixed(1)} MB
                                </p>
                              ) : null}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                              {formatRelativeTime(release.createdAt)}
                              {release.uploadedBy ? <p>{release.uploadedBy.name}</p> : null}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="When a store has local template changes"
        description="A rollout never merges theme code. These are the four choices offered instead."
      >
        <div className="grid gap-3 md:grid-cols-2">
          {(Object.keys(THEME_LOCAL_CHANGE_RESOLUTION_LABELS) as ThemeLocalChangeResolution[]).map(
            (resolution) => (
              <Card key={resolution}>
                <CardContent className="p-4">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    {resolution === 'DOWNLOAD_COMPARISON' ? (
                      <Download className="h-4 w-4 text-muted-foreground" aria-hidden />
                    ) : (
                      <GitBranch className="h-4 w-4 text-muted-foreground" aria-hidden />
                    )}
                    {THEME_LOCAL_CHANGE_RESOLUTION_LABELS[resolution]}
                    {resolution === 'REPLACE_WITH_MANAGED' ? (
                      <Badge variant="destructive" size="sm">
                        Destructive
                      </Badge>
                    ) : null}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {RESOLUTION_NOTES[resolution]}
                  </p>
                </CardContent>
              </Card>
            ),
          )}
        </div>
      </Section>

      <div className="grid gap-4 md:grid-cols-2">
        <UnavailableState
          title="Theme upload"
          icon={Upload}
          reason={
            <>
              <CapabilityBadge status="NOT_IMPLEMENTED" showIcon={false} />{' '}
              {CAPABILITY_DEFINITIONS['themes.upload'].unavailableReason} Uploads are asynchronous — the API
              returns a job that must be polled — and each store keeps only a limited number of custom themes.
            </>
          }
          docsHref="https://docs.bigcommerce.com/api-reference/store-management/themes"
        />
        <UnavailableState
          title="Theme activation"
          icon={Rocket}
          reason={
            <>
              <CapabilityBadge status="NOT_IMPLEMENTED" showIcon={false} />{' '}
              {CAPABILITY_DEFINITIONS['themes.activate'].unavailableReason}
            </>
          }
          docsHref="https://docs.bigcommerce.com/api-reference/store-management/themes"
        />
      </div>

      <InfoNote className="mt-4">
        Rollback is possible in principle because the previous theme stays installed — but only while the store
        has a free theme slot. That constraint is checked during a rollout&rsquo;s preflight rather than assumed.
      </InfoNote>
    </>
  );
}
