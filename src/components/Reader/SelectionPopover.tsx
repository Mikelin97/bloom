import { useEffect, useMemo } from 'react';
import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
  useRole
} from '@floating-ui/react';

export type SelectionAction = 'anchor' | 'moderator' | 'highlight';

interface SelectionPopoverProps {
  open: boolean;
  referenceRect: DOMRect | null;
  selectionText: string;
  onClose: () => void;
  onAction: (action: SelectionAction) => void;
}

export default function SelectionPopover({
  open,
  referenceRect,
  selectionText,
  onClose,
  onAction
}: SelectionPopoverProps) {
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: (nextOpen) => {
      if (!nextOpen) onClose();
    },
    middleware: [offset(10), flip({ padding: 12 }), shift({ padding: 12 })],
    whileElementsMounted: autoUpdate
  });

  const dismiss = useDismiss(context, { outsidePress: true, escapeKey: true });
  const role = useRole(context, { role: 'menu' });
  const { getFloatingProps } = useInteractions([dismiss, role]);

  const textPreview = useMemo(() => selectionText.trim().slice(0, 96), [selectionText]);

  useEffect(() => {
    if (!open || !referenceRect) {
      return;
    }

    refs.setPositionReference({
      getBoundingClientRect() {
        return referenceRect;
      }
    });
  }, [open, referenceRect, refs]);

  if (!open || !referenceRect) {
    return null;
  }

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={floatingStyles}
        className="selection-popover z-50 w-[min(92vw,340px)] rounded-xl border border-[var(--border-strong)] bg-[var(--surface-strong)] px-2 py-2 shadow-[var(--shadow-soft)] backdrop-blur"
        {...getFloatingProps()}
      >
        <p className="truncate px-2 pb-2 text-xs text-[var(--app-text-muted)]">“{textPreview}”</p>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className="salon-btn-primary rounded-lg px-3 py-1.5 text-xs font-semibold"
            onClick={() => onAction('anchor')}
          >
            Anchor to Chat
          </button>
          <button
            type="button"
            className="salon-btn-wine rounded-lg px-3 py-1.5 text-xs font-semibold"
            onClick={() => onAction('moderator')}
          >
            Ask Moderator
          </button>
          <button
            type="button"
            className="salon-btn-ghost rounded-lg px-3 py-1.5 text-xs font-semibold"
            onClick={() => onAction('highlight')}
          >
            Highlight
          </button>
        </div>
      </div>
    </FloatingPortal>
  );
}
