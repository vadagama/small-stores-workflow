import { useState } from 'react';
import { verifyPassword } from '../../utils/auth';
import { useApp } from '../../context/AppContext';

interface LoginPageProps {
  onClose: () => void;
}

export function LoginPage({ onClose }: LoginPageProps) {
  const { dispatch } = useApp();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const ok = await verifyPassword(value);
    setLoading(false);
    if (ok) {
      dispatch({ type: 'SET_APP_MODE', mode: 'admin' });
      onClose();
    } else {
      setError('Неверное секретное слово');
      setValue('');
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-[var(--panel)] border border-[var(--line)] rounded-2xl p-8 w-[400px] shadow-2xl">
        <h2 className="text-xl font-bold text-white mb-1">Авторизация</h2>
        <p className="text-xs text-[var(--muted)] mb-6 leading-relaxed">
          Введите секретное слово для доступа на страницу редактирования
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="password"
            autoFocus
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="Секретное слово"
            className="px-3 py-2.5 rounded-lg border border-[var(--line)] bg-[#0d1117] text-white text-sm outline-none focus:border-[#2f7ecb] transition-colors placeholder:text-[var(--muted)]"
          />
          {error && (
            <p className="text-xs text-red-400 pl-1">{error}</p>
          )}
          <div className="flex gap-2 mt-1">
            <button
              type="submit"
              disabled={loading || !value.trim()}
              className="flex-1 py-2 rounded-lg bg-[#2f7ecb] hover:bg-[#3a8edb] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
            >
              {loading ? 'Проверка…' : 'Войти'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-[var(--line)] text-[var(--muted)] hover:text-white hover:border-[rgba(255,255,255,.3)] text-sm transition-colors"
            >
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
