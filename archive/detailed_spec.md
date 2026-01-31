# Product Requirements Document: Reimagine Reading

## 1. Executive Summary

**Reimagine Reading** is a client-side, minimalist web application designed to render Markdown text into a distraction-free, highly readable format.

* **Core Philosophy:** Performance first, typography-centric, offline-capable.
* **Target Device Support:** Responsive from iPhone SE (320px) to Large Desktop.

## 2. Technical Stack & Environment

* **Build Tool:** **Vite** (Chosen for speed over Create React App).
* **Framework:** **React** (Functional components + Hooks only).
* **Styling:** **Tailwind CSS** (v3.0+).
* **Typography Plugin:** `@tailwindcss/typography` (The `prose` class is essential here).
* **Markdown Engine:** `react-markdown` (Lightweight, secure parser).
* **Icons:** **Inline SVGs** (No font-awesome/Material libraries).
* **State Management:** React Context API + `useReducer`.
* **Storage:** Browser `localStorage`.

---

## 3. Data Model & State

Since there is no backend, the "Database" is a strictly typed JSON object residing in `localStorage`.

### 3.1 Global State (Context)

The app tracks a single state object:

```typescript
interface AppState {
  viewMode: 'edit' | 'read'; // Toggle between input and reading
  content: string; // The raw Markdown text
  settings: {
    theme: 'light' | 'dark' | 'sepia';
    fontFamily: 'serif' | 'sans' | 'mono';
    fontSizeStep: number; // 1-5 scale (mapped to CSS clamp values)
    scrollPosition: number; // Y-axis pixel coordinate
  }
}

```

### 3.2 Persistence Logic

* **On Mount:** `useEffect` checks `localStorage.getItem('zen_reader_state')`. If null, load default "Welcome" markdown.
* **On Change:** `useEffect` listens to state changes (debounced by 500ms) and writes to `localStorage`.

---

## 4. User Interface Architecture

The layout must avoid nesting div soup.

### 4.1 Component Tree

```text
src/
  components/
    Layout/
      ├── MainContainer.jsx  (Handles max-width and centering)
      └── ThemeWrapper.jsx   (Injects CSS variables for colors)
    Editor/
      └── InputArea.jsx      (Raw textarea, minimalist styling)
    Reader/
      └── RenderedView.jsx   (The ReactMarkdown output)
    Controls/
      ├── SettingsBar.jsx    (Floating or Fixed bottom bar)
      └── ToggleSwitch.jsx   (Read/Edit mode toggle)
  context/
    └── ReaderContext.jsx

```

### 4.2 The "Engine" (Typography Specs)

This is the most critical technical requirement. We will use Tailwind's configuration to enforce the aesthetic.

**Tailwind Config (`tailwind.config.js`) Requirements:**

* **Font Families:**
* Sans: `Inter` (Google Font)
* Serif: `Merriweather` (Google Font)
* Mono: `JetBrains Mono` (Google Font)


* **Color Palettes (Theming):**
* **Light:** Bg: `#FFFFFF`, Text: `#1A202C` (Slate-900)
* **True Black (OLED):** Bg: `#000000`, Text: `#A3A3A3` (Neutral-400 - dimmed to reduce contrast strain)
* **Sepia:** Bg: `#F4ECD8`, Text: `#5C4B37`



**Fluid Sizing Strategy:**
Use CSS `clamp()` logic injected via inline styles or Tailwind arbitrary values based on the `fontSizeStep`.

* *Example Formula:* `font-size: clamp(1rem, 0.9rem + 0.5vw, 1.3rem);`
* Dev must ensure line-height (`leading`) scales with font size to maintain vertical rhythm.

---

## 5. Functional Specifications (User Stories)

### Feature 1: The Input

* **Story:** As a user, I want to easily import my document.
* **Dev Spec:**
* Hardcode encode the text from poor_charlie_almanack.md for the MVP demo purpose. 



### Feature 2: The Reader (Read Mode)

* **Story:** As a user, I want to switch to reading mode to see formatted text without distraction.
* **Dev Spec:**
* Hide the `<textarea>`.
* Mount the `<RenderedView>` component.
* Apply `prose prose-lg` (Tailwind typography classes).
* Remove all scrollbars (custom CSS to hide scrollbar but allow scrolling) to enhance the "Zen" feel.



### Feature 3: The Control Deck

* **Story:** As a user, I want to change fonts and themes without leaving the article.
* **Dev Spec:**
* **Trigger:** A subtle "Gear" icon or "Aa" icon fixed at the bottom right (mobile) or top right (desktop).
* **Interaction:** Clicking opens a small popover (Glassmorphism effect: `backdrop-blur-md`).
* **Controls:**
* 3 Circles for Themes (White, Black, Sepia).
* 3 Text Buttons for Fonts (Serif, Sans, Mono).
* Range slider or +/- buttons for Size.





### Feature 4: Auto-Save & Resume

* **Story:** If I close the browser tab and come back, my text and place should be there.
* **Dev Spec:**
* Save `window.scrollY` to state on scroll events (throttled).
* On load, `window.scrollTo(0, savedPosition)`.



---

## 6. Performance & "Clean Code" Guidelines

### 6.1 Lighthouse Targets

* **LCP (Largest Contentful Paint):** < 1.2s.
* **CLS (Cumulative Layout Shift):** 0.00. (Critical: Font loading must use `font-display: swap` or optional to prevent layout jumping).

### 6.2 Asset Optimization

* **Fonts:** Do **not** import all Google Font weights. Import only:
* Inter: 400, 700.
* Merriweather: 400, 700, 400i.
* JetBrains: 400.


* **SVG:** Use direct SVG code within components.
* *Bad:* `import { Settings } from 'lucide-react'` (Adds library weight).
* *Good:* `<svg width="24"...><path.../></svg>` (Zero weight).



---

## 7. Developer Handoff Checklist

To start immediately, the developer needs:

1. **Repository Init:** `npm create vite@latest zen-reader --template react`
2. **Dependencies:** `npm install tailwindcss postcss autoprefixer react-markdown @tailwindcss/typography`
3. **Asset Folder:** Place the `favicon.ico` (Use a simple Zen circle SVG).

