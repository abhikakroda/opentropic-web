import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { MarketingShell } from './components/MarketingShell';
import { ArtifactsPage } from './pages/ArtifactsPage';
import { ChatPage } from './pages/ChatPage';
import { DevicesPage } from './pages/DevicesPage';
import { HomePage } from './pages/HomePage';
import { SettingsPage } from './pages/SettingsPage';
import { SkillsPage } from './pages/SkillsPage';
import { TasksPage } from './pages/TasksPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MarketingShell />}>
          <Route index element={<HomePage />} />
        </Route>

        <Route path="/app" element={<AppShell />}>
          <Route index element={<ChatPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="skills" element={<SkillsPage />} />
          <Route path="artifacts" element={<ArtifactsPage />} />
          <Route path="devices" element={<DevicesPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
