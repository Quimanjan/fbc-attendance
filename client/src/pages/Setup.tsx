import { Tabs } from '../ui';
import Teachers from './Teachers';
import { ClassesTab, SchedulesTab } from './Classes';

/** Everything that is set up once at the start of the school year, in the order it's needed. */
export default function Setup() {
  return (
    <Tabs numbered tabs={[
      { id: 'teachers', label: 'Teachers', icon: 'teacher', hint: 'Add each teacher. Their school email is what they sign in with.', render: () => <Teachers /> },
      { id: 'classes', label: 'Classes & sections', icon: 'classes', hint: 'Create a class, then add its sections. Students are placed in a section.', render: () => <ClassesTab /> },
      { id: 'times', label: 'Class times', icon: 'clock', hint: 'Set when each section has class. A check-in more than 15 minutes after the first class counts as Late.', render: () => <SchedulesTab /> },
    ]} />
  );
}
