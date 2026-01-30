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

  return (
    <div className="reader-prose prose prose-lg max-w-none">
      <ReactMarkdown
        components={{
          p: ({ node, children }) => {
            const positionId = node?.position?.start?.offset;
            const id = positionId != null ? `p-${positionId}` : `p-${paragraphIndex++}`;
            const text = nodeToText(node).trim();
            const isActive = activeAnchorId === id;

            return (
              <p
                className={`group relative cursor-pointer rounded-md px-1 py-0.5 transition ${
                  isActive
                    ? 'bg-emerald-500/15 shadow-[0_0_0_1px_rgba(16,185,129,0.25)]'
                    : 'hover:bg-slate-400/10'
                }`}
                data-anchor-id={id}
                role="button"
                tabIndex={0}
                onClick={() => actions.setAnchor(id, text)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
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
