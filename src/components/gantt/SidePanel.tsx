import * as Dialog from '@radix-ui/react-dialog';
import { useApp } from '../../context/AppContext';
import { SubprocessPanel } from '../shared/SubprocessPanel';

export function SidePanel() {
  const { state, dispatch } = useApp();
  const isOpen = !!state.selectedId;

  return (
    <Dialog.Root open={isOpen} onOpenChange={open => { if (!open) dispatch({ type: 'SET_SELECTED', id: null }); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Content className="fixed right-0 top-0 h-full w-[640px] bg-[var(--panel)] border-l border-[var(--line)] z-50 overflow-hidden focus:outline-none">
          {state.selectedId && (
            <SubprocessPanel
              subId={state.selectedId}
              onClose={() => dispatch({ type: 'SET_SELECTED', id: null })}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
