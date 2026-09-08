import { WeekendEventsOverview } from '@/app/components/events/WeekendEventsOverview';

export default function WeekendPlanningPage() {
  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <p className="text-sm font-medium text-primary">Planning</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Vue week-end</h1>
      </div>
      <WeekendEventsOverview />
    </div>
  );
}
