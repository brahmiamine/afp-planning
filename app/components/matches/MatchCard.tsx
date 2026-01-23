'use client';

import { CheckCircle2 } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { Match } from '@/types/match';
import { useMatchExtras } from '@/hooks/useMatchExtras';
import { MatchCardHeader } from './MatchCardHeader';
import { MatchTeams } from './MatchTeams';
import { MatchDetails } from './MatchDetails';
import { MatchEditor } from './MatchEditor';
import { Badge } from '@/components/ui/badge';

interface MatchCardProps {
  match: Match;
  onMatchUpdate?: () => void;
}

export const MatchCard = memo(function MatchCard({ match, onMatchUpdate }: MatchCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const { extras, reload: reloadExtras } = useMatchExtras(match.id);

  const handleSave = useCallback(() => {
    setIsEditing(false);
    reloadExtras();
    onMatchUpdate?.();
  }, [reloadExtras, onMatchUpdate]);

  const handleEdit = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsEditing(false);
  }, []);

  return (
    <>
      <div className="bg-card rounded-xl shadow-md hover:shadow-lg transition-shadow duration-300 overflow-hidden border border-border relative">
        <MatchCardHeader match={match} onEdit={handleEdit} extras={extras} />
        <div className="p-4 sm:p-6">
          <MatchTeams match={match} />
          <MatchDetails match={match} extras={extras} />
          {extras?.confirmed && (
            <div className="mt-4 pt-4 border-t flex items-center justify-end">
              <Badge variant="default">
                <CheckCircle2 className="w-3 h-3" />
                Complété
              </Badge>
            </div>
          )}
        </div>
      </div>

      {isEditing && (
        <MatchEditor
          match={match}
          onClose={handleClose}
          onSave={handleSave}
        />
      )}
    </>
  );
});
