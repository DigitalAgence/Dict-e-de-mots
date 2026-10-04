(() => {
  "use strict";

  const STORAGE_KEY = "dictationWords";
  let words = loadWords();
  let quizWords = [];
  let currentIndex = 0;
  let score = 0;
  let waiting = false;
  let currentMode = null;

  const $ = (id) => document.getElementById(id);

  function loadWords() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return Array.isArray(saved) ? saved.filter(w => typeof w === "string") : [];
    } catch {
      return [];
    }
  }

  function saveWords() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(words));
  }

  function escapeHTML(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // Navigation
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
      tab.classList.add("active");
      $(tab.dataset.section).classList.add("active");
    });
  });

  // Ajout
  $("wordForm").addEventListener("submit", (event) => {
    event.preventDefault();
    addWord();
  });

  function addWord() {
    const input = $("wordInput");
    const word = input.value.trim();

    if (!word) {
      showMessage("⚠️ Écris un mot.", "#c62828");
      input.focus();
      return;
    }

    if (words.some(w => w.toLocaleLowerCase("fr") === word.toLocaleLowerCase("fr"))) {
      showMessage("⚠️ Ce mot existe déjà.", "#c62828");
      input.select();
      return;
    }

    words.push(word);
    saveWords();
    input.value = "";
    showMessage("✅ Mot ajouté !", "#168548");
    displayWords();
  }

  function showMessage(text, color) {
    const message = $("addMessage");
    message.textContent = text;
    message.style.color = color;
  }

  // Liste
  function displayWords() {
    $("wordCount").textContent = words.length;
    const list = $("wordList");

    if (!words.length) {
      list.innerHTML = `
        <div class="empty">
          <div class="empty-icon">📖</div>
          <h3>Aucun mot pour le moment</h3>
          <p>Ajoute tes premiers mots pour commencer.</p>
        </div>`;
      return;
    }

    list.innerHTML = "";
    words.forEach((word, index) => {
      const item = document.createElement("div");
      item.className = "word-item";
      item.innerHTML = `
        <div class="word-number">${index + 1}</div>
        <strong>${escapeHTML(word)}</strong>
        <div class="word-actions">
          <button type="button" class="listen-small" aria-label="Écouter ${escapeHTML(word)}">🔊</button>
          <button type="button" class="delete-word" aria-label="Supprimer ${escapeHTML(word)}">🗑️</button>
        </div>`;

      item.querySelector(".listen-small").addEventListener("click", () => speakWord(word));
      item.querySelector(".delete-word").addEventListener("click", () => deleteWord(index));
      list.appendChild(item);
    });
  }

  function deleteWord(index) {
    if (!window.confirm("Supprimer ce mot ?")) return;
    words.splice(index, 1);
    saveWords();
    displayWords();
  }

  // Modes
  $("visibleMode").addEventListener("click", () => chooseMode("visible"));
  $("hiddenMode").addEventListener("click", () => chooseMode("hidden"));

  function chooseMode(mode) {
    if (!words.length) {
      alert("Ajoute d'abord des mots dans « Mes mots ».");
      switchSection("ajouter");
      return;
    }

    currentMode = mode;
    $("dictationChoice").classList.add("hidden");
    $("game").classList.remove("hidden");
    $("gameModeTitle").textContent =
      mode === "visible" ? "👀 Dictée avec mot apparent" : "🧠 Dictée sans mot apparent";
    startGame();
  }

  $("backToModes").addEventListener("click", () => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    $("game").classList.add("hidden");
    $("dictationChoice").classList.remove("hidden");
  });

  function startGame() {
    if (!words.length) return;

    quizWords = [...words].sort(() => Math.random() - 0.5);
    currentIndex = 0;
    score = 0;
    waiting = false;

    $("score").textContent = "0";
    $("totalWords").textContent = `/ ${quizWords.length}`;
    showWord();
  }

  // =========================
  // Lecture vocale robuste mobile
  // =========================
  let speechVoices = [];
  let speechTimer = null;

  function refreshVoices() {
    if (!("speechSynthesis" in window)) return [];
    speechVoices = window.speechSynthesis.getVoices() || [];
    return speechVoices;
  }

  function getFrenchVoice() {
    const voices = refreshVoices();
    return voices.find(v => /^fr(-|_|$)/i.test(v.lang) && /france|français|french|google|premium|enhanced|siri/i.test(v.name))
      || voices.find(v => /^fr(-|_|$)/i.test(v.lang))
      || null;
  }

  if ("speechSynthesis" in window) {
    refreshVoices();
    window.speechSynthesis.addEventListener?.("voiceschanged", refreshVoices);
  }

  function speakWord(word) {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      showSpeechStatus("❌ La lecture vocale n’est pas prise en charge par ce navigateur.");
      return;
    }

    window.clearTimeout(speechTimer);
    const synth = window.speechSynthesis;
    const voice = getFrenchVoice();
    const utterance = new SpeechSynthesisUtterance(String(word));

    utterance.lang = voice?.lang || "fr-FR";
    if (voice) utterance.voice = voice;
    utterance.rate = 0.72;
    utterance.pitch = 1;
    utterance.volume = 1;

    utterance.onstart = () => showSpeechStatus("🔊 Lecture en cours…");
    utterance.onend = () => showSpeechStatus("✅ Appuie à nouveau pour réécouter.");
    utterance.onerror = (event) => {
      if (event.error === "canceled" || event.error === "interrupted") return;
      showSpeechStatus("⚠️ La voix n’a pas démarré. Appuie encore une fois sur « Écouter ».");
    };

    synth.cancel();
    // Safari iOS et certains WebViews Android sont plus fiables avec un petit
    // délai entre cancel() et speak(). La lecture reste déclenchée par le tap.
    speechTimer = window.setTimeout(() => {
      try {
        synth.resume();
        synth.speak(utterance);
      } catch (_) {
        showSpeechStatus("⚠️ Impossible de lancer la lecture vocale sur cet appareil.");
      }
    }, 80);
  }

  function showSpeechStatus(message) {
    const status = document.getElementById("speechStatus");
    if (status) status.textContent = message;
  }

  function showWord() {
    waiting = false;

    const word = quizWords[currentIndex];
    const percent = (currentIndex / quizWords.length) * 100;

    $("progressBar").style.width = `${percent}%`;
    $("questionNumber").textContent = `Mot ${currentIndex + 1}`;

    const visible = currentMode === "visible";

    $("gameContent").innerHTML = `
      <div class="listen">${visible ? "👀" : "🧠"}</div>

      ${visible
        ? `<div class="visible-word">${escapeHTML(word)}</div>
           <p class="mode-help">👀 Observe bien l'orthographe du mot.</p>`
        : `<h2>Écoute attentivement</h2>
           <p class="mode-help">🧠 Le mot n'est pas affiché avant ta réponse.</p>`
      }

      <button type="button" class="btn listen-button" id="listenButton" aria-label="Écouter le mot">
        🔊 Écouter le mot
      </button>
      <div class="speech-status" id="speechStatus" aria-live="polite">
        Appuie sur le bouton pour écouter.
      </div>

      <div class="answer-container">
        <input
          id="answerInput"
          class="answer-input"
          type="text"
          inputmode="text"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="none"
          spellcheck="false"
          enterkeyhint="done"
          placeholder="Écris le mot..."
          aria-label="Ta réponse"
        >
        <button type="button" class="btn primary check-button" id="checkButton">
          ✓ Vérifier
        </button>
      </div>

      <div class="feedback" id="feedback" aria-live="polite"></div>
    `;

    $("listenButton").addEventListener("click", () => speakWord(word));
    $("checkButton").addEventListener("click", checkAnswer);

    $("answerInput").addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        checkAnswer();
      }
    });

    // Pas de lecture automatique : iPhone/Android peuvent bloquer
    // SpeechSynthesis lorsqu'elle n'est pas déclenchée par l'utilisateur.
  }

  function checkAnswer() {
    if (waiting) return;

    const input = $("answerInput");
    const answer = input.value.trim();

    if (!answer) {
      showFeedback("⚠️ Écris une réponse.", "wrong");
      input.focus();
      return;
    }

    waiting = true;

    const correctWord = quizWords[currentIndex];
    const isCorrect =
      answer.toLocaleLowerCase("fr") === correctWord.toLocaleLowerCase("fr");

    if (isCorrect) {
      score++;
      $("score").textContent = score;
      $("feedback").innerHTML = `
        <div class="correct">🎉 Bravo !</div>
        <div class="feedback-small">Bonne orthographe !</div>`;
    } else {
      $("feedback").innerHTML = `
        <div class="wrong">❌ Pas tout à fait...</div>
        <div class="correct-word">
          La bonne réponse : <strong>${escapeHTML(correctWord)}</strong>
        </div>`;
    }

    $("answerInput").disabled = true;
    $("checkButton").disabled = true;

    window.setTimeout(nextWord, 1800);
  }

  function showFeedback(text, type) {
    const feedback = $("feedback");
    if (!feedback) return;
    feedback.innerHTML = `<span class="${type}">${escapeHTML(text)}</span>`;
  }

  function nextWord() {
    currentIndex++;

    if (currentIndex >= quizWords.length) {
      finishGame();
    } else {
      showWord();
    }
  }

  function finishGame() {
    $("progressBar").style.width = "100%";

    const percentage = Math.round((score / quizWords.length) * 100);

    let icon = "💪";
    let message = "Continue tes dictées pour progresser.";

    if (percentage === 100) {
      icon = "🏆";
      message = "Parfait ! Aucune faute.";
    } else if (percentage >= 80) {
      icon = "🌟";
      message = "Excellent niveau d'orthographe !";
    } else if (percentage >= 60) {
      icon = "👏";
      message = "Très bien ! Continue à t'entraîner.";
    }

    const modeText =
      currentMode === "visible" ? "avec mots apparents" : "sans mots apparents";

    $("gameContent").innerHTML = `
      <div class="result">
        <div class="result-icon">${icon}</div>
        <h2>Dictée terminée !</h2>
        <p class="result-mode">Mode ${modeText}</p>
        <div class="final-score">${score} <span>/ ${quizWords.length}</span></div>
        <div class="percentage">${percentage}% de réussite</div>
        <p class="result-message">${message}</p>
        <div class="result-actions">
          <button type="button" class="btn primary" id="restart">🔄 Recommencer</button>
          <button type="button" class="btn secondary" id="changeMode">🎧 Changer de mode</button>
        </div>
      </div>`;

    $("restart").addEventListener("click", startGame);
    $("changeMode").addEventListener("click", () => {
      $("game").classList.add("hidden");
      $("dictationChoice").classList.remove("hidden");
    });
  }

  function switchSection(id) {
    document.querySelectorAll(".tab").forEach(t => {
      t.classList.toggle("active", t.dataset.section === id);
    });
    document.querySelectorAll(".section").forEach(s => {
      s.classList.toggle("active", s.id === id);
    });
  }

  displayWords();
})();
