import { describe, expect, it } from 'vitest';
import { resetAssignmentForDuplicate, shiftPlanningDate, stripUnsafeTemplateFields } from './productivity';

describe('planning productivity', () => {
  it('shifts French and ISO dates by an explicit day offset', () => {
    expect(shiftPlanningDate('22/08/2026', 7)).toBe('29/08/2026');
    expect(shiftPlanningDate('2026-08-22', 7)).toBe('2026-08-29');
  });

  it('resets copied assignments to a fresh pending state', () => {
    expect(resetAssignmentForDuplicate({
      nom: 'A', numero: '1', personId: 4, personType: 'officiel', status: 'accepted', respondedAt: 'x', attendanceStatus: 'present', declineReason: 'work', reminderCount: 3,
    })).toMatchObject({ nom: 'A', personId: 4, status: 'pending', attendanceStatus: 'unknown', reminderCount: 0 });
  });

  it('does not retain identifiers or publication metadata in templates', () => {
    const sanitized = stripUnsafeTemplateFields({ id: 'x', date: 'x', planningStatus: 'published', publishedAt: 'x', localTeam: 'AFP', durationMinutes: 90 });
    expect(sanitized.id).toBeUndefined();
    expect(sanitized.planningStatus).toBeUndefined();
    expect(sanitized.localTeam).toBe('AFP');
  });
});
