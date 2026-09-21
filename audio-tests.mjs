import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeTracks, SpeechPlayer, speechSteps, spoken} from './private/audio-engine.js';
const content = JSON.parse(fs.readFileSync(new URL('./private/content.json', import.meta.url)));
function harness(onComplete = () => {}) {
  let time = 0, sequence = 0;
  const timers = new Map(), utterances = [], events = [];
  const synth = {cancel() {}, speak(utterance) { utterances.push(utterance); }};
  class Utterance { constructor(text) { this.text = text; } }
  const player = new SpeechPlayer({synth, Utterance, onComplete, onChange: state => events.push(state), now: () => time,
    setTimer: (callback, delay) => { const id = ++sequence; timers.set(id, {callback, due: time + delay}); return id; },
    clearTimer: id => timers.delete(id)});
  return {player, utterances, events, timers, advance(ms) {
    time += ms;
    for (const [id, timer] of [...timers]) if (timer.due <= time) { timers.delete(id); timer.callback(); }
  }, finish() { utterances.at(-1).onend(); }};
}
test('all lessons, recaps and questions produce meaningful bounded speech', () => {
  for (const mode of ['lessons', 'recap', 'questions']) {
    const tracks = makeTracks(content, mode);
    assert.equal(tracks.length, mode === 'questions' ? 150 : 21);
    for (const track of tracks) for (const step of track.steps) if (step.text) {
      assert.ok(step.text.trim()); assert.ok(step.text.split(/\s+/).length <= 35);
    }
  }
  assert.equal(makeTracks(content, 'questions', 'delivery').length, 24);
  assert.ok(makeTracks(content, 'recap')[0].steps.length < makeTracks(content)[0].steps.length);
  for (const [i, track] of makeTracks(content, 'questions', 'all', 25).entries()) {
    const pause = track.steps.findIndex(step => step.wait);
    assert.ok(pause > 0); assert.equal(track.steps[pause].wait, 25000);
    const answer = track.steps.slice(pause + 1).map(step => step.text).join(' ');
    assert.ok(answer.startsWith(`The correct answer is ${'ABCD'[content.questions[i].answer]}.`));
    assert.ok(answer.includes(speechSteps(content.questions[i].explanation)[0].text));
  }
  assert.equal(spoken('KCNA & K8s'), 'K C N A  and  Kubernetes');
});
test('speech advances once; pause rejects stale callbacks and repeats the sentence', () => {
  const h = harness(); h.player.load([{text:'First'}, {text:'Second'}]); h.player.play();
  const old = h.utterances[0]; h.player.pause(); old.onend();
  assert.equal(h.player.index, 0); assert.equal(h.player.status, 'paused');
  h.player.play(); assert.equal(h.utterances.at(-1).text, 'First');
  old.onerror({error:'interrupted'}); assert.equal(h.player.status, 'playing');
  h.finish(); assert.equal(h.player.index, 1); assert.equal(h.utterances.at(-1).text, 'Second');
  h.utterances[1].onend(); assert.equal(h.player.index, 1);
});
test('thinking time is preserved across pause and answer is withheld until it elapses', () => {
  const h = harness(); h.player.load([{text:'Question'}, {wait:15000}, {text:'Answer'}]);
  h.player.play(); h.finish(); h.advance(5000); h.player.pause();
  assert.equal(h.player.remaining, 10000); h.advance(30000);
  assert.equal(h.utterances.length, 1); h.player.play(); h.advance(9999);
  assert.equal(h.utterances.length, 1); h.advance(1);
  assert.equal(h.utterances.at(-1).text, 'Answer');
});
test('switching tracks cancels a pending gap and prevents old audio advancing', () => {
  const h = harness(); h.player.load([{wait:8000}, {text:'Old answer'}]); h.player.play();
  h.player.load([{text:'New lesson'}]); h.advance(10000);
  assert.equal(h.utterances.length, 0); h.player.play(); assert.equal(h.utterances.at(-1).text, 'New lesson');
});
test('speech errors pause playback, allow retry and keep configured voice/speed', () => {
  const h = harness(); h.player.voice = {lang:'en-GB', name:'Test'}; h.player.rate = 1.2;
  h.player.load([{text:'Test'}]); h.player.play();
  assert.equal(h.utterances[0].rate, 1.2); assert.equal(h.utterances[0].lang, 'en-GB');
  h.utterances[0].onerror({error:'network'});
  assert.equal(h.player.status, 'paused'); assert.match(h.player.error, /network/);
  h.player.play(); assert.equal(h.player.error, ''); assert.equal(h.utterances.length, 2);
});
test('completion is emitted once and a finished track can be replayed', () => {
  let completions = 0; const h = harness(() => completions++);
  h.player.load([{text:'Last sentence'}], 999); h.player.play(); h.finish(); h.finish();
  assert.equal(completions, 1); assert.equal(h.player.status, 'ended');
  h.player.play(); assert.equal(h.player.index, 0); assert.equal(h.utterances.length, 2);
});

test('car page controller loads, advances automatically, changes mode, saves and applies timer', async () => {
  const {default: vm} = await import('node:vm');
  const elements = new Map();
  class Element {
    constructor(id) { this.id = id; this.value = ''; this.checked = false; this.options = []; this.events = {}; }
    replaceChildren(...options) { this.options = options; this.value = options[0]?.value || ''; }
    append(...options) { this.options.push(...options); }
    addEventListener(event, callback) { this.events[event] = callback; }
    setAttribute() {}
  }
  class Option { constructor(text, value) { this.text = text; this.value = String(value); } }
  const get = id => { if (!elements.has(id)) elements.set(id, new Element(id)); return elements.get(id); };
  for (const [id, values] of Object.entries({mode:['lessons','recap','questions'], domain:['all'], rate:['1','0.8','1.2','1.5'], gap:['15','8','25'], sleep:['0','15','30','60'], voice:['']})) get(id).replaceChildren(...values.map(value => new Option(value, value)));
  get('autonext').checked = true;
  const utterances = [], timers = new Map(); let timerId = 0; const storage = new Map();
  const synth = {cancel() {}, speak(utterance) { utterances.push(utterance); }, getVoices: () => [], addEventListener() {}};
  const context = vm.createContext({makeTracks, SpeechPlayer, Option, console,
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } }, speechSynthesis: synth,
    window: {speechSynthesis:synth, SpeechSynthesisUtterance: true, addEventListener() {}},
    document: {getElementById: get, visibilityState:'visible', addEventListener() {}}, navigator:{},
    localStorage: {getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value)},
    fetch: async () => ({ok:true, status:200, json:async () => content}),
    setTimeout: (callback, delay) => { const id = ++timerId; timers.set(id, {callback, delay}); return id; },
    clearTimeout: id => timers.delete(id)
  });
  const script = fs.readFileSync(new URL('./private/car.js', import.meta.url), 'utf8').replace(/^import .*;\n/, '').replace('void init();', 'await init();');
  await new vm.Script(`(async () => {${script}})()`).runInContext(context);
  assert.equal(get('play').disabled, false); assert.equal(get('track').options.length, 21);
  assert.equal(utterances.length, 0, 'does not autoplay on load');
  get('play').events.click(); assert.equal(get('play-label').textContent, 'Pause');
  const firstSteps = makeTracks(content)[0].steps.length;
  for (let i = 0; i < firstSteps; i++) utterances.at(-1).onend();
  assert.equal(get('position').textContent, '2 / 21');
  assert.equal(JSON.parse(storage.get('kcna-car-mode-v1')).heard.length, 1);
  get('mode').value = 'questions'; get('mode').events.change();
  assert.equal(get('track').options.length, 150); assert.equal(get('play-label').textContent, 'Play');
  assert.equal(get('gap').disabled, false);
  get('sleep').value = '15'; get('sleep').events.change(); get('play').events.click();
  const timer = [...timers.values()].find(timer => timer.delay === 900000); assert.ok(timer);
  timer.callback(); assert.equal(get('play-label').textContent, 'Play');
  assert.match(get('notice').textContent, /timer has finished/);
});

test('browser timer receiver rules allow initial load, question gaps and pause', async () => {
  const {default: vm} = await import('node:vm');
  const timers = new Map(); let nextId = 0;
  // Window timer methods reject a SpeechPlayer receiver. Node timers and the
  // arrow-function fakes above do not, so exercise the actual default adapters.
  function browserSetTimeout(callback, delay) {
    if (this?.constructor?.name === 'SpeechPlayer') throw new TypeError('Illegal invocation');
    const id = ++nextId; timers.set(id, {callback, delay}); return id;
  }
  function browserClearTimeout(id) {
    if (this?.constructor?.name === 'SpeechPlayer') throw new TypeError('Illegal invocation');
    timers.delete(id);
  }
  const source = fs.readFileSync(new URL('./private/audio-engine.js', import.meta.url), 'utf8').replaceAll('export ', '');
  const context = vm.createContext({setTimeout:browserSetTimeout, clearTimeout:browserClearTimeout});
  const BrowserPlayer = new vm.Script(`${source}\nSpeechPlayer;`).runInContext(context);
  const speech = [];
  const player = new BrowserPlayer({synth:{cancel() {}, speak(utterance) { speech.push(utterance); }},
    Utterance:class { constructor(text) { this.text = text; } }});
  player.load([{text:'Question'}, {wait:15000}, {text:'Answer'}]);
  assert.equal(player.status, 'paused'); player.play(); speech.at(-1).onend();
  const timer = [...timers.values()][0]; assert.equal(timer.delay, 15000);
  player.pause(); assert.equal(timers.size, 0);
  player.play(); [...timers.values()][0].callback();
  assert.equal(speech.at(-1).text, 'Answer');
  player.load([{text:'Next track'}]); assert.equal(player.status, 'paused');
});
