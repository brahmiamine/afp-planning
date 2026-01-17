'use client';

import Image from 'next/image';
import { Users } from 'lucide-react';
import { memo } from 'react';

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
        className={`rounded-full object-cover border-2 border-gray-200 ${className}`}
        unoptimized
      />
    );
  }

  return (
    <div
      className={`rounded-full bg-gray-200 flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <Users className="text-gray-400" size={size * 0.5} />
    </div>
  );
});
