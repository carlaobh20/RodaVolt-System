import { useState, type ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';

type TabItem = {
  value: string;
  label: string;
  content: ReactNode;
};

export function Tabs({ items, defaultValue }: { items: TabItem[]; defaultValue?: string }) {
  const [active, setActive] = useState(defaultValue ?? items[0]?.value);
  const activeItem = items.find((item) => item.value === active);

  return (
    <div>
      <div className="flex gap-1 border-b border-neutral-200 dark:border-neutral-800">
        {items.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setActive(item.value)}
            className={cn(
              'border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              active === item.value
                ? 'border-brand-600 text-brand-700 dark:text-brand-400'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="pt-4">{activeItem?.content}</div>
    </div>
  );
}
