import { MouseEvent, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import content from '../../content/poor_charlie_almanack.md?raw';
import { useInteraction } from '../../context/InteractionContext';

function nodeToText(node: any): string {
  if (!node) return '';
  if (node.type === 'text') return node.value || '';
  if (node.children && Array.isArray(node.children)) {
    return node.children.map(nodeToText).join('');
  }
  return '';
}

export default function RenderedView() {
  const { state, actions } = useInteraction();
  const activeAnchorId = state.anchor?.id;
  let paragraphIndex = 0;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const paragraphRefs = useRef<Map<string, HTMLParagraphElement>>(new Map());
  const visibleIds = useRef<Set<string>>(new Set());
  const rafId = useRef<number | null>(null);
  const setViewportTextRef = useRef(actions.setViewportText);

  useEffect(() => {
    setViewportTextRef.current = actions.setViewportText;
  }, [actions.setViewportText]);

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    const updateViewportText = () => {
      const visibleText = Array.from(visibleIds.current)
        .map((id) => paragraphRefs.current.get(id)?.textContent || '')
        .filter(Boolean)
        .join(' ');
      setViewportTextRef.current(visibleText);
    };

    const scheduleUpdate = () => {
      if (rafId.current !== null) {
        return;
      }
      rafId.current = window.requestAnimationFrame(() => {
        rafId.current = null;
        updateViewportText();
      });
    };

    const observer = new IntersectionObserver(
      (entries) => {
        let changed = false;
        entries.forEach((entry) => {
          const id = (entry.target as HTMLElement).dataset.anchorId;
          if (!id) {
            return;
          }
          if (entry.isIntersecting) {
            if (!visibleIds.current.has(id)) {
              visibleIds.current.add(id);
              changed = true;
            }
          } else if (visibleIds.current.delete(id)) {
            changed = true;
          }
        });
        if (changed) {
          scheduleUpdate();
        }
      },
      { root: null, threshold: [0, 0.25, 0.6] }
    );

    paragraphRefs.current.forEach((element) => observer.observe(element));
    scheduleUpdate();

    return () => {
      observer.disconnect();
      if (rafId.current !== null) {
        window.cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
    };
  }, []);

  const handleContainerClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const paragraph = target.closest('[data-anchor-id]');
    if (paragraph) return;
    actions.clearAnchor();
  };

  return (
    <div
      className="reader-prose prose prose-lg max-w-none"
      ref={containerRef}
      onClick={handleContainerClick}
    >
      <ReactMarkdown
        components={{
          p: ({ node, children }) => {
            const positionId = node?.position?.start?.offset;
            const id = positionId != null ? `p-${positionId}` : `p-${paragraphIndex++}`;
            const text = nodeToText(node).trim();
            const isActive = activeAnchorId === id;

            return (
              <p
                ref={(element) => {
                  if (element) {
                    paragraphRefs.current.set(id, element);
                  } else {
                    paragraphRefs.current.delete(id);
                  }
                }}
                className={`group relative cursor-pointer rounded-md px-1 py-0.5 transition ${
                  isActive
                    ? 'bg-emerald-500/15 shadow-[0_0_0_1px_rgba(16,185,129,0.25)]'
                    : 'hover:bg-slate-400/10'
                }`}
                data-anchor-id={id}
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.stopPropagation();
                  if (isActive) {
                    actions.clearAnchor();
                    return;
                  }
                  actions.setAnchor(id, text);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    if (isActive) {
                      actions.clearAnchor();
                      return;
                    }
                    actions.setAnchor(id, text);
                  }
                }}
              >
                <span
                  className={`absolute -left-5 top-2 h-2 w-2 rounded-full transition ${
                    isActive ? 'bg-emerald-500' : 'bg-[var(--text-muted)] opacity-0 group-hover:opacity-70'
                  }`}
                />
                {children}
              </p>
            );
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
