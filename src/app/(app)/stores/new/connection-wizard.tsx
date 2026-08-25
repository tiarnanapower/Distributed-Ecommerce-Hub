'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CircleCheck,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { InfoNote, WarningNote } from '@/components/shared/states';
import { CapabilityBadge } from '@/components/shared/status-badges';
import { createConnection, testConnection, verifyCapabilities } from '@/app/actions/connections';
import {
  CONNECTION_TYPE_LABELS,
  CONNECTION_TYPES,
  HIERARCHY_MODE_LABELS,
  HIERARCHY_MODES,
  STORE_CLASSIFICATIONS,
  type ConnectionType,
  type HierarchyMode,
  type StoreClassification,
} from '@/lib/enums';
import { MINIMUM_READ_SCOPES } from '@/lib/commerce/capability-registry';
import { cn, titleCase } from '@/lib/utils';

interface Option {
  id: string;
  name: string;
  meta?: string;
}

interface WizardProps {
  companies: (Option & { regions: Option[] })[];
  brands: Option[];
  environments: Option[];
  masters: Option[];
  templates: Option[];
}

const STEPS = [
  { id: 'type', label: 'Connection type' },
  { id: 'identity', label: 'Store identity' },
  { id: 'credentials', label: 'Credentials' },
  { id: 'placement', label: 'Placement' },
  { id: 'inheritance', label: 'Inheritance' },
  { id: 'verify', label: 'Verify' },
] as const;

const CURRENCIES = ['GBP', 'USD', 'EUR', 'CAD', 'AUD', 'JPY', 'SEK', 'AED', 'MXN', 'SGD'];
const COUNTRIES = [
  ['GB', 'United Kingdom'],
  ['US', 'United States'],
  ['DE', 'Germany'],
  ['FR', 'France'],
  ['NL', 'Netherlands'],
  ['CA', 'Canada'],
  ['AU', 'Australia'],
  ['JP', 'Japan'],
  ['SE', 'Sweden'],
  ['AE', 'United Arab Emirates'],
  ['MX', 'Mexico'],
  ['SG', 'Singapore'],
  ['IE', 'Ireland'],
  ['ES', 'Spain'],
  ['IT', 'Italy'],
] as const;

export function ConnectionWizard({ companies, brands, environments, masters, templates }: WizardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
    latencyMs?: number;
    grantedScopes?: string[];
    missingScopes?: string[];
    isSimulated?: boolean;
  } | null>(null);

  const [form, setForm] = useState({
    name: '',
    storeHash: '',
    accessToken: '',
    clientId: '',
    clientSecret: '',
    companyId: companies[0]?.id ?? '',
    regionId: '',
    brandId: '',
    environmentId: environments.find((environment) => environment.name === 'Production')?.id ?? '',
    connectionType: 'INDEPENDENT' as ConnectionType,
    hierarchyMode: 'INDEPENDENT' as HierarchyMode,
    classification: 'B2C' as StoreClassification,
    masterConnectionId: '',
    templateId: '',
    countryCode: 'GB',
    currencyCode: 'GBP',
    locale: 'en-GB',
    notes: '',
    isDemo: false,
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[key as string];
      return next;
    });
  };

  const selectedCompany = companies.find((company) => company.id === form.companyId);

  const canAdvance = (): boolean => {
    switch (STEPS[step]!.id) {
      case 'identity':
        return form.name.trim().length >= 2;
      case 'credentials':
        return form.isDemo || (form.storeHash.trim().length >= 5 && form.accessToken.trim().length > 0);
      case 'placement':
        return Boolean(form.companyId);
      default:
        return true;
    }
  };

  const submit = () => {
    startTransition(async () => {
      setFormError(null);
      setFieldErrors({});
      const result = await createConnection(form);
      if (!result.ok) {
        setFormError(result.error ?? 'The store could not be created.');
        setFieldErrors(result.fieldErrors ?? {});
        // Send the operator back to the step that owns the failing field.
        const failing = Object.keys(result.fieldErrors ?? {})[0];
        if (failing === 'storeHash' || failing === 'accessToken') setStep(2);
        else if (failing === 'name') setStep(1);
        else if (failing === 'companyId') setStep(3);
        toast.error('Could not create the store', { description: result.error });
        return;
      }
      setCreatedId(result.data!.id);
      setStep(STEPS.length - 1);
      toast.success('Store connection created', {
        description: 'Run the connection test to verify the credential and capabilities.',
      });
    });
  };

  const runTest = () => {
    if (!createdId) return;
    startTransition(async () => {
      const result = await testConnection(createdId);
      setTestResult({
        ok: result.ok,
        message: result.data?.message ?? result.error ?? 'The test did not return a result.',
        latencyMs: result.data?.latencyMs,
        grantedScopes: result.data?.grantedScopes,
        missingScopes: result.data?.missingScopes,
        isSimulated: result.data?.isSimulated,
      });
      if (result.ok) {
        await verifyCapabilities(createdId);
        toast.success('Connection verified', { description: 'The capability matrix has been refreshed.' });
      } else {
        toast.error('Connection test failed', { description: result.error });
      }
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      {/* Step rail */}
      <nav aria-label="Wizard steps">
        <ol className="space-y-1">
          {STEPS.map((wizardStep, index) => {
            const isComplete = index < step;
            const isCurrent = index === step;
            return (
              <li key={wizardStep.id}>
                <button
                  type="button"
                  disabled={index > step || Boolean(createdId)}
                  onClick={() => setStep(index)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors',
                    isCurrent && 'bg-secondary font-medium',
                    !isCurrent && index < step && 'text-muted-foreground hover:bg-muted',
                    index > step && 'cursor-not-allowed text-muted-foreground/50',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
                      isComplete
                        ? 'bg-success text-success-foreground'
                        : isCurrent
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {isComplete ? <Check className="h-3 w-3" aria-hidden /> : index + 1}
                  </span>
                  {wizardStep.label}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Panel */}
      <div className="min-w-0 space-y-4">
        {formError ? (
          <WarningNote>
            <span className="font-medium">{formError}</span>
          </WarningNote>
        ) : null}

        {/* ---------------- Step 1: connection type ---------------- */}
        {STEPS[step]!.id === 'type' ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">What are you connecting?</CardTitle>
              <CardDescription>
                This choice matters. An independent store has its own store hash and credentials; a storefront
                channel lives inside an existing Multi-Storefront store and shares its catalog.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {CONNECTION_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => set('connectionType', type)}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors',
                    form.connectionType === type ? 'border-primary bg-primary/[0.04]' : 'hover:border-primary/40',
                  )}
                  aria-pressed={form.connectionType === type}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                      form.connectionType === type ? 'border-primary bg-primary' : 'border-input',
                    )}
                  >
                    {form.connectionType === type ? (
                      <Check className="h-2.5 w-2.5 text-primary-foreground" aria-hidden />
                    ) : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium">{CONNECTION_TYPE_LABELS[type]}</span>
                    <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">
                      {TYPE_DESCRIPTIONS[type]}
                    </span>
                  </span>
                </button>
              ))}

              <InfoNote>
                Creating a brand-new BigCommerce store is not something any public API can do — it is an account
                and billing operation. If the store does not exist yet, use{' '}
                <Link href="/stores/new?mode=provisioning" className="font-medium text-primary hover:underline">
                  guided provisioning
                </Link>{' '}
                to build the checklist, then come back here once BigCommerce has provisioned it.
              </InfoNote>
            </CardContent>
          </Card>
        ) : null}

        {/* ---------------- Step 2: identity ---------------- */}
        {STEPS[step]!.id === 'identity' ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Store identity</CardTitle>
              <CardDescription>How this store appears throughout the platform.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Friendly store name" htmlFor="name" error={fieldErrors.name} required>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(event) => set('name', event.target.value)}
                  placeholder="Acme Netherlands"
                  autoFocus
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Country" htmlFor="country">
                  <Select value={form.countryCode} onValueChange={(value) => set('countryCode', value)}>
                    <SelectTrigger id="country">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map(([code, label]) => (
                        <SelectItem key={code} value={code}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field
                  label="Transactional currency"
                  htmlFor="currency"
                  hint="Cannot be changed after the store is created in BigCommerce."
                >
                  <Select value={form.currencyCode} onValueChange={(value) => set('currencyCode', value)}>
                    <SelectTrigger id="currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((currency) => (
                        <SelectItem key={currency} value={currency}>
                          {currency}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Locale" htmlFor="locale">
                  <Input
                    id="locale"
                    value={form.locale}
                    onChange={(event) => set('locale', event.target.value)}
                    placeholder="en-GB"
                  />
                </Field>
              </div>

              <Field label="Store type" htmlFor="classification">
                <Select
                  value={form.classification}
                  onValueChange={(value) => set('classification', value as StoreClassification)}
                >
                  <SelectTrigger id="classification">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STORE_CLASSIFICATIONS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {titleCase(value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Notes" htmlFor="notes" hint="Optional context for whoever picks this store up next.">
                <Textarea
                  id="notes"
                  value={form.notes}
                  onChange={(event) => set('notes', event.target.value)}
                  placeholder="Why this store exists, who owns it, and anything unusual about how it trades."
                  rows={3}
                />
              </Field>
            </CardContent>
          </Card>
        ) : null}

        {/* ---------------- Step 3: credentials ---------------- */}
        {STEPS[step]!.id === 'credentials' ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">BigCommerce credentials</CardTitle>
              <CardDescription>
                Create a V2/V3 API account in the store&rsquo;s control panel under Settings → API accounts, then
                paste the token here.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex cursor-pointer items-start gap-2.5 rounded-md border p-3">
                <Checkbox
                  checked={form.isDemo}
                  onCheckedChange={(value) => set('isDemo', Boolean(value))}
                  aria-describedby="demo-help"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">Create as a demo connection</span>
                  <span id="demo-help" className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    No credential is stored and no BigCommerce store is ever contacted. Everything the store
                    shows comes from seeded data, and it is labelled as such throughout.
                  </span>
                </span>
              </label>

              {!form.isDemo ? (
                <>
                  <Field
                    label="Store hash"
                    htmlFor="storeHash"
                    error={fieldErrors.storeHash}
                    required
                    hint="Found in the control-panel URL: store-{hash}.mybigcommerce.com"
                  >
                    <Input
                      id="storeHash"
                      value={form.storeHash}
                      onChange={(event) => set('storeHash', event.target.value)}
                      placeholder="abc123def4"
                      className="font-mono"
                      autoComplete="off"
                    />
                  </Field>

                  <Field
                    label="Access token"
                    htmlFor="accessToken"
                    error={fieldErrors.accessToken}
                    required
                    hint="Encrypted with AES-256-GCM before it is stored, and never returned to a browser again."
                  >
                    <Input
                      id="accessToken"
                      type="password"
                      value={form.accessToken}
                      onChange={(event) => set('accessToken', event.target.value)}
                      placeholder="••••••••••••••••••••••••"
                      className="font-mono"
                      autoComplete="off"
                    />
                  </Field>

                  <details className="rounded-md border p-3">
                    <summary className="cursor-pointer text-sm font-medium">
                      Client ID and secret (optional)
                    </summary>
                    <div className="mt-3 space-y-3">
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        API account tokens authenticate with the <code className="font-mono">X-Auth-Token</code>{' '}
                        header alone. A client id and secret are only needed for app-style OAuth flows, which this
                        platform does not use. Supply them only if your process requires them to be held here.
                      </p>
                      <Field label="Client ID" htmlFor="clientId">
                        <Input
                          id="clientId"
                          value={form.clientId}
                          onChange={(event) => set('clientId', event.target.value)}
                          className="font-mono"
                          autoComplete="off"
                        />
                      </Field>
                      <Field label="Client secret" htmlFor="clientSecret">
                        <Input
                          id="clientSecret"
                          type="password"
                          value={form.clientSecret}
                          onChange={(event) => set('clientSecret', event.target.value)}
                          className="font-mono"
                          autoComplete="off"
                        />
                      </Field>
                    </div>
                  </details>

                  <Card className="border-info/30 bg-info/[0.03]">
                    <CardContent className="p-4">
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        <ShieldCheck className="h-4 w-4 text-info" aria-hidden />
                        Scopes this platform can use
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        Grant at least these read scopes. Anything missing downgrades the affected capabilities to
                        &ldquo;permission missing&rdquo; rather than failing silently.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {MINIMUM_READ_SCOPES.map((scope) => (
                          <code key={scope} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                            {scope}
                          </code>
                        ))}
                      </div>
                      <a
                        href="https://docs.bigcommerce.com/docs/start/authentication/api-accounts"
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        BigCommerce API accounts documentation
                        <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <InfoNote>
                  Demo connections are how the whole platform stays usable without credentials. Everything is
                  driven by the seeded snapshots, and every screen labels the source.
                </InfoNote>
              )}
            </CardContent>
          </Card>
        ) : null}

        {/* ---------------- Step 4: placement ---------------- */}
        {STEPS[step]!.id === 'placement' ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Where does this store sit?</CardTitle>
              <CardDescription>
                Company, region, brand and environment are organisational groupings inside this platform. They
                have no counterpart in BigCommerce.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Company" htmlFor="company" error={fieldErrors.companyId} required>
                  <Select
                    value={form.companyId}
                    onValueChange={(value) => {
                      set('companyId', value);
                      set('regionId', '');
                    }}
                  >
                    <SelectTrigger id="company">
                      <SelectValue placeholder="Choose a company" />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.map((company) => (
                        <SelectItem key={company.id} value={company.id}>
                          {company.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Region" htmlFor="region">
                  <Select
                    value={form.regionId || '__none'}
                    onValueChange={(value) => set('regionId', value === '__none' ? '' : value)}
                  >
                    <SelectTrigger id="region">
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Unassigned</SelectItem>
                      {(selectedCompany?.regions ?? []).map((region) => (
                        <SelectItem key={region.id} value={region.id}>
                          {region.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Brand" htmlFor="brand">
                  <Select
                    value={form.brandId || '__none'}
                    onValueChange={(value) => set('brandId', value === '__none' ? '' : value)}
                  >
                    <SelectTrigger id="brand">
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Unassigned</SelectItem>
                      {brands.map((brand) => (
                        <SelectItem key={brand.id} value={brand.id}>
                          {brand.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field
                  label="Environment"
                  htmlFor="environment"
                  hint="Production stores get the strictest guard rails."
                >
                  <Select
                    value={form.environmentId || '__none'}
                    onValueChange={(value) => set('environmentId', value === '__none' ? '' : value)}
                  >
                    <SelectTrigger id="environment">
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Unassigned</SelectItem>
                      {environments.map((environment) => (
                        <SelectItem key={environment.id} value={environment.id}>
                          {environment.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* ---------------- Step 5: inheritance ---------------- */}
        {STEPS[step]!.id === 'inheritance' ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">How should this store inherit?</CardTitle>
              <CardDescription>
                You can change this at any time, and tune it per resource category afterwards on the
                store&rsquo;s Configuration tab.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Hierarchy mode" htmlFor="hierarchy">
                <Select
                  value={form.hierarchyMode}
                  onValueChange={(value) => set('hierarchyMode', value as HierarchyMode)}
                >
                  <SelectTrigger id="hierarchy">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HIERARCHY_MODES.map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {HIERARCHY_MODE_LABELS[mode]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              {form.hierarchyMode === 'INHERITED' ? (
                <Field
                  label="Master store"
                  htmlFor="master"
                  hint="Product, category and customer-group structure will be compared against this store."
                >
                  <Select
                    value={form.masterConnectionId || '__none'}
                    onValueChange={(value) => set('masterConnectionId', value === '__none' ? '' : value)}
                  >
                    <SelectTrigger id="master">
                      <SelectValue placeholder="Choose a master store" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">None yet</SelectItem>
                      {masters.map((master) => (
                        <SelectItem key={master.id} value={master.id}>
                          {master.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              ) : null}

              {form.hierarchyMode === 'TEMPLATE_BASED' ? (
                <Field label="Configuration template" htmlFor="template">
                  <Select
                    value={form.templateId || '__none'}
                    onValueChange={(value) => set('templateId', value === '__none' ? '' : value)}
                  >
                    <SelectTrigger id="template">
                      <SelectValue placeholder="Choose a template" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">None yet</SelectItem>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                          {template.meta ? ` — ${template.meta}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              ) : null}

              <InfoNote>
                Nothing is written to any store as a result of this choice. Inheritance drives comparison and
                what a deployment would do; deployments are always dry-run first and confirmed explicitly.
              </InfoNote>
            </CardContent>
          </Card>
        ) : null}

        {/* ---------------- Step 6: verify ---------------- */}
        {STEPS[step]!.id === 'verify' ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {createdId ? 'Verify the connection' : 'Review and create'}
              </CardTitle>
              <CardDescription>
                {createdId
                  ? 'The store record exists. Test the connection to confirm the credential works and to build the capability matrix.'
                  : 'Check the summary, then create the store record.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
                <SummaryItem label="Name" value={form.name || '—'} />
                <SummaryItem label="Connection type" value={CONNECTION_TYPE_LABELS[form.connectionType]} />
                <SummaryItem
                  label="Store hash"
                  value={form.isDemo ? 'Demo connection — none' : form.storeHash || '—'}
                  mono
                />
                <SummaryItem
                  label="Credential"
                  value={form.isDemo ? 'None (demo)' : form.accessToken ? 'Supplied — will be encrypted' : 'Not supplied'}
                />
                <SummaryItem label="Company" value={selectedCompany?.name ?? '—'} />
                <SummaryItem
                  label="Region"
                  value={selectedCompany?.regions.find((region) => region.id === form.regionId)?.name ?? 'Unassigned'}
                />
                <SummaryItem label="Country and currency" value={`${form.countryCode} · ${form.currencyCode}`} />
                <SummaryItem label="Hierarchy" value={HIERARCHY_MODE_LABELS[form.hierarchyMode]} />
              </dl>

              {createdId ? (
                <>
                  <div className="flex flex-wrap gap-2 border-t pt-4">
                    <Button onClick={runTest} loading={pending}>
                      Run connection test
                    </Button>
                    <Button variant="outline" asChild>
                      <a href={`/stores/${createdId}`}>Open the store</a>
                    </Button>
                  </div>

                  {testResult ? (
                    <Card
                      className={cn(
                        testResult.ok ? 'border-success/30 bg-success/[0.03]' : 'border-destructive/30 bg-destructive/[0.03]',
                      )}
                    >
                      <CardContent className="p-4">
                        <p className="flex items-center gap-1.5 text-sm font-semibold">
                          {testResult.ok ? (
                            <CircleCheck className="h-4 w-4 text-success" aria-hidden />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />
                          )}
                          {testResult.ok ? 'Connection succeeded' : 'Connection failed'}
                          {testResult.latencyMs !== undefined ? (
                            <Badge variant="muted" size="sm">
                              {testResult.latencyMs}ms
                            </Badge>
                          ) : null}
                          {testResult.isSimulated ? (
                            <Badge variant="info" size="sm">
                              Simulated
                            </Badge>
                          ) : null}
                        </p>
                        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                          {testResult.message}
                        </p>

                        {testResult.grantedScopes && testResult.grantedScopes.length > 0 ? (
                          <div className="mt-3">
                            <p className="mb-1 text-xs font-medium">Granted scopes</p>
                            <div className="flex flex-wrap gap-1">
                              {testResult.grantedScopes.map((scope) => (
                                <code
                                  key={scope}
                                  className="rounded bg-success/10 px-1.5 py-0.5 font-mono text-[11px] text-success"
                                >
                                  {scope}
                                </code>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {testResult.missingScopes && testResult.missingScopes.length > 0 ? (
                          <div className="mt-3">
                            <p className="mb-1 text-xs font-medium">Missing scopes</p>
                            <div className="flex flex-wrap gap-1">
                              {testResult.missingScopes.map((scope) => (
                                <code
                                  key={scope}
                                  className="rounded bg-warning/10 px-1.5 py-0.5 font-mono text-[11px] text-warning"
                                >
                                  {scope}
                                </code>
                              ))}
                            </div>
                            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                              The affected capabilities appear as{' '}
                              <CapabilityBadge status="PERMISSION_MISSING" showIcon={false} /> rather than being
                              hidden.
                            </p>
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  ) : null}
                </>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {/* Navigation */}
        {!createdId ? (
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={() => setStep((value) => Math.max(0, value - 1))}
              disabled={step === 0 || pending}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back
            </Button>

            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep((value) => value + 1)} disabled={!canAdvance() || pending}>
                Continue
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            ) : (
              <Button onClick={submit} loading={pending}>
                Create store connection
              </Button>
            )}
          </div>
        ) : (
          <div className="flex justify-end">
            <Button
              onClick={() => {
                router.push(`/stores/${createdId}`);
                router.refresh();
              }}
            >
              Finish
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

const TYPE_DESCRIPTIONS: Record<ConnectionType, string> = {
  INDEPENDENT:
    'A standalone BigCommerce store with its own store hash, credentials, catalog and customers. Nothing is shared with any other store.',
  MSF_PARENT:
    'A BigCommerce store with Multi-Storefront enabled, hosting several storefront channels that share one catalog and one set of credentials.',
  CHANNEL_CONNECTION:
    'A storefront channel inside an existing Multi-Storefront store. Connect the parent store first, then discover its channels.',
  DEVELOPMENT:
    'A development store used to rehearse changes. Guard rails are relaxed and its trading data is excluded from group reporting.',
  SANDBOX:
    'A sandbox or test connection. Useful for integration work without touching a store that serves customers.',
};

function Field({
  label,
  htmlFor,
  children,
  hint,
  error,
  required,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  hint?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function SummaryItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('text-right font-medium', mono && 'font-mono text-xs')}>{value}</dd>
    </div>
  );
}
