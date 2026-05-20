import { useState, useCallback, useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { TopBar } from './components/layout/TopBar';
import { CardsView } from './components/cards/CardsView';
import { GanttView } from './components/gantt/GanttView';
import { ChangesView } from './components/changes/ChangesView';
import { TimelineView } from './components/timeline/TimelineView';
import { GraphView } from './components/graph/GraphView';
import { Toast } from './components/ui/Toast';
import { LoginPage } from './components/auth/LoginPage';

function AppInner() {
  const { state, dispatch } = useApp();
  const [toast, setToast] = useState<string | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [activeStageIds, setActiveStageIds] = useState<Set<string>>(new Set());
  const showToast = useCallback((msg: string) => setToast(msg), []);

  useEffect(() => {
    if (state.stages.length > 0 && activeStageIds.size === 0)
      setActiveStageIds(new Set(state.stages.map(s => s.id)));
  }, [state.stages, activeStageIds.size]);

  const toggleStage = useCallback((id: string) => {
    setActiveStageIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }, []);

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
      {state.view !== 'changes' && (
        <div style={{background:'rgba(13,17,23,.97)',borderBottom:'1px solid rgba(230,236,242,.10)',flexShrink:0,display:'flex',alignItems:'center',gap:8,padding:'8px 24px',flexWrap:'wrap'}}>
          <span style={{fontSize:11,color:'#7a8fa8',textTransform:'uppercase',letterSpacing:'0.06em',fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif'}}>Этапы:</span>
          {state.stages.map(s => {
            const on = activeStageIds.has(s.id);
            return (
              <button key={s.id} onClick={() => toggleStage(s.id)} style={{display:'inline-flex',alignItems:'center',gap:6,padding:'3px 10px',borderRadius:999,fontSize:12,border:`1px solid ${on?'rgba(230,236,242,.20)':'rgba(230,236,242,.10)'}`,color:on?'#e0e6ef':'#7a8fa8',background:on?'#20262f':'transparent',cursor:'pointer',fontFamily:'inherit'}}>
                <span style={{width:9,height:9,borderRadius:'50%',background:s.color,display:'inline-block'}}/>
                {s.title}
              </button>
            );
          })}
        </div>
      )}
      <main id="main-area" className="flex-1 min-h-0 overflow-hidden relative">
        {state.view === 'cards'    && <CardsView activeStageIds={activeStageIds} />}
        {state.view === 'gantt'    && <GanttView activeStageIds={activeStageIds} />}
        {state.view === 'changes'  && <ChangesView />}
        {state.view === 'timeline' && <TimelineView activeStageIds={activeStageIds} />}
        {state.view === 'graph'    && <GraphView activeStageIds={activeStageIds} />}
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
