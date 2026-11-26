import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { AppShell } from './components/layout/AppShell';
import { Watchers } from './components/layout/Watchers';
import { FeedbackProvider } from './components/ui/Feedback';
import Dashboard from './pages/Dashboard';
import WorkoutPage from './pages/WorkoutPage';
import PlansPage from './pages/PlansPage';
import PlanEditor from './pages/PlanEditor';
import ExercisesPage from './pages/ExercisesPage';
import HistoryPage from './pages/HistoryPage';
import WorkoutDetail from './pages/WorkoutDetail';
import SettingsPage from './pages/SettingsPage';
import NotFound from './pages/NotFound';

// chart-heavy pages are split into their own chunk (precached for offline use)
const StatsPage = lazy(() => import('./pages/StatsPage'));
const ExerciseDetail = lazy(() => import('./pages/ExerciseDetail'));
const RecordsPage = lazy(() => import('./pages/RecordsPage'));
const ActivityPage = lazy(() => import('./pages/health/ActivityPage'));
const BodyPage = lazy(() => import('./pages/health/BodyPage'));
const SourcesPage = lazy(() => import('./pages/health/SourcesPage'));
const NutritionPage = lazy(() => import('./pages/nutrition/NutritionPage'));
const FoodsPage = lazy(() => import('./pages/nutrition/FoodsPage'));
const NutritionProfilePage = lazy(() => import('./pages/nutrition/NutritionProfilePage'));
const NutritionStatsPage = lazy(() => import('./pages/nutrition/NutritionStatsPage'));

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <FeedbackProvider>
        <ScrollTop />
        <Watchers />
        <Suspense fallback={<div className="page" />}>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Dashboard />} />
              <Route path="workout" element={<WorkoutPage />} />
              <Route path="plans" element={<PlansPage />} />
              <Route path="plans/new" element={<PlanEditor />} />
              <Route path="plans/:id" element={<PlanEditor />} />
              <Route path="exercises" element={<ExercisesPage />} />
              <Route path="exercises/:id" element={<ExerciseDetail />} />
              <Route path="history" element={<HistoryPage />} />
              <Route path="history/:id" element={<WorkoutDetail />} />
              <Route path="stats" element={<StatsPage />} />
              <Route path="records" element={<RecordsPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="health" element={<Navigate to="/activity" replace />} />
              <Route path="health/sources" element={<SourcesPage />} />
              <Route path="activity" element={<ActivityPage />} />
              <Route path="body" element={<BodyPage />} />
              <Route path="nutrition" element={<NutritionPage />} />
              <Route path="nutrition/foods" element={<FoodsPage />} />
              <Route path="nutrition/profile" element={<NutritionProfilePage />} />
              <Route path="nutrition/stats" element={<NutritionStatsPage />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
      </FeedbackProvider>
    </BrowserRouter>
  );
}
