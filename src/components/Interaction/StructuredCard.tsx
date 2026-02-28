import { useMemo } from 'react';
import { Persona } from '../../context/InteractionContext';
import {
  parseStructuredResponse,
  type ParsedResponse,
  type ResponseSection
} from '../../utils/parseStructuredResponse';

/* ── Icon mapping by section label ─────────────────────────── */

const SECTION_ICONS: Record<string, string> = {
  insight: '💡',
  challenge: '⚡',
  connection: '🔗',
  takeaway: '🎯',
  context: '📖',
  reflect: '❓'
};

function iconForLabel(label: string): string {
  return SECTION_ICONS[label.toLowerCase()] ?? '•';
}

/* ── Accent color per persona (matches PERSONA_STYLES) ────── */

const ACCENT: Record<Persona, { border: string; icon: string; reflectBg: string }> = {
  mentor: {
    border: 'divide-emerald-500/20',
    icon: 'text-emerald-500',
    reflectBg: 'bg-emerald-500/8'
  },
  skeptic: {
    border: 'divide-rose-500/20',
    icon: 'text-rose-500',
    reflectBg: 'bg-rose-500/8'
  },
  historian: {
    border: 'divide-amber-500/20',
    icon: 'text-amber-600',
    reflectBg: 'bg-amber-500/8'
  },
  pragmatist: {
    border: 'divide-sky-500/20',
    icon: 'text-sky-500',
    reflectBg: 'bg-sky-500/8'
  }
};

/* ── Section row ──────────────────────────────────────────── */

function SectionRow({
  section,
  persona,
  isReflect
}: {
  section: ResponseSection;
  persona: Persona;
  isReflect: boolean;
}) {
  const accent = ACCENT[persona];
  return (
    <div className={`px-3 py-2.5 ${isReflect ? `${accent.reflectBg} rounded-b-xl` : ''}`}>
      <div className="mb-0.5 flex items-center gap-1.5">
        <span className={`text-xs ${accent.icon}`} aria-hidden>
          {iconForLabel(section.label)}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          {section.label}
        </span>
      </div>
      <p
        className={`text-sm leading-relaxed text-[var(--text)] ${isReflect ? 'italic' : ''}`}
      >
        {section.text}
      </p>
    </div>
  );
}

/* ── Main card ────────────────────────────────────────────── */

export default function StructuredCard({
  content,
  persona
}: {
  content: string;
  persona: Persona;
}) {
  const parsed: ParsedResponse = useMemo(() => parseStructuredResponse(content), [content]);

  if (!parsed.structured) {
    // Fallback: render as plain text (same as old MessageBubble body)
    return <div className="whitespace-pre-wrap leading-relaxed">{content}</div>;
  }

  const accent = ACCENT[persona];

  return (
    <div className={`-mx-1 divide-y ${accent.border} overflow-hidden rounded-xl`}>
      {parsed.sections.map((section, i) => (
        <SectionRow
          key={i}
          section={section}
          persona={persona}
          isReflect={section.label.toLowerCase() === 'reflect'}
        />
      ))}
    </div>
  );
}
