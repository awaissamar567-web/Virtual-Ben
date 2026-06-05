// ==========================================================================
// Virtual Ben Coach - Application Logic (app.js)
// ==========================================================================

// --- Configuration & Default State ---
const DEFAULT_API_KEY = "";
const SYSTEM_PROMPT = `You are Virtual Ben, an expert fitness and nutrition coach, and a well-known social media influencer. Your role is to provide personalized, realistic, and highly practical meal and workout guidance based on each user's unique goals, fitness level, and preferences.

Core coaching principles to follow:
1. Prioritize understanding the user. ALWAYS start by asking clarifying questions if they haven't provided enough context (e.g., current fitness level, specific goals, dietary preferences/restrictions, available training time, injuries).
2. Do NOT provide generic template advice. Always tailor meals and workouts to their specific constraints.
3. Be encouraging, motivating, and conversational, but always realistic. Do not promise overnight transformations. Keep responses friendly, energetic, and clean.
4. Provide science-backed, evidence-based nutrition and exercise recommendations. Explain concepts clearly without using unexplained technical jargon.
5. Scope of help: meal planning, recipe/meal prep ideas, exercise selection, programming structure, training frequency, habit coaching, motivation, and progress checking.
6. Crucial boundaries (Do NOT):
   - Never diagnose injuries, medical conditions, or provide medical advice.
   - Never prescribe supplements, hormones, or prescription medications.
   - Do not stray outside fitness, workout, and nutrition coaching.

ARTIFACT GENERATION:
When you generate a full, structured workout routine, training split, or a detailed week-long meal plan/menu, you must wrap the core guide in a custom XML artifact tag. Do this so the user can view it in their side-by-side interactive dashboard.
Format:
<artifact type="workout" title="Name of Workout Routine">
## Routine Summary
- **Frequency**: 3 Days/week
- **Goal**: Muscle growth / Fat loss
... rest of workout program in structured markdown ...
</artifact>

Or for meals:
<artifact type="meal" title="Name of Meal Plan">
## Daily Nutrition Target
- **Calories**: ~2000 kcal
- **Protein**: 150g
... rest of meal plan/menu in structured markdown ...
</artifact>

In your chat response, write a brief, friendly summary explaining the program, and guide them to check the right-hand panel (or the toggle menu on mobile) for the full interactive guide. Never repeat the entire program text outside the tag.`;

let state = {
  chats: [],
  currentChatId: null,
  attachedFile: null,
  activeArtifact: null
};

// --- DOM Elements ---
const sidebar = document.getElementById("sidebar");
const sidebarSeam = document.getElementById("sidebar-seam");
const chatFeed = document.getElementById("chat-feed");
const welcomeContainer = document.getElementById("welcome-container");
const chatHistoryList = document.getElementById("chat-history-list");
const promptInput = document.getElementById("prompt-input");
const sendBtn = document.getElementById("send-btn");
const newChatBtn = document.getElementById("new-chat-btn");
const mobileMenuBtn = document.getElementById("mobile-menu-btn");
const currentChatTitle = document.getElementById("chat-current-title");

// Artifact Canvas Elements
const artifactCanvas = document.getElementById("artifact-canvas");
const artifactSeam = document.getElementById("artifact-seam");
const artifactTitle = document.getElementById("artifact-title");
const artifactTypeIcon = document.getElementById("artifact-type-icon");
const artifactTypeLabel = document.getElementById("artifact-type-label");
const artifactPreviewContent = document.getElementById("artifact-preview-content");
const artifactCloseBtn = document.getElementById("artifact-close-btn");
const artifactCopyBtn = document.getElementById("artifact-copy-btn");
const panePreview = document.getElementById("pane-preview");

// Mobile Toggle elements
const mobileArtifactToggleBtn = document.getElementById("mobile-artifact-toggle-btn");
const mobileArtifactBadge = document.getElementById("mobile-artifact-badge");

// No UI settings/API modal variables needed for end-users

// Attachment Elements
const attachmentBtn = document.getElementById("attachment-btn");
const fileInput = document.getElementById("file-input");
const attachmentPreviewArea = document.getElementById("attachment-preview-area");
const attachedFileName = document.getElementById("attached-file-name");
const removeAttachmentBtn = document.getElementById("remove-attachment-btn");

// Create Backdrop for Mobile Sidebar overlay
const backdrop = document.createElement("div");
backdrop.className = "sidebar-backdrop";
document.body.appendChild(backdrop);

// --- Initialization ---
function init() {
  // Config Marked options
  if (window.marked) {
    marked.setOptions({
      gfm: true,
      breaks: true
    });
  }

  // Load Chats from LocalStorage
  const savedChats = localStorage.getItem("vben_chats");
  if (savedChats) {
    try {
      state.chats = JSON.parse(savedChats);
    } catch (e) {
      state.chats = [];
    }
  }

  // Select last chat or create new
  if (state.chats.length > 0) {
    state.currentChatId = state.chats[0].id;
    renderHistory();
    loadChat(state.currentChatId);
  } else {
    newChat();
  }

  setupEventListeners();
}

// --- Event Listeners ---
function setupEventListeners() {
  // Input triggers
  promptInput.addEventListener("input", handleInputResize);
  promptInput.addEventListener("keydown", handleKeyDown);
  sendBtn.addEventListener("click", handleSend);
  newChatBtn.addEventListener("click", () => newChat());
  
  // Mobile navigation toggles
  mobileMenuBtn.addEventListener("click", toggleMobileSidebar);
  backdrop.addEventListener("click", () => {
    sidebar.classList.remove("active");
    backdrop.classList.remove("active");
  });

  mobileArtifactToggleBtn.addEventListener("click", toggleMobileArtifact);

  // Drag seam resizing
  setupPanelResizing();

  // Artifact panel controls
  artifactCloseBtn.addEventListener("click", closeArtifactPanel);
  artifactCopyBtn.addEventListener("click", copyArtifactToClipboard);

  // Attachments
  attachmentBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", handleFileSelect);
  removeAttachmentBtn.addEventListener("click", clearAttachedFile);

  // Quick Start Suggestions
  document.querySelectorAll(".quick-start-card").forEach(card => {
    card.addEventListener("click", (e) => {
      const prompt = card.getAttribute("data-prompt");
      promptInput.value = prompt;
      handleInputResize();
      handleSend();
    });
  });
}

// --- Textarea Autogrow & Input Checking ---
function handleInputResize() {
  promptInput.style.height = "auto";
  const newHeight = promptInput.scrollHeight - 6; // adjust padding
  promptInput.style.height = Math.min(newHeight, 180) + "px";
  
  // Enable/Disable Send button
  if (promptInput.value.trim().length > 0) {
    sendBtn.removeAttribute("disabled");
  } else {
    sendBtn.setAttribute("disabled", "true");
  }
}

function handleKeyDown(e) {
  // Enter submits, Shift+Enter breaks line
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
}

// --- Panel Resizing Seams (Desktop Only) ---
function setupPanelResizing() {
  let isResizingSidebar = false;
  let isResizingArtifact = false;

  sidebarSeam.addEventListener("mousedown", (e) => {
    isResizingSidebar = true;
    sidebarSeam.classList.add("active");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  });

  artifactSeam.addEventListener("mousedown", (e) => {
    isResizingArtifact = true;
    artifactSeam.classList.add("active");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  });

  document.addEventListener("mousemove", (e) => {
    if (isResizingSidebar) {
      let width = e.clientX;
      if (width < 180) width = 0; // collapse
      if (width > 400) width = 400;
      
      if (width === 0) {
        sidebar.classList.add("collapsed");
      } else {
        sidebar.classList.remove("collapsed");
        document.documentElement.style.setProperty("--sidebar-width", `${width}px`);
      }
    }

    if (isResizingArtifact) {
      let rightWidth = window.innerWidth - e.clientX;
      let percent = (rightWidth / window.innerWidth) * 100;
      if (percent < 15) {
        closeArtifactPanel();
        isResizingArtifact = false;
        return;
      }
      if (percent > 70) percent = 70;
      document.documentElement.style.setProperty("--artifact-width", `${percent}%`);
    }
  });

  document.addEventListener("mouseup", () => {
    isResizingSidebar = false;
    isResizingArtifact = false;
    sidebarSeam.classList.remove("active");
    artifactSeam.classList.remove("active");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  });
}

// --- Mobile Navigation Handlers ---
function toggleMobileSidebar() {
  sidebar.classList.toggle("active");
  backdrop.classList.toggle("active");
}

function toggleMobileArtifact() {
  if (artifactCanvas.style.display === "none") {
    artifactCanvas.style.display = "flex";
    mobileArtifactToggleBtn.style.borderColor = "var(--accent-color)";
    mobileArtifactToggleBtn.style.color = "var(--accent-color)";
  } else {
    artifactCanvas.style.display = "none";
    mobileArtifactToggleBtn.style.borderColor = "";
    mobileArtifactToggleBtn.style.color = "";
  }
}

// --- Chat Session Management ---
function newChat() {
  const id = Date.now().toString();
  const chatItem = {
    id: id,
    title: "New Coaching Session",
    messages: [],
    created: new Date().toISOString()
  };

  state.chats.unshift(chatItem);
  state.currentChatId = id;
  saveChatsToLocal();
  renderHistory();
  loadChat(id);
}

function deleteChat(id, event) {
  if (event) event.stopPropagation();
  
  state.chats = state.chats.filter(c => c.id !== id);
  saveChatsToLocal();
  
  if (state.currentChatId === id) {
    if (state.chats.length > 0) {
      state.currentChatId = state.chats[0].id;
    } else {
      newChat();
      return;
    }
  }
  renderHistory();
  loadChat(state.currentChatId);
}

function loadChat(id) {
  state.currentChatId = id;
  const chat = state.chats.find(c => c.id === id);
  if (!chat) return;

  // Update active status in history UI
  document.querySelectorAll(".chat-history-item").forEach(item => {
    item.classList.remove("active");
    if (item.getAttribute("data-id") === id) {
      item.classList.add("active");
    }
  });

  currentChatTitle.textContent = chat.title;
  
  // Clear feed
  chatFeed.innerHTML = "";
  
  // Hide Artifact on start unless last message had one
  closeArtifactPanel();

  if (chat.messages.length === 0) {
    chatFeed.appendChild(welcomeContainer);
  } else {
    chat.messages.forEach(msg => {
      appendMessageBubble(msg.role, msg.content);
    });
    chatFeed.scrollTop = chatFeed.scrollHeight;
  }
}

function saveChatsToLocal() {
  localStorage.setItem("vben_chats", JSON.stringify(state.chats));
}

// --- Render Sidebar History ---
function renderHistory() {
  chatHistoryList.innerHTML = "";
  
  if (state.chats.length === 0) {
    chatHistoryList.innerHTML = `<li class="sidebar-section-title" style="text-transform:none; padding:10px 6px;">No sessions saved</li>`;
    return;
  }

  state.chats.forEach(chat => {
    const li = document.createElement("li");
    li.className = `chat-history-item ${chat.id === state.currentChatId ? 'active' : ''}`;
    li.setAttribute("data-id", chat.id);
    li.addEventListener("click", () => {
      loadChat(chat.id);
      // Close mobile drawer on item pick
      sidebar.classList.remove("active");
      backdrop.classList.remove("active");
    });

    const titleSpan = document.createElement("span");
    titleSpan.className = "chat-title-text";
    titleSpan.textContent = chat.title;

    const delBtn = document.createElement("button");
    delBtn.className = "delete-chat-btn";
    delBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        <line x1="10" y1="11" x2="10" y2="17"></line>
        <line x1="14" y1="11" x2="14" y2="17"></line>
      </svg>
    `;
    delBtn.addEventListener("click", (e) => deleteChat(chat.id, e));

    li.appendChild(titleSpan);
    li.appendChild(delBtn);
    chatHistoryList.appendChild(li);
  });
}

// --- Attachments ---
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  state.attachedFile = file;
  attachedFileName.textContent = file.name;
  attachmentPreviewArea.style.display = "block";
}

function clearAttachedFile() {
  state.attachedFile = null;
  fileInput.value = "";
  attachmentPreviewArea.style.display = "none";
}

// --- Add Message Bubble to Feed ---
function appendMessageBubble(role, content) {
  // If first message, remove welcome
  if (chatFeed.contains(welcomeContainer)) {
    chatFeed.removeChild(welcomeContainer);
  }

  const wrapper = document.createElement("div");
  wrapper.className = `message-wrapper ${role}`;

  const meta = document.createElement("div");
  meta.className = "message-meta";
  meta.textContent = role === "user" ? "You" : "Virtual Ben Coach";

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  
  // Clean custom artifact tags before rendering in chat bubble
  const chatDisplayContent = parseChatContentForBubble(content);
  bubble.innerHTML = window.marked ? marked.parse(chatDisplayContent) : chatDisplayContent;

  wrapper.appendChild(meta);
  wrapper.appendChild(bubble);
  chatFeed.appendChild(wrapper);
  
  // Check if bubble contains action buttons for artifacts
  attachBubbleActionButtonEvents(bubble);

  chatFeed.scrollTop = chatFeed.scrollHeight;
  return bubble;
}

// --- Content Parser (Cleans Artifact XML from Chat Bubble) ---
function parseChatContentForBubble(text) {
  // Replace <artifact ...> ... </artifact> blocks with action button previews in chat feed
  const regex = /<artifact\s+type="([^"]+)"\s+title="([^"]+)">([\s\S]*?)<\/artifact>/gi;
  let match;
  let cleanedText = text;
  
  while ((match = regex.exec(text)) !== null) {
    const type = match[1];
    const title = match[2];
    const rawMatch = match[0];
    
    const emoji = type === "workout" ? "🏋️‍♂️" : "🥗";
    const btnHtml = `\n\n<button class="message-action-btn" data-type="${type}" data-title="${title}">${emoji} View Detailed ${title}</button>\n\n`;
    
    cleanedText = cleanedText.replace(rawMatch, btnHtml);
    
    // Update local active state for this artifact block (uses last detected)
    updateArtifactUI(type, title, match[3]);
  }
  
  // Also parse incomplete stream tags cleanly so they don't break markdown rendering
  cleanedText = cleanedText.replace(/<artifact[^>]*>/gi, "");
  cleanedText = cleanedText.replace(/<\/artifact>/gi, "");
  
  return cleanedText;
}

function attachBubbleActionButtonEvents(parentEl) {
  parentEl.querySelectorAll(".message-action-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const type = btn.getAttribute("data-type");
      const title = btn.getAttribute("data-title");
      
      // Look up artifact in current chat or reconstruct
      const currentChat = state.chats.find(c => c.id === state.currentChatId);
      if (currentChat) {
        // Find matching tag inside messages
        for (let msg of currentChat.messages) {
          const regex = new RegExp(`<artifact\\s+type="${type}"\\s+title="${title}">([\\s\\S]*?)</artifact>`, "i");
          const m = regex.exec(msg.content);
          if (m) {
            openArtifactPanel(type, title, m[1]);
            return;
          }
        }
      }
      // Fallback fallback
      openArtifactPanel(type, title, "Workout program details unavailable.");
    });
  });
}

// --- Streaming Parser for Active Generation ---
function processStreamChunkForArtifact(fullText) {
  const artifactRegex = /<artifact\s+type="([^"]+)"\s+title="([^"]+)">([\s\S]*?)(?:<\/artifact>|$)/i;
  const match = artifactRegex.exec(fullText);
  if (match) {
    const type = match[1];
    const title = match[2];
    const content = match[3];
    updateArtifactUI(type, title, content);
  }
}

// --- Artifact UI Actions ---
function updateArtifactUI(type, title, content) {
  state.activeArtifact = { type, title, content };
  
  // Header badges
  artifactTitle.textContent = title;
  artifactTypeLabel.textContent = type === "workout" ? "WORKOUT PROGRAM" : "NUTRITION PLAN";
  
  const iconSvg = type === "workout" 
    ? `<path d="M6.5 6.5h11M12 2v20M8 12h8"></path>` 
    : `<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>`;
    
  artifactTypeIcon.innerHTML = iconSvg;
  
  // Body Content render
  artifactPreviewContent.innerHTML = window.marked ? marked.parse(content) : content;

  // If mobile, update indicator badge
  if (window.innerWidth < 768) {
    mobileArtifactToggleBtn.style.display = "flex";
    mobileArtifactBadge.textContent = "!";
  }
}

function openArtifactPanel(type, title, content) {
  updateArtifactUI(type, title, content);
  artifactCanvas.style.display = "flex";
  artifactSeam.style.display = "block";
  
  // Re-adjust layouts for flex split axis
  if (window.innerWidth >= 768) {
    document.documentElement.style.setProperty("--artifact-width", "45%");
  }
}

function closeArtifactPanel() {
  artifactCanvas.style.display = "none";
  artifactSeam.style.display = "none";
  mobileArtifactToggleBtn.style.display = "none";
}

// Tab Switching Removed

function copyArtifactToClipboard() {
  if (!state.activeArtifact) return;
  
  navigator.clipboard.writeText(state.activeArtifact.content)
    .then(() => {
      const origSvg = artifactCopyBtn.innerHTML;
      artifactCopyBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      `;
      setTimeout(() => {
        artifactCopyBtn.innerHTML = origSvg;
      }, 1500);
    })
    .catch(err => {
      console.error("Clipboard copy failed", err);
    });
}

// --- Send Action (Groq API Stream Integration) ---
async function handleSend() {
  const text = promptInput.value.trim();
  if (!text) return;

  let promptToSend = text;
  if (state.attachedFile) {
    promptToSend = `[User attached file: ${state.attachedFile.name}]\n\n${text}`;
    clearAttachedFile();
  }

  // Clear text entry & reset box size
  promptInput.value = "";
  handleInputResize();

  // Find active chat or create one
  let activeChat = state.chats.find(c => c.id === state.currentChatId);
  if (!activeChat) {
    newChat();
    activeChat = state.chats[0];
  }

  // Set chat title if first real message
  if (activeChat.messages.length === 0) {
    activeChat.title = text.length > 30 ? text.substring(0, 30) + "..." : text;
    renderHistory();
    currentChatTitle.textContent = activeChat.title;
  }

  // 1. Render User Message bubble
  appendMessageBubble("user", promptToSend);
  activeChat.messages.push({ role: "user", content: promptToSend });
  saveChatsToLocal();

  // 2. Create AI Stream Response bubble & indicator
  const aiBubble = appendMessageBubble("assistant", "");
  const streamCursor = document.createElement("span");
  streamCursor.className = "streaming-indicator";
  aiBubble.appendChild(streamCursor);

  // Disable prompts during load
  promptInput.setAttribute("disabled", "true");
  sendBtn.setAttribute("disabled", "true");

  try {
    // API headers & payloads
    const messagesPayload = [
      { role: "system", content: SYSTEM_PROMPT },
      ...activeChat.messages.map(m => ({ role: m.role, content: m.content }))
    ];

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DEFAULT_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: messagesPayload,
        temperature: 0.7,
        max_tokens: 4096,
        stream: true
      })
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.error?.message || `HTTP ${response.status} Error`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let accumulatedText = "";
    let isReading = true;

    while (isReading) {
      const { done, value } = await reader.read();
      if (done) {
        isReading = false;
        break;
      }

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n");
      
      for (const line of lines) {
        const cleanedLine = line.trim();
        if (!cleanedLine) continue;
        if (cleanedLine === "data: [DONE]") {
          isReading = false;
          break;
        }

        if (cleanedLine.startsWith("data: ")) {
          try {
            const dataObj = JSON.parse(cleanedLine.substring(6));
            const textChunk = dataObj.choices[0]?.delta?.content || "";
            accumulatedText += textChunk;
            
            // Real-time render
            const chatDisplayContent = parseChatContentForBubble(accumulatedText);
            aiBubble.innerHTML = (window.marked ? marked.parse(chatDisplayContent) : chatDisplayContent);
            aiBubble.appendChild(streamCursor);
            
            // Process artifact streams
            processStreamChunkForArtifact(accumulatedText);

            chatFeed.scrollTop = chatFeed.scrollHeight;
          } catch (e) {
            // Silence JSON parses of partial buffers
          }
        }
      }
    }

    // Save output
    streamCursor.remove();
    attachBubbleActionButtonEvents(aiBubble);
    
    // Save to model history
    activeChat.messages.push({ role: "assistant", content: accumulatedText });
    saveChatsToLocal();

  } catch (error) {
    console.error("Groq API Call Error:", error);
    streamCursor.remove();
    aiBubble.innerHTML += `<div style="color:var(--accent-color); font-weight:600; margin-top:8px;">⚠️ Error generating response. Please try again.</div>`;
  } finally {
    promptInput.removeAttribute("disabled");
    promptInput.focus();
    handleInputResize();
  }
}

// --- Window load launch ---
window.addEventListener("DOMContentLoaded", init);
