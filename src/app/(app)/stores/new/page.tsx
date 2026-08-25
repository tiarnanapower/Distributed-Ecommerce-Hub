import Link from 'next/link';
import type { Metadata } from 'next';
import { CircleCheck, ClipboardList, ExternalLink, Plug, Wrench } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader, Section } from '@/components/shared/page-header';
import { InfoNote, UnavailableState, WarningNote } from '@/components/shared/states';
import { requireAuthOrRedirect } from '@/lib/auth/session';
import { scopeFromAuth, tenantWhere } from '@/lib/tenancy';
import { prisma } from '@/lib/db';
import { AUTOMATION_LEVEL_LABELS, type AutomationLevel } from '@/lib/enums';
import { formatDate, titleCase } from '@/lib/utils';
import { ConnectionWizard } from './connection-wizard';

export const metadata: Metadata = { title: 'Add a store' };
export const dynamic = 'force-dynamic';

export default async function NewStorePage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const auth = await requireAuthOrRedirect('/stores/new');
  const scope = scopeFromAuth(auth);
  const { mode } = await searchParams;

  const [companies, brands, environments, masters, templates, plans] = await Promise.all([
    prisma.company.findMany({
      where: {
        organisationId: scope.organisationId,
        deletedAt: null,
        ...(scope.allowedCompanyIds.length > 0 ? { id: { in: scope.allowedCompanyIds } } : {}),
      },
      orderBy: { name: 'asc' },
      include: { regions: { where: { deletedAt: null }, orderBy: { name: 'asc' } } },
    }),
    prisma.brand.findMany({
      where: { organisationId: scope.organisationId, deletedAt: null },
      orderBy: { name: 'asc' },
    }),
    prisma.environment.findMany({
      where: { organisationId: scope.organisationId },
      orderBy: { name: 'asc' },
    }),
    prisma.storeConnection.findMany({
      where: {
        ...tenantWhere(scope),
        deletedAt: null,
        hierarchyMode: { in: ['MASTER', 'MSF_PARENT'] },
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.configurationTemplate.findMany({
      where: { organisationId: scope.organisationId, deletedAt: null, status: 'PUBLISHED' },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, version: true },
    }),
    prisma.provisioningPlan.findMany({
      where: { organisationId: scope.organisationId, status: { not: 'COMPLETED' } },
      orderBy: { createdAt: 'desc' },
      include: { steps: { orderBy: { position: 'asc' } }, company: { select: { name: true } } },
    }),
  ]);

  const showProvisioning = mode === 'provisioning';

  return (
    <>
      <PageHeader
        title={showProvisioning ? 'Guided provisioning' : 'Add a store'}
        breadcrumbs={[
          { label: 'Estate' },
          { label: 'Stores', href: '/stores' },
          { label: showProvisioning ? 'Guided provisioning' : 'Add a store' },
        ]}
        description={
          showProvisioning
            ? 'For stores that do not exist yet. Tracks the manual steps, prepares the configuration, and connects the store once BigCommerce has provisioned it.'
            : 'Connect a BigCommerce store that already exists. If the store has not been created yet, use guided provisioning instead.'
        }
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href={showProvisioning ? '/stores/new' : '/stores/new?mode=provisioning'}>
              {showProvisioning ? (
                <>
                  <Plug className="h-4 w-4" aria-hidden />
                  Connect an existing store
                </>
              ) : (
                <>
                  <ClipboardList className="h-4 w-4" aria-hidden />
                  Guided provisioning
                </>
              )}
            </Link>
          </Button>
        }
      />

      {showProvisioning ? (
        <>
          <UnavailableState
            title="Creating a BigCommerce store is not an API operation"
            reason={
              <>
                There is no public API that creates a new BigCommerce store account. Provisioning a store is an
                account and billing matter handled by BigCommerce or through the partner portal. What this
                platform can do is prepare everything around it: capture the intended configuration, generate a
                launch checklist that distinguishes automated from manual steps, and connect and configure the
                store the moment it exists.
              </>
            }
            docsHref="https://docs.bigcommerce.com/docs/start/about"
            className="mb-6"
          />

          {plans.length === 0 ? (
            <InfoNote>
              No provisioning plans are in progress. Creating one records the intended market, currency, brand
              and template so the launch checklist can be generated.
            </InfoNote>
          ) : (
            <Section title="Provisioning plans in progress">
              <div className="space-y-4">
                {plans.map((plan) => {
                  const completed = plan.steps.filter((step) => step.status === 'COMPLETED').length;
                  const automated = plan.steps.filter((step) => step.automation === 'AUTOMATED').length;
                  const unsupported = plan.steps.filter((step) => step.automation === 'UNSUPPORTED').length;

                  return (
                    <Card key={plan.id}>
                      <CardHeader className="pb-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <CardTitle className="text-base">{plan.name}</CardTitle>
                            <CardDescription>
                              {plan.company.name} · {plan.intendedStoreName} · {plan.countryCode} ·{' '}
                              {plan.currencyCode} · {plan.locale} · created {formatDate(plan.createdAt)}
                            </CardDescription>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <Badge variant="warning">{titleCase(plan.status)}</Badge>
                            <Badge variant="muted">
                              {completed} of {plan.steps.length} steps complete
                            </Badge>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {plan.notes ? (
                          <p className="mb-4 rounded-md bg-muted/50 px-3 py-2 text-sm leading-relaxed text-muted-foreground">
                            {plan.notes}
                          </p>
                        ) : null}

                        <div className="mb-4 flex flex-wrap gap-2 text-xs">
                          <Badge variant="success" size="sm">
                            {automated} automated
                          </Badge>
                          <Badge variant="warning" size="sm">
                            {plan.steps.filter((step) => step.automation === 'MANUAL' || step.automation === 'PARTIAL').length}{' '}
                            manual or partial
                          </Badge>
                          <Badge variant="muted" size="sm">
                            {unsupported} with no public API
                          </Badge>
                        </div>

                        <ol className="space-y-2">
                          {plan.steps.map((step) => (
                            <li
                              key={step.id}
                              className="flex gap-3 rounded-md border p-3"
                            >
                              <span
                                className={
                                  step.status === 'COMPLETED'
                                    ? 'mt-0.5 text-success'
                                    : step.status === 'IN_PROGRESS'
                                      ? 'mt-0.5 text-info'
                                      : 'mt-0.5 text-muted-foreground/40'
                                }
                              >
                                {step.status === 'COMPLETED' ? (
                                  <CircleCheck className="h-4 w-4" aria-hidden />
                                ) : (
                                  <span className="flex h-4 w-4 items-center justify-center rounded-full border text-[10px]">
                                    {step.position}
                                  </span>
                                )}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p
                                    className={
                                      step.status === 'COMPLETED'
                                        ? 'text-sm font-medium text-muted-foreground line-through'
                                        : 'text-sm font-medium'
                                    }
                                  >
                                    {step.title}
                                  </p>
                                  <Badge
                                    variant={
                                      step.automation === 'AUTOMATED'
                                        ? 'success'
                                        : step.automation === 'PARTIAL'
                                          ? 'warning'
                                          : step.automation === 'MANUAL'
                                            ? 'info'
                                            : 'muted'
                                    }
                                    size="sm"
                                  >
                                    {AUTOMATION_LEVEL_LABELS[step.automation as AutomationLevel] ?? step.automation}
                                  </Badge>
                                  <Badge variant="outline" size="sm">
                                    {step.category}
                                  </Badge>
                                </div>
                                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                                  {step.description}
                                </p>
                                {step.docsUrl ? (
                                  <a
                                    href={step.docsUrl}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                                  >
                                    Documentation
                                    <ExternalLink className="h-3 w-3" aria-hidden />
                                  </a>
                                ) : null}
                              </div>
                            </li>
                          ))}
                        </ol>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </Section>
          )}

          <Section title="What guided provisioning does and does not do">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-1.5 text-sm">
                    <CircleCheck className="h-4 w-4 text-success" aria-hidden />
                    This platform can
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {[
                      'Capture the intended configuration before the store exists.',
                      'Generate a launch checklist that separates automated from manual work.',
                      'Prepare a reusable configuration template from an existing store.',
                      'Connect the store and verify its credential and capabilities.',
                      'Apply the supported subset of a template after connection.',
                      'Dry-run a catalogue seed from a master store and show exactly what would change.',
                      'Record every step and every completion in the audit log.',
                    ].map((line) => (
                      <li key={line} className="flex gap-2">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-success" aria-hidden />
                        {line}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-1.5 text-sm">
                    <Wrench className="h-4 w-4 text-warning" aria-hidden />
                    This platform cannot
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {[
                      'Create a BigCommerce store account — no public API exists for it.',
                      'Create an API account or its token; that is done in the control panel.',
                      'Change a store’s default transactional currency after setup.',
                      'Configure a payment gateway or enter gateway credentials.',
                      'Register a domain, set DNS records or provision SSL.',
                      'Set tax rates on your behalf — the legal risk stays with a human.',
                    ].map((line) => (
                      <li key={line} className="flex gap-2">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-warning" aria-hidden />
                        {line}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </Section>
        </>
      ) : (
        <>
          {companies.length === 0 ? (
            <WarningNote>
              There are no companies to place a store into. Create one under Settings → Companies first.
            </WarningNote>
          ) : (
            <ConnectionWizard
              companies={companies.map((company) => ({
                id: company.id,
                name: company.name,
                regions: company.regions.map((region) => ({ id: region.id, name: region.name })),
              }))}
              brands={brands.map((brand) => ({ id: brand.id, name: brand.name }))}
              environments={environments.map((environment) => ({
                id: environment.id,
                name: environment.name,
              }))}
              masters={masters}
              templates={templates.map((template) => ({
                id: template.id,
                name: template.name,
                meta: `v${template.version}`,
              }))}
            />
          )}
        </>
      )}
    </>
  );
}
