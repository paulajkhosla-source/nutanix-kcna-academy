import {makeTracks, SpeechPlayer} from '/audio-engine.js';
const $ = id => document.getElementById(id);
const storageKey = 'kcna-car-mode-v1';
let saved = {};
try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch {}
if (typeof saved !== 'object' || Array.isArray(saved)) saved = {};
let content, tracks = [], current = 0, player, voices = [], sleepTimer, sleepDeadline = 0;
let wakeLock = null, requestingWake = false;
const heard = new Set(Array.isArray(saved.heard) ? saved.heard.filter(x => typeof x === 'string').slice(0, 500) : []);
function notice(message) { $('notice').textContent = message; }
function restoreSelect(id, value) {
  if ([...$(id).options].some(option => option.value === String(value))) $(id).value = value;
}
for (const id of ['mode', 'rate', 'gap', 'sleep']) restoreSelect(id, saved[id]);
$('autonext').checked = saved.autonext !== false;
$('awake').checked = saved.awake === true;
function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify({
    mode: $('mode').value, domain: $('domain').value, rate: $('rate').value,
    gap: $('gap').value, sleep: $('sleep').value, voice: $('voice').value,
    autonext: $('autonext').checked, awake: $('awake').checked,
    track: tracks[current]?.id, step: player?.index || 0, heard: [...heard]
  })); } catch { notice('Listening works, but this browser could not save your place.'); }
}
function listened() {
  const count = tracks.filter(track => heard.has($('mode').value + ':' + track.id)).length;
  $('listened').textContent = `${count} of ${tracks.length} tracks listened to in this playlist`;
}
async function updateWake() {
  const wanted = $('awake').checked && player?.status === 'playing' && document.visibilityState === 'visible';
  if (!wanted && wakeLock) {
    const lock = wakeLock; wakeLock = null; await lock.release().catch(() => {});
  }
  if (!('wakeLock' in navigator)) {
    $('wake-status').textContent = 'Keep-screen-awake is unavailable in this browser.';
    $('awake').disabled = true; return;
  }
  if (wanted && !wakeLock && !requestingWake) {
    requestingWake = true;
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (!$('awake').checked || player?.status !== 'playing' || document.visibilityState !== 'visible') await lock.release();
      else {
        wakeLock = lock;
        lock.addEventListener('release', () => {
          if (wakeLock === lock) { wakeLock = null; $('wake-status').textContent = 'Screen wake lock released by your device.'; }
        });
      }
    } catch { $('wake-status').textContent = 'Your device declined the screen wake lock. Check its display settings.'; }
    finally { requestingWake = false; }
  }
  if (wakeLock) $('wake-status').textContent = 'Screen will stay awake while this page is visible and playing.';
  else if (!wanted) $('wake-status').textContent = 'Background and screen-lock playback are controlled by your browser.';
}
function clearSleep() { clearTimeout(sleepTimer); sleepTimer = null; sleepDeadline = 0; }
function armSleep() {
  const minutes = Number($('sleep').value);
  if (!minutes || sleepDeadline) return;
  sleepDeadline = Date.now() + minutes * 60000;
  sleepTimer = setTimeout(() => {
    clearSleep(); player.pause(); notice('Your listening timer has finished. Tap Play to start a new session when ready.');
  }, minutes * 60000);
}
function render(state) {
  const playing = state.status === 'playing';
  $('play-label').textContent = playing ? 'Pause' : 'Play';
  $('play-icon').textContent = playing ? 'Ⅱ' : '▶';
  $('play').setAttribute('aria-label', playing ? 'Pause audio' : 'Play audio');
  $('progress').max = state.total || 1; $('progress').value = state.index;
  $('status').textContent = state.error || (playing ? (player.steps[state.index]?.wait ? 'Thinking time…' : 'Playing · Listen and learn') : state.status === 'ended' ? 'Track complete' : 'Paused · Ready when you are');
  $('transcript').textContent = state.status === 'ended' ? 'Track complete.' : state.text;
  if (state.error) { clearSleep(); notice(state.error); }
  persist(); void updateWake();
}
function selectTrack(index, autoplay = false, step = 0) {
  current = Math.max(0, Math.min(index, tracks.length - 1));
  const track = tracks[current];
  $('track').value = String(current);
  $('track-title').textContent = track.title;
  $('domain-label').textContent = content.domains.find(domain => domain.id === track.domain)?.name || '';
  $('mode-label').textContent = {lessons: 'AUDIO LESSON', recap: 'QUICK RECAP', questions: 'AUDIO PRACTICE'}[$('mode').value];
  $('position').textContent = `${current + 1} / ${tracks.length}`;
  $('previous').disabled = current === 0; $('next').disabled = current === tracks.length - 1;
  player.load(track.steps, step); listened();
  if (autoplay) { armSleep(); player.play(); }
}
function buildPlaylist(resume = false) {
  clearSleep();
  tracks = makeTracks(content, $('mode').value, $('domain').value, Number($('gap').value));
  $('track').replaceChildren(...tracks.map((track, index) => new Option(`${index + 1}. ${track.title}`, index)));
  const index = resume ? tracks.findIndex(track => track.id === saved.track) : 0;
  selectTrack(index < 0 ? 0 : index, false, resume && Number.isInteger(saved.step) ? saved.step : 0);
  $('gap').disabled = $('mode').value !== 'questions';
}
function loadVoices() {
  const selected = $('voice').value || saved.voice || '';
  voices = speechSynthesis.getVoices();
  const english = voices.filter(voice => /^en(?:-|$)/i.test(voice.lang));
  $('voice').replaceChildren(new Option('Device default (English)', ''),
    ...english.map(voice => new Option(`${voice.name} · ${voice.lang}${voice.localService ? ' · device' : ''}`, voice.voiceURI)));
  restoreSelect('voice', selected);
  if (player) player.voice = voices.find(voice => voice.voiceURI === $('voice').value) || null;
}
async function init() {
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
    notice('Audio narration is not available in this browser. Open the academy in a browser with text-to-speech support, such as Safari or Chrome.');
    document.querySelectorAll('.settings select, .settings input').forEach(input => { input.disabled = true; });
    return;
  }
  try {
    const response = await fetch('/content.json');
    if (response.status === 401) { location.assign('/'); return; }
    if (!response.ok) throw new Error('Content unavailable');
    content = await response.json();
    $('domain').append(...content.domains.map(domain => new Option(domain.name, domain.id)));
    restoreSelect('domain', saved.domain);
    player = new SpeechPlayer({synth: speechSynthesis, Utterance: SpeechSynthesisUtterance, onChange: render,
      onComplete: () => {
        heard.add($('mode').value + ':' + tracks[current].id); persist(); listened();
        if ($('autonext').checked && current < tracks.length - 1) selectTrack(current + 1, true);
        else { clearSleep(); notice('Playlist paused at the end of this track. Choose another session while parked.'); }
      }});
    player.rate = Number($('rate').value); loadVoices();
    speechSynthesis.addEventListener('voiceschanged', loadVoices);
    buildPlaylist(true);
    $('play').disabled = false; $('replay').disabled = false;
    notice('Choose your session while parked, then tap Play. No microphone or spoken responses are needed.');
    $('play').addEventListener('click', () => {
      if (player.status === 'playing') player.pause();
      else { notice('Listen without looking at the screen. Adjust your session only when parked.'); armSleep(); player.play(); }
    });
    $('previous').addEventListener('click', () => selectTrack(current - 1, player.status === 'playing'));
    $('next').addEventListener('click', () => selectTrack(current + 1, player.status === 'playing'));
    $('replay').addEventListener('click', () => selectTrack(current, player.status === 'playing'));
    $('track').addEventListener('change', () => { clearSleep(); selectTrack(Number($('track').value)); });
    for (const id of ['mode', 'domain', 'gap']) $(id).addEventListener('change', () => buildPlaylist());
    $('rate').addEventListener('change', () => { player.pause(); player.rate = Number($('rate').value); persist(); });
    $('voice').addEventListener('change', () => {
      player.pause(); player.voice = voices.find(voice => voice.voiceURI === $('voice').value) || null; persist();
    });
    $('sleep').addEventListener('change', () => { clearSleep(); if (player.status === 'playing') armSleep(); persist(); });
    $('autonext').addEventListener('change', persist);
    $('awake').addEventListener('change', () => { persist(); void updateWake(); });
    document.addEventListener('visibilitychange', () => {
      // Enforce an elapsed wall-clock timer even if the browser suspended callbacks.
      if (sleepDeadline && Date.now() >= sleepDeadline) { clearSleep(); player.pause(); notice('Your listening timer has finished.'); }
      void updateWake();
    });
    window.addEventListener('pagehide', () => { player.pause(); clearSleep(); player.cancel(); });
    void updateWake();
  } catch (error) {
    console.error('Car Mode initialization failed:', error);
    const detail = error instanceof Error ? error.message : 'Unknown error';
    notice(content
      ? `The lessons loaded, but the audio player could not start (${detail}). Reload the page to retry.`
      : `The audio library could not load (${detail}). Reload this page or return to the academy and sign in again.`);
  }
}
void init();
