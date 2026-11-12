import { Tabs } from '../ui';
import ViewRecords from './ViewRecords';
import Reports from './Reports';

export default function Records() {
  return (
    <Tabs tabs={[
      { id: 'days', label: 'By day', icon: 'calendar', hint: 'Open a day to see who was present, late or absent in each section.', render: () => <ViewRecords /> },
      { id: 'monthly', label: 'Monthly totals', icon: 'chart', hint: "Each student's totals for a month. Change the month or section and the table updates.", render: () => <Reports /> },
    ]} />
  );
}
