import { useEffect, useRef } from 'react';
import MainContainer from './components/Layout/MainContainer';
import ThemeWrapper from './components/Layout/ThemeWrapper';
import RenderedView from './components/Reader/RenderedView';
import SettingsBar from './components/Controls/SettingsBar';
import { useReader } from './context/ReaderContext';
import InteractionPanel from './components/Interaction/InteractionPanel';
import { useInteraction } from './context/InteractionContext';

export default function App() {
  const { state, dispatch } = useReader();
  const { state: interactionState } = useInteraction();
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
      <MainContainer
        panelOpen={interactionState.mode !== 'IDLE' && !interactionState.voiceMode}
      >
        <RenderedView />
      </MainContainer>
      <InteractionPanel />
      <SettingsBar />
    </ThemeWrapper>
  );
}
