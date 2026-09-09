'use client';

import { Label } from '@/app/components/ui/label';
import {
  ACCESS_ROLE_LABELS,
  ALL_ACCESS_ROLES,
  ALL_PLANNING_FUNCTIONS,
  PLANNING_FUNCTION_LABELS,
  type ClubAccessRole,
  type PlanningFunction,
} from '@/lib/auth/roles';

interface AccessRoleFieldsProps {
  idPrefix: string;
  accessRole: ClubAccessRole;
  planningFunctions: PlanningFunction[];
  onAccessRoleChange: (accessRole: ClubAccessRole) => void;
  onPlanningFunctionsChange: (planningFunctions: PlanningFunction[]) => void;
}

/**
 * Rôle d'accès au club (exclusif) et fonctions opérationnelles (cumulables) — issue #209.
 * Les fonctions ne sont proposées que pour un dirigeant : un administrateur gère le club,
 * il n'est pas affecté au planning.
 */
export function AccessRoleFields({
  idPrefix,
  accessRole,
  planningFunctions,
  onAccessRoleChange,
  onPlanningFunctionsChange,
}: AccessRoleFieldsProps) {
  const toggleFunction = (planningFunction: PlanningFunction, checked: boolean) => {
    onPlanningFunctionsChange(
      checked
        ? ALL_PLANNING_FUNCTIONS.filter((item) => item === planningFunction || planningFunctions.includes(item))
        : planningFunctions.filter((item) => item !== planningFunction),
    );
  };

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-access-role`}>Rôle</Label>
        <select
          id={`${idPrefix}-access-role`}
          className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={accessRole}
          onChange={(e) => onAccessRoleChange(e.target.value as ClubAccessRole)}
        >
          {ALL_ACCESS_ROLES.map((role) => (
            <option key={role} value={role}>{ACCESS_ROLE_LABELS[role]}</option>
          ))}
        </select>
      </div>
      {accessRole === 'dirigeant' && (
        <div className="space-y-2">
          <Label>Fonctions (cumulables)</Label>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {ALL_PLANNING_FUNCTIONS.map((planningFunction) => (
              <label key={planningFunction} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={planningFunctions.includes(planningFunction)}
                  onChange={(e) => toggleFunction(planningFunction, e.target.checked)}
                />
                {PLANNING_FUNCTION_LABELS[planningFunction]}
              </label>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
