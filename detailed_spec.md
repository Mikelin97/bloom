# **Technical Specification: Reimagine Reading (MVP)**

**Version:** 3.0

**Status:** MVP 

**Scope:** Core Interaction Mechanics (Conversation Mode & Round-Table Mode)

**Input Reference:** Lean Canvas v2 (Focus: Deep Reading, Cognitive Load, Social Learning)

## **1\. Executive Summary**

This document outlines the technical implementation for the MVP of "Reimagine Reading." The goal is to build a "Kindle meets Socrates" reading environment. While the reading interface (parsing, rendering) is necessary, this spec focuses strictly on the differentiation engines:

1. **Conversation Mode (1:1 Mentor):** A context-aware, Socratic AI mentor.  
2. **Round-Table Mode (1:Many):** A multi-persona discussion room.

## **2\. High-Level Architecture**

### **2.1 Technology Stack Recommendations**

* **Frontend:** **Existing Frontend Stack** (Integrate Conversation/Round-Table overlays into current reader app).  
* **State Management:** Extend current system to manage AI chat state and reading anchors.  
* **Backend:** Python (FastAPI) or Node.js (Express). Python is preferred for better integration with LlamaIndex.  
* **AI Layer:** \* **Orchestration:** LlamaIndex or simple OpenAI API wrappers.  
  * **Model:** GPT-4.1 (Critical for large context windows to hold full chapters/books).  
* **Voice Stack:**  
  * **Input (STT):** OpenAI Whisper.  
  * **Output (TTS):** OpenAI TTS (HD model).  
* **Database:** **MongoDB** (Unified store for User data & Chat logs). Use MongoDB Atlas Vector Search for RAG (retrieving book passages), eliminating the need for a separate vector database for the MVP.

### **2.2 Context Management Strategy**

To minimize "Cognitive Friction," the AI must know exactly what the user is reading.

* **The "Anchor" Concept:** Every paragraph is treated as a discrete, interactable unit with a unique paragraph\_id. Users can initiate a conversation from any paragraph, which automatically serves as the precise context anchor.  
* **Sliding Window Context:** The prompt sent to the LLM must always include:  
  1. The Book Title/Author.  
  2. The Chapter Summary (pre-generated).  
  3. The specific text currently visible in the viewport (approx. 500-1000 words).

## **3\. Feature Spec: Conversation Mode (1:1 Mentor)**

### **3.1 Overview**

An on-demand slide-out drawer or overlay that remains hidden during reading. To ensure a distraction-free experience, the UI activates only when the user explicitly triggers a mode, expanding from the side to reveal the "Mentor" persona. The key differentiator is **Pedagogical Prompting**: the AI should rarely give a direct answer without a follow-up question to check understanding.

### **3.2 Functional Requirements**

#### **A. Trigger Mechanisms**

1. **Paragraph Interaction:** Clicking a paragraph or its side-marker triggers the "Ask Mentor" context. The system automatically ingests that paragraph as the primary focus.

#### **B. The "Socratic" Logic Flow**

Standard chatbots answer and stop. The Mentor must loop.

1. **User Input (Text or Voice):** "What does the author mean by 'anti-library'?" (Voice input is transcribed via Whisper).  
2. **System Logic:**  
   * Retrieve current\_paragraph\_text.  
   * Inject System\_Prompt\_Mentor.  
3. **Mentor Response Structure:**  
   * *Part 1: Validation.* Acknowledge the complexity.  
   * *Part 2: Explanation.* concise explanation using analogies.  
   * *Part 3: The Hook.* A specific question asking the user to relate the concept to their own life or previous chapters.

### **3.3 Data Structure (JSON)**

**Message Object:**
```json
{
  "id": "msg_123",
  "role": "ai", // or "user"
  "persona_type": "mentor",
  "content": "The 'anti-library' refers to unread books. Taleb argues they are more valuable than read ones because they remind us of what we don't know. Do you typically buy books to read immediately, or to stock up for later?",
  "anchor_context": {
    "book_id": "b_001",
    "chapter_id": "ch_02",
    "paragraph_id": "p_42",
    "highlighted_text": "The writer Umberto Eco belongs to that small class of scholars..."
  },
  "timestamp": "2025-10-27T10:00:00Z"
}
```
### **3.4 System Prompt (Draft)**

"You are a Socratic Mentor. Your goal is deep understanding, not just fact retrieval. When the user asks a question, explain the concept clearly, but ALWAYS end your response with a reflective question that forces the user to apply the logic. Be concise. Do not lecture. Use a warm, academic tone."

## **4\. Feature Spec: Round-Table Mode (1:Many)**

### **4.1 Overview**

This simulates a round table discussion. The user initiates a topic, and 2 distinct AI agents (Personas) discuss it amongst themselves and the user.

### **4.2 The "Round-table" Orchestration Engine**

This is the most complex technical component. It requires an **Orchestrator** to manage the "microphone."

#### **A. Persona Definitions**

We define three fixed personas for the MVP.

1. **The Skeptic:** Questions assumptions, looks for logical fallacies.  
2. **The Contextualist (Historian):** Connects the text to the time period or other authors.  
3. **The Pragmatist:** Asks "How is this useful in real life?"

#### **B. Interaction Flow (The "Turn-Taking" Loop)**

1. **User Trigger (Escalation):** User clicks "Invite Panel" from within an active 1:1 Mentor session, or the Mentor proactively suggests: *"This is a matter of debate. Shall we invite the Skeptic and Historian?"*  
2. **Initialization:** The Orchestrator preserves the existing Mentor chat context. The Mentor acts as the moderator, introducing the new personas and summarizing the user's current stance/question to them.  
3. **The Loop (Max 4 turns to manage API costs):**  
   * **Orchestrator Check:** Analyze the conversation history. Who hasn't spoken? Which perspective is missing?  
   * **Selection:** Orchestrator selects Next\_Speaker (e.g., The Skeptic).  
   * **Generation:** Call LLM with System\_Prompt\_Skeptic \+ Conversation\_History.  
   * **Output:** Render message in UI as a distinct bubble (different color/avatar) and simultaneously stream audio output via TTS (using distinct voices for each persona).  
4. **Pause:** After 3-4 AI exchanges, the system *must* pause and explicitly invite the User to weigh in (User\_Turn) via text or voice (transcribed via Whisper).

### **4.3 UI/UX Requirements**

* **Visual Distinction:** Each persona needs a distinct avatar and accent color (e.g., Skeptic \= Red/Sharp, Historian \= Sepia/Serif).  
* **Speed Control:** AI responses should not appear instantly. Implement "Typing..." indicators that simulate reading speed (approx. 50ms per character) to lower cognitive load and make it feel like a real chat.  
* **"Hand Raise" Feature:** The user can interrupt the AI discussion at any time.

### **4.4 Data Structure (Round Table)**

**RoundTableSession Object:**
```json
{
  "session_id": "rt_555",
  "active_participants": ["user", "skeptic", "pragmatist", "historian"],
  "turn_count": 3,
  "max_turns_before_pause": 4,
  "transcript": [
    {
      "speaker": "historian",
      "text": "It is worth noting that this was written pre-internet..."
    },
    {
      "speaker": "skeptic",
      "text": "I disagree. The core logic applies regardless of the medium..."
    }
  ]
}
```
## **5\. Shared Technical Components**

### **5.1 Streaming Response Handler**

* **Requirement:** Both modes must support streaming tokens (Server-Sent Events).  
* **Why:** "Great Books" answers are long. Waiting 5 seconds for a full block of text breaks flow. Text must appear token-by-token.

### **5.2 Frontend Component Structure (React)**
```js
<ReadingEnvironment>
  <BookReader>
    {/* Text Rendering Engine */}
  </BookReader>
  
  <InteractionPanel mode={mode}> 
     {/* mode = 'MENTOR' | 'ROUND_TABLE' */}
     
     {mode === 'MENTOR' && (
        <ChatStream messages={messages} />
     )}
     
     {mode === 'ROUND_TABLE' && (
        <GroupChatStream 
            participants={participants} 
            isOrchestrating={loading} 
        />
     )}
  </InteractionPanel>
</ReadingEnvironment>
```
## **6\. Implementation Roadmap (MVP)**

1. **Step 1: Infrastructure & Mentor.** Set up the reading view and the basic 1:1 API connection with context injection.  
2. **Step 2: Persona Definitions.** Refine the System Prompts for the Mentor to ensure the "Socratic" nature works (prompt engineering).  
3. **Step 3: The Orchestrator.** Build the logic for Round-Table turn-taking. (Hardest engineering task).  
4. **Step 4: UI Polish.** Visual differentiation between modes. Typing animations.

## **7\. Risks & Mitigations**

* **Risk:** Round-Table loops get expensive (Token usage).  
  * *Mitigation:* Hard limit of 4 AI turns per user interaction. User must press "Continue" to generate more.  
* **Risk:** Hallucinations (AI inventing book quotes).  
  * *Mitigation:* **Prioritize Liveliness.** temperature set to **0.7** to ensure distinct, bold persona voices. Mitigate fabrications by adding a "Fact Check" instruction in the system prompt rather than restricting creativity, accepting a slightly higher risk of hallucination in exchange for a much more engaging "dinner party" vibe.