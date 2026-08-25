import { PageHeader } from '@/components/shared/page-header';
import { SETTINGS_SECTIONS } from '@/lib/navigation';
import { SettingsNav } from './settings-nav';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader
        title="Settings"
        breadcrumbs={[{ label: 'Administration' }, { label: 'Settings' }]}
        description="Organisation profile, hierarchy, inheritance and approval policies, security posture and feature flags."
      />

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <SettingsNav sections={[...SETTINGS_SECTIONS]} />
        <div className="min-w-0">{children}</div>
      </div>
    </>
  );
}
