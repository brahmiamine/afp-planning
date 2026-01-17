'use client';

import Image from 'next/image';
import { Users } from 'lucide-react';
import { memo } from 'react';
import { cn } from '@/lib/utils';

interface TeamLogoProps {
  logo?: string;
  name: string;
  size?: number;
  className?: string;
}

export const TeamLogo = memo(function TeamLogo({
  logo,
  name,
  size = 64,
  className = '',
}: TeamLogoProps) {
  if (logo) {
    return (
      <Image
        src={logo}
        alt={name}
        width={size}
        height={size}
        className={cn('rounded-full object-cover border-2 border-border', className)}
        unoptimized
      />
    );
  }

  return (
    <div
      className={cn('rounded-full bg-muted flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <Users className="text-muted-foreground" size={size * 0.5} />
    </div>
  );
});
