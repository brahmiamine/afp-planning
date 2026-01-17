'use client';

import { ReactNode, memo } from 'react';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon?: ReactNode;
  borderColor?: 'blue' | 'green' | 'purple' | 'orange' | 'red';
  className?: string;
}

const borderColors = {
  blue: 'border-blue-500',
  green: 'border-green-500',
  purple: 'border-purple-500',
  orange: 'border-orange-500',
  red: 'border-red-500',
};

export const StatsCard = memo(function StatsCard({
  title,
  value,
  icon,
  borderColor = 'blue',
  className = '',
}: StatsCardProps) {
  return (
    <div className={`bg-white rounded-lg shadow-md p-6 border-l-4 ${borderColors[borderColor]} ${className}`}>
      <div className="flex items-center gap-3">
        {icon && <div className="flex-shrink-0">{icon}</div>}
        <div>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-sm text-gray-600">{title}</p>
        </div>
      </div>
    </div>
  );
});
