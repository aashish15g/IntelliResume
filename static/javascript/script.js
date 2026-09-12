/* ==========================================================================
   ResumeAI — App logic
   Organized into: file upload, sidebar, modals, analyze action.
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  /* ------------------------------------------------------------------ */
  /* Elements                                                            */
  /* ------------------------------------------------------------------ */
  const fileInput = document.getElementById("fileInput");
  const dropZone = document.getElementById("dropZone");
  const fileChosen = document.getElementById("fileChosen");
  const fileName = document.getElementById("fileName");
  const fileClear = document.getElementById("fileClear");
  const analyzeBtn = document.getElementById("analyzeBtn");
  const jobInput = document.getElementById("jobInput");
  const card = document.getElementById("card");
  const loader = document.getElementById("loader");
  const results = document.getElementById("results");
  const resultsSummary = document.getElementById("resultsSummary");
  const scoreValue = document.getElementById("scoreValue");
  const strengthsList = document.getElementById("strengthsList");
  const skillGapsList = document.getElementById("skillGapsList");
  const suggestionsList = document.getElementById("suggestionsList");
  const chatMessages = document.getElementById("chatMessages");
  const chatInput = document.getElementById("chatInput");
  const chatSendBtn = document.getElementById("chatSendBtn");

  const sidebar = document.getElementById("sidebar");
  const chatsBtn = document.getElementById("chatsBtn");
  const sidebarBody = document.getElementById("sidebarBody");
  const newChatBtn = document.getElementById("newChatBtn");

  const loginModal = document.getElementById("loginModal");
  const signupModal = document.getElementById("signupModal");

  const openLoginLink = document.getElementById("openLogin");
  const openSignupLink = document.getElementById("openSignup");
  const logoutBtn = document.getElementById("logoutBtn");

  let selectedFile = null;
  let chatsOpen = false;
  let loaderInterval;
  let currentAnalysisId = null;

  function startAnalysisAnimation() {
    const steps = document.querySelectorAll(".analysis-step");

    steps.forEach((step, index) => {
      step.querySelector(".step-icon").textContent = index === 0 ? "⏳" : "○";
      step.classList.remove("done");
    });

    let current = 0;

    loaderInterval = setInterval(() => {
      if (current > 0) {
        const previous = steps[current - 1];
        previous.querySelector(".step-icon").textContent = "✓";
        previous.classList.add("done");
      }

      if (current < steps.length) {
        steps[current].querySelector(".step-icon").textContent = "⏳";
      }

      current++;

      if (current > steps.length) {
        clearInterval(loaderInterval);
      }
    }, 1200);
  }

  function finishAnalysisAnimation() {
    clearInterval(loaderInterval);

    document.querySelectorAll(".analysis-step").forEach((step) => {
      step.querySelector(".step-icon").textContent = "✓";
      step.classList.add("done");
    });
  }

  /* ------------------------------------------------------------------ */
  /* Sidebar history                                                      */
  /* ------------------------------------------------------------------ */

  function formatHistoryDate(isoString) {
    const date = new Date(isoString);
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    if (isToday) return "Today";
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }

  function renderHistory(analyses) {
    sidebarBody.innerHTML = "";

    if (!analyses || analyses.length === 0) {
      sidebarBody.innerHTML = `
        <div class="chats-empty">
          <span class="chats-empty-icon">📄</span>
          <p class="chats-empty-text">Your past analyses will show up here.</p>
        </div>
      `;
      return;
    }

    analyses.forEach((analysis) => {
      const item = document.createElement("a");
      item.className = "chat-item";
      item.href = "#";
      item.dataset.analysisId = analysis.id;
      item.innerHTML = `
        <span class="chat-item-icon">📄</span>
        <span class="chat-item-text">${analysis.job_title}</span>
        <span class="chat-item-date">${formatHistoryDate(analysis.created_at)}</span>
      `;
      sidebarBody.appendChild(item);
    });
  }

  function loadHistory() {
    fetch("/history")
      .then((r) => r.json())
      .then((data) => {
        renderHistory(data.success ? data.analyses : []);
      })
      .catch(() => renderHistory([]));
  }

  loadHistory();

  function loadAnalysis(analysisId) {
    fetch(`/analysis/${analysisId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) {
          console.error("Failed to load analysis:", data.message);
          return;
        }
        renderResults(data.feedback, false);
        currentAnalysisId = data.analysis_id;
        renderMessages(data.messages);

        document.querySelectorAll(".chat-item").forEach((el) => {
          el.classList.toggle(
            "active-chat",
            el.dataset.analysisId === String(analysisId),
          );
        });
      })
      .catch((error) => console.error("Error loading analysis:", error));
  }

  // Event delegation: sidebarBody's contents are built dynamically by
  // renderHistory(), so we listen on the stable parent container instead
  // of attaching a listener to each chat-item individually.
  sidebarBody.addEventListener("click", (e) => {
    const item = e.target.closest(".chat-item");
    if (!item) return;
    e.preventDefault();
    loadAnalysis(item.dataset.analysisId);
  });

  /* ------------------------------------------------------------------ */
  /* Auth UI state                                                        */
  /* ------------------------------------------------------------------ */

  function updateAuthUI(isLoggedIn) {
    openLoginLink.style.display = isLoggedIn ? "none" : "";
    openSignupLink.style.display = isLoggedIn ? "none" : "";
    logoutBtn.style.display = isLoggedIn ? "" : "none";
    setSidebarOpen(isLoggedIn);
  }

  fetch("/me")
    .then((r) => r.json())
    .then((data) => updateAuthUI(data.loggedIn))
    .catch(() => updateAuthUI(false));

  logoutBtn.addEventListener("click", () => {
    fetch("/logout", { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          updateAuthUI(false);
          loadHistory();
          resetWorkspace();
        }
      })
      .catch((error) => console.error("Logout failed:", error));
  });

  /* ------------------------------------------------------------------ */
  /* File upload                                                         */
  /* ------------------------------------------------------------------ */

  function updateAnalyzeButton() {
    analyzeBtn.disabled = !(selectedFile && jobInput.value.trim());
  }

  function showFile(file) {
    selectedFile = file;
    fileName.textContent = file.name;
    dropZone.style.display = "none";
    fileChosen.classList.add("show");
    card.classList.add("active");
    updateAnalyzeButton();
  }

  function clearFile() {
    selectedFile = null;
    fileInput.value = "";
    dropZone.style.display = "";
    fileChosen.classList.remove("show");
    card.classList.remove("active");
    updateAnalyzeButton();
  }

  fileInput.addEventListener("change", () => {
    if (fileInput.files[0]) showFile(fileInput.files[0]);
  });

  fileClear.addEventListener("click", clearFile);

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("dragover");
  });

  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    const file = e.dataTransfer.files[0];
    if (file && file.type === "application/pdf") showFile(file);
  });

  jobInput.addEventListener("input", updateAnalyzeButton);

  window.setHint = function setHint(el) {
    jobInput.value = el.textContent;
    updateAnalyzeButton();
    jobInput.focus();
  };

  /* ------------------------------------------------------------------ */
  /* Sidebar                                                              */
  /* ------------------------------------------------------------------ */

  function setSidebarOpen(isOpen) {
    chatsOpen = isOpen;
    sidebarBody.classList.toggle("show", chatsOpen);
    sidebar.classList.toggle("collapsed", !chatsOpen);
    chatsBtn.classList.toggle("active", chatsOpen);
  }

  chatsBtn.addEventListener("click", () => {
    setSidebarOpen(!chatsOpen);
  });

  function resetWorkspace() {
    clearFile();
    jobInput.value = "";
    updateAnalyzeButton();
    loader.classList.remove("show");
    analyzeBtn.textContent = "Analyze ↗";
    results.classList.remove("show");
    chatMessages.innerHTML = "";
    currentAnalysisId = null;

    document
      .querySelectorAll(".chat-item")
      .forEach((el) => el.classList.remove("active-chat"));
  }

  newChatBtn.addEventListener("click", () => {
    resetWorkspace();

    // TODO: create a new session via Flask
  });

  /* ------------------------------------------------------------------ */
  /* Modals (login / signup)                                             */
  /* ------------------------------------------------------------------ */

  function openModal(modal) {
    modal.classList.add("show");
  }

  function closeModal(modal) {
    modal.classList.remove("show");
  }

  document.getElementById("openLogin").addEventListener("click", () => {
    openModal(loginModal);
  });

  document.getElementById("openSignup").addEventListener("click", () => {
    openModal(signupModal);
  });

  document
    .getElementById("closeLogin")
    .addEventListener("click", () => closeModal(loginModal));
  document
    .getElementById("closeSignup")
    .addEventListener("click", () => closeModal(signupModal));

  loginModal.addEventListener("click", (e) => {
    if (e.target === loginModal) closeModal(loginModal);
  });

  signupModal.addEventListener("click", (e) => {
    if (e.target === signupModal) closeModal(signupModal);
  });

  document.getElementById("switchToSignup").addEventListener("click", () => {
    closeModal(loginModal);
    openModal(signupModal);
  });

  document.getElementById("switchToLogin").addEventListener("click", () => {
    closeModal(signupModal);
    openModal(loginModal);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal(loginModal);
      closeModal(signupModal);
    }
  });

  function showModalError(errorEl, message) {
    errorEl.textContent = message;
    errorEl.classList.add("show");
  }

  document.getElementById("loginSubmit").addEventListener("click", () => {
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    const error = document.getElementById("loginError");

    if (!email || !password) {
      showModalError(error, "Please fill in all fields.");
      return;
    }

    error.classList.remove("show");

    fetch("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          closeModal(loginModal);
          document.getElementById("loginEmail").value = "";
          document.getElementById("loginPassword").value = "";
          error.classList.remove("show");
          updateAuthUI(true);
          loadHistory();
        } else {
          showModalError(error, data.message || "Invalid email or password.");
        }
      })
      .catch(() => showModalError(error, "Something went wrong. Try again."));
  });

  document.getElementById("signupSubmit").addEventListener("click", () => {
    const email = document.getElementById("signupEmail").value.trim();
    const password = document.getElementById("signupPassword").value;
    const confirm = document.getElementById("signupConfirm").value;
    const error = document.getElementById("signupError");

    if (!email || !password || !confirm) {
      showModalError(error, "Please fill in all fields.");
      return;
    }

    if (password !== confirm) {
      showModalError(error, "Passwords do not match.");
      return;
    }

    error.classList.remove("show");

    fetch("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          closeModal(signupModal);
        } else {
          showModalError(error, data.message || "Something went wrong.");
        }
      })
      .catch(() => showModalError(error, "Something went wrong. Try again."));
  });

  /* ------------------------------------------------------------------ */
  /* Results rendering                                                    */
  /* ------------------------------------------------------------------ */

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function typeText(el, text, speed = 12) {
    el.textContent = "";
    const cursor = document.createElement("span");
    cursor.className = "typing-cursor";
    el.appendChild(cursor);

    for (const char of text) {
      cursor.insertAdjacentText("beforebegin", char);
      await sleep(speed);
    }

    cursor.remove();
  }

  function renderListInstant(listEl, items) {
    listEl.innerHTML = "";
    (items || []).forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      listEl.appendChild(li);
    });
  }

  async function typeList(listEl, items) {
    listEl.innerHTML = "";
    for (const item of items || []) {
      const li = document.createElement("li");
      listEl.appendChild(li);
      await typeText(li, item, 8);
      await sleep(150);
    }
  }

  async function animateScore(finalScore) {
    const duration = 600;
    const steps = 30;
    const stepTime = duration / steps;
    for (let i = 1; i <= steps; i++) {
      scoreValue.textContent = Math.round((finalScore * i) / steps);
      await sleep(stepTime);
    }
    scoreValue.textContent = finalScore;
  }

  async function renderResults(feedback, animate = true) {
    // Reset everything before starting the sequence.
    scoreValue.textContent = "0";
    resultsSummary.textContent = "";
    strengthsList.innerHTML = "";
    skillGapsList.innerHTML = "";
    suggestionsList.innerHTML = "";

    results.classList.add("show");
    results.scrollIntoView({ behavior: "smooth", block: "start" });

    if (!animate) {
      // Reopening a past analysis — show it instantly, no typewriter.
      scoreValue.textContent = feedback.score ?? 0;
      resultsSummary.textContent = feedback.summary ?? "";
      renderListInstant(strengthsList, feedback.strengths);
      renderListInstant(skillGapsList, feedback.skill_gaps);
      renderListInstant(suggestionsList, feedback.suggestions);
      return;
    }

    // Reveal each section in sequence, like a conversational response
    // being written out rather than dumped on screen all at once.
    await typeText(resultsSummary, feedback.summary ?? "", 10);
    await animateScore(feedback.score ?? 0);
    await typeList(strengthsList, feedback.strengths);
    await typeList(skillGapsList, feedback.skill_gaps);
    await typeList(suggestionsList, feedback.suggestions);
  }

  /* ------------------------------------------------------------------ */
  /* Follow-up chat                                                       */
  /* ------------------------------------------------------------------ */

  // Renders full markdown (bold, lists, etc.) via marked.js. When
  // animate is true, each paragraph/list item/heading fades in as a
  // whole unit, staggered slightly — not word-by-word, since animating
  // individual words breaks apart from native list markers (the "1."
  // or "•" is part of the <li> itself, not something we control), which
  // looked like markers popping in before their text.
  function renderFormattedText(el, text, animate = false) {
    el.innerHTML = marked.parse(text);
    if (animate) revealBlocks(el);
  }

  function revealBlocks(container) {
    const delayStep = 90; // ms between each block starting to appear
    const blocks = container.querySelectorAll(
      "p, li, h1, h2, h3, h4, blockquote, hr",
    );

    if (blocks.length === 0) {
      // Plain text with no block-level markdown elements at all —
      // just animate the whole container as one unit.
      container.classList.add("reveal-block");
      return;
    }

    blocks.forEach((block, i) => {
      block.classList.add("reveal-block");
      block.style.animationDelay = `${i * delayStep}ms`;
    });
  }

  function appendChatMessage(role, content, animate = false) {
    const msg = document.createElement("div");
    msg.className = `chat-message ${role}`;
    renderFormattedText(msg, content, animate);
    chatMessages.appendChild(msg);

    if (animate) {
      // A new response is about to phase in — scroll so its START is
      // visible. We calculate this manually instead of using
      // scrollIntoView(), because scrollIntoView() scrolls EVERY
      // scrollable ancestor needed to bring the element into view —
      // which included the outer page here, not just this chat box.
      const chatRect = chatMessages.getBoundingClientRect();
      const msgRect = msg.getBoundingClientRect();
      const scrollOffset = msgRect.top - chatRect.top + chatMessages.scrollTop;
      chatMessages.scrollTo({ top: scrollOffset, behavior: "smooth" });
    } else {
      // Sending your own message, or restoring history — keep the
      // usual "scroll to latest" behavior.
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    return msg;
  }

  function renderMessages(messages) {
    chatMessages.innerHTML = "";
    (messages || []).forEach((m) =>
      appendChatMessage(m.role, m.content, false),
    );
  }

  function sendChatMessage() {
    const question = chatInput.value.trim();
    if (!question || !currentAnalysisId) return;

    appendChatMessage("user", question, false);
    chatInput.value = "";
    chatInput.disabled = true;
    chatSendBtn.disabled = true;

    fetch(`/analysis/${currentAnalysisId}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    })
      .then((r) => r.json())
      .then((data) => {
        chatInput.disabled = false;
        chatSendBtn.disabled = false;
        chatInput.focus();

        if (data.success) {
          appendChatMessage("model", data.answer, true);
        } else {
          appendChatMessage(
            "model",
            data.message || "Something went wrong.",
            false,
          );
        }
      })
      .catch(() => {
        chatInput.disabled = false;
        chatSendBtn.disabled = false;
        appendChatMessage("model", "Something went wrong. Try again.", false);
      });
  }

  chatSendBtn.addEventListener("click", sendChatMessage);

  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendChatMessage();
    }
  });

  /* ------------------------------------------------------------------ */
  /* Analyze action                                                       */
  /* ------------------------------------------------------------------ */

  analyzeBtn.addEventListener("click", () => {
    if (!selectedFile || !jobInput.value.trim()) return;

    // Clear any previous analysis's chat immediately — it shouldn't
    // linger on screen while the new analysis is still loading.
    currentAnalysisId = null;
    chatMessages.innerHTML = "";

    loader.classList.add("show");
    startAnalysisAnimation();
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = "Analyzing…";

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("job_title", jobInput.value.trim());

    fetch("/analyze", {
      method: "POST",
      body: formData,
    })
      .then((response) => response.json())
      .then(async (data) => {
        if (data.success) {
          finishAnalysisAnimation();
          await sleep(500);

          loader.classList.remove("show");
          analyzeBtn.disabled = false;
          analyzeBtn.textContent = "Analyze ↗";

          await renderResults(data.feedback);
          currentAnalysisId = data.analysis_id;
          renderMessages([]);
          loadHistory();
        } else {
          clearInterval(loaderInterval);

          loader.classList.remove("show");
          analyzeBtn.disabled = false;
          analyzeBtn.textContent = "Analyze ↗";

          console.error("Analysis failed:", data.message);
          // TODO: show data.message somewhere visible to the user
        }
      })
      .catch((error) => {
        clearInterval(loaderInterval);

        loader.classList.remove("show");
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = "Analyze ↗";
        console.error("Error:", error);
      });
  });
});
