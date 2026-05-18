import { useEffect, useState } from 'react';

interface ToastProps {
  message: string | null;
  onDone: () => void;
}

export function Toast({ message, onDone }: ToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) return;
    setVisible(true);
    const t = setTimeout(() => { setVisible(false); setTimeout(onDone, 300); }, 2000);
    return () => clearTimeout(t);
  }, [message, onDone]);

  return (
    <div className={`fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-[#1d2730] border border-[rgba(230,236,242,.15)] text-sm font-semibold text-[var(--text)] shadow-xl transition-all duration-300 z-50 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
      {message}
    </div>
  );
}
