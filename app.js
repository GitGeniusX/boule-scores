/* Boule — two-team score tracker
   - Persists to localStorage (graceful fallback if blocked)
   - Standard pétanque: first to target (default 13) wins
   - Round history + undo
*/
(function () {
  'use strict';

  const STORAGE_KEY = 'boule.state.v1';

  const defaultState = () => ({
    teams: [
      { id: 'a', name: 'Team A', score: 0 },
      { id: 'b', name: 'Team B', score: 0 },
    ],
    target: 13,
    rounds: [], // { team: 'a'|'b', points: number, tally: [aScore, bScore] }
    winner: null, // 'a' | 'b' | null
  });

  // --- persistence (safe) ---
  const store = {
    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaultState();
        const parsed = JSON.parse(raw);
        return { ...defaultState(), ...parsed };
      } catch {
        return defaultState();
      }
    },
    save(s) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      } catch {
        /* sandboxed — ignore */
      }
    },
  };

  let state = store.load();

  // --- render ---
  const board = document.getElementById('board');
  const roundNumEl = document.getElementById('roundNum');
  const targetBtn = document.getElementById('targetBtn');
  const leaderEl = document.getElementById('leaderLabel');
  const historyList = document.getElementById('historyList');
  const undoBtn = document.getElementById('undoBtn');
  const winnerEl = document.getElementById('winner');
  const winnerName = document.getElementById('winnerName');
  const winnerScore = document.getElementById('winnerScore');
  const targetDialog = document.getElementById('targetDialog');

  function renderBoard() {
    board.innerHTML = '';
    state.teams.forEach((t) => {
      const other = state.teams.find((x) => x.id !== t.id);
      const leading = t.score > other.score && t.score > 0;
      const card = document.createElement('section');
      card.className = 'team-card' + (leading ? ' leading' : '');
      card.dataset.team = t.id;
      card.innerHTML = `
        <div class="team-name">
          <span class="team-dot" aria-hidden="true"></span>
          <input
            type="text"
            value="${escapeHtml(t.name)}"
            maxlength="20"
            aria-label="Team name"
            data-team-input="${t.id}"
          />
        </div>
        <div class="score" data-score="${t.id}" aria-live="polite">${t.score}</div>
        <div class="points-row" role="group" aria-label="Add or subtract points for ${escapeHtml(t.name)}">
          <button class="pt-btn minus" data-pt="${t.id}" data-v="-1" aria-label="Subtract one point">−</button>
          <button class="pt-btn" data-pt="${t.id}" data-v="1">+1</button>
          <button class="pt-btn" data-pt="${t.id}" data-v="2">+2</button>
          <button class="pt-btn" data-pt="${t.id}" data-v="3">+3</button>
          <button class="pt-btn" data-pt="${t.id}" data-v="4">+4</button>
          <button class="pt-btn" data-pt="${t.id}" data-v="5">+5</button>
        </div>
      `;
      board.appendChild(card);
    });
  }

  function renderMeta() {
    const roundsPlayed = state.rounds.length;
    roundNumEl.textContent = state.winner ? roundsPlayed : roundsPlayed + 1;
    targetBtn.textContent = state.target;
    const [a, b] = state.teams;
    if (a.score === b.score) {
      leaderEl.textContent = a.score === 0 ? '—' : 'Tied';
    } else {
      leaderEl.textContent = a.score > b.score ? a.name : b.name;
    }
  }

  function renderHistory() {
    if (state.rounds.length === 0) {
      historyList.innerHTML = `<li class="history-empty">No rounds played yet — add points to a team to start.</li>`;
      undoBtn.disabled = true;
      return;
    }
    undoBtn.disabled = false;
    historyList.innerHTML = state.rounds
      .map((r, i) => {
        const team = state.teams.find((t) => t.id === r.team);
        return `
          <li class="history-item">
            <span class="r">#${i + 1}</span>
            <span class="who">
              <span class="dot" style="background: var(--color-team-${r.team});"></span>
              <span>${escapeHtml(team.name)}</span>
            </span>
            <span class="pts">+${r.points}</span>
            <span class="tally">${r.tally[0]} – ${r.tally[1]}</span>
          </li>`;
      })
      .reverse()
      .join('');
  }

  function renderWinner() {
    if (!state.winner) {
      winnerEl.hidden = true;
      return;
    }
    const w = state.teams.find((t) => t.id === state.winner);
    const l = state.teams.find((t) => t.id !== state.winner);
    winnerName.textContent = `${w.name} wins`;
    winnerScore.textContent = `${w.score} – ${l.score}`;
    winnerEl.hidden = false;
  }

  function renderAll() {
    renderBoard();
    renderMeta();
    renderHistory();
    renderWinner();
  }

  // --- actions ---
  function addPoints(teamId, v) {
    if (state.winner) return;
    const t = state.teams.find((x) => x.id === teamId);
    if (!t) return;
    const next = Math.max(0, t.score + v);
    if (next === t.score) return; // no-op (can't go below 0)
    const actualDelta = next - t.score;
    t.score = next;

    if (actualDelta > 0) {
      state.rounds.push({
        team: teamId,
        points: actualDelta,
        tally: [state.teams[0].score, state.teams[1].score],
      });
    } else {
      // negative adjustment: drop the last matching round if possible, otherwise log correction
      const idx = [...state.rounds].reverse().findIndex((r) => r.team === teamId);
      if (idx !== -1) {
        state.rounds.splice(state.rounds.length - 1 - idx, 1);
      }
    }

    if (t.score >= state.target) {
      state.winner = t.id;
    }

    store.save(state);
    renderAll();

    // bump animation
    const scoreEl = document.querySelector(`[data-score="${teamId}"]`);
    if (scoreEl) {
      scoreEl.classList.remove('bump');
      void scoreEl.offsetWidth;
      scoreEl.classList.add('bump');
    }
  }

  function undoLast() {
    const last = state.rounds.pop();
    if (!last) return;
    const t = state.teams.find((x) => x.id === last.team);
    t.score = Math.max(0, t.score - last.points);
    if (state.winner && t.score < state.target) state.winner = null;
    store.save(state);
    renderAll();
  }

  function resetMatch(keepNames = true) {
    const names = state.teams.map((t) => t.name);
    const target = state.target;
    state = defaultState();
    state.target = target;
    if (keepNames) {
      state.teams[0].name = names[0];
      state.teams[1].name = names[1];
    }
    store.save(state);
    renderAll();
  }

  function setTeamName(teamId, name) {
    const t = state.teams.find((x) => x.id === teamId);
    if (!t) return;
    t.name = name.trim() || (teamId === 'a' ? 'Team A' : 'Team B');
    store.save(state);
    // don't full re-render (would kill input focus); just update history + meta
    renderMeta();
    renderHistory();
  }

  // --- events ---
  board.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pt]');
    if (!btn) return;
    addPoints(btn.dataset.pt, parseInt(btn.dataset.v, 10));
  });

  board.addEventListener('input', (e) => {
    const input = e.target.closest('[data-team-input]');
    if (!input) return;
    setTeamName(input.dataset.teamInput, input.value);
  });

  undoBtn.addEventListener('click', undoLast);

  document.querySelector('[data-action="reset"]').addEventListener('click', () => {
    if (state.rounds.length === 0 && !state.winner) return;
    if (confirm('Reset the match? Team names are kept.')) resetMatch(true);
  });

  winnerEl.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'rematch') resetMatch(true);
    if (action === 'dismiss') {
      winnerEl.hidden = true;
    }
  });

  targetBtn.addEventListener('click', () => {
    targetDialog
      .querySelector(`input[value="${state.target}"]`)
      ?.setAttribute('checked', 'checked');
    targetDialog.showModal();
  });
  targetDialog.addEventListener('close', () => {
    if (targetDialog.returnValue === 'ok') {
      const picked = targetDialog.querySelector('input[name="target"]:checked');
      if (picked) {
        state.target = parseInt(picked.value, 10);
        // if any team already past new target, declare winner
        const winner = state.teams.find((t) => t.score >= state.target);
        state.winner = winner ? winner.id : null;
        store.save(state);
        renderAll();
      }
    }
  });

  // --- theme toggle ---
  (function () {
    const toggle = document.querySelector('[data-theme-toggle]');
    const root = document.documentElement;
    let theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const apply = () => {
      root.setAttribute('data-theme', theme);
      toggle.setAttribute(
        'aria-label',
        `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`,
      );
      toggle.innerHTML =
        theme === 'dark'
          ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
          : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    };
    apply();
    toggle.addEventListener('click', () => {
      theme = theme === 'dark' ? 'light' : 'dark';
      apply();
    });
  })();

  // keyboard shortcuts: 1-5 add points to team A, 6-0 to team B, U = undo
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;
    if (e.key >= '1' && e.key <= '5') addPoints('a', parseInt(e.key, 10));
    else if (['6', '7', '8', '9', '0'].includes(e.key)) {
      const map = { 6: 1, 7: 2, 8: 3, 9: 4, 0: 5 };
      addPoints('b', map[e.key]);
    } else if (e.key.toLowerCase() === 'u') {
      undoLast();
    }
  });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));
  }

  // initial render
  renderAll();
})();
