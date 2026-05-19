import { useState, useCallback, useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { TopBar } from './components/layout/TopBar';
import { CardsView } from './components/cards/CardsView';
import { GanttView } from './components/gantt/GanttView';
import { ChangesView } from './components/changes/ChangesView';
import { TimelineView } from './components/timeline/TimelineView';
import { Toast } from './components/ui/Toast';
import { LoginPage } from './components/auth/LoginPage';

function AppInner() {
  const { state, dispatch } = useApp();
  const [toast, setToast] = useState<string | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const showToast = useCallback((msg: string) => setToast(msg), []);

  useEffect(() => {
    if (state.blobMessage) {
      showToast(state.blobMessage);
      dispatch({ type: 'SET_BLOB_MESSAGE', message: null });
    }
  }, [state.blobMessage, showToast, dispatch]);

  if (state.loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-[var(--muted)] text-sm animate-pulse">Загрузка данных…</div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-red-400 text-sm max-w-md text-center">
          <p className="font-bold mb-1">Ошибка загрузки</p>
          <p className="text-xs opacity-70">{state.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <TopBar onToast={showToast} onLogin={() => setShowLogin(true)} />
      <main className="flex-1 min-h-0 overflow-hidden">
        {state.view === 'cards'   && <CardsView />}
        {state.view === 'gantt'   && <GanttView />}
        {state.view === 'changes' && <ChangesView />}
        {state.view === 'timeline' && <TimelineView />}
      </main>
      <Toast message={toast} onDone={() => setToast(null)} />
      {showLogin && <LoginPage onClose={() => setShowLogin(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}
