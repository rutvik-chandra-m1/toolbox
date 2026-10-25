import { Navigate, Route, Routes } from 'react-router';
import { PageContainer } from '@/shared/ui';
import { HomeScreen } from './HomeScreen';
import { BookScreen, LibraryScreen } from './LibraryScreen';
import { LessonScreen } from './LessonScreen';
import { RecallScreen } from './RecallScreen';
import { SettingsScreen } from './SettingsScreen';
import { ROUTE } from './types';
import { useDailyRead } from './useDailyRead';

/** The tool's own screens, nested below /daily-read. */
export default function DailyReadPage() {
  const dr = useDailyRead();
  return (
    <PageContainer>
      <Routes>
        <Route index element={<HomeScreen dr={dr} />} />
        <Route path="lesson/:lessonId" element={<LessonScreen dr={dr} />} />
        <Route path="recall" element={<RecallScreen dr={dr} />} />
        <Route path="library" element={<LibraryScreen dr={dr} />} />
        <Route path="library/:slug" element={<BookScreen dr={dr} />} />
        <Route path="settings" element={<SettingsScreen dr={dr} />} />
        <Route path="*" element={<Navigate to={ROUTE} replace />} />
      </Routes>
    </PageContainer>
  );
}
