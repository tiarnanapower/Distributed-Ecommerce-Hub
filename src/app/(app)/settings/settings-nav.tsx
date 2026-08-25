'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

export function SettingsNav({ sections }: { sections: { id: string; label: string; href: string }[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Settings sections">
      <ul className="space-y-0.5">
        {sections.map((section) => {
          const active = pathname === section.href;
          return (
            <li key={section.id}>
              <Link
                href={section.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'block rounded-md px-3 py-2 text-sm transition-colors',
                  active
                    ? 'bg-secondary font-medium text-secondary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
