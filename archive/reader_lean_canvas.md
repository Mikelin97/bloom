# Lean Canvas: Reimagine Reading

## 1. Problem

Top 3 problems users face with current reading apps:

- **Visual Clutter:** Most web readers (and standard articles) are riddled with sidebars, pop-ups, ads, and sticky headers that break focus.

- **Performance Bloat:** Heavy frameworks and tracking scripts make loading text sluggish, especially on mobile data.

- **Inconsistent Typography:** Users cannot easily standardize font size, line height, or background colors across different sources of text.

## 2. Customer Segments

Who is this for?

- **The "Deep Reader":** People who read long-form essays, documentation, or public domain books on screens.

- **Commuters:** Users on phones/iPads who need offline capabilities and one-handed navigation.

- **Minimalists/Designers:** Users who care deeply about vertical rhythm, whitespace, and font choice.

## 3. Unique Value Proposition (UVP)

The single compelling message:

> "Read without noise. The fastest, purest digital reading experience on the web."

**High-Level Concept:** Instant-load "Reader Mode" for any text, with zero setup, just like the reader in apple devices.

## 4. Solution (The MVP Features)

What will we build?

- **Input Mechanism:** Markdown only.

- **The "Engine":** A highly responsive typography engine.

- **3 Font Modes:** Serif (e.g., Merriweather), Sans (e.g., Inter), Mono (e.g., JetBrains Mono).

- **Fluid sizing (clamp functions)** for perfect rendering on iPhone SE to iPad Pro.

- **State Persistence:** Uses localStorage to save the last read position and theme preference. No database, no login.

- **Aesthetics:** "True Black" (OLED) mode and "Sepia" (Eye strain) mode.

## 5. Unfair Advantage

What can't be easily copied or bought?

- **Extreme Performance:** 100/100 Lighthouse score. Zero layout shift.

- **Code Transparency:** Open-source, single-file architecture (or very modular) that developers trust because it has no tracking/bloat.

## 6. Channels

How will customers find you?

- **Word of Mouth:** "Paste this text to read it better" — organic growth driven purely by the utility and aesthetic of the product.

## 7. Key Metrics

How do we measure success?

- **Reading Time:** Average session duration (indicates the UI is comfortable).

- **Return Rate:** Percentage of users who use the app more than once a week.

- **"Clean" Rate:** How many users switch themes (indicates they are customizing the experience).

## 8. Cost Structure

What will this cost to run?

- **Hosting:** $0 (Vercel/Netlify Free Tier).

- **Database:** $0 (Local-first / Client-side only).

- **Development:** Time only.

- **Maintenance:** Minimal (stateless apps rarely break).

## 9. Revenue Streams

How do we make money? (Optional for MVP)

Future Feature (Premium)

---

## Technical constraints for "Clean Code"

To adhere to the user's desire for clean complexity:

- **Stack:** React + Tailwind CSS (for utility-first, responsive design).

- **State:** React Context API (no Redux or heavy state libraries).

- **Storage:** localStorage (No Firebase/Supabase complexity yet).

- **Icons:** Inline SVG only (no heavy icon libraries).
