import { useEffect, useRef } from 'react';
import SettingsBar from '../components/Controls/SettingsBar';
import MainContainer from '../components/Layout/MainContainer';
import ThemeWrapper from '../components/Layout/ThemeWrapper';
import RenderedView from '../components/Reader/RenderedView';
import { useReader } from '../context/ReaderContext';
import { useAuth } from '../contexts/AuthContext';

export default function Dashboard() {
  const { state, dispatch } = useReader();
  const { signOutUser } = useAuth();
  const restoredRef = useRef(false);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) {
        return;
      }
      ticking = true;
      window.requestAnimationFrame(() => {
        dispatch({ type: 'SET_SCROLL_POSITION', value: window.scrollY });
        ticking = false;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [dispatch]);

  useEffect(() => {
    if (restoredRef.current) {
      return;
    }
    restoredRef.current = true;
    const targetPosition = state.settings.scrollPosition;
    window.requestAnimationFrame(() => {
      window.scrollTo(0, targetPosition);
    });
  }, [state.settings.scrollPosition]);

  return (
    <ThemeWrapper>
      <MainContainer>
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => signOutUser()}
            className="rounded-full border border-[var(--panel-border)] bg-[var(--panel)] px-3 py-1 text-xs font-semibold tracking-wide text-[var(--text)]"
          >
            Sign out
          </button>
        </div>
        <RenderedView />
      </MainContainer>
      <SettingsBar />
    </ThemeWrapper>
  );
}
