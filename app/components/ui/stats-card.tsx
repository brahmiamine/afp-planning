'use client';

import { ReactNode, memo } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon?: ReactNode;
  borderColor?: 'blue' | 'green' | 'purple' | 'orange' | 'red';
  className?: string;
}

const borderColors = {
  blue: 'border-l-blue-500',
  green: 'border-l-green-500',
  purple: 'border-l-purple-500',
  orange: 'border-l-orange-500',
  red: 'border-l-red-500',
};

export const StatsCard = memo(function StatsCard({
  title,
  value,
  icon,
  borderColor = 'blue',
  className = '',
}: StatsCardProps) {
  return (
    <Card className={cn('border-l-4 shadow-md', borderColors[borderColor], className)}>
      <div className="p-6">
        <div className="flex items-center gap-3">
          {icon && <div className="flex-shrink-0">{icon}</div>}
          <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-sm text-muted-foreground">{title}</p>
          </div>
        </div>
      </div>
    </Card>
  );
});
