(function () {
  'use strict';

  var STORAGE_KEY = 'dictationWords';
  var memoryWords = [];
  var words = loadWords();
  var quizWords = [];
  var currentIndex = 0;
  var score = 0;
  var waiting = false;
  var currentMode = null;
  var speechTimer = null;
  var speechVoices = [];
  var $ = function (id) { return document.getElementById(id); };

  function safeStorage() {
    try {
      if (!window.localStorage) return null;
      var test = '__dictation_test__';
      window.localStorage.setItem(test, '1');
      window.localStorage.removeItem(test);
      return window.localStorage;
    } catch (e) { return null; }
  }

  function loadWords() {
    var storage = safeStorage();
    if (!storage) return memoryWords.slice(0);
    try {
      var saved = JSON.parse(storage.getItem(STORAGE_KEY) || '[]');
      if (!saved || Object.prototype.toString.call(saved) !== '[object Array]') return [];
      return saved.filter(function (w) { return typeof w === 'string'; });
    } catch (e) { return []; }
  }

  function saveWords() {
    var storage = safeStorage();
    memoryWords = words.slice(0);
    if (!storage) return;
    try { storage.setItem(STORAGE_KEY, JSON.stringify(words)); } catch (e) {}
  }

  function escapeHTML(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function addEvent(el, type, fn) {
    if (!el) return;
    if (el.addEventListener) el.addEventListener(type, fn, false);
    else if (el.attachEvent) el.attachEvent('on' + type, fn);
  }

  function each(selector, fn) {
    var list = document.querySelectorAll(selector);
    var i;
    for (i = 0; i < list.length; i++) fn(list[i], i);
  }

  function hasClass(el, name) {
    return el && (' ' + el.className + ' ').indexOf(' ' + name + ' ') !== -1;
  }
  function addClass(el, name) {
    if (!el || hasClass(el, name)) return;
    el.className += (el.className ? ' ' : '') + name;
  }
  function removeClass(el, name) {
    if (!el) return;
    var re = new RegExp('(^|\\s)' + name + '(?=\\s|$)', 'g');
    el.className = el.className.replace(re, ' ').replace(/^\s+|\s+$/g, '');
  }

  each('.tab', function (tab) {
    addEvent(tab, 'click', function () {
      each('.tab', function (t) { removeClass(t, 'active'); });
      each('.section', function (s) { removeClass(s, 'active'); });
      addClass(tab, 'active');
      addClass($(tab.getAttribute('data-section')), 'active');
    });
  });

  addEvent($('wordForm'), 'submit', function (event) {
    event = event || window.event;
    if (event.preventDefault) event.preventDefault();
    else event.returnValue = false;
    addWord();
    return false;
  });

  function lowerFR(value) {
    try { return String(value).toLocaleLowerCase('fr'); }
    catch (e) { return String(value).toLowerCase(); }
  }

  function addWord() {
    var input = $('wordInput');
    var word = input.value.replace(/^\s+|\s+$/g, '');
    if (!word) { showMessage('⚠️ Écris un mot.', '#c62828'); input.focus(); return; }
    var exists = false;
    for (var i = 0; i < words.length; i++) {
      if (lowerFR(words[i]) === lowerFR(word)) { exists = true; break; }
    }
    if (exists) { showMessage('⚠️ Ce mot existe déjà.', '#c62828'); input.select(); return; }
    words.push(word);
    saveWords();
    input.value = '';
    showMessage('✅ Mot ajouté !', '#168548');
    displayWords();
  }

  function showMessage(text, color) {
    var message = $('addMessage');
    if (!message) return;
    message.textContent = text;
    message.style.color = color;
  }

  function displayWords() {
    $('wordCount').textContent = words.length;
    var list = $('wordList');
    if (!words.length) {
      list.innerHTML = '<div class="empty"><div class="empty-icon">📖</div><h3>Aucun mot pour le moment</h3><p>Ajoute tes premiers mots pour commencer.</p></div>';
      return;
    }
    list.innerHTML = '';
    for (var i = 0; i < words.length; i++) {
      (function (word, index) {
        var item = document.createElement('div');
        item.className = 'word-item';
        item.innerHTML = '<div class="word-number">' + (index + 1) + '</div>' +
          '<strong>' + escapeHTML(word) + '</strong>' +
          '<div class="word-actions">' +
          '<button type="button" class="listen-small" aria-label="Écouter">🔊</button>' +
          '<button type="button" class="delete-word" aria-label="Supprimer">🗑️</button></div>';
        addEvent(item.querySelector('.listen-small'), 'click', function () { speakWord(word); });
        addEvent(item.querySelector('.delete-word'), 'click', function () { deleteWord(index); });
        list.appendChild(item);
      }(words[i], i));
    }
  }

  function deleteWord(index) {
    if (!window.confirm('Supprimer ce mot ?')) return;
    words.splice(index, 1);
    saveWords();
    displayWords();
  }

  addEvent($('visibleMode'), 'click', function () { chooseMode('visible'); });
  addEvent($('hiddenMode'), 'click', function () { chooseMode('hidden'); });

  function chooseMode(mode) {
    if (!words.length) {
      window.alert('Ajoute d’abord des mots dans « Mes mots ».');
      switchSection('ajouter');
      return;
    }
    currentMode = mode;
    addClass($('dictationChoice'), 'hidden');
    removeClass($('game'), 'hidden');
    $('gameModeTitle').textContent = mode === 'visible' ? '👀 Dictée avec mot apparent' : '🧠 Dictée sans mot apparent';
    startGame();
  }

  addEvent($('backToModes'), 'click', function () {
    stopSpeech();
    addClass($('game'), 'hidden');
    removeClass($('dictationChoice'), 'hidden');
  });

  function startGame() {
    if (!words.length) return;
    quizWords = words.slice(0);
    quizWords.sort(function () { return Math.random() - 0.5; });
    currentIndex = 0; score = 0; waiting = false;
    $('score').textContent = '0';
    $('totalWords').textContent = '/ ' + quizWords.length;
    showWord();
  }

  function refreshVoices() {
    if (!window.speechSynthesis || !window.speechSynthesis.getVoices) return [];
    try { speechVoices = window.speechSynthesis.getVoices() || []; } catch (e) { speechVoices = []; }
    return speechVoices;
  }

  function getFrenchVoice() {
    var voices = refreshVoices();
    var i;
    for (i = 0; i < voices.length; i++) {
      if (/^fr(-|_|$)/i.test(voices[i].lang || '') && /france|français|french|google|premium|enhanced|siri/i.test(voices[i].name || '')) return voices[i];
    }
    for (i = 0; i < voices.length; i++) {
      if (/^fr(-|_|$)/i.test(voices[i].lang || '')) return voices[i];
    }
    return null;
  }

  if (window.speechSynthesis) {
    refreshVoices();
    if (window.speechSynthesis.addEventListener) addEvent(window.speechSynthesis, 'voiceschanged', refreshVoices);
  }

  function speechSupported() {
    return !!(window.speechSynthesis && window.SpeechSynthesisUtterance);
  }

  function stopSpeech() {
    if (speechTimer) { window.clearTimeout(speechTimer); speechTimer = null; }
    if (window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch (e) {}
    }
  }

  function speakWord(word) {
    if (!speechSupported()) {
      showSpeechStatus('ℹ️ Ce navigateur ne fournit pas de synthèse vocale. Le jeu reste utilisable en mode « mot apparent ».');
      return;
    }

    stopSpeech();
    var synth = window.speechSynthesis;
    var voice = getFrenchVoice();
    var utterance;
    try { utterance = new window.SpeechSynthesisUtterance(String(word)); }
    catch (e) { showSpeechStatus('⚠️ La lecture vocale est indisponible sur cet appareil.'); return; }

    utterance.lang = voice && voice.lang ? voice.lang : 'fr-FR';
    if (voice) utterance.voice = voice;
    utterance.rate = 0.72;
    utterance.pitch = 1;
    utterance.volume = 1;
    utterance.onstart = function () { showSpeechStatus('🔊 Lecture en cours…'); };
    utterance.onend = function () { showSpeechStatus('✅ Appuie à nouveau pour réécouter.'); };
    utterance.onerror = function (event) {
      var err = event && event.error;
      if (err === 'canceled' || err === 'interrupted') return;
      showSpeechStatus('⚠️ La voix n’a pas démarré. Vérifie le volume puis réessaie.');
    };

    /*
      Safari/iOS et certains WebViews sont sensibles à cancel()+speak().
      On attend très brièvement, puis on relance le moteur si nécessaire.
    */
    speechTimer = window.setTimeout(function () {
      try {
        if (synth.resume) synth.resume();
        synth.speak(utterance);
        window.setTimeout(function () {
          try {
            if (synth.paused && synth.resume) synth.resume();
          } catch (e) {}
        }, 150);
      } catch (e) {
        showSpeechStatus('⚠️ Impossible de lancer la lecture vocale.');
      }
    }, 120);
  }

  function showSpeechStatus(message) {
    var status = $('speechStatus');
    if (status) status.textContent = message;
  }

  function showWord() {
    waiting = false;
    stopSpeech();
    var word = quizWords[currentIndex];
    var percent = (currentIndex / quizWords.length) * 100;
    $('progressBar').style.width = percent + '%';
    $('questionNumber').textContent = 'Mot ' + (currentIndex + 1);
    var visible = currentMode === 'visible';
    $('gameContent').innerHTML =
      '<div class="listen">' + (visible ? '👀' : '🧠') + '</div>' +
      (visible ? '<div class="visible-word">' + escapeHTML(word) + '</div><p class="mode-help">👀 Observe bien l’orthographe du mot.</p>' : '<h2>Écoute attentivement</h2><p class="mode-help">🧠 Le mot n’est pas affiché avant ta réponse.</p>') +
      '<button type="button" class="btn listen-button" id="listenButton" aria-label="Écouter le mot">🔊 Écouter le mot</button>' +
      '<div class="speech-status" id="speechStatus" aria-live="polite">Appuie sur le bouton pour écouter.</div>' +
      '<div class="answer-container"><input id="answerInput" class="answer-input" type="text" inputmode="text" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" placeholder="Écris le mot..." aria-label="Ta réponse"><button type="button" class="btn primary check-button" id="checkButton">✓ Vérifier</button></div><div class="feedback" id="feedback" aria-live="polite"></div>';
    addEvent($('listenButton'), 'click', function () { speakWord(word); });
    addEvent($('checkButton'), 'click', checkAnswer);
    addEvent($('answerInput'), 'keydown', function (event) {
      event = event || window.event;
      if (event.key === 'Enter' || event.keyCode === 13) { if (event.preventDefault) event.preventDefault(); checkAnswer(); }
    });
  }

  function checkAnswer() {
    if (waiting) return;
    var input = $('answerInput');
    var answer = input.value.replace(/^\s+|\s+$/g, '');
    if (!answer) { showFeedback('⚠️ Écris une réponse.', 'wrong'); input.focus(); return; }
    waiting = true;
    var correctWord = quizWords[currentIndex];
    var isCorrect = lowerFR(answer) === lowerFR(correctWord);
    if (isCorrect) {
      score++; $('score').textContent = score;
      $('feedback').innerHTML = '<div class="correct">🎉 Bravo !</div><div class="feedback-small">Bonne orthographe !</div>';
    } else {
      $('feedback').innerHTML = '<div class="wrong">❌ Pas tout à fait...</div><div class="correct-word">La bonne réponse : <strong>' + escapeHTML(correctWord) + '</strong></div>';
    }
    input.disabled = true; $('checkButton').disabled = true;
    window.setTimeout(nextWord, 1800);
  }

  function showFeedback(text, type) {
    var feedback = $('feedback');
    if (feedback) feedback.innerHTML = '<span class="' + type + '">' + escapeHTML(text) + '</span>';
  }

  function nextWord() {
    currentIndex++;
    if (currentIndex >= quizWords.length) finishGame(); else showWord();
  }

  function finishGame() {
    stopSpeech();
    $('progressBar').style.width = '100%';
    var percentage = Math.round((score / quizWords.length) * 100);
    var icon = '💪'; var message = 'Continue tes dictées pour progresser.';
    if (percentage === 100) { icon = '🏆'; message = 'Parfait ! Aucune faute.'; }
    else if (percentage >= 80) { icon = '🌟'; message = 'Excellent niveau d’orthographe !'; }
    else if (percentage >= 60) { icon = '👏'; message = 'Très bien ! Continue à t’entraîner.'; }
    var modeText = currentMode === 'visible' ? 'avec mots apparents' : 'sans mots apparents';
    $('gameContent').innerHTML = '<div class="result"><div class="result-icon">' + icon + '</div><h2>Dictée terminée !</h2><p class="result-mode">Mode ' + modeText + '</p><div class="final-score">' + score + ' <span>/ ' + quizWords.length + '</span></div><div class="percentage">' + percentage + '% de réussite</div><p class="result-message">' + message + '</p><div class="result-actions"><button type="button" class="btn primary" id="restart">🔄 Recommencer</button><button type="button" class="btn secondary" id="changeMode">🎧 Changer de mode</button></div></div>';
    addEvent($('restart'), 'click', startGame);
    addEvent($('changeMode'), 'click', function () { addClass($('game'), 'hidden'); removeClass($('dictationChoice'), 'hidden'); });
  }

  function switchSection(id) {
    each('.tab', function (t) { if (t.getAttribute('data-section') === id) addClass(t, 'active'); else removeClass(t, 'active'); });
    each('.section', function (s) { if (s.id === id) addClass(s, 'active'); else removeClass(s, 'active'); });
  }

  displayWords();
}());
