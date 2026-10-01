// Run with: node --test tests/frontend.test.cjs
// A small DOM/fetch stub exercises the real script without browser dependencies.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

class Element {
  constructor() {
    this.children = [];
    this.value = '';
    this.style = {};
    this.dataset = {};
    this.listeners = {};
    this.disabled = false;
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach(n => classes.add(n)),
      remove: (...names) => names.forEach(n => classes.delete(n)),
      contains: name => classes.has(name),
      toggle: (name, on) => on ? classes.add(name) : classes.delete(name),
    };
    this.textContent = '';
  }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text + this.children.map(c => c.textContent).join(''); }
  set innerHTML(value) { this.textContent = value; }
  get innerHTML() { return this.textContent; }
  append(...children) { children.forEach(child => this.appendChild(child)); }
  appendChild(child) { child.parent = this; this.children.push(child); }
  replaceChildren(...children) { this.textContent = ''; this.append(...children); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
  insertAdjacentText(position, text) { this.parent.text += text; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  dispatch(name, event = {}) { return this.listeners[name]?.(event); }
  querySelectorAll() { return []; }
  focus() {}
  scrollIntoView() {}
  scrollTo() {}
  getBoundingClientRect() { return { top: 0 }; }
}

const settle = () => new Promise(resolve => setImmediate(resolve));
const feedback = (name, score = 80) => ({ summary: name, score, strengths: ['Python'], skill_gaps: [], suggestions: [] });

async function app() {
  const elements = new Map();
  const el = id => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  const requests = [];
  const timers = new Map();
  let timerId = 0;
  const document = {
    getElementById: el,
    createElement: () => new Element(),
    querySelectorAll: selector => selector === '.chat-item' ? el('sidebarBody').children : [],
    addEventListener: (name, fn) => { if (name === 'DOMContentLoaded') document.start = fn; },
  };
  const context = {
    document, window: {}, console, URL,
    FormData: class { append() {} },
    fetch: (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })),
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; },
    setInterval: () => ++timerId,
    clearInterval: () => {},
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../static/javascript/script.js'), 'utf8'), context);
  document.start();
  const reply = async (request, data) => {
    request.resolve({ json: async () => data });
    await settle();
  };
  await reply(requests.find(r => r.url === '/history'), { success: true, analyses: [] });
  await reply(requests.find(r => r.url === '/me'), { loggedIn: true });
  const latest = url => requests.filter(r => r.url === url).at(-1);
  const open = id => el('sidebarBody').dispatch('click', {
    target: { closest: () => ({ dataset: { analysisId: String(id) } }) }, preventDefault() {},
  });
  const restore = async id => {
    open(id);
    await reply(latest(`/analysis/${id}`), { success: true, analysis_id: id, feedback: feedback(`Analysis ${id}`), messages: [] });
  };
  const upload = () => {
    el('fileInput').files = [{ name: 'resume.pdf', type: 'application/pdf', size: 100 }];
    el('fileInput').dispatch('change');
    el('jobInput').value = 'Developer';
    el('jobInput').dispatch('input');
  };
  const tick = async () => {
    const callbacks = [...timers.values()];
    timers.clear();
    callbacks.forEach(fn => fn());
    await settle();
  };
  return { el, requests, latest, reply, open, restore, upload, tick };
}

test('out-of-order history selection keeps the latest analysis', async () => {
  const a = await app();
  a.open(1);
  a.open(2);
  await a.reply(a.latest('/analysis/2'), { success: true, analysis_id: 2, feedback: feedback('New', 90), messages: [] });
  await a.reply(a.latest('/analysis/1'), { success: true, analysis_id: 1, feedback: feedback('Old', 10), messages: [] });
  assert.equal(a.el('resultsSummary').textContent, 'New');
  assert.equal(a.el('scoreValue').textContent, '90');
});

test('old chat replies and errors do not enter another analysis', async () => {
  for (const fails of [false, true]) {
    const a = await app();
    await a.restore(1);
    a.el('chatInput').value = 'Question';
    a.el('chatSendBtn').dispatch('click');
    const old = a.latest('/analysis/1/ask');
    await a.restore(2);
    a.el('chatInput').value = 'New question';
    a.el('chatSendBtn').dispatch('click');
    if (fails) { old.reject(new Error('offline')); await settle(); }
    else await a.reply(old, { success: true, answer: 'Old answer' });
    assert.equal(a.el('chatMessages').textContent, 'New question');
    assert.equal(a.el('chatInput').disabled, true);
    await a.reply(a.latest('/analysis/2/ask'), { success: true, answer: 'New answer' });
    assert.equal(a.el('chatMessages').textContent, 'New questionNew answer');
  }
});

test('new analysis ignores old success or error responses', async () => {
  for (const fails of [false, true]) {
    const a = await app();
    a.upload();
    a.el('analyzeBtn').dispatch('click');
    const request = a.latest('/analyze');
    a.el('newChatBtn').dispatch('click');
    if (fails) { request.reject(new Error('offline')); await settle(); }
    else await a.reply(request, { success: true, analysis_id: 1, feedback: feedback('Old') });
    await a.tick();
    assert.equal(a.el('results').classList.contains('show'), false);
    assert.equal(a.el('uploadError').textContent, '');
    assert.equal(a.el('analyzeBtn').disabled, true);
  }
});

test('editing the title cannot enable duplicate submissions while pending', async () => {
  const a = await app();
  a.upload();
  a.el('analyzeBtn').dispatch('click');
  a.el('jobInput').value = 'Engineer';
  a.el('jobInput').dispatch('input');
  assert.equal(a.el('analyzeBtn').disabled, true);
  a.el('analyzeBtn').dispatch('click');
  assert.equal(a.requests.filter(r => r.url === '/analyze').length, 1);
});

test('switching analyses stops typewriter updates and score animations', async () => {
  const a = await app();
  a.upload();
  a.el('analyzeBtn').dispatch('click');
  await a.reply(a.latest('/analyze'), { success: true, analysis_id: 1, feedback: feedback('Old summary') });
  await a.tick();
  assert.equal(a.el('resultsSummary').textContent, 'O');
  await a.restore(2);
  for (let i = 0; i < 35; i++) await a.tick();
  assert.equal(a.el('resultsSummary').textContent, 'Analysis 2');
  assert.equal(a.el('scoreValue').textContent, '80');
  assert.equal(a.el('strengthsList').children.length, 1);
});

test('signout cannot restore an old history response', async () => {
  const a = await app();
  a.el('logoutBtn').dispatch('click');
  await a.reply(a.latest('/logout'), { success: true });
  const request = a.latest('/history');
  a.el('newChatBtn').dispatch('click');
  await a.reply(request, { success: true, analyses: [{ id: 1, job_title: 'Old', created_at: '2026-10-01' }] });
  assert.equal(a.el('sidebarBody').children.length, 0);
});

test('keyword fallback is labelled and keeps paginated scores comparable', async () => {
  const a = await app();
  await a.restore(1);
  a.el('jobSearchBtn').dispatch('click');
  const job = { title: 'Developer', description: 'Python', matched_skills: ['python'], missing_skills: [],
    match_score: 60, keyword_score: 100, ranking_method: 'hybrid', url: 'https://example.com/1' };
  await a.reply(a.latest('/analysis/1/jobs'), { success: true, jobs: [job], has_more: true, ranking_method: 'hybrid' });
  a.el('jobLoadMoreBtn').dispatch('click');
  await a.reply(a.latest('/analysis/1/jobs'), { success: true, jobs: [{ ...job, url: 'https://example.com/2',
    match_score: 80, keyword_score: 80, ranking_method: 'keyword' }], has_more: false, ranking_method: 'keyword' });
  assert.match(a.el('jobSearchStatus').textContent, /keyword matches/);
  const firstBadge = a.el('jobResults').children[0].children[0].children[1];
  assert.equal(firstBadge.textContent, '100%');
});
