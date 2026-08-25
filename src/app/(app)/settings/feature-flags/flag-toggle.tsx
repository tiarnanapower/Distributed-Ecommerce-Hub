'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { Switch } from '@/components/ui/switch';
import { toggleFeatureFlag } from '@/app/actions/settings';

export function FlagToggle({
  flagKey,
  name,
  isEnabled,
}: {
  flagKey: string;
  name: string;
  isEnabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Switch
      checked={isEnabled}
      disabled={pending}
      aria-label={`Toggle ${name}`}
      onCheckedChange={(value) =>
        startTransition(async () => {
          const result = await toggleFeatureFlag({ key: flagKey, isEnabled: value });
          if (!result.ok) {
            toast.error('Could not update the flag', { description: result.error });
            return;
          }
          toast.success(`${name} ${value ? 'enabled' : 'disabled'}`);
          router.refresh();
        })
      }
    />
  );
}
