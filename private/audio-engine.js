// Browser speech is deliberately isolated so sequencing and cancellation can be tested.
export function spoken(text) {
  return String(text).replace(/→/g, ', then ').replace(/&/g, ' and ')
    .replace(/\bK8s\b/gi, 'Kubernetes').replace(/\bkubectl\b/g, 'kube control')
    .replace(/\b(KCNA|CNCF|OCI|CRI|CSI|CNI|API|RBAC|CI|CD|SLO|SLI|SLA|DNS|HTTP|HTTPS|TCP|UDP|AHV|VM|CPU)\b/g, word => word.split('').join(' '));
}
export function speechSteps(text) {
  const sentences = spoken(text).match(/[^.!?]+[.!?]?/g) || [];
  return sentences.flatMap(sentence => {
    const words = sentence.trim().split(/\s+/), chunks = [];
    for (let i = 0; i < words.length; i += 35) chunks.push({text: words.slice(i, i + 35).join(' ')});
    return chunks;
  });
}
export function makeTracks(content, mode = 'lessons', domain = 'all', gap = 15) {
  const filter = item => domain === 'all' || item.domain === domain;
  if (mode === 'questions') return content.questions.filter(filter).map((q, i) => ({
    id: q.id, title: `Question ${i + 1}: ${q.question}`, domain: q.domain,
    steps: [...speechSteps(`Practice question ${i + 1}. ${q.question}`),
      ...q.options.flatMap((option, index) => speechSteps(`Option ${'ABCD'[index]}. ${option}`)),
      ...speechSteps(`Think about your answer. You have ${gap} seconds.`), {wait: gap * 1000},
      ...speechSteps(`The correct answer is ${'ABCD'[q.answer]}. ${q.options[q.answer]}. ${q.explanation}`)]
  }));
  return content.lessons.filter(filter).map(lesson => ({
    id: lesson.id, title: lesson.title, domain: lesson.domain,
    steps: speechSteps([mode === 'recap' ? 'Quick recap.' : 'Lesson.', lesson.title,
      ...(mode === 'recap' ? [] : lesson.body), 'Key points to remember.',
      ...lesson.remember, 'Watch out for this common misconception.', lesson.trap,
      ...(mode === 'recap' ? [] : ['Try explaining this later.', lesson.exercise])].join(' '))
  }));
}
export class SpeechPlayer {
  constructor({synth, Utterance, onChange = () => {}, onComplete = () => {},
    setTimer = setTimeout, clearTimer = clearTimeout, now = Date.now}) {
    Object.assign(this, {synth, Utterance, onChange, onComplete, setTimer, clearTimer, now});
    this.status = 'idle'; this.index = 0; this.steps = []; this.generation = 0;
    this.rate = 1; this.voice = null; this.remaining = null; this.error = '';
  }
  emit() { this.onChange({status: this.status, index: this.index, total: this.steps.length,
    text: this.steps[this.index]?.text || 'Thinking time…', error: this.error}); }
  cancel() {
    this.generation++; this.clearTimer(this.timer); this.timer = null;
    this.synth.cancel(); this.utterance = null;
  }
  load(steps, index = 0) {
    this.cancel(); this.steps = steps; this.index = Math.max(0, Math.min(index, steps.length - 1));
    this.remaining = null; this.error = ''; this.status = 'paused'; this.emit();
  }
  play() {
    if (this.status === 'playing' || !this.steps.length) return;
    if (this.index >= this.steps.length) this.index = 0;
    this.error = ''; this.status = 'playing'; this.run();
  }
  pause() {
    if (this.status !== 'playing') return;
    if (this.steps[this.index]?.wait) this.remaining = Math.max(0, this.deadline - this.now());
    this.status = 'paused'; this.cancel(); this.emit();
  }
  run() {
    if (this.status !== 'playing') return;
    if (this.index >= this.steps.length) {
      this.status = 'ended'; this.emit(); this.onComplete(); return;
    }
    const step = this.steps[this.index], generation = ++this.generation;
    const next = () => {
      if (generation !== this.generation || this.status !== 'playing') return;
      this.remaining = null; this.index++; this.run();
    };
    this.emit();
    if (step.wait) {
      const duration = this.remaining ?? step.wait;
      this.deadline = this.now() + duration;
      this.timer = this.setTimer(next, duration);
    } else {
      const utterance = new this.Utterance(step.text);
      utterance.rate = this.rate; utterance.lang = this.voice?.lang || 'en-US';
      if (this.voice) utterance.voice = this.voice;
      utterance.onend = next;
      utterance.onerror = event => {
        if (generation !== this.generation) return;
        this.status = 'paused'; this.cancel();
        this.error = `Speech stopped (${event.error || 'audio unavailable'}). Tap Play to retry, or choose another voice.`;
        this.emit();
      };
      this.utterance = utterance;
      try { this.synth.speak(utterance); }
      catch { utterance.onerror({error: 'voice unavailable'}); }
    }
  }
}
