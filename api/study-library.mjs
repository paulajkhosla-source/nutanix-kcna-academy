import {gunzipSync} from 'node:zlib';
const MAX_LIBRARY_BYTES = 262144;
const MAX_COMPRESSED_BYTES = 196608;
// Study content is supplied only through the server environment, never bundled.
const emptyLibrary = () => ({configured: false, updatedAt: null, summary: '', notes: [], resources: [], questions: []});
function text(value, name, max = 4000, required = false) {
  if (value === undefined || value === null) {
    if (required) throw new Error(`Missing ${name}`);
    return '';
  }
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error(`Invalid ${name}`);
  return value.trim();
}
function list(value, name, max) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max) throw new Error(`Invalid ${name}`);
  return value;
}
function link(value, required = false) {
  const raw = text(value, 'URL', 2048, required);
  if (!raw) return '';
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid URL');
  return url.href;
}
export function parseStudyLibrary(raw) {
  if (!raw || !raw.trim()) return emptyLibrary();
  if (Buffer.byteLength(raw, 'utf8') > MAX_LIBRARY_BYTES) throw new Error('Study library is too large');
  let value = JSON.parse(raw);
  if (value && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, 'encoding')) {
    if (value.encoding !== 'gzip-base64' || Object.keys(value).some(key => !['encoding', 'data'].includes(key))) throw new Error('Invalid study library encoding');
    const encoded = value.data;
    if (typeof encoded !== 'string' || !encoded.length || encoded.length > MAX_COMPRESSED_BYTES * 4 / 3 || encoded.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new Error('Invalid compressed study library');
    const compressed = Buffer.from(encoded, 'base64');
    if (compressed.length > MAX_COMPRESSED_BYTES || compressed.toString('base64') !== encoded) throw new Error('Invalid compressed study library');
    const decoded = gunzipSync(compressed, {maxOutputLength: MAX_LIBRARY_BYTES});
    if (decoded.length > MAX_LIBRARY_BYTES) throw new Error('Study library is too large');
    value = JSON.parse(decoded.toString('utf8'));
    if (value && typeof value === 'object' && Object.hasOwn(value, 'encoding')) throw new Error('Nested study library encodings are not supported');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid study library');
  if (!Array.isArray(value.notes) || !Array.isArray(value.resources)) throw new Error('Missing study library entries');
  const ids = new Set();
  const takeId = item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid entry');
    const id = text(item.id, 'id', 100, true);
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(id) || ids.has(id)) throw new Error('Invalid or repeated id');
    ids.add(id);
    return id;
  };
  const common = item => {
    return {id: takeId(item), title: text(item.title, 'title', 200, true), tags: list(item.tags, 'tags', 24).map(tag => text(tag, 'tag', 100, true))};
  };
  const updatedAt = text(value.updatedAt, 'updatedAt', 80);
  if (updatedAt && !Number.isFinite(Date.parse(updatedAt))) throw new Error('Invalid update date');
  const result = {
    configured: true,
    updatedAt: updatedAt || null,
    summary: text(value.summary, 'summary', 6000),
    notes: list(value.notes, 'notes', 150).map(item => ({
      ...common(item), category: text(item.category, 'category', 100) || 'General',
      body: text(item.body, 'body', 20000),
      bullets: list(item.bullets, 'bullets', 50).map(bullet => text(bullet, 'bullet', 3000, true)),
      sources: list(item.sources, 'sources', 16).map(source => {
        if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('Invalid source');
        return {label: text(source.label, 'source label', 200, true), url: link(source.url)};
      })
    })),
    resources: list(value.resources, 'resources', 250).map(item => ({
      ...common(item), type: text(item.type, 'type', 100) || 'Resource',
      author: text(item.author, 'author', 200), date: text(item.date, 'date', 80),
      description: text(item.description, 'description', 8000), url: link(item.url),
      access: text(item.access, 'access', 200) || 'See source for access',
      status: text(item.status, 'status', 400)
    }))
  };
  const noteIds = new Set(result.notes.map(note => note.id));
  result.questions = list(value.questions, 'questions', 100).map(item => {
    const id = takeId(item), noteId = text(item.noteId, 'noteId', 100);
    const options = list(item.options, 'options', 6).map(option => text(option, 'option', 2000, true));
    if (options.length < 2 || new Set(options).size !== options.length || !Number.isInteger(item.answer) || item.answer < 0 || item.answer >= options.length) throw new Error('Invalid question answers');
    if (noteId && !noteIds.has(noteId)) throw new Error('Unknown question note');
    return {id, noteId, prompt: text(item.prompt, 'prompt', 4000, true), options, answer: item.answer, explanation: text(item.explanation, 'explanation', 8000, true)};
  });
  return result;
}

