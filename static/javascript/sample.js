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

  /* ------------------------------------------------------------------ */
  /* Auth UI state                                                        */
  /* ------------------------------------------------------------------ */

  function updateAuthUI(isLoggedIn) {
    openLoginLink.style.display = isLoggedIn ? "none" : "";
    openSignupLink.style.display = isLoggedIn ? "none" : "";
    logoutBtn.style.display = isLoggedIn ? "" : "none";
  }

  // On page load, ask the server whether the current session is logged in
  // (handles refreshes / users who already had a valid session cookie).
  fetch("/me")
    .then((r) => r.json())
    .then((data) => updateAuthUI(data.loggedIn))
    .catch(() => updateAuthUI(false));

  logoutBtn.addEventListener("click", () => {
    fetch("/logout", { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) updateAuthUI(false);
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

  // Hint chips fill the search bar. Exposed on window since it's called
  // from an inline onclick attribute in the HTML.
  window.setHint = function setHint(el) {
    jobInput.value = el.textContent;
    updateAnalyzeButton();
    jobInput.focus();
  };

  /* ------------------------------------------------------------------ */
  /* Sidebar                                                              */
  /* ------------------------------------------------------------------ */

  chatsBtn.addEventListener("click", () => {
    chatsOpen = !chatsOpen;
    sidebarBody.classList.toggle("show", chatsOpen);
    sidebar.classList.toggle("collapsed", !chatsOpen);
    chatsBtn.classList.toggle("active", chatsOpen);
  });

  newChatBtn.addEventListener("click", () => {
    // Reset the page to a fresh state.
    clearFile();
    jobInput.value = "";
    updateAnalyzeButton();
    loader.classList.remove("show");
    analyzeBtn.textContent = "Analyze ↗";

    document
      .querySelectorAll(".chat-item")
      .forEach((el) => el.classList.remove("active-chat"));

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

    // TODO: wire to Flask /login route
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

    // TODO: wire to Flask /register route
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
  /* Analyze action                                                       */
  /* ------------------------------------------------------------------ */

  analyzeBtn.addEventListener("click", () => {
    if (!selectedFile || !jobInput.value.trim()) return;

    loader.classList.add("show");
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
      .then((data) => {
        loader.classList.remove("show");
        console.log("Result:", data);
        // TODO: render results on page
      })
      .catch((error) => {
        loader.classList.remove("show");
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = "Analyze ↗";
        console.error("Error:", error);
      });
  });
});
