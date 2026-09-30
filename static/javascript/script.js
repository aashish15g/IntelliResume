/* ==========================================================================
   ResumeAI — App logic
   Organized into: file upload, sidebar, modals, analyze action.
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  /* ------------------------------------------------------------------ */
  /* Elements                                                            */
  /* ------------------------------------------------------------------ */
  const fileInput = document.getElementById("fileInput");
  const uploadError = document.getElementById("uploadError");
  const maxResumeBytes = 10 * 1024 * 1024;
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
  const jobLocationInput = document.getElementById("jobLocationInput");
  const jobSearchBtn = document.getElementById("jobSearchBtn");
  const jobSearchStatus = document.getElementById("jobSearchStatus");
  const jobResults = document.getElementById("jobResults");
  const jobLoadMoreBtn = document.getElementById("jobLoadMoreBtn");

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
  let loadedJobs = [];
  let nextJobPage = 1;
  let activeJobLocation = "";
  let jobRequestVersion = 0;
  let jobPageLoading = false;

  function textElement(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = text ?? "";
    return element;
  }

  function safeWebUrl(value) {
    if (typeof value !== "string") return null;
    try {
      const url = new URL(value);
      return ["https:", "http:"].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  }

  function clearJobSearch() {
    jobRequestVersion++;
    jobPageLoading = false;
    loadedJobs = [];
    nextJobPage = 1;
    activeJobLocation = "";
    jobResults.replaceChildren();
    jobSearchStatus.textContent = "";
    jobLoadMoreBtn.hidden = true;
    jobLoadMoreBtn.disabled = false;
    jobLoadMoreBtn.textContent = "Load more";
    jobSearchBtn.disabled = false;
  }

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
      item.append(
        textElement("span", "chat-item-icon", "📄"),
        textElement("span", "chat-item-text", analysis.job_title),
        textElement(
          "span",
          "chat-item-date",
          formatHistoryDate(analysis.created_at),
        ),
      );
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

        // Job results are never persisted — start fresh each time a
        // past analysis is reopened, ready for a new search.
        clearJobSearch();
        jobLocationInput.value = "";

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
    selectedFile = null;
    updateAnalyzeButton();
    uploadError.textContent = "";
    if (
      !file.name.toLowerCase().endsWith(".pdf") ||
      (file.type && file.type !== "application/pdf")
    ) {
      uploadError.textContent = "Please upload a PDF file.";
      return;
    }
    if (file.size > maxResumeBytes) {
      uploadError.textContent = "PDF must be 10 MB or smaller.";
      return;
    }
    selectedFile = file;
    fileName.textContent = file.name;
    dropZone.style.display = "none";
    fileChosen.classList.add("show");
    card.classList.add("active");
    updateAnalyzeButton();
  }

  function clearFile() {
    uploadError.textContent = "";
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
    if (file) showFile(file);
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
    clearJobSearch();
    jobLocationInput.value = "";

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
      resultsSummary.textContent =
        feedback.summary ??
        "Summary unavailable for analyses saved before this update.";
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
    if (!window.marked || !window.DOMPurify || !DOMPurify.isSupported) {
      el.textContent = text;
      return;
    }
    el.innerHTML = DOMPurify.sanitize(marked.parse(text), {
      ALLOWED_TAGS: [
        "p",
        "br",
        "strong",
        "em",
        "ul",
        "ol",
        "li",
        "blockquote",
        "pre",
        "code",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "hr",
        "a",
        "del",
        "table",
        "thead",
        "tbody",
        "tr",
        "th",
        "td",
      ],
      ALLOWED_ATTR: ["href", "title"],
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: false,
    });
    el.querySelectorAll("a").forEach((link) => {
      const href = safeWebUrl(link.getAttribute("href"));
      if (href) {
        link.href = href;
        link.rel = "noopener noreferrer";
      } else {
        link.removeAttribute("href");
      }
    });
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
    if (role === "user") {
      msg.textContent = content;
      msg.style.whiteSpace = "pre-wrap";
    } else {
      renderFormattedText(msg, content, animate);
    }
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
  /* Job search                                                           */
  /* ------------------------------------------------------------------ */

  function formatSalary(min, max) {
    if (!min && !max) return null;
    const fmt = (n) => `$${Math.round(n / 1000)}k`;
    if (min && max && min !== max) return `${fmt(min)} - ${fmt(max)}`;
    return fmt(min || max);
  }

  function renderSkillTags(skills, emptyLabel) {
    const tags = document.createElement("div");
    tags.className = "job-skill-tags";
    if (!skills || skills.length === 0) {
      tags.append(textElement("span", "job-skill-tag none", emptyLabel));
      return tags;
    }
    skills.forEach((skill) =>
      tags.append(textElement("span", "job-skill-tag", skill)),
    );
    return tags;
  }

  function renderJobs(jobs) {
    jobResults.innerHTML = "";

    if (!jobs || jobs.length === 0) {
      jobResults.innerHTML = `<div class="job-empty-state">No matching jobs found. Try a different location.</div>`;
      return;
    }

    jobs.forEach((job) => {
      const card = document.createElement("div");
      card.className = "job-card";

      const salary = formatSalary(job.salary_min, job.salary_max);
      const metaParts = [job.company, job.location, salary].filter(Boolean);

      const header = textElement("div", "job-card-header", "");
      const details = document.createElement("div");
      details.append(
        textElement("h4", "job-title", job.title || "Untitled role"),
        textElement("p", "job-meta", metaParts.join(" · ")),
      );
      header.append(
        details,
        textElement("div", "job-match-badge", `${job.match_score}%`),
      );
      const skills = textElement("div", "job-skills", "");
      const matched = document.createElement("div");
      matched.append(
        textElement("span", "job-skills-label matched", "You have"),
        renderSkillTags(job.matched_skills, "None detected"),
      );
      const missing = document.createElement("div");
      missing.append(
        textElement("span", "job-skills-label missing", "Missing"),
        renderSkillTags(job.missing_skills, "Nothing specific"),
      );
      skills.append(matched, missing);
      card.append(header, skills);
      const href = safeWebUrl(job.url);
      if (href) {
        const link = textElement("a", "job-apply-link", "View posting →");
        link.href = href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        card.append(link);
      }

      jobResults.appendChild(card);
    });
  }

  function showJobSearchError(message, retainJobs) {
    jobSearchStatus.textContent = message;
    if (!retainJobs) {
      const errorState = document.createElement("div");
      errorState.className = "job-empty-state";
      errorState.textContent = message;
      jobResults.replaceChildren(errorState);
    }
  }

  function fetchJobPage(page) {
    if (jobPageLoading || !currentAnalysisId) return;
    jobPageLoading = true;
    const requestVersion = jobRequestVersion;
    const analysisId = currentAnalysisId;
    jobSearchBtn.disabled = true;
    jobLoadMoreBtn.disabled = true;
    jobLoadMoreBtn.textContent = page === 1 ? "Load more" : "Loading…";
    jobSearchStatus.textContent =
      page === 1 ? "Searching..." : "Loading more jobs...";

    fetch(`/analysis/${analysisId}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location: activeJobLocation, page }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (
          requestVersion !== jobRequestVersion ||
          analysisId !== currentAnalysisId
        )
          return;

        if (data.success) {
          const seen = new Set(
            loadedJobs.map(
              (job) => job.url || `${job.title}|${job.company}|${job.location}`,
            ),
          );
          for (const job of data.jobs) {
            const key =
              job.url || `${job.title}|${job.company}|${job.location}`;
            if (!seen.has(key)) {
              seen.add(key);
              loadedJobs.push(job);
            }
          }
          loadedJobs.sort((a, b) => b.match_score - a.match_score);
          renderJobs(loadedJobs);
          nextJobPage = page + 1;
          jobLoadMoreBtn.hidden = !data.has_more;
          jobSearchStatus.textContent = loadedJobs.length
            ? `Showing ${loadedJobs.length} jobs ranked by resume match. Results may reorder as more jobs load.`
            : "";
        } else {
          showJobSearchError(data.message || "Something went wrong.", page > 1);
        }
      })
      .catch(() => {
        if (
          requestVersion !== jobRequestVersion ||
          analysisId !== currentAnalysisId
        )
          return;
        showJobSearchError("Something went wrong. Try again.", page > 1);
      })
      .finally(() => {
        if (
          requestVersion !== jobRequestVersion ||
          analysisId !== currentAnalysisId
        )
          return;
        jobPageLoading = false;
        jobSearchBtn.disabled = false;
        jobLoadMoreBtn.disabled = false;
        jobLoadMoreBtn.textContent = "Load more";
      });
  }

  function searchJobs() {
    if (!currentAnalysisId) return;
    const location = jobLocationInput.value.trim();
    clearJobSearch();
    activeJobLocation = location;
    fetchJobPage(1);
  }

  jobSearchBtn.addEventListener("click", searchJobs);
  jobLoadMoreBtn.addEventListener("click", () => fetchJobPage(nextJobPage));

  jobLocationInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      searchJobs();
    }
  });

  /* ------------------------------------------------------------------ */
  /* Analyze action                                                       */
  /* ------------------------------------------------------------------ */

  analyzeBtn.addEventListener("click", () => {
    if (!selectedFile || !jobInput.value.trim()) return;
    uploadError.textContent = "";

    // Clear any previous analysis's chat and job results immediately —
    // they shouldn't linger on screen while the new analysis loads.
    currentAnalysisId = null;
    chatMessages.innerHTML = "";
    clearJobSearch();
    jobLocationInput.value = "";

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
          uploadError.textContent =
            data.message || "Analysis failed. Please try again.";
        }
      })
      .catch((error) => {
        clearInterval(loaderInterval);

        loader.classList.remove("show");
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = "Analyze ↗";
        console.error("Error:", error);
        uploadError.textContent = "Analysis failed. Please try again.";
      });
  });
});
