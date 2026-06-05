"use client";

import { useState, useEffect, useRef } from "react";
import { useUser, useClerk, Show } from "@clerk/nextjs";
import { marked } from "marked";
import { collection, getDocs, doc, setDoc, deleteDoc, query, orderBy, getDoc } from "firebase/firestore";
import { db } from "./firebase";

// Robust artifact parser to handle single/double quotes, ordering, and incomplete close tags during streaming
function parseArtifact(text: string) {
  if (!text) return null;
  const startTagRegex = /<artifact\s+([^>]+)>/i;
  const matchStart = startTagRegex.exec(text);
  if (!matchStart) return null;

  const attributesStr = matchStart[1];
  const startIndex = matchStart.index;
  const contentStartIndex = startIndex + matchStart[0].length;

  const typeMatch = /type=["']([^"']+)["']/i.exec(attributesStr);
  const type = typeMatch ? typeMatch[1] : "workout";

  const titleMatch = /title=["']([^"']+)["']/i.exec(attributesStr);
  const title = titleMatch ? titleMatch[1] : "Guide";

  const closeTagRegex = /<\/artifact>/i;
  const matchEnd = closeTagRegex.exec(text.substring(contentStartIndex));
  
  let content = "";
  if (matchEnd) {
    content = text.substring(contentStartIndex, contentStartIndex + matchEnd.index);
  } else {
    content = text.substring(contentStartIndex);
  }

  return {
    type,
    title,
    content,
    startIndex,
    endIndex: matchEnd ? contentStartIndex + matchEnd.index + matchEnd[0].length : text.length
  };
}

const DEFAULT_API_KEY = "";
const SYSTEM_PROMPT = `You are Virtual Ben, operating at the intersection of physical optimization and technological efficiency. You are a highly disciplined, results-oriented professional who applies the same rigorous standards to artificial intelligence as you do to bodybuilding and fitness. Your brand is built on "optimization" — focus on the fundamentals, ignore the hype, and use the right tools for the job.

Core Tone and Communication Style:
1. Authority & Directness: Be highly decisive. Use declarative statements to establish authority and dispel myths. Focus on foundational truths before advanced tactics (e.g., "You need groceries before you need supplements", "Keep it simple", "Stick to it"). Avoid fluff, excessive emojis, or overly enthusiastic marketing language.
2. Encouraging & Pragmatic: Keep a supportive peer-to-peer coaching dynamic. Use key colloquial affirmations like "solid brother", "facts", "100%", "good stuff", "Ya", "Bro", "Brother" naturally to validate correct information. Directives like "Stay original. Stay focused."
3. Domain Knowledge & Syntheses:
   - Body Optimization: Tactical, protein-to-calorie calculations, high-protein meal prep (40g+ protein target, prepping 25 meals in a single afternoon for consistency), supplement pragmatism (D3+K2, Creatine, EAAs are secondary to real food), hypertrophy training (bodybuilding fundamentals, form, and consistency).
   - AI Consulting: Skepticism of low-quality tools ("calorie AI apps are not going to cut it"), transitional state of tech, tool evaluation (e.g. Meta AI's OCR/image strengths), AI as an efficiency multiplier.
   - Bridge the Gap: Draw parallels between physical discipline (consistency in the gym/kitchen) and technological efficiency (using AI/scripts to streamline work).

PLAN FORMATTING & REAL-WORLD DETAILS:
- Workout splits and meal plans MUST always be structured in clean Markdown Tables for a premium, highly readable layout.
- When generating meal plans or splits, always specify concrete, real-world whole foods (e.g., pasture-raised eggs, grass-fed beef, sweet potato, jasmine rice, peanut butter, avocado, oats) as examples rather than abstract macros or numbers.

ARTIFACT GENERATION RULE:
Whenever the user asks for a workout plan, routine, training split, diet, meal plan, recipes, or a list of meal/exercise recommendations, you MUST ALWAYS generate the full detailed plan/routine/recipes/splits inside a custom XML tag:
- Workout/training splits/routines: <artifact type="workout" title="Name of Workout Routine">...</artifact>
- Meal plans/diets/recipes/meal ideas: <artifact type="meal" title="Name of Meal Plan">...</artifact>

In your conversational response bubble, ONLY mention or refer to the right-hand panel if you have actually generated an artifact in that turn. If you did not generate an artifact, do NOT tell the user to check the right-hand panel. Never repeat the full artifact details outside the tag. Keep it simple, facts, and solid.

CALORIE & MACRO QUERY RULE:
- When a user asks for calories or macros of specific foods (e.g., "calories of 80g avocado"), be extremely direct, basic, and precise. Provide the final calorie and macro values immediately. Do NOT show the step-by-step mathematical calculations, formulas, or sequence. Keep it simple, clean, and practical for everyday users.`;

export default function Home() {
  const { isLoaded, isSignedIn, user } = useUser();
  const clerk = useClerk();
  
  // Set to false for secure, production Clerk authentication
  const bypassSignIn = false;

  const handleGoogleSignIn = () => {
    clerk.client.signIn.authenticateWithRedirect({
      strategy: "oauth_google",
      redirectUrl: "/sso-callback",
      redirectUrlComplete: "/",
    });
  };

  // Chat states
  const [chats, setChats] = useState<any[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [activeArtifact, setActiveArtifact] = useState<any>(null);
  const [promptInput, setPromptInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [streamingText, setStreamingText] = useState("");

  // UI state
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSidebarActive, setIsSidebarActive] = useState(false);
  const [isArtifactVisible, setIsArtifactVisible] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [artifactWidth, setArtifactWidth] = useState(45);
  const [isLightMode, setIsLightMode] = useState(false);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatFeedRef = useRef<HTMLDivElement>(null);

  // 1. Initial configuration set up
  useEffect(() => {
    // Set markdown options
    marked.setOptions({
      gfm: true,
      breaks: true,
    });

    // Load theme setting
    const savedTheme = localStorage.getItem("vben_theme");
    if (savedTheme === "light") {
      setIsLightMode(true);
      document.documentElement.classList.add("light");
    } else {
      setIsLightMode(false);
      document.documentElement.classList.remove("light");
    }

    // Load Chat History
    const savedChats = localStorage.getItem("vben_chats");
    if (savedChats) {
      try {
        const parsed = JSON.parse(savedChats);
        setChats(parsed);
        if (parsed.length > 0) {
          setCurrentChatId(parsed[0].id);
        }
      } catch (e) {
        setChats([]);
      }
    }

    // Periodically search for the Clerk keyless mode prompt and hide/remove it
    const removeClerkKeylessPrompt = () => {
      // 1. Check direct children of body
      document.body.childNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;
          if (
            el.textContent &&
            (el.textContent.includes("Configure your application") ||
             el.textContent.includes("Claim your application") ||
             el.textContent.includes("Temporary API keys"))
          ) {
            el.style.setProperty("display", "none", "important");
            el.style.setProperty("visibility", "hidden", "important");
            el.style.setProperty("opacity", "0", "important");
            el.style.setProperty("pointer-events", "none", "important");
          }
        }
      });

      // 2. Also search all divs in the document
      const allDivs = document.querySelectorAll("div");
      allDivs.forEach((el) => {
        if (
          el.textContent &&
          (el.textContent.includes("Configure your application") ||
           el.textContent.includes("Claim your application") ||
           el.textContent.includes("Temporary API keys"))
        ) {
          // Find the outermost fixed/absolute container, making sure not to hide our app
          let current: HTMLElement | null = el;
          while (current && current !== document.body) {
            if (
              current.classList.contains("app-container") ||
              current.classList.contains("login-container") ||
              current.id === "clerk-captcha"
            ) {
              // It is our own app content! Just hide the specific child text element instead of the container
              el.style.setProperty("display", "none", "important");
              break;
            }
            const style = window.getComputedStyle(current);
            if (
              style.position === "fixed" ||
              style.position === "absolute" ||
              current.parentElement === document.body
            ) {
              current.style.setProperty("display", "none", "important");
              current.style.setProperty("visibility", "hidden", "important");
              current.style.setProperty("opacity", "0", "important");
              current.style.setProperty("pointer-events", "none", "important");
              break;
            }
            current = current.parentElement;
          }
        }
      });
    };

    removeClerkKeylessPrompt();
    const keylessInterval = setInterval(removeClerkKeylessPrompt, 300);

    return () => {
      clearInterval(keylessInterval);
    };
  }, []);

  // Helper to save a single chat session to Firestore
  const saveChatToFirestore = async (userId: string, chat: any) => {
    try {
      const chatDocRef = doc(db, "users", userId, "chats", chat.id);
      await setDoc(chatDocRef, chat);
    } catch (e) {
      console.error("Error saving chat to Firestore:", e);
    }
  };

  // Save chats whenever history changes (local storage cache + firestore sync)
  const saveChats = async (updatedChats: any[], chatToUpdate?: any) => {
    setChats(updatedChats);
    localStorage.setItem("vben_chats", JSON.stringify(updatedChats));

    const userId = user?.id || "guest_user";
    if (chatToUpdate) {
      await saveChatToFirestore(userId, chatToUpdate);
    }
  };

  // Load chats from Firestore when user changes
  useEffect(() => {
    const loadUserChats = async () => {
      const userId = user?.id || "guest_user";
      try {
        const chatsRef = collection(db, "users", userId, "chats");
        const q = query(chatsRef, orderBy("created", "desc"));
        const querySnapshot = await getDocs(q);
        const loadedChats: any[] = [];
        querySnapshot.forEach((doc) => {
          loadedChats.push(doc.data());
        });
        setChats(loadedChats);
        if (loadedChats.length > 0) {
          setCurrentChatId(loadedChats[0].id);
        } else {
          setCurrentChatId(null);
        }
      } catch (e) {
        console.error("Error loading chats from Firestore:", e);
        // Fallback to localStorage
        const savedChats = localStorage.getItem("vben_chats");
        if (savedChats) {
          setChats(JSON.parse(savedChats));
        }
      }
    };
    
    if (isLoaded) {
      loadUserChats();
    }
  }, [user?.id, isLoaded]);

  // Create a new chat session
  const startNewChat = async () => {
    const id = Date.now().toString();
    const newChatSession = {
      id: id,
      title: "New Coaching Session",
      messages: [],
      created: new Date().toISOString(),
    };
    const updated = [newChatSession, ...chats];
    
    setChats(updated);
    localStorage.setItem("vben_chats", JSON.stringify(updated));
    const userId = user?.id || "guest_user";
    await saveChatToFirestore(userId, newChatSession);

    setCurrentChatId(id);
    setActiveArtifact(null);
    setIsArtifactVisible(false);
  };

  // Delete chat
  const deleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = chats.filter((c) => c.id !== id);
    setChats(updated);
    localStorage.setItem("vben_chats", JSON.stringify(updated));

    const userId = user?.id || "guest_user";
    try {
      await deleteDoc(doc(db, "users", userId, "chats", id));
    } catch (err) {
      console.error("Error deleting chat from Firestore:", err);
    }
    
    if (currentChatId === id) {
      if (updated.length > 0) {
        setCurrentChatId(updated[0].id);
      } else {
        setCurrentChatId(null);
      }
      setActiveArtifact(null);
      setIsArtifactVisible(false);
    }
  };

  // Active chat session
  const currentChat = chats.find((c) => c.id === currentChatId);

  // Theme toggler
  const toggleTheme = () => {
    const nextMode = !isLightMode;
    setIsLightMode(nextMode);
    if (nextMode) {
      document.documentElement.classList.add("light");
      localStorage.setItem("vben_theme", "light");
    } else {
      document.documentElement.classList.remove("light");
      localStorage.setItem("vben_theme", "dark");
    }
  };

  // Scroll chat feed to bottom
  useEffect(() => {
    if (chatFeedRef.current) {
      chatFeedRef.current.scrollTop = chatFeedRef.current.scrollHeight;
    }
  }, [currentChat?.messages, streamingText]);

  // Automatically load the latest artifact for the active chat session
  useEffect(() => {
    if (isSending) return; // Don't override during active streaming
    if (!currentChat) {
      setActiveArtifact(null);
      setIsArtifactVisible(false);
      return;
    }

    // Find the last assistant message containing an artifact
    const assistantMessages = currentChat.messages.filter((m: any) => m.role === "assistant");
    let foundArtifact = null;
    
    for (let i = assistantMessages.length - 1; i >= 0; i--) {
      const parsed = parseArtifact(assistantMessages[i].content);
      if (parsed) {
        foundArtifact = {
          type: parsed.type,
          title: parsed.title,
          content: parsed.content,
        };
        break;
      }
    }
    
    if (foundArtifact) {
      setActiveArtifact(foundArtifact);
      setIsArtifactVisible(true);
    } else {
      setActiveArtifact(null);
      setIsArtifactVisible(false);
    }
  }, [currentChatId, chats, isSending]);

  // Textarea auto-resize
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPromptInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const newHeight = textareaRef.current.scrollHeight - 6;
      textareaRef.current.style.height = Math.min(newHeight, 180) + "px";
    }
  };

  // File Upload handling
  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAttachedFile(file);
    }
  };

  const removeAttachedFile = () => {
    setAttachedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Drag logic for panels (resizing)
  const startResizeSidebar = (e: React.MouseEvent) => {
    e.preventDefault();
    const onMouseMove = (moveEvent: MouseEvent) => {
      let width = moveEvent.clientX;
      if (width < 180) width = 0;
      if (width > 400) width = 400;
      setSidebarWidth(width);
    };
    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const startResizeArtifact = (e: React.MouseEvent) => {
    e.preventDefault();
    const onMouseMove = (moveEvent: MouseEvent) => {
      const rightWidth = window.innerWidth - moveEvent.clientX;
      let percent = (rightWidth / window.innerWidth) * 100;
      if (percent < 15) {
        setIsArtifactVisible(false);
        return;
      }
      if (percent > 70) percent = 70;
      setArtifactWidth(percent);
    };
    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  // Message sending and Groq streaming integration
  const handleSendMessage = async (customPrompt?: string) => {
    const finalPrompt = (customPrompt || promptInput).trim();
    if (!finalPrompt && !attachedFile) return;

    let textToSend = finalPrompt;
    if (attachedFile) {
      textToSend = `[User attached file: ${attachedFile.name}]\n\n${finalPrompt}`;
      removeAttachedFile();
    }

    setPromptInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    let activeSessionId = currentChatId;
    let localChats = [...chats];

    // If no chats, create one
    if (!activeSessionId) {
      activeSessionId = Date.now().toString();
      const newChatSession = {
        id: activeSessionId,
        title: finalPrompt.length > 30 ? finalPrompt.substring(0, 30) + "..." : finalPrompt,
        messages: [],
        created: new Date().toISOString(),
      };
      localChats = [newChatSession, ...localChats];
      setCurrentChatId(activeSessionId);
    } else {
      // Update title if first message
      const session = localChats.find((c) => c.id === activeSessionId);
      if (session && session.messages.length === 0) {
        session.title = finalPrompt.length > 30 ? finalPrompt.substring(0, 30) + "..." : finalPrompt;
      }
    }

    const sessionIndex = localChats.findIndex((c) => c.id === activeSessionId);
    const userMessage = { role: "user", content: textToSend };
    localChats[sessionIndex].messages.push(userMessage);
    await saveChats(localChats, localChats[sessionIndex]);

    setIsSending(true);
    setStreamingText("");

    try {
      const messagesPayload = [
        { role: "system", content: SYSTEM_PROMPT },
        ...localChats[sessionIndex].messages.map((m: any) => ({
          role: m.role,
          content: m.content,
        })),
      ];

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: messagesPayload,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder("utf-8");
      if (!reader) return;

      let accumulated = "";
      let displayedText = "";
      let charQueue: string[] = [];
      let isStreamFinished = false;

      // Typewriter playback loop synchronized with browser refresh rate (smooth character repaints)
      const typewrite = () => {
        if (charQueue.length > 0) {
          // Dynamic speed adjustment: type faster if we have a backlog of characters to prevent delays
          const speed = charQueue.length > 40 ? Math.ceil(charQueue.length / 8) : 1;
          for (let i = 0; i < speed; i++) {
            const nextChar = charQueue.shift();
            if (nextChar !== undefined) {
              displayedText += nextChar;
            }
          }
          setStreamingText(displayedText);
          
          // Inspect current text for artifact blocks (update right panel in background)
          const parsed = parseArtifact(displayedText);
          if (parsed) {
            setActiveArtifact({
              type: parsed.type,
              title: parsed.title,
              content: parsed.content,
            });
            setIsArtifactVisible(true); // Automatically open the panel when artifact generation starts
          }
          
          requestAnimationFrame(typewrite);
        } else if (!isStreamFinished) {
          requestAnimationFrame(typewrite);
        } else {
          // Rendering complete: push to final local chats list
          const assistantMessage = { role: "assistant", content: accumulated };
          localChats[sessionIndex].messages.push(assistantMessage);
          saveChats(localChats, localChats[sessionIndex]);
          setStreamingText("");
          setIsSending(false);
        }
      };

      // Kickoff typewriter loop
      requestAnimationFrame(typewrite);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");
        for (const line of lines) {
          const cleanLine = line.trim();
          if (!cleanLine) continue;
          if (cleanLine === "data: [DONE]") break;
          if (cleanLine.startsWith("data: ")) {
            try {
              const data = JSON.parse(cleanLine.substring(6));
              const delta = data.choices[0]?.delta?.content || "";
              accumulated += delta;
              // Queue up characters
              charQueue.push(...delta.split(""));
            } catch (err) {}
          }
        }
      }

      isStreamFinished = true;
    } catch (e) {
      console.error(e);
      const errorMessage = {
        role: "assistant",
        content: "⚠️ Error generating response. Please check your network and try again.",
      };
      localChats[sessionIndex].messages.push(errorMessage);
      saveChats(localChats, localChats[sessionIndex]);
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Copy artifact to clipboard
  const [copySuccess, setCopySuccess] = useState(false);
  const copyArtifactToClipboard = () => {
    if (!activeArtifact) return;
    navigator.clipboard.writeText(activeArtifact.content).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  // Render message bubble contents (hides XML block and displays an interactive button)
  const renderMessageContent = (content: string): any => {
    const parsed = parseArtifact(content);
    if (!parsed) {
      return (
        <div
          className="markdown-body"
          dangerouslySetInnerHTML={{ __html: marked.parse(content) }}
        />
      );
    }

    const beforeText = content.substring(0, parsed.startIndex);
    const afterText = content.substring(parsed.endIndex);
    const emoji = parsed.type === "workout" ? "🏋️‍♂️" : "🥗";

    return (
      <>
        {beforeText.trim() && (
          <div
            className="markdown-body"
            dangerouslySetInnerHTML={{ __html: marked.parse(beforeText) }}
          />
        )}
        <div className="my-2">
          <button
            className="message-action-btn"
            onClick={() => {
              setActiveArtifact({ type: parsed.type, title: parsed.title, content: parsed.content });
              setIsArtifactVisible(true);
            }}
          >
            {emoji} View Detailed {parsed.title}
          </button>
        </div>
        {afterText.trim() && renderMessageContent(afterText)}
      </>
    );
  };

  // Show loading spinner while Clerk is loading (only if not bypassing login wall)
  if (!bypassSignIn && !isLoaded) {
    return (
      <div className="loading-screen">
        <div className="spinner-container">
          <div className="spinner" />
          <h2 className="loading-text">Loading Virtual Ben Coach...</h2>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Clerk Captcha: Always render in the DOM to prevent race conditions during initialization */}
      {!bypassSignIn && (
        <div 
          id="clerk-captcha" 
          style={{ 
            display: isSignedIn ? "none" : "block",
            position: "fixed",
            bottom: "20px",
            right: "20px",
            zIndex: 9999
          }} 
        />
      )}

      {/* Signed-out state: Beautiful Authentication Portal */}
      {!bypassSignIn && (
        <Show when="signed-out">
          <div className="login-container">
            <div className="login-logo">
              <img src="/ben_coach.png" alt="Coach Logo" className="avatar-img" />
            </div>
            <h1 className="login-heading">Virtual Ben Coach</h1>
            <p className="login-subheading">
              Get premium, science-backed personal coaching Splits, Macros, and Daily Routine designs. Login to start.
            </p>
            <div className="login-button-group">
              <button onClick={handleGoogleSignIn} className="login-btn primary">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style={{ marginRight: '8px' }}>
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </button>
            </div>
            <div className="login-footer">
              Virtual Ben uses advanced artificial intelligence models. Please verify workout forms and diets.
            </div>
          </div>
        </Show>
      )}

      {/* Signed-in state / Local testing bypass: Main Interactive Application Dashboard */}
      {(() => {
        const dashboardContent = (
          <div className="app-container">
            {/* Mobile Sidebar Backdrop */}
            <div 
              className={`sidebar-backdrop ${isSidebarActive ? "active" : ""}`} 
              onClick={() => setIsSidebarActive(false)}
            />
          
          {/* Collapsible Sidebar (Left Panel) */}
          <aside
            className={`sidebar ${isSidebarActive ? "active" : ""} ${sidebarWidth === 0 ? "collapsed" : ""}`}
            style={{
              width: sidebarWidth > 0 ? `${sidebarWidth}px` : undefined,
              minWidth: sidebarWidth > 0 ? `${sidebarWidth}px` : undefined,
            }}
          >
            <div className="sidebar-header">
              <div className="brand-row">
                <div className="brand">
                  <div className="brand-avatar-container">
                    <img src="/ben_coach.png" alt="Coach" className="avatar-img" />
                    <span className="online-dot" />
                  </div>
                  <span className="brand-name">Virtual Ben</span>
                </div>
                <button 
                  className="sidebar-collapse-btn" 
                  onClick={() => {
                    if (window.innerWidth < 768) {
                      setIsSidebarActive(false);
                    } else {
                      setSidebarWidth(0);
                    }
                  }}
                  title="Collapse Sidebar"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <line x1="9" y1="3" x2="9" y2="21" />
                    <path d="M17 15l-3-3 3-3" />
                  </svg>
                </button>
              </div>
              <button className="new-chat-btn" onClick={startNewChat} title="New Chat">
                <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>New Chat</span>
              </button>
            </div>

            <div className="sidebar-scroll-area">
              <div className="sidebar-section">
                <div className="sidebar-section-title">Chat History</div>
                <ul className="chat-history-list">
                  {chats.map((c) => (
                    <li
                      key={c.id}
                      className={`chat-history-item ${c.id === currentChatId ? "active" : ""}`}
                      onClick={() => setCurrentChatId(c.id)}
                    >
                      <span className="chat-title-text">{c.title}</span>
                      <button className="delete-chat-btn" onClick={(e) => deleteChat(c.id, e)}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <line x1="10" y1="11" x2="10" y2="17" />
                          <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                      </button>
                    </li>
                  ))}
                  {chats.length === 0 && (
                    <li className="sidebar-section-title" style={{ textTransform: "none", padding: "10px 6px" }}>
                      No sessions saved
                    </li>
                  )}
                </ul>
              </div>
            </div>

            {/* Sidebar Footer: Logged-in user's profile card trigger */}
            <div className="sidebar-footer">
              
              {/* Profile details dropdown card modal */}
              {isProfileOpen && (
                <div className="profile-card-dropdown">
                  <div className="profile-card-header">
                    <div className="user-avatar">
                      <img src={user?.imageUrl || "/ben_coach.png"} alt="Profile" className="avatar-img" />
                    </div>
                    <div className="user-info">
                      <div className="user-name">{user?.fullName || "Guest Account"}</div>
                      <div className="user-status" style={{ fontSize: "0.65rem", wordBreak: "break-all" }}>
                        {user?.primaryEmailAddress?.emailAddress || "guest@local.host"}
                      </div>
                    </div>
                  </div>
                  <div className="profile-card-body">
                    <div className="theme-toggle-container">
                      <span>Light Theme</span>
                      <label className="switch">
                        <input type="checkbox" checked={isLightMode} onChange={toggleTheme} />
                        <span className="slider"></span>
                      </label>
                    </div>
                    <button 
                      className="signout-btn" 
                      onClick={() => {
                        if (bypassSignIn) {
                          alert("Sign Out is disabled in local bypass mode.");
                        } else {
                          clerk.signOut();
                        }
                      }}
                    >
                      Sign Out
                    </button>
                  </div>
                </div>
              )}

              {/* Collapsed/footer info click toggle */}
              <div className="user-profile" onClick={() => setIsProfileOpen(!isProfileOpen)}>
                <div className="user-avatar">
                  <img src={user?.imageUrl || "/ben_coach.png"} alt="User Avatar" className="avatar-img" />
                </div>
                <div className="user-info">
                  <div className="user-name">{user?.firstName || "My Profile"}</div>
                  <div className="user-status">{isLightMode ? "Light Mode" : "Dark Mode"} Settings</div>
                </div>
              </div>

            </div>
          </aside>

          {/* Desktop Seam Toggle (Drag handles) */}
          <div
            className="sidebar-seam"
            onMouseDown={startResizeSidebar}
            style={{ display: sidebarWidth === 0 ? "none" : undefined }}
          >
            <div className="seam-handle" />
          </div>

          {/* Main Chat Workspace */}
          <main className="main-workspace">
            <section className="chat-section">
              <header className="chat-header">
                <button 
                  className={`sidebar-toggle-btn ${sidebarWidth === 0 ? "collapsed-desktop" : ""}`}
                  onClick={() => {
                    if (window.innerWidth < 768) {
                      setIsSidebarActive(true);
                    } else {
                      setSidebarWidth(sidebarWidth === 0 ? 260 : 0);
                    }
                  }}
                  title="Toggle Sidebar"
                >
                  <svg className="mobile-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </svg>
                  <svg className="desktop-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <line x1="9" y1="3" x2="9" y2="21" />
                    <path d="M14 9l3 3-3 3" />
                  </svg>
                </button>
                
                <div className="chat-title-info">
                  <h1 className="chat-current-title">{currentChat?.title || "Coaching Session"}</h1>
                  <p className="chat-subtitle">Personalized workout Splits, meal Plans, and Daily Habits coaching</p>
                </div>

                <div className="chat-header-actions">
                  {activeArtifact && (
                    <button
                      className="header-btn mobile-artifact-toggle-btn"
                      onClick={() => setIsArtifactVisible(!isArtifactVisible)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                      </svg>
                      <span className="badge">1</span>
                    </button>
                  )}
                </div>
              </header>

              {/* Messages feed scrolling layout */}
              <div className="chat-feed" ref={chatFeedRef}>
                {(!currentChat || currentChat.messages.length === 0) && (
                  <div className="welcome-container">
                    <div className="welcome-avatar-container">
                      <img src="/ben_coach.png" alt="VB Coach" className="avatar-img" />
                      <span className="online-dot" />
                    </div>
                    <h2 className="welcome-heading">I'm Virtual Ben, your fitness & nutrition partner.</h2>
                    <p className="welcome-tagline">
                      Let's build specific, science-backed workout and meal plans tailored to your lifestyle.
                      I don't believe in quick fixes—just sustainable, realistic growth.
                    </p>
                    
                    <div className="quick-starts">
                      <button
                        className="quick-start-card"
                        onClick={() =>
                          handleSendMessage(
                            "I want to start weight training. Can you create a basic 3-day full body split for a beginner?"
                          )
                        }
                      >
                        <span className="card-emoji">🏋️‍♂️</span>
                        <span className="card-text">3-Day Beginner Workout</span>
                      </button>
                      <button
                        className="quick-start-card"
                        onClick={() =>
                          handleSendMessage(
                            "Help me plan high-protein, budget-friendly meal ideas for fat loss. I have about 30 minutes to cook daily."
                          )
                        }
                      >
                        <span className="card-emoji">🥗</span>
                        <span className="card-text">High-Protein Meal Prep</span>
                      </button>
                      <button
                        className="quick-start-card"
                        onClick={() =>
                          handleSendMessage(
                            "How do I structure my post-workout nutrition for better muscle recovery? What should I eat?"
                          )
                        }
                      >
                        <span className="card-emoji">⚡</span>
                        <span className="card-text">Nutrition for Recovery</span>
                      </button>
                    </div>
                  </div>
                )}

                {currentChat?.messages.map((msg: any, index: number) => (
                  <div key={index} className={`message-wrapper ${msg.role}`}>
                    <div className="message-meta">
                      {msg.role === "user" ? "You" : "Virtual Ben Coach"}
                    </div>
                    <div className="message-bubble">
                      {renderMessageContent(msg.content)}
                    </div>
                  </div>
                ))}

                {/* Live stream bubble during API generation */}
                {isSending && streamingText && (
                  <div className="message-wrapper assistant">
                    <div className="message-meta">Virtual Ben Coach</div>
                    <div className="message-bubble">
                      {renderMessageContent(streamingText)}
                      <span className="streaming-indicator" />
                    </div>
                  </div>
                )}
              </div>

              {/* Chat Bounding Input Area (Upload and Enter field) */}
              <div className="input-container">
                <div className="input-bounding-box">
                  {attachedFile && (
                    <div className="attachment-preview-area">
                      <div className="attachment-micro-frame">
                        <svg className="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        <span className="file-name">{attachedFile.name}</span>
                        <button className="remove-attachment-btn" onClick={removeAttachedFile}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="input-row">
                    <button className="attachment-btn" onClick={triggerFileSelect} title="Upload File">
                      <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                      </svg>
                    </button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      style={{ display: "none" }}
                      onChange={handleFileChange}
                    />

                    <textarea
                      ref={textareaRef}
                      className="prompt-textarea"
                      placeholder="Ask Ben about your workout program, meal prep or nutrition details..."
                      rows={1}
                      value={promptInput}
                      onChange={handleTextareaChange}
                      onKeyDown={handleKeyDown}
                      disabled={isSending}
                    />

                    <button
                      className="send-btn"
                      disabled={isSending || (!promptInput.trim() && !attachedFile)}
                      onClick={() => handleSendMessage()}
                      title="Send Message"
                    >
                      <svg className="send-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="input-footer">
                  Virtual Ben can make mistakes. Verify meal ideas & workout exercises to fit your body's safe limits.
                </div>
              </div>
            </section>

            {/* Desktop Seam toggling for Artifact canvas */}
            {isArtifactVisible && activeArtifact && (
              <div className="artifact-seam" onMouseDown={startResizeArtifact}>
                <div className="artifact-seam-handle" />
              </div>
            )}

            {/* Collapsible Interactive Artifact View Panel */}
            {isArtifactVisible && activeArtifact && (
              <section className="artifact-canvas" style={{ width: `${artifactWidth}%` }}>
                <header className="artifact-header">
                  <div className="artifact-type-badge">
                    <svg className="badge-icon" id="artifact-type-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      {activeArtifact.type === "workout" ? (
                        <path d="M6.5 6.5h11M12 2v20M8 12h8" />
                      ) : (
                        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                      )}
                    </svg>
                    <span>{activeArtifact.type === "workout" ? "WORKOUT PROGRAM" : "NUTRITION PLAN"}</span>
                  </div>

                  <h2 className="artifact-title">{activeArtifact.title}</h2>

                  <div className="artifact-header-actions">
                    <button className="header-action-btn" onClick={copyArtifactToClipboard} title="Copy Content">
                      {copySuccess ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      )}
                    </button>
                    
                    <button className="header-action-btn" onClick={() => setIsArtifactVisible(false)} title="Close Panel">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                </header>

                <div className="artifact-content-container">
                  <div className="artifact-pane active">
                    <div
                      className="markdown-body"
                      dangerouslySetInnerHTML={{ __html: marked.parse(activeArtifact.content) }}
                    />
                  </div>
                </div>
              </section>
            )}

          </main>
          </div>
        );
        return bypassSignIn ? dashboardContent : <Show when="signed-in">{dashboardContent}</Show>;
      })()}
    </>
  );
}
