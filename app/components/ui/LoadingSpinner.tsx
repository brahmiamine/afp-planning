'use client';

import { Loader2 } from 'lucide-react';
import { memo } from 'react';

interface LoadingSpinnerProps {
  size?: number;
  className?: string;
  text?: string;
}

export const LoadingSpinner = memo(function LoadingSpinner({
  size = 24,
  className = '',
  text,
}: LoadingSpinnerProps) {
  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <Loader2 className={`text-indigo-600 animate-spin`} size={size} />
      {text && <p className="text-gray-600 mt-2">{text}</p>}
    </div>
  );
});
