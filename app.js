/* ═══════════════════════════════════════════
   Keystroke Dynamics Collector – Core Engine
   FIXED VERSION — all panel/element bugs resolved
   ═══════════════════════════════════════════ */

(function () {
  'use strict';

  // ─── State ───
  const state = {
    sessions: JSON.parse(localStorage.getItem('kd_sessions') || '[]'),
    currentSession: null,
    isRecording: false,
    keyEvents: [],
    keystrokes: [],
    pendingKeys: {},
    prevRelease: null,
    prevPress: null,
    sessionStartTime: null,
    errorCount: 0,
  };

  // ─── DOM References ───
  const $ = id => document.getElementById(id);

  // FIX 1: panels now includes ALL four panels from HTML
  const panels = {
    collect:  $('panel-collect'),
    subjects: $('panel-subjects'),
    sessions: $('panel-sessions'),
    export:   $('panel-export'),
  };

  const navBtns = document.querySelectorAll('.nav-btn');

  const setupCard        = $('setup-card');
  const typingCard       = $('typing-card');
  const inputUserId      = $('input-user-id');
  // FIX 2: inputAttempt removed — it never existed in HTML.
  //         We track attempt directly in state.currentSession.attempt
  const selectPrompt         = $('select-prompt');
  const customPromptGroup    = $('custom-prompt-group');
  const inputCustomPrompt    = $('input-custom-prompt');
  const inputTargetAttempts  = $('input-target-attempts');  // added
  const btnStart        = $('btn-start-session');
  const btnEnd          = $('btn-end-session');
  const btnSubmit       = $('btn-submit-attempt');
  const btnClear        = $('btn-clear-input');
  const typingInput     = $('typing-input');
  const promptText      = $('prompt-text');
  const promptDisplay   = $('prompt-display');
  const charTyped       = $('char-typed');
  const liveBody        = $('live-table-body');
  const badgeUser       = $('badge-user');
  const badgeAttempt    = $('badge-attempt');
  const badgePromptLabel = $('badge-prompt-label');

  const totalSubjectsCount   = $('total-subjects-count');
  const totalSessionsCount   = $('total-sessions-count');
  const totalKeystrokesCount = $('total-keystrokes-count');

  // Progress elements
  const subjectProgressFill  = $('subject-progress-fill');
  const subjectProgressLabel = $('subject-progress-label');
  const progressPreview      = $('progress-preview');
  const userDatalist         = $('user-datalist');

  // ─── Navigation ───
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      navBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // FIX 3: hide ALL panels properly including subjects
      Object.values(panels).forEach(p => p.classList.remove('active'));
      const target = btn.dataset.panel;
      document.getElementById(target).classList.add('active');
      if (target === 'panel-sessions') renderSessions();
      if (target === 'panel-export')   updateSummary();
      if (target === 'panel-subjects') renderSubjects(); // FIX 4: added
    });
  });

  // ─── FIX 5: Config card collapsible toggle ───
  const configToggle = $('config-toggle');
  const configBody   = $('config-body');
  const configArrow  = $('config-arrow');
  if (configToggle) {
    configToggle.addEventListener('click', () => {
      const hidden = configBody.classList.toggle('hidden');
      configArrow.textContent = hidden ? '▸' : '▾';
    });
  }

  // ─── Prompt Selection ───
  selectPrompt.addEventListener('change', () => {
    const v = selectPrompt.value;
    customPromptGroup.classList.toggle('hidden', v !== 'custom');
  });

  // ─── FIX 6: Progress preview on User ID input ───
  inputUserId.addEventListener('input', () => {
    const uid = inputUserId.value.trim();
    if (!uid) {
      progressPreview.innerHTML = '<span class="progress-preview-text">Enter ID to see progress</span>';
      return;
    }
    const target = parseInt(inputTargetAttempts.value) || 50;
    const userSessions = state.sessions.filter(s => s.userId === uid);
    const totalAttempts = userSessions.reduce((sum, s) => sum + s.attempts.length, 0);
    const pct = Math.min((totalAttempts / target) * 100, 100).toFixed(0);
    progressPreview.innerHTML = `
      <div style="width:100%">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:13px">
          <span>${totalAttempts} / ${target} attempts</span>
          <span>${pct}%</span>
        </div>
        <div style="background:var(--bg-elevated);border-radius:4px;height:8px;width:100%">
          <div style="background:var(--accent);border-radius:4px;height:8px;width:${pct}%;transition:width 0.3s"></div>
        </div>
        ${totalAttempts >= target
          ? '<span style="color:var(--success);font-size:12px;margin-top:4px;display:block">✅ Target reached!</span>'
          : `<span style="color:var(--text-muted);font-size:12px;margin-top:4px;display:block">${target - totalAttempts} more needed</span>`}
      </div>`;
  });

  // ─── Start Session ───
  // FIX 7: removed all inputAttempt.value references — was null → crashed here
  btnStart.addEventListener('click', () => {
    const userId = inputUserId.value.trim();
    if (!userId) {
      toast('Please enter a Subject ID.', 'error');
      inputUserId.focus();
      return;
    }

    const promptVal = selectPrompt.value;
    let prompt = promptVal;
    if (promptVal === 'custom') {
      prompt = inputCustomPrompt.value.trim();
      if (!prompt) {
        toast('Enter a custom prompt.', 'error');
        inputCustomPrompt.focus();
        return;
      }
    }

    // Calculate starting attempt number for this user
    const userSessions = state.sessions.filter(s => s.userId === userId);
    const prevAttempts = userSessions.reduce((sum, s) => sum + s.attempts.length, 0);
    const startAttempt = prevAttempts + 1;
    const target = parseInt(inputTargetAttempts.value) || 50;

    if (prevAttempts >= target) {
      toast(`${userId} already completed all ${target} attempts!`, 'info');
      return;
    }

    state.currentSession = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      userId,
      attempt: startAttempt,
      target,
      prompt: promptVal === 'free' ? '(free text)' : prompt,
      isFree: promptVal === 'free',
      startedAt: new Date().toISOString(),
      attempts: [],
    };

    state.isRecording = false;
    resetAttemptState();

    // UI
    setupCard.classList.add('hidden');
    typingCard.classList.remove('hidden');
    badgeUser.textContent = userId;
    updateAttemptBadge();
    badgePromptLabel.textContent = promptVal === 'free' ? 'Free Text' : 'Fixed Prompt';

    if (promptVal === 'free') {
      promptDisplay.classList.add('hidden');
    } else {
      promptDisplay.classList.remove('hidden');
      promptText.textContent = state.currentSession.prompt;
    }

    updateSubjectProgressBar();
    typingInput.value = '';
    typingInput.focus();
    toast(`Session started for ${userId}! Attempt ${startAttempt} / ${target}`, 'success');
  });

  function updateAttemptBadge() {
    const s = state.currentSession;
    badgeAttempt.textContent = `Attempt ${s.attempt} / ${s.target}`;
  }

  // FIX 8: subject progress bar update
  function updateSubjectProgressBar() {
    const s = state.currentSession;
    if (!s) return;
    const userSessions = state.sessions.filter(sess => sess.userId === s.userId);
    const done = userSessions.reduce((sum, sess) => sum + sess.attempts.length, 0)
                 + s.attempts.length;
    const pct = Math.min((done / s.target) * 100, 100);
    if (subjectProgressFill)  subjectProgressFill.style.width = pct + '%';
    if (subjectProgressLabel) subjectProgressLabel.textContent = `${done} / ${s.target} attempts`;
  }

  // ─── End Session ───
  btnEnd.addEventListener('click', endSession);

  function endSession() {
    if (state.keystrokes.length > 0) saveCurrentAttempt();
    if (state.currentSession && state.currentSession.attempts.length > 0) {
      state.sessions.push({ ...state.currentSession, endedAt: new Date().toISOString() });
      persistSessions();
      toast(`Session saved — ${state.currentSession.attempts.length} attempt(s).`, 'success');
    } else {
      toast('Session ended (no data captured).', 'info');
    }
    state.currentSession = null;
    state.isRecording = false;
    typingCard.classList.add('hidden');
    setupCard.classList.remove('hidden');
    // Refresh preview for same user
    inputUserId.dispatchEvent(new Event('input'));
    updateHeaderStats();
  }

  // ─── Submit Attempt ───
  btnSubmit.addEventListener('click', () => {
    if (state.keystrokes.length === 0) {
      toast('No keystrokes captured yet.', 'error');
      return;
    }
    const target = state.currentSession.target;
    saveCurrentAttempt();

    const totalSoFar = state.sessions
      .filter(s => s.userId === state.currentSession.userId)
      .reduce((sum, s) => sum + s.attempts.length, 0)
      + state.currentSession.attempts.length;

    if (totalSoFar >= target) {
      toast(`🎉 ${state.currentSession.userId} completed all ${target} attempts!`, 'success');
      endSession();
      return;
    }

    // FIX 9: was inputAttempt.value = ... → now just increment state
    state.currentSession.attempt++;
    updateAttemptBadge();
    resetAttemptState();
    typingInput.value = '';
    typingInput.focus();
    updateSubjectProgressBar();
    toast(`Attempt saved! Ready for attempt ${state.currentSession.attempt}.`, 'success');
  });

  btnClear.addEventListener('click', () => {
    typingInput.value = '';
    resetAttemptState();
    typingInput.focus();
  });

  function saveCurrentAttempt() {
    state.currentSession.attempts.push({
      attempt: state.currentSession.attempt,
      prompt:  state.currentSession.prompt,
      typed:   typingInput.value,
      keystrokes: [...state.keystrokes],
      timestamp:  new Date().toISOString(),
    });
    updateHeaderStats();
    updateSubjectProgressBar();
  }

  function resetAttemptState() {
    state.keyEvents      = [];
    state.keystrokes     = [];
    state.pendingKeys    = {};
    state.prevRelease    = null;
    state.prevPress      = null;
    state.sessionStartTime = null;
    state.errorCount     = 0;
    liveBody.innerHTML   = '';
    updateMetrics();
  }

  // ═══════════════════════════════════
  //  KEYSTROKE CAPTURE ENGINE
  // ═══════════════════════════════════

  typingInput.addEventListener('keydown', e => {
    if (!state.currentSession) return;
    if (e.key === 'Tab') { e.preventDefault(); return; }

    const now = performance.now();
    if (!state.sessionStartTime) state.sessionStartTime = now;
    if (state.pendingKeys[e.code]) return;

    state.pendingKeys[e.code] = { key: e.key, code: e.code, pressTime: now };
    state.isRecording = true;
  });

  typingInput.addEventListener('keyup', e => {
    if (!state.currentSession) return;

    const now     = performance.now();
    const pending = state.pendingKeys[e.code];
    if (!pending) return;
    delete state.pendingKeys[e.code];

    const pressTime   = pending.pressTime;
    const releaseTime = now;
    const dwell       = releaseTime - pressTime;
    const flight = state.prevRelease !== null ? (pressTime - state.prevRelease) : null;
    const ikl    = state.prevPress   !== null ? (pressTime - state.prevPress)   : null;
    const dd     = ikl;
    const uu     = state.prevRelease !== null ? (releaseTime - state.prevRelease) : null;

    const idx = state.keystrokes.length + 1;
    const row = {
      index:       idx,
      key:         e.key,
      code:        e.code,
      pressTime:   +(pressTime - state.sessionStartTime).toFixed(2),
      releaseTime: +(releaseTime - state.sessionStartTime).toFixed(2),
      dwell:       +dwell.toFixed(2),
      flight:      flight !== null ? +flight.toFixed(2) : '',
      ikl:         ikl    !== null ? +ikl.toFixed(2)    : '',
      dd:          dd     !== null ? +dd.toFixed(2)     : '',
      uu:          uu     !== null ? +uu.toFixed(2)     : '',
    };

    state.keystrokes.push(row);
    state.prevRelease = releaseTime;
    state.prevPress   = pressTime;

    if (!state.currentSession.isFree) {
      const typed    = typingInput.value;
      const expected = state.currentSession.prompt;
      if (typed.length <= expected.length) {
        const lastChar     = typed[typed.length - 1];
        const expectedChar = expected[typed.length - 1];
        if (lastChar !== expectedChar && e.key.length === 1) state.errorCount++;
      }
    }

    addLiveRow(row);
    updateMetrics();
  });

  typingInput.addEventListener('input', () => {
    charTyped.textContent = typingInput.value.length;
  });

  // ─── Live Table Row ───
  function addLiveRow(row) {
    const tr = document.createElement('tr');
    tr.className = 'new-row';
    tr.innerHTML = `
      <td>${row.index}</td>
      <td>${escHtml(displayKey(row.key))}</td>
      <td>${escHtml(row.code)}</td>
      <td>${row.pressTime}</td>
      <td>${row.releaseTime}</td>
      <td>${row.dwell}</td>
      <td>${row.flight}</td>
      <td>${row.ikl}</td>
      <td>${row.dd}</td>
      <td>${row.uu}</td>
    `;
    liveBody.appendChild(tr);
    const wrapper = document.querySelector('.table-scroll');
    if (wrapper) wrapper.scrollTop = wrapper.scrollHeight;
  }

  function displayKey(key) {
    const map = {
      ' ': '␣', Enter: '⏎', Backspace: '⌫', Shift: '⇧',
      Tab: '⇥', CapsLock: '⇪', Control: 'Ctrl', Alt: 'Alt', Meta: '⌘',
    };
    return map[key] || key;
  }

  // ─── Update Live Metrics ───
  function updateMetrics() {
    const ks = state.keystrokes;
    const n  = ks.length;

    $('metric-keystrokes').textContent = n;
    $('metric-errors').textContent     = state.errorCount;

    if (n === 0) {
      $('metric-dwell').textContent  = '—';
      $('metric-flight').textContent = '—';
      $('metric-ikl').textContent    = '—';
      $('metric-wpm').textContent    = '—';
      ['bar-dwell','bar-flight','bar-ikl','bar-wpm','bar-keystrokes','bar-errors']
        .forEach(id => setBar(id, 0));
      return;
    }

    const dwells  = ks.map(r => r.dwell);
    const flights = ks.map(r => r.flight).filter(v => v !== '');
    const ikls    = ks.map(r => r.ikl).filter(v => v !== '');

    const avgDwell  = mean(dwells);
    const avgFlight = flights.length ? mean(flights) : 0;
    const avgIKL    = ikls.length    ? mean(ikls)    : 0;

    const elapsed = (ks[n - 1].releaseTime) / 1000 / 60;
    const words   = typingInput.value.trim().split(/\s+/).filter(Boolean).length;
    const wpm     = elapsed > 0 ? Math.round(words / elapsed) : 0;

    $('metric-dwell').textContent  = avgDwell.toFixed(1);
    $('metric-flight').textContent = avgFlight.toFixed(1);
    $('metric-ikl').textContent    = avgIKL.toFixed(1);
    $('metric-wpm').textContent    = wpm;

    setBar('bar-dwell',      Math.min(avgDwell  / 200, 1) * 100);
    setBar('bar-flight',     Math.min(avgFlight / 300, 1) * 100);
    setBar('bar-ikl',        Math.min(avgIKL    / 400, 1) * 100);
    setBar('bar-wpm',        Math.min(wpm       / 120, 1) * 100);
    setBar('bar-keystrokes', Math.min(n         / 100, 1) * 100);
    setBar('bar-errors',     Math.min(state.errorCount / 10, 1) * 100);
  }

  function setBar(id, pct) { $(id).style.width = pct + '%'; }
  function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
  function std(arr) {
    const m = mean(arr);
    return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
  }

  // ═══════════════════════════════
  //  FIX 10: SUBJECTS PANEL
  // ═══════════════════════════════

  function renderSubjects() {
    const target     = parseInt(inputTargetAttempts.value) || 50;
    const subjectMap = {};

    state.sessions.forEach(s => {
      if (!subjectMap[s.userId]) {
        subjectMap[s.userId] = { attempts: 0, lastActive: s.startedAt };
      }
      subjectMap[s.userId].attempts += s.attempts.length;
      if (s.startedAt > subjectMap[s.userId].lastActive)
        subjectMap[s.userId].lastActive = s.startedAt;
    });

    const subjects   = Object.entries(subjectMap);
    const completed  = subjects.filter(([, d]) => d.attempts >= target).length;
    const inProgress = subjects.filter(([, d]) => d.attempts > 0 && d.attempts < target).length;
    const totalAttempts = subjects.reduce((s, [, d]) => s + d.attempts, 0);

    // Overview ring
    const ringGoal  = parseInt($('overview-target')?.textContent) || 50;
    const ringPct   = Math.min(completed / ringGoal, 1);
    const circumference = 326.73;
    const ring = $('overview-ring-progress');
    if (ring) ring.style.strokeDashoffset = circumference * (1 - ringPct);
    const countEl = $('overview-complete-count');
    if (countEl) countEl.textContent = completed;

    // Overview stats
    const setStat = (id, v) => { const el = $(id); if (el) el.textContent = v; };
    setStat('ov-total-subjects',   subjects.length);
    setStat('ov-complete-subjects', completed);
    setStat('ov-in-progress',      inProgress);
    setStat('ov-total-attempts',   totalAttempts);

    // Populate datalist for autocomplete
    if (userDatalist) {
      userDatalist.innerHTML = '';
      subjects.forEach(([uid]) => {
        const opt = document.createElement('option');
        opt.value = uid;
        userDatalist.appendChild(opt);
      });
    }

    const emptyEl = $('subjects-empty');
    const tableWrap = $('subjects-table-wrap');
    const tbody = $('subjects-table-body');

    if (subjects.length === 0) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      if (tableWrap) tableWrap.classList.add('hidden');
      return;
    }
    if (emptyEl) emptyEl.classList.add('hidden');
    if (tableWrap) tableWrap.classList.remove('hidden');
    if (!tbody) return;

    tbody.innerHTML = '';
    subjects
      .sort((a, b) => b[1].attempts - a[1].attempts)
      .forEach(([uid, data]) => {
        const pct     = Math.min((data.attempts / target) * 100, 100).toFixed(0);
        const done    = data.attempts >= target;
        const status  = done ? '✅ Complete' : data.attempts > 0 ? '🔄 In Progress' : '⬜ Not Started';
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${escHtml(uid)}</strong></td>
          <td>${data.attempts}</td>
          <td>${target}</td>
          <td>
            <div style="display:flex;align-items:center;gap:8px">
              <div style="flex:1;background:var(--bg-elevated);border-radius:4px;height:8px">
                <div style="background:var(--accent);border-radius:4px;height:8px;width:${pct}%"></div>
              </div>
              <span style="font-size:12px;color:var(--text-muted)">${pct}%</span>
            </div>
          </td>
          <td>${status}</td>
          <td style="font-size:12px;color:var(--text-muted)">${new Date(data.lastActive).toLocaleString()}</td>
        `;
        tbody.appendChild(tr);
      });
  }

  // ═══════════════════════════════
  //  SESSIONS PANEL
  // ═══════════════════════════════

  function renderSessions() {
    const list  = $('sessions-list');
    const empty = $('sessions-empty');
    if (state.sessions.length === 0) {
      empty.classList.remove('hidden');
      list.classList.add('hidden');
      return;
    }
    empty.classList.add('hidden');
    list.classList.remove('hidden');
    list.innerHTML = '';

    state.sessions.forEach((s, i) => {
      const totalKs = s.attempts.reduce((sum, a) => sum + a.keystrokes.length, 0);
      const div = document.createElement('div');
      div.className = 'session-item';
      div.innerHTML = `
        <div class="session-item-info">
          <span class="badge badge--accent">${escHtml(s.userId)}</span>
          <div class="session-item-meta">
            <span class="session-title">${s.attempts.length} attempt(s) · ${totalKs} keystrokes</span>
            <span class="session-detail">Prompt: ${escHtml(s.prompt)} · ${new Date(s.startedAt).toLocaleString()}</span>
          </div>
        </div>
        <div class="session-item-actions">
          <button class="btn btn--danger btn--sm" data-delete="${i}">Delete</button>
        </div>
      `;
      list.appendChild(div);
    });

    list.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.delete);
        state.sessions.splice(idx, 1);
        persistSessions();
        renderSessions();
        updateHeaderStats();
        toast('Session deleted.', 'info');
      });
    });
  }

  $('btn-clear-all').addEventListener('click', () => {
    if (!confirm('Delete ALL sessions? This cannot be undone.')) return;
    state.sessions = [];
    persistSessions();
    renderSessions();
    updateHeaderStats();
    toast('All sessions cleared.', 'info');
  });

  // FIX 11: Import JSON handler (was missing entirely)
  const importInput = $('import-file-input');
  if (importInput) {
    importInput.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const imported = JSON.parse(ev.target.result);
          if (!Array.isArray(imported)) throw new Error('Invalid format');
          state.sessions.push(...imported);
          persistSessions();
          renderSessions();
          updateHeaderStats();
          toast(`Imported ${imported.length} session(s).`, 'success');
        } catch {
          toast('Import failed — invalid JSON file.', 'error');
        }
        importInput.value = '';
      };
      reader.readAsText(file);
    });
  }

  // ═══════════════════════════════
  //  EXPORT ENGINE
  // ═══════════════════════════════

  $('btn-export-raw').addEventListener('click', () => {
    if (state.sessions.length === 0) { toast('No data to export.', 'error'); return; }
    const header = 'subject,session,attempt,key,keyCode,pressTime,releaseTime,dwell,flight,IKL,DD,UU';
    const rows = [];
    state.sessions.forEach(s => {
      s.attempts.forEach(a => {
        a.keystrokes.forEach(k => {
          rows.push([
            csvSafe(s.userId), csvSafe(s.id), a.attempt,
            csvSafe(displayKey(k.key)), csvSafe(k.code),
            k.pressTime, k.releaseTime, k.dwell,
            k.flight, k.ikl, k.dd, k.uu,
          ].join(','));
        });
      });
    });
    downloadCSV('keystroke_raw_events.csv', header + '\n' + rows.join('\n'));
    toast('Raw events exported!', 'success');
  });

  $('btn-export-features').addEventListener('click', () => {
    if (state.sessions.length === 0) { toast('No data to export.', 'error'); return; }
    const header = 'subject,session,attempt,prompt,typed,num_keystrokes,dwell_mean,dwell_std,dwell_min,dwell_max,flight_mean,flight_std,flight_min,flight_max,IKL_mean,IKL_std,IKL_min,IKL_max,DD_mean,DD_std,UU_mean,UU_std,wpm,error_rate';
    const rows = [];
    state.sessions.forEach(s => {
      s.attempts.forEach(a => {
        const ks = a.keystrokes;
        if (ks.length === 0) return;
        const dwells  = ks.map(k => k.dwell);
        const flights = ks.map(k => k.flight).filter(v => v !== '');
        const ikls    = ks.map(k => k.ikl).filter(v => v !== '');
        const dds     = ks.map(k => k.dd).filter(v => v !== '');
        const uus     = ks.map(k => k.uu).filter(v => v !== '');

        const elapsed = (ks[ks.length - 1].releaseTime) / 1000 / 60;
        const words   = a.typed.trim().split(/\s+/).filter(Boolean).length;
        const wpm     = elapsed > 0 ? (words / elapsed).toFixed(1) : 0;

        let errors = 0;
        if (a.prompt && a.prompt !== '(free text)') {
          for (let i = 0; i < Math.min(a.typed.length, a.prompt.length); i++) {
            if (a.typed[i] !== a.prompt[i]) errors++;
          }
        }
        const errorRate = a.typed.length > 0 ? (errors / a.typed.length).toFixed(4) : 0;

        rows.push([
          csvSafe(s.userId), csvSafe(s.id), a.attempt,
          csvSafe(a.prompt), csvSafe(a.typed), ks.length,
          stats(dwells).join(','), stats(flights).join(','),
          stats(ikls).join(','),
          dds.length ? mean(dds).toFixed(2) : '', dds.length ? std(dds).toFixed(2) : '',
          uus.length ? mean(uus).toFixed(2) : '', uus.length ? std(uus).toFixed(2) : '',
          wpm, errorRate,
        ].join(','));
      });
    });
    downloadCSV('keystroke_features.csv', header + '\n' + rows.join('\n'));
    toast('Features exported!', 'success');
  });

  $('btn-export-dsl').addEventListener('click', () => {
    if (state.sessions.length === 0) { toast('No data to export.', 'error'); return; }
    const rows = [];
    const allHeaders = new Set();
    const attemptData = [];

    state.sessions.forEach(s => {
      s.attempts.forEach(a => {
        const ks = a.keystrokes;
        if (ks.length < 2) return;
        const record = { subject: s.userId, sessionIndex: s.id, rep: a.attempt };
        ks.forEach((k, i) => {
          const kname = sanitizeKeyName(k.key);
          const hKey  = 'H.' + kname;
          record[hKey] = k.dwell;
          allHeaders.add(hKey);
          if (i > 0) {
            const prevName = sanitizeKeyName(ks[i - 1].key);
            const ddKey = 'DD.' + prevName + '.' + kname;
            const udKey = 'UD.' + prevName + '.' + kname;
            record[ddKey] = k.dd;
            record[udKey] = k.flight;
            allHeaders.add(ddKey);
            allHeaders.add(udKey);
          }
        });
        attemptData.push(record);
      });
    });

    const sortedHeaders = ['subject', 'sessionIndex', 'rep', ...Array.from(allHeaders).sort()];
    attemptData.forEach(rec => {
      rows.push(sortedHeaders.map(h => rec[h] !== undefined ? rec[h] : '').join(','));
    });
    downloadCSV('keystroke_dsl_format.csv', sortedHeaders.join(',') + '\n' + rows.join('\n'));
    toast('DSL-format exported!', 'success');
  });

  $('btn-export-json').addEventListener('click', () => {
    if (state.sessions.length === 0) { toast('No data to export.', 'error'); return; }
    const blob = new Blob([JSON.stringify(state.sessions, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'keystroke_dataset.json'; a.click();
    URL.revokeObjectURL(url);
    toast('JSON exported!', 'success');
  });

  // ─── Summary ───
  function updateSummary() {
    const subjects = new Set();
    let totalAttempts = 0, totalKs = 0;
    const allDwells = [], allFlights = [];

    state.sessions.forEach(s => {
      subjects.add(s.userId);
      s.attempts.forEach(a => {
        totalAttempts++;
        a.keystrokes.forEach(k => {
          totalKs++;
          allDwells.push(k.dwell);
          if (k.flight !== '') allFlights.push(k.flight);
        });
      });
    });

    $('sum-subjects').textContent    = subjects.size;
    $('sum-sessions').textContent    = state.sessions.length;
    $('sum-attempts').textContent    = totalAttempts;
    $('sum-keystrokes').textContent  = totalKs;
    $('sum-avg-dwell').textContent   = allDwells.length  ? mean(allDwells).toFixed(1)  + ' ms' : '—';
    $('sum-avg-flight').textContent  = allFlights.length ? mean(allFlights).toFixed(1) + ' ms' : '—';
  }

  // ═══════════════════════════════
  //  HELPERS
  // ═══════════════════════════════

  function persistSessions() {
    localStorage.setItem('kd_sessions', JSON.stringify(state.sessions));
    updateHeaderStats();
  }

  // FIX 12: updateHeaderStats now also updates subjects count
  function updateHeaderStats() {
    const subjects = new Set(state.sessions.map(s => s.userId));
    let totalKs = 0;
    state.sessions.forEach(s => s.attempts.forEach(a => { totalKs += a.keystrokes.length; }));
    if (totalSubjectsCount)   totalSubjectsCount.textContent   = subjects.size;
    if (totalSessionsCount)   totalSessionsCount.textContent   = state.sessions.length;
    if (totalKeystrokesCount) totalKeystrokesCount.textContent = totalKs;
  }

  function stats(arr) {
    if (!arr.length) return ['', '', '', ''];
    return [
      mean(arr).toFixed(2), std(arr).toFixed(2),
      Math.min(...arr).toFixed(2), Math.max(...arr).toFixed(2),
    ];
  }

  function sanitizeKeyName(key) {
    const map = {
      '.': 'period', ',': 'comma', ' ': 'space', '!': 'exclam', '@': 'at',
      '#': 'hash', '$': 'dollar', '%': 'percent', '^': 'caret', '&': 'ampersand',
      '*': 'asterisk', '(': 'lparen', ')': 'rparen', '-': 'minus', '=': 'equal',
      '+': 'plus', '/': 'slash', '\\': 'backslash', "'": 'apostrophe', '"': 'quote',
      ';': 'semicolon', ':': 'colon', '[': 'lbracket', ']': 'rbracket',
      '{': 'lbrace', '}': 'rbrace', '<': 'less', '>': 'greater', '?': 'question',
      '`': 'backtick', '~': 'tilde', '_': 'underscore', '|': 'pipe',
      Enter: 'Return', Backspace: 'BackSpace', Shift: 'Shift',
      Control: 'Control', Alt: 'Alt', Tab: 'Tab', CapsLock: 'CapsLock', Meta: 'Meta',
    };
    return map[key] || key;
  }

  function csvSafe(val) {
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n'))
      return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function downloadCSV(filename, content) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function escHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function toast(msg, type = 'info') {
    const container = $('toast-container');
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => {
      el.style.animation = 'toastOut 0.3s ease-in forwards';
      setTimeout(() => el.remove(), 300);
    }, 3000);
  }

  // ─── Init ───
  updateHeaderStats();

})();
