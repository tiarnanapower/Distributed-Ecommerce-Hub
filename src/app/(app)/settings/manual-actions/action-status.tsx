'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { updateManualAction } from '@/app/actions/settings';

export function ManualActionStatus({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Select
      value={status}
      disabled={pending}
      onValueChange={(value) =>
        startTransition(async () => {
          const result = await updateManualAction({
            id,
            status: value as 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'NOT_APPLICABLE',
          });
          if (!result.ok) {
            toast.error('Could not update the item', { description: result.error });
            return;
          }
          toast.success('Checklist updated');
          router.refresh();
        })
      }
    >
      <SelectTrigger className="h-8 w-40 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="PENDING">Pending</SelectItem>
        <SelectItem value="IN_PROGRESS">In progress</SelectItem>
        <SelectItem value="COMPLETED">Completed</SelectItem>
        <SelectItem value="NOT_APPLICABLE">Not applicable</SelectItem>
      </SelectContent>
    </Select>
  );
}
