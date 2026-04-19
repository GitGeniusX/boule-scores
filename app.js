/* Boule — två-lagsmatch & serie med ljud, GPS och extern lagring */
(function () {
  'use strict';

  // ---------- state ----------
  const defaultMatch = () => ({
    teams: [
      { id: 'a', name: 'Tjejerna', score: 0 },
      { id: 'b', name: 'Killarna', score: 0 },
    ],
    target: 13,
    rounds: [],
    winner: null,
    startedAt: new Date().toISOString(),
    endedAt: null,
  });

  const defaultSeries = () => ({
    matches: [], // { teams: [{name}], target, rounds, winner, startedAt, endedAt, place, location }
  });

  const defaultSettings = () => ({
    soundOn: true,
    storageMode: 'none', // 'none' | 'jsonbin' | 'webhook'
    jsonbinKey: '',
    webhookUrl: '',
    placeLabel: '',
    useGps: true,
  });

  // Persistens: localStorage när det funkar (riktig host), annars in-memory.
  const LS_KEY = 'boule.v3';
  const hasLS = (() => {
    try {
      const k = '__t';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch {
      return false;
    }
  })();
  const storage = {
    load() {
      if (!hasLS) return null;
      try {
        return JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      } catch {
        return null;
      }
    },
    save(state) {
      if (!hasLS) return;
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(state));
      } catch {
        /* quota etc. */
      }
    },
  };

  const saved = storage.load();
  let match = saved?.match || defaultMatch();
  let series = saved?.series || defaultSeries();
  let settings = { ...defaultSettings(), ...(saved?.settings || {}) };

  function persist() {
    storage.save({ match, series, settings });
  }

  // ---------- elements ----------
  const $ = (s) => document.querySelector(s);
  const board = $('#board');
  const roundNumEl = $('#roundNum');
  const targetBtn = $('#targetBtn');
  const leaderEl = $('#leaderLabel');
  const historyList = $('#historyList');
  const undoBtn = $('#undoBtn');
  const winnerEl = $('#winner');
  const winnerName = $('#winnerName');
  const winnerScore = $('#winnerScore');
  const winnerMeta = $('#winnerMeta');
  const seriesBadge = $('#seriesBadge');
  const targetDialog = $('#targetDialog');
  const teamDialog = $('#teamDialog');
  const settingsDialog = $('#settingsDialog');
  const historyDialog = $('#historyDialog');
  const toast = $('#toast');

  // ---------- ljud (WebAudio, inga externa filer) ----------
  const sound = (() => {
    let ctx = null;
    const ensure = () => {
      if (!ctx) {
        try {
          ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch {
          ctx = false;
        }
      }
      return ctx;
    };
    const tone = (freq, dur = 0.12, type = 'sine', vol = 0.12) => {
      if (!settings.soundOn) return;
      const ac = ensure();
      if (!ac) return;
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.value = 0;
      g.gain.linearRampToValueAtTime(vol, ac.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
      osc.connect(g).connect(ac.destination);
      osc.start();
      osc.stop(ac.currentTime + dur + 0.02);
    };
    return {
      point: () => tone(880, 0.09, 'triangle', 0.14),
      bigPoint: () => {
        tone(660, 0.08, 'triangle', 0.12);
        setTimeout(() => tone(990, 0.12, 'triangle', 0.14), 70);
      },
      undo: () => tone(320, 0.13, 'sine', 0.1),
      win: () => {
        const notes = [523, 659, 784, 1047];
        notes.forEach((f, i) => setTimeout(() => tone(f, 0.18, 'triangle', 0.16), i * 120));
      },
      click: () => tone(1200, 0.04, 'square', 0.05),
    };
  })();

  // ---------- rendering ----------
  function renderBoard() {
    board.innerHTML = '';
    match.teams.forEach((t) => {
      const other = match.teams.find((x) => x.id !== t.id);
      const leading = t.score > other.score && t.score > 0;
      const card = document.createElement('section');
      card.className = 'team-card' + (leading ? ' leading' : '');
      card.dataset.team = t.id;
      card.innerHTML = `
        <div class="team-name">
          <span class="team-icon" aria-hidden="true">${teamIcon(t.id)}</span>
          <button class="team-name-btn" data-action="edit-teams" title="Redigera lagnamn">
            <span>${escapeHtml(t.name)}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="pencil"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </button>
        </div>
        <div class="score" data-score="${t.id}" aria-live="polite">${t.score}</div>
        <div class="points-row" role="group" aria-label="Poäng för ${escapeHtml(t.name)}">
          <button class="pt-btn minus" data-pt="${t.id}" data-v="-1" aria-label="Ta bort en poäng">−</button>
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
    const roundsPlayed = match.rounds.length;
    roundNumEl.textContent = match.winner ? roundsPlayed : roundsPlayed + 1;
    targetBtn.textContent = match.target;
    const [a, b] = match.teams;
    if (a.score === b.score) leaderEl.textContent = a.score === 0 ? '—' : 'Lika';
    else leaderEl.textContent = a.score > b.score ? a.name : b.name;
  }

  function renderHistory() {
    if (match.rounds.length === 0) {
      historyList.innerHTML = `<li class="history-empty">Inga omgångar spelade än — lägg till poäng för att börja.</li>`;
      undoBtn.disabled = true;
      return;
    }
    undoBtn.disabled = false;
    historyList.innerHTML = match.rounds
      .map((r, i) => {
        const team = match.teams.find((t) => t.id === r.team);
        return `
          <li class="history-item">
            <span class="r">#${i + 1}</span>
            <span class="who">
              <span class="who-icon" style="color: var(--color-team-${r.team});">${teamIcon(r.team)}</span>
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
    if (!match.winner) {
      winnerEl.hidden = true;
      return;
    }
    const w = match.teams.find((t) => t.id === match.winner);
    const l = match.teams.find((t) => t.id !== match.winner);
    winnerName.textContent = `${w.name} vinner`;
    winnerScore.textContent = `${w.score} – ${l.score}`;
    winnerMeta.textContent = `${match.rounds.length} omgångar • mål ${match.target}`;
    winnerEl.hidden = false;
  }

  function renderSeriesBadge() {
    if (series.matches.length === 0) {
      seriesBadge.textContent = '—';
      return;
    }
    const a = series.matches.filter((m) => winnerName_(m) === match.teams[0].name).length;
    const b = series.matches.filter((m) => winnerName_(m) === match.teams[1].name).length;
    seriesBadge.textContent = `${a} – ${b}`;
  }
  function winnerName_(m) {
    return m.teams.find((t, i) => (i === 0 ? 'a' : 'b') === m.winner)?.name;
  }

  function renderAll() {
    renderBoard();
    renderMeta();
    renderHistory();
    renderWinner();
    renderSeriesBadge();
  }

  // ---------- actions ----------
  function addPoints(teamId, v) {
    if (match.winner) return;
    const t = match.teams.find((x) => x.id === teamId);
    if (!t) return;
    const next = Math.max(0, t.score + v);
    if (next === t.score) return;
    const delta = next - t.score;
    t.score = next;

    if (delta > 0) {
      match.rounds.push({
        team: teamId,
        points: delta,
        tally: [match.teams[0].score, match.teams[1].score],
      });
      delta >= 3 ? sound.bigPoint() : sound.point();
    } else {
      const idx = [...match.rounds].reverse().findIndex((r) => r.team === teamId);
      if (idx !== -1) match.rounds.splice(match.rounds.length - 1 - idx, 1);
      sound.undo();
    }

    if (t.score >= match.target && !match.winner) {
      match.winner = t.id;
      match.endedAt = new Date().toISOString();
      sound.win();
    }

    renderAll();
    bumpScore(teamId);
    persist();
  }

  function bumpScore(teamId) {
    const el = document.querySelector(`[data-score="${teamId}"]`);
    if (!el) return;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  function undoLast() {
    const last = match.rounds.pop();
    if (!last) return;
    const t = match.teams.find((x) => x.id === last.team);
    t.score = Math.max(0, t.score - last.points);
    if (match.winner && t.score < match.target) {
      match.winner = null;
      match.endedAt = null;
    }
    sound.undo();
    renderAll();
    persist();
  }

  function newMatch(keepNames = true) {
    const names = match.teams.map((t) => t.name);
    const target = match.target;
    match = defaultMatch();
    match.target = target;
    if (keepNames) {
      match.teams[0].name = names[0];
      match.teams[1].name = names[1];
    }
    renderAll();
    persist();
  }

  // ---------- lagnamn ----------
  function openTeamDialog() {
    teamDialog.querySelector('#teamA').value = match.teams[0].name;
    teamDialog.querySelector('#teamB').value = match.teams[1].name;
    teamDialog.showModal();
  }
  teamDialog.addEventListener('close', () => {
    if (teamDialog.returnValue !== 'ok') return;
    const a = teamDialog.querySelector('#teamA').value.trim() || 'Tjejerna';
    const b = teamDialog.querySelector('#teamB').value.trim() || 'Killarna';
    match.teams[0].name = a;
    match.teams[1].name = b;
    renderAll();
    sound.click();
    persist();
  });

  // ---------- målpoäng ----------
  targetBtn.addEventListener('click', () => {
    targetDialog.querySelector(`input[value="${match.target}"]`)?.setAttribute('checked', '');
    targetDialog.showModal();
  });
  targetDialog.addEventListener('close', () => {
    if (targetDialog.returnValue !== 'ok') return;
    const picked = targetDialog.querySelector('input[name="target"]:checked');
    if (!picked) return;
    match.target = parseInt(picked.value, 10);
    const win = match.teams.find((t) => t.score >= match.target);
    match.winner = win ? win.id : null;
    renderAll();
    persist();
  });

  // ---------- inställningar ----------
  function openSettings() {
    settingsDialog.querySelector('#soundOn').checked = settings.soundOn;
    settingsDialog.querySelector('#storageMode').value = settings.storageMode;
    settingsDialog.querySelector('#jsonbinKey').value = settings.jsonbinKey;
    settingsDialog.querySelector('#webhookUrl').value = settings.webhookUrl;
    settingsDialog.querySelector('#placeLabel').value = settings.placeLabel;
    settingsDialog.querySelector('#useGps').checked = settings.useGps;
    updateStorageVisibility();
    settingsDialog.showModal();
  }
  function updateStorageVisibility() {
    const mode = settingsDialog.querySelector('#storageMode').value;
    settingsDialog.querySelectorAll('[data-storage]').forEach((el) => {
      el.style.display = el.dataset.storage === mode ? '' : 'none';
    });
  }
  settingsDialog.querySelector('#storageMode').addEventListener('change', updateStorageVisibility);
  settingsDialog.addEventListener('close', () => {
    if (settingsDialog.returnValue !== 'ok') return;
    settings.soundOn = settingsDialog.querySelector('#soundOn').checked;
    settings.storageMode = settingsDialog.querySelector('#storageMode').value;
    settings.jsonbinKey = settingsDialog.querySelector('#jsonbinKey').value.trim();
    settings.webhookUrl = settingsDialog.querySelector('#webhookUrl').value.trim();
    settings.placeLabel = settingsDialog.querySelector('#placeLabel').value.trim();
    settings.useGps = settingsDialog.querySelector('#useGps').checked;
    renderSoundIcon();
    showToast('Inställningar sparade');
    persist();
  });

  // ---------- GPS ----------
  function getLocation(timeoutMs = 6000) {
    return new Promise((resolve) => {
      if (!settings.useGps || !('geolocation' in navigator)) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            lat: +pos.coords.latitude.toFixed(5),
            lng: +pos.coords.longitude.toFixed(5),
            accuracy: Math.round(pos.coords.accuracy),
          }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 },
      );
    });
  }

  // Omvänd geokodning via OpenStreetMap Nominatim — gratis, ingen nyckel.
  // Returnerar en kort läsbar adress, t.ex. "Sexdrega, Svenljunga, Sverige".
  async function reverseGeocode(lat, lng, timeoutMs = 5000) {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1&accept-language=sv`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const r = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!r.ok) return null;
      const j = await r.json();
      const a = j.address || {};
      // Bygg en kompakt etikett: närmsta ort/stadsdel + kommun + land.
      const primary =
        a.village || a.town || a.suburb || a.city_district || a.hamlet || a.city || a.municipality;
      const secondary = a.municipality && a.municipality !== primary ? a.municipality : a.county;
      const country = a.country;
      const parts = [primary, secondary, country].filter(Boolean);
      if (parts.length) return parts.join(', ');
      return j.display_name || null;
    } catch {
      return null;
    }
  }

  // ---------- spara match ----------
  async function saveMatch() {
    if (!match.winner) return;
    showToast('Hämtar plats…', 8000);
    const location = await getLocation();
    let placeText = settings.placeLabel || null;
    if (location) {
      const addr = await reverseGeocode(location.lat, location.lng);
      if (addr) placeText = addr; // adress i klartext vinner över manuell etikett
    }
    const payload = buildPayload(location, placeText);

    // alltid spara lokalt i serien
    series.matches.push(payload);
    persist();

    if (settings.storageMode === 'none') {
      showToast('Sparad lokalt (inget fjärrmål valt)');
    } else {
      try {
        const res = await sendToRemote(payload);
        showToast(`Sparad till ${settings.storageMode}: ${res}`);
      } catch (err) {
        showToast(`Fjärrsparning misslyckades: ${err.message}`, 6000);
      }
    }
    renderSeriesBadge();
  }

  function buildPayload(location, placeText) {
    return {
      app: 'boule-scoretracker',
      version: 1,
      savedAt: new Date().toISOString(),
      startedAt: match.startedAt,
      endedAt: match.endedAt,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      place: placeText || settings.placeLabel || null,
      location, // { lat, lng, accuracy } eller null
      target: match.target,
      teams: match.teams.map((t) => ({ name: t.name, score: t.score })),
      winner: match.teams.find((t) => t.id === match.winner)?.name || null,
      rounds: match.rounds.map((r, i) => ({
        n: i + 1,
        team: match.teams.find((t) => t.id === r.team).name,
        points: r.points,
        tally: r.tally,
      })),
    };
  }

  async function sendToRemote(payload) {
    if (settings.storageMode === 'jsonbin') {
      if (!settings.jsonbinKey) throw new Error('JSONBin Master Key saknas');
      const r = await fetch('https://api.jsonbin.io/v3/b', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Master-Key': settings.jsonbinKey,
          'X-Bin-Name': `boule-${payload.endedAt || payload.savedAt}`,
          'X-Bin-Private': 'true',
        },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      return `bin ${j.metadata?.id || 'skapad'}`;
    }
    if (settings.storageMode === 'webhook') {
      if (!settings.webhookUrl) throw new Error('Webhook-URL saknas');
      // Google Apps Script (och de flesta enkla webhooks) avvisar CORS-preflight.
      // Lösning: skicka som text/plain med no-cors — servern läser e.postData.contents som JSON.
      // Nackdel: vi kan inte läsa responsen (opaque), så vi antar success om fetch inte kastar.
      const looksLikeAppsScript = /script\.google\.com/.test(settings.webhookUrl);
      await fetch(settings.webhookUrl, {
        method: 'POST',
        mode: looksLikeAppsScript ? 'no-cors' : 'cors',
        headers: {
          'Content-Type': looksLikeAppsScript ? 'text/plain;charset=utf-8' : 'application/json',
        },
        body: JSON.stringify(payload),
        redirect: 'follow',
      });
      return looksLikeAppsScript ? 'skickat till Google Sheet' : 'OK';
    }
    throw new Error('okänt lagringsläge');
  }

  // ---------- matchhistorik ----------
  function openHistory() {
    const list = $('#matchList');
    const summary = $('#seriesSummary');
    if (series.matches.length === 0) {
      list.innerHTML = '<li class="history-empty">Inga sparade matcher än.</li>';
      summary.textContent = '';
    } else {
      const a = match.teams[0].name;
      const b = match.teams[1].name;
      const aWins = series.matches.filter((m) => m.winner === a).length;
      const bWins = series.matches.filter((m) => m.winner === b).length;
      summary.innerHTML = `
        <div class="series-score">
          <span><strong>${escapeHtml(a)}</strong> ${aWins}</span>
          <span class="divider">–</span>
          <span>${bWins} <strong>${escapeHtml(b)}</strong></span>
        </div>
        <div class="series-sub">${series.matches.length} matcher spelade</div>
      `;
      list.innerHTML = series.matches
        .slice()
        .reverse()
        .map((m, i) => {
          const idx = series.matches.length - i;
          const date = new Date(m.endedAt || m.savedAt);
          const dateStr = date.toLocaleString('sv-SE', {
            dateStyle: 'short',
            timeStyle: 'short',
          });
          const scores = m.teams.map((t) => `${escapeHtml(t.name)} ${t.score}`).join(' – ');
          const place = m.place || (m.location ? `${m.location.lat}, ${m.location.lng}` : '');
          return `
            <li class="match-item">
              <div class="match-head">
                <strong>Match ${idx}</strong>
                <span class="match-date">${dateStr}</span>
              </div>
              <div class="match-body">
                <div class="match-score">${scores}</div>
                <div class="match-winner">🏆 ${escapeHtml(m.winner || '—')}</div>
                ${place ? `<div class="match-place">📍 ${escapeHtml(place)}</div>` : ''}
              </div>
            </li>`;
        })
        .join('');
    }
    historyDialog.showModal();
  }

  $('#resetSeriesBtn').addEventListener('click', () => {
    if (confirm('Nollställ serien? Alla sparade matcher raderas.')) {
      series = defaultSeries();
      renderSeriesBadge();
      historyDialog.close();
      showToast('Serien nollställd');
      persist();
    }
  });

  // ---------- ljudikon ----------
  function renderSoundIcon() {
    const btn = document.querySelector('[data-action="sound-toggle"]');
    btn.innerHTML = settings.soundOn
      ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>'
      : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
  }

  // ---------- event bindings ----------
  board.addEventListener('click', (e) => {
    const pt = e.target.closest('[data-pt]');
    if (pt) {
      addPoints(pt.dataset.pt, parseInt(pt.dataset.v, 10));
      return;
    }
    if (e.target.closest('[data-action="edit-teams"]')) openTeamDialog();
  });

  undoBtn.addEventListener('click', undoLast);

  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]');
    if (!a) return;
    switch (a.dataset.action) {
      case 'sound-toggle':
        settings.soundOn = !settings.soundOn;
        renderSoundIcon();
        if (settings.soundOn) sound.click();
        break;
      case 'history':
        openHistory();
        break;
      case 'settings':
        openSettings();
        break;
      case 'save-match':
        saveMatch();
        break;
      case 'new-match':
        winnerEl.hidden = true;
        newMatch(true);
        break;
      case 'dismiss':
        winnerEl.hidden = true;
        break;
    }
  });

  // keyboard: 1-5 = A, 6-0 = B, U = undo
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select')) return;
    if (e.key >= '1' && e.key <= '5') addPoints('a', parseInt(e.key, 10));
    else if (['6', '7', '8', '9', '0'].includes(e.key)) {
      const map = { 6: 1, 7: 2, 8: 3, 9: 4, 0: 5 };
      addPoints('b', map[e.key]);
    } else if (e.key.toLowerCase() === 'u') undoLast();
  });

  // ---------- tema ----------
  (function () {
    const toggle = document.querySelector('[data-theme-toggle]');
    const root = document.documentElement;
    let theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const apply = () => {
      root.setAttribute('data-theme', theme);
      toggle.setAttribute('aria-label', `Byt till ${theme === 'dark' ? 'ljust' : 'mörkt'} läge`);
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

  // ---------- utils ----------
  let toastTimer;
  function showToast(msg, ms = 2500) {
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast.hidden = true), ms);
  }

  function teamIcon(id) {
    if (id === 'a') {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="9" r="5.5"/><path d="M12 14.5V22"/><path d="M8.5 19h7"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="14" r="5.5"/><path d="M14 10 20 4"/><path d="M15 4h5v5"/></svg>';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));
  }

  // ---------- service worker ----------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  // init
  renderSoundIcon();
  renderAll();
})();
