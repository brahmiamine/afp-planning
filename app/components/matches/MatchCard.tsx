'use client';

import { ExternalLink, CheckCircle2 } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { Match } from '@/types/match';
import { useMatchExtras } from '@/hooks/useMatchExtras';
import { MatchCardHeader } from './MatchCardHeader';
import { MatchTeams } from './MatchTeams';
import { MatchDetails } from './MatchDetails';
import { MatchEditor } from './MatchEditor';

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
      <div className="bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow duration-300 overflow-hidden border border-gray-200 relative">
        <MatchCardHeader match={match} onEdit={handleEdit} />
        <div className="p-6">
          <MatchTeams match={match} />
          <MatchDetails match={match} extras={extras} />
          {(match.url || extras?.confirmed) && (
            <div className="mt-4 pt-4 border-t flex items-center justify-between gap-4">
              {match.url && (
                <a
                  href={match.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 text-sm inline-flex items-center gap-1"
                >
                  <ExternalLink className="w-4 h-4" />
                  Voir les détails complets
                </a>
              )}
              {extras?.confirmed && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-500 text-white text-xs font-semibold rounded-full shadow-md ml-auto">
                  <CheckCircle2 className="w-3 h-3" />
                  Confirmé
                </span>
              )}
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
