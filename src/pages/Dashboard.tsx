import { useEffect, useRef } from 'react';
import InteractionPanel from '../components/Interaction/InteractionPanel';
import SettingsBar from '../components/Controls/SettingsBar';
import MainContainer from '../components/Layout/MainContainer';
import ThemeWrapper from '../components/Layout/ThemeWrapper';
import RenderedView from '../components/Reader/RenderedView';
import { useReader } from '../context/ReaderContext';
import { useInteraction } from '../context/InteractionContext';
import { useAuth } from '../contexts/AuthContext';

export default function Dashboard() {
  const { state, dispatch } = useReader();
  const { state: interactionState } = useInteraction();
  const { signOutUser } = useAuth();
  const restoredContentRef = useRef<string | null>(null);

  const panelOpen = interactionState.mode !== 'IDLE' && !interactionState.voiceMode;

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
    if (restoredContentRef.current === state.settings.contentId) {
      return;
    }
    restoredContentRef.current = state.settings.contentId;
    const targetPosition = state.settings.scrollPosition;
    window.requestAnimationFrame(() => {
      window.scrollTo(0, targetPosition);
    });
  }, [state.settings.contentId, state.settings.scrollPosition]);

  return (
    <ThemeWrapper>
      <MainContainer className={panelOpen ? 'md:mr-[490px] md:ml-16' : ''}>
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
      <InteractionPanel />
      <SettingsBar />
    </ThemeWrapper>
  );
}
