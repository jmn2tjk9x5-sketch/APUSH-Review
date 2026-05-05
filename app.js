import { data, eventsData, eraOrder, allEventTypes, eraConceptNotes } from './data.js';
import { auth, progressStore } from './supabase.js';

const amscoPeriodMap = {
  "Colonial": { code: "P1-P2", title: "Periods 1-2: 1491-1754" },
  "Revolution": { code: "P3", title: "Period 3: 1754-1800" },
  "Early Republic": { code: "P4", title: "Period 4: 1800-1848" },
  "Antebellum": { code: "P5", title: "Period 5: 1844-1877" },
  "Civil War": { code: "P5", title: "Period 5: 1844-1877" },
  "Reconstruction": { code: "P5", title: "Period 5: 1844-1877" },
  "Gilded Age": { code: "P6", title: "Period 6: 1865-1898" },
  "Progressive Era": { code: "P7", title: "Period 7: 1890-1945" },
  "WWI": { code: "P7", title: "Period 7: 1890-1945" },
  "1920s": { code: "P7", title: "Period 7: 1890-1945" },
  "New Deal": { code: "P7", title: "Period 7: 1890-1945" },
  "WWII": { code: "P7", title: "Period 7: 1890-1945" },
  "Cold War": { code: "P8", title: "Period 8: 1945-1980" },
  "Vietnam": { code: "P8", title: "Period 8: 1945-1980" },
  "Modern": { code: "P9", title: "Period 9: 1980-Present" }
};

function switchTab(tab) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.className = 'nav-tab');
  document.getElementById('page-' + tab).classList.add('active');
  document.getElementById('tab-' + tab).classList.add('active-' + tab);
  if (tab === 'flashcards') renderFlashcardsPage();
  if (tab === 'progress') renderProgressPage();
}

function setupNav() {
  document.querySelectorAll('.nav-tab[data-tab]').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
}

function amscoForEra(era) {
  return amscoPeriodMap[era] || { code: "UNSORTED", title: "Unsorted" };
}

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function loadLocalJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveLocalJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function updateSyncStatus(user) {
  const statusEl = document.getElementById('sync-status');
  const dotEl = document.getElementById('sync-dot');
  const userLabelEl = document.getElementById('auth-user-label');
  const signOutButton = document.getElementById('sign-out-button');

  if (auth.isConfigured()) {
    dotEl.classList.add('connected');
    statusEl.textContent = user ? 'Supabase connected' : 'Supabase ready';
  } else {
    dotEl.classList.remove('connected');
    statusEl.textContent = user ? 'Local mode signed in' : 'Local mode';
  }

  userLabelEl.textContent = user ? (user.email || user.id) : (auth.isConfigured() ? 'Not signed in' : 'No Supabase keys configured');
  signOutButton.classList.toggle('hidden', !user);
}

async function setupAuthUi() {
  const authForm = document.getElementById('auth-form');
  const emailEl = document.getElementById('auth-email');
  const signOutButton = document.getElementById('sign-out-button');

  authForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = emailEl.value.trim();
    if (!email) return;
    const { error } = await auth.signInWithEmail(email);
    if (error) {
      document.getElementById('sync-status').textContent = error.message;
      return;
    }
    document.getElementById('sync-status').textContent = auth.isConfigured() ? 'Magic link sent' : 'Local sign-in saved';
    emailEl.value = '';
    updateSyncStatus(await auth.getUser());
    renderProgressPage();
  });

  signOutButton.addEventListener('click', async () => {
    await auth.signOut();
    updateSyncStatus(null);
    renderProgressPage();
  });

  updateSyncStatus(await auth.getUser());
  auth.onChange(async (user) => {
    updateSyncStatus(user);
    renderProgressPage();
  });
}

async function recordStudyAttempt({ label, era, mode, questionType, correct, metadata = {} }) {
  await progressStore.recordAttempt({
    content_key: `${slugify(mode)}:${slugify(label)}:${slugify(era)}`,
    content_title: label,
    amsco_period: amscoForEra(era).code,
    mode,
    question_type: questionType,
    correct,
    metadata: {
      era,
      amsco_title: amscoForEra(era).title,
      ...metadata
    }
  });
}

async function renderProgressPage() {
  const attempts = await progressStore.listAttempts();
  const overviewEl = document.getElementById('progress-overview');
  const periodListEl = document.getElementById('period-progress-list');
  const modeListEl = document.getElementById('mode-progress-list');
  const recentEl = document.getElementById('recent-attempts-list');

  if (!overviewEl || !periodListEl || !modeListEl || !recentEl) return;

  if (!attempts.length) {
    overviewEl.textContent = 'No attempts yet';
    periodListEl.innerHTML = '<div class="no-results">// TAKE A QUIZIZZ ROUND TO START TRACKING</div>';
    modeListEl.innerHTML = '<div class="no-results">// NO QUESTION-TYPE DATA YET</div>';
    recentEl.innerHTML = '<div class="no-results">// NO ATTEMPTS RECORDED</div>';
    return;
  }

  const total = attempts.length;
  const correct = attempts.filter(item => item.correct).length;
  const accuracy = Math.round((correct / total) * 100);
  overviewEl.textContent = `${correct} / ${total} correct · ${accuracy}% accuracy`;

  const periodBuckets = new Map();
  const modeBuckets = new Map();

  attempts.forEach(item => {
    const p = periodBuckets.get(item.amsco_period) || { seen: 0, correct: 0 };
    p.seen += 1;
    if (item.correct) p.correct += 1;
    periodBuckets.set(item.amsco_period, p);

    const modeKey = `${item.mode} · ${item.question_type}`;
    const m = modeBuckets.get(modeKey) || { seen: 0, correct: 0 };
    m.seen += 1;
    if (item.correct) m.correct += 1;
    modeBuckets.set(modeKey, m);
  });

  const orderedPeriods = ["P1-P2","P3","P4","P5","P6","P7","P8","P9"];
  periodListEl.innerHTML = orderedPeriods
    .filter(key => periodBuckets.has(key))
    .map(key => {
      const bucket = periodBuckets.get(key);
      const pct = Math.round((bucket.correct / bucket.seen) * 100);
      return `
        <div class="period-progress-row">
          <div class="period-progress-head">
            <span>${key}</span>
            <span>${bucket.correct}/${bucket.seen} · ${pct}%</span>
          </div>
          <div class="period-progress-bar"><div class="period-progress-fill" style="width:${pct}%"></div></div>
        </div>
      `;
    }).join('');

  modeListEl.innerHTML = [...modeBuckets.entries()]
    .sort((a, b) => b[1].seen - a[1].seen)
    .map(([key, bucket]) => {
      const pct = Math.round((bucket.correct / bucket.seen) * 100);
      return `
        <div class="period-progress-row">
          <div class="period-progress-head">
            <span>${key}</span>
            <span>${bucket.correct}/${bucket.seen} · ${pct}%</span>
          </div>
          <div class="period-progress-bar"><div class="period-progress-fill" style="width:${pct}%"></div></div>
        </div>
      `;
    }).join('');

  recentEl.innerHTML = attempts.slice(0, 12).map(item => `
    <div class="recent-attempt ${item.correct ? 'correct' : 'wrong'}">
      <div class="recent-attempt-top">
        <span>${item.amsco_period}</span>
        <span>${item.mode} / ${item.question_type}</span>
      </div>
      <div class="recent-attempt-name">${item.content_title}</div>
    </div>
  `).join('');
}

function buildPeopleApp() {
  const mainEl = document.getElementById('main');
  const eraFiltersDiv = document.getElementById('era-filters');
  const countEl = document.getElementById('count');
  const searchEl = document.getElementById('search');
  let activeEra = 'ALL';

  const allBtn = document.createElement('button');
  allBtn.className = 'era-btn active';
  allBtn.textContent = 'ALL';
  allBtn.dataset.era = 'ALL';
  eraFiltersDiv.appendChild(allBtn);

  eraOrder.forEach(era => {
    const btn = document.createElement('button');
    btn.className = 'era-btn';
    btn.textContent = era;
    btn.dataset.era = era;
    eraFiltersDiv.appendChild(btn);
  });

  eraFiltersDiv.addEventListener('click', e => {
    if (!e.target.classList.contains('era-btn')) return;
    document.querySelectorAll('.era-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    activeEra = e.target.dataset.era;
    renderPeople();
  });

  searchEl.addEventListener('input', renderPeople);

  function renderPeople() {
    mainEl.innerHTML = '';
    const q = searchEl.value.toLowerCase();
    let total = 0;

    eraOrder.forEach(era => {
      if (activeEra !== 'ALL' && activeEra !== era) return;
      const items = data.filter(p => {
        if (p.era !== era) return false;
        if (!q) return true;
        return p.name.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q) || p.tags.some(t => t.toLowerCase().includes(q));
      });
      if (!items.length) return;
      total += items.length;

      const section = document.createElement('div');
      section.className = 'era-section';
      section.innerHTML = `<div class="era-heading">${era.toUpperCase()}</div>`;
      const grid = document.createElement('div');
      grid.className = 'grid';
      items.forEach(p => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
          <div class="card-name">${p.name}</div>
          <div class="card-dates">${p.dates}</div>
          <div class="card-desc">${p.desc}</div>
          <div>${p.tags.map(t=>`<span class="card-tag">${t}</span>`).join('')}</div>
        `;
        grid.appendChild(card);
      });
      section.appendChild(grid);
      mainEl.appendChild(section);
    });

    countEl.textContent = `${total} people`;
    if (!total) mainEl.innerHTML = '<div class="no-results">// NO RESULTS FOUND</div>';
  }

  renderPeople();
}

function buildEventsApp() {
  const eventsMainEl = document.getElementById('events-main');
  const typeFiltersDiv = document.getElementById('type-filters');
  const countEl = document.getElementById('event-count');
  const searchEl = document.getElementById('event-search');
  let activeType = 'ALL';

  const allBtn = document.createElement('button');
  allBtn.className = 'type-btn active';
  allBtn.textContent = 'ALL';
  allBtn.dataset.type = 'ALL';
  typeFiltersDiv.appendChild(allBtn);

  allEventTypes.forEach(type => {
    const btn = document.createElement('button');
    btn.className = 'type-btn';
    btn.textContent = type.toUpperCase();
    btn.dataset.type = type;
    typeFiltersDiv.appendChild(btn);
  });

  typeFiltersDiv.addEventListener('click', e => {
    if (!e.target.classList.contains('type-btn')) return;
    document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    activeType = e.target.dataset.type;
    renderEvents();
  });

  searchEl.addEventListener('input', renderEvents);

  function renderEvents() {
    eventsMainEl.innerHTML = '';
    const q = searchEl.value.toLowerCase();
    let total = 0;

    eraOrder.forEach(era => {
      const items = eventsData.filter(ev => {
        if (ev.era !== era) return false;
        if (activeType !== 'ALL' && !ev.types.includes(activeType)) return false;
        if (!q) return true;
        return ev.name.toLowerCase().includes(q) || ev.desc.toLowerCase().includes(q) || ev.significance.toLowerCase().includes(q);
      });
      if (!items.length) return;
      total += items.length;

      const section = document.createElement('div');
      section.className = 'events-era-section';
      section.innerHTML = `<div class="events-era-heading">${era.toUpperCase()}</div>`;
      const grid = document.createElement('div');
      grid.className = 'events-grid';

      items.forEach(ev => {
        const card = document.createElement('div');
        card.className = 'event-card';
        card.innerHTML = `
          <div class="event-year">${ev.year}</div>
          <div class="event-name">${ev.name}</div>
          <div class="event-desc">${ev.desc}</div>
          <div class="event-significance">⚑ ${ev.significance}</div>
          <div>${ev.types.map(t=>`<span class="event-tag type-${t}">${t.toUpperCase()}</span>`).join('')}</div>
        `;
        grid.appendChild(card);
      });

      section.appendChild(grid);
      eventsMainEl.appendChild(section);
    });

    countEl.textContent = `${total} events`;
    if (!total) eventsMainEl.innerHTML = '<div class="no-results">// NO RESULTS FOUND</div>';
  }

  renderEvents();
}

const movementTagMap = {
  "abolitionist": "abolitionist movement",
  "women's rights": "women's rights movement",
  "suffrage": "women's suffrage movement",
  "labor": "labor movement",
  "civil rights": "civil rights movement",
  "conservationist": "conservation movement",
  "Progressive": "Progressive movement",
  "reformer": "reform movement",
  "organizer": "organizing efforts",
  "Black nationalism": "Black nationalist movement",
  "Transcendentalist": "Transcendentalist movement",
  "temperance": "temperance movement",
  "activist": "reform movements"
};

const quizizzState = {
  mode: "mixed",
  score: 0,
  total: 0,
  current: null
};

const flashcardStorageKey = "apush-flashcard-marks-v1";
const flashcardState = {
  deck: "all",
  flipped: false,
  order: [],
  index: 0,
  marks: loadLocalJson(flashcardStorageKey, {})
};
let draggedTimelineId = null;

function yearValue(label) {
  const m = String(label).match(/\d{3,4}/);
  return m ? Number(m[0]) : 9999;
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickMany(arr, n) {
  return shuffle(arr).slice(0, n);
}

function getFlashcardItems() {
  return [
    ...data.map(item => ({
      key: `person:${slugify(item.name)}`,
      type: "person",
      name: item.name,
      era: item.era,
      yearLabel: item.dates,
      desc: item.desc,
      significance: "",
      tags: item.tags || []
    })),
    ...eventsData.map(item => ({
      key: `event:${slugify(item.name)}`,
      type: "event",
      name: item.name,
      era: item.era,
      yearLabel: item.year,
      desc: item.desc,
      significance: item.significance || "",
      tags: item.types || []
    }))
  ];
}

function getFlashcardMarks(itemKey) {
  return flashcardState.marks[itemKey] || { review: false, known: false };
}

function setFlashcardMarks(itemKey, patch) {
  const nextMarks = {
    ...getFlashcardMarks(itemKey),
    ...patch
  };
  flashcardState.marks[itemKey] = nextMarks;
  saveLocalJson(flashcardStorageKey, flashcardState.marks);
}

function getDeckDefinitions() {
  return [
    { value: "all", label: "EVERYTHING" },
    { value: "people", label: "PEOPLE ONLY" },
    { value: "events", label: "EVENTS ONLY" },
    { value: "review", label: "MARKED FOR REVIEW" },
    { value: "known", label: "MARKED KNOWN" },
    { value: "unknown", label: "UNMARKED / STILL LEARNING" },
    ...eraOrder.map(era => ({ value: `era:${era}`, label: era.toUpperCase() }))
  ];
}

function filterFlashcardsByDeck(items, deckValue) {
  if (deckValue === "all") return items;
  if (deckValue === "people") return items.filter(item => item.type === "person");
  if (deckValue === "events") return items.filter(item => item.type === "event");
  if (deckValue === "review") return items.filter(item => getFlashcardMarks(item.key).review);
  if (deckValue === "known") return items.filter(item => getFlashcardMarks(item.key).known);
  if (deckValue === "unknown") {
    return items.filter(item => {
      const marks = getFlashcardMarks(item.key);
      return !marks.review && !marks.known;
    });
  }
  if (deckValue.startsWith("era:")) {
    const era = deckValue.slice(4);
    return items.filter(item => item.era === era);
  }
  return items;
}

function refreshFlashcardOrder({ shuffleDeck = false } = {}) {
  const cards = filterFlashcardsByDeck(getFlashcardItems(), flashcardState.deck);
  const sortedKeys = cards.map(item => item.key);
  const existingSet = new Set(sortedKeys);
  let nextOrder = flashcardState.order.filter(key => existingSet.has(key));

  if (!nextOrder.length || shuffleDeck) {
    nextOrder = shuffle(sortedKeys);
    flashcardState.index = 0;
  } else if (nextOrder.length !== sortedKeys.length) {
    const missing = sortedKeys.filter(key => !nextOrder.includes(key));
    nextOrder = nextOrder.concat(missing);
  }

  flashcardState.order = nextOrder;
  if (flashcardState.index >= nextOrder.length) {
    flashcardState.index = Math.max(0, nextOrder.length - 1);
  }
}

function currentFlashcardItem() {
  const itemsByKey = new Map(getFlashcardItems().map(item => [item.key, item]));
  return itemsByKey.get(flashcardState.order[flashcardState.index]) || null;
}

function updateFlashcardMeta(deckSize) {
  const metaEl = document.getElementById("flashcard-meta");
  if (!metaEl) return;
  if (!deckSize) {
    metaEl.textContent = "0 cards in deck";
    return;
  }
  metaEl.textContent = `${flashcardState.index + 1} / ${deckSize} · ${flashcardState.flipped ? "back" : "front"}`;
}

function renderFlashcardStats(deckItems) {
  const deckStatsEl = document.getElementById("flashcard-deck-stats");
  const savedStatsEl = document.getElementById("flashcard-saved-stats");
  if (!deckStatsEl || !savedStatsEl) return;

  const reviewCount = deckItems.filter(item => getFlashcardMarks(item.key).review).length;
  const knownCount = deckItems.filter(item => getFlashcardMarks(item.key).known).length;
  const peopleCount = deckItems.filter(item => item.type === "person").length;
  const eventCount = deckItems.filter(item => item.type === "event").length;

  deckStatsEl.innerHTML = `
    <div class="flashcard-stat-row"><span>Cards in Deck</span><strong>${deckItems.length}</strong></div>
    <div class="flashcard-stat-row"><span>People</span><strong>${peopleCount}</strong></div>
    <div class="flashcard-stat-row"><span>Events</span><strong>${eventCount}</strong></div>
  `;

  savedStatsEl.innerHTML = `
    <div class="flashcard-stat-row"><span>Marked Review</span><strong>${reviewCount}</strong></div>
    <div class="flashcard-stat-row"><span>Marked Known</span><strong>${knownCount}</strong></div>
    <div class="flashcard-stat-row"><span>Unmarked</span><strong>${Math.max(deckItems.length - reviewCount - knownCount, 0)}</strong></div>
  `;
}

function renderFlashcardsPage() {
  const stageEl = document.getElementById("flashcard-stage");
  const deckEl = document.getElementById("flashcard-deck");
  if (!stageEl || !deckEl) return;

  const deckItems = filterFlashcardsByDeck(getFlashcardItems(), flashcardState.deck);
  refreshFlashcardOrder();
  updateFlashcardMeta(deckItems.length);
  renderFlashcardStats(deckItems);

  const item = currentFlashcardItem();
  if (!item) {
    const emptyText = flashcardState.deck === "review"
      ? "// NO CARDS MARKED FOR REVIEW YET"
      : flashcardState.deck === "known"
        ? "// NO CARDS MARKED KNOWN YET"
        : "// NO CARDS IN THIS DECK YET";
    stageEl.innerHTML = `<div class="flashcard-empty">${emptyText}</div>`;
    return;
  }

  const marks = getFlashcardMarks(item.key);
  stageEl.innerHTML = `
    <div class="flashcard-card" id="flashcard-card">
      <div class="flashcard-topline">
        <span class="flashcard-type">${item.type} · ${item.era}</span>
        <span class="flashcard-position">${flashcardState.index + 1} OF ${deckItems.length}</span>
      </div>
      ${flashcardState.flipped ? `
        <div class="flashcard-back">
          <div class="flashcard-title">${item.name}</div>
          <div class="flashcard-detail-block">
            <div class="flashcard-detail-label">When</div>
            <div class="flashcard-detail-value">${item.yearLabel}</div>
          </div>
          <div class="flashcard-detail-block">
            <div class="flashcard-detail-label">Why It Matters</div>
            <div class="flashcard-detail-value">${item.desc}</div>
          </div>
          ${item.significance ? `
            <div class="flashcard-detail-block">
              <div class="flashcard-detail-label">Significance</div>
              <div class="flashcard-detail-value">${item.significance}</div>
            </div>
          ` : ""}
          <div class="flashcard-pill-row">
            ${item.tags.map(tag => `<span class="flashcard-pill">${tag}</span>`).join("")}
          </div>
        </div>
      ` : `
        <div class="flashcard-front">
          <div class="flashcard-title">${item.name}</div>
        </div>
      `}
      <div class="flashcard-actions">
        <button class="flashcard-button ${marks.review ? "review-active" : ""}" id="mark-review-button" type="button">Mark for Review</button>
        <button class="flashcard-button ${marks.known ? "known-active" : ""}" id="mark-known-button" type="button">Mark Known</button>
        <button class="flashcard-button" id="clear-marks-button" type="button">Clear Marks</button>
      </div>
    </div>
  `;

  document.getElementById("flashcard-card").addEventListener("click", () => {
    flashcardState.flipped = !flashcardState.flipped;
    renderFlashcardsPage();
  });

  document.getElementById("mark-review-button").addEventListener("click", (event) => {
    event.stopPropagation();
    const nextReview = !getFlashcardMarks(item.key).review;
    setFlashcardMarks(item.key, { review: nextReview, known: nextReview ? false : getFlashcardMarks(item.key).known });
    recordStudyAttempt({
      label: item.name,
      era: item.era,
      mode: "flashcards",
      questionType: "mark-review",
      correct: false,
      metadata: { type: item.type, toggled_on: nextReview }
    });
    flashcardState.flipped = true;
    renderFlashcardsPage();
  });

  document.getElementById("mark-known-button").addEventListener("click", (event) => {
    event.stopPropagation();
    const nextKnown = !getFlashcardMarks(item.key).known;
    setFlashcardMarks(item.key, { known: nextKnown, review: nextKnown ? false : getFlashcardMarks(item.key).review });
    recordStudyAttempt({
      label: item.name,
      era: item.era,
      mode: "flashcards",
      questionType: "mark-known",
      correct: true,
      metadata: { type: item.type, toggled_on: nextKnown }
    });
    flashcardState.flipped = true;
    renderFlashcardsPage();
  });

  document.getElementById("clear-marks-button").addEventListener("click", (event) => {
    event.stopPropagation();
    setFlashcardMarks(item.key, { review: false, known: false });
    renderFlashcardsPage();
  });
}

function makeTimelineId(item) {
  return `${item.name}__${item.year}`;
}

function buildLeaderQuestion() {
  const pool = data.filter(p => p.tags.some(t => movementTagMap[t]));
  const correct = pool[Math.floor(Math.random() * pool.length)];
  const matchedTag = correct.tags.find(t => movementTagMap[t]);
  const movement = movementTagMap[matchedTag];
  const distractors = pickMany(pool.filter(p => p.name !== correct.name), 3);
  const options = shuffle([correct.name, ...distractors.map(d => d.name)]);
  return {
    kind: "mcq",
    label: "LEADERS",
    prompt: `Which historical figure was a major leader in the ${movement}?`,
    sub: correct.desc,
    options,
    answerIndex: options.indexOf(correct.name),
    explanation: `${correct.name} fits here because ${correct.desc}`,
    meta: [correct.era, matchedTag]
  };
}

function buildCauseQuestion() {
  const pool = eventsData.filter(ev =>
    ev.types.includes("law") ||
    /Act|Amendment|Decision|Doctrine|Compromise|Order|Treaty|Proclamation|v\./i.test(ev.name)
  );
  const correct = pool[Math.floor(Math.random() * pool.length)];
  const distractors = pickMany(pool.filter(ev => ev.name !== correct.name), 3);
  const options = shuffle([correct.name, ...distractors.map(d => d.name)]);
  return {
    kind: "mcq",
    label: "ACTS / CAUSES",
    prompt: "Which act, amendment, law, or ruling is most closely tied to this effect?",
    sub: correct.significance,
    options,
    answerIndex: options.indexOf(correct.name),
    explanation: `${correct.name}: ${correct.desc}`,
    meta: [correct.era, ...correct.types]
  };
}

function buildIdentifyQuestion() {
  const combined = shuffle([
    ...data.map(p => ({
      type: "person",
      name: p.name,
      year: p.dates,
      era: p.era,
      clue: p.desc,
      extra: p.tags.join(", ")
    })),
    ...eventsData.map(ev => ({
      type: "event",
      name: ev.name,
      year: ev.year,
      era: ev.era,
      clue: ev.desc,
      extra: ev.types.join(", ")
    }))
  ]);

  const correct = combined[0];
  const distractors = pickMany(combined.filter(x => x.name !== correct.name), 3);
  const options = shuffle([correct.name, ...distractors.map(d => d.name)]);
  return {
    kind: "mcq",
    label: "IDENTIFY",
    prompt: "Which term best matches this clue?",
    sub: correct.clue,
    options,
    answerIndex: options.indexOf(correct.name),
    explanation: `${correct.name} is correct. ${correct.clue}`,
    meta: [correct.era, correct.type]
  };
}

function buildChronologyQuestion() {
  const usable = eventsData
    .filter(ev => yearValue(ev.year) < 9999)
    .sort((a, b) => yearValue(a.year) - yearValue(b.year));

  let sample = [];
  while (sample.length < 4) {
    sample = pickMany(usable, 4);
    const years = sample.map(s => yearValue(s.year));
    if (new Set(years).size < 4) sample = [];
  }

  const shuffled = shuffle(sample);
  const sorted = [...sample].sort((a, b) => yearValue(a.year) - yearValue(b.year));

  return {
    kind: "chronology",
    label: "CHRONOLOGY",
    prompt: "Put these events in chronological order from earliest to latest.",
    items: shuffled,
    answer: sorted.map(x => x.name),
    explanation: sorted.map(x => `${x.year} — ${x.name}`).join("<br>"),
    meta: ["events only", "earliest → latest"]
  };
}

function buildTimelineDragQuestion() {
  const era = document.getElementById("quizizz-era").value;
  const pool = eventsData.filter(ev => ev.era === era && yearValue(ev.year) < 9999);

  let sample = [];
  while (sample.length < 4) {
    sample = pickMany(pool, 4);
    if (sample.length < 4) break;
    const years = sample.map(s => yearValue(s.year));
    if (new Set(years).size < 4) sample = [];
  }

  const sorted = [...sample].sort((a, b) => yearValue(a.year) - yearValue(b.year));
  const shuffled = shuffle(sample).map(item => ({
    ...item,
    dragId: makeTimelineId(item)
  }));

  return {
    kind: "timeline-drag",
    label: "TIMELINE DRAG",
    prompt: `Drag these ${era} events into chronological order.`,
    items: shuffled,
    answer: sorted.map(item => makeTimelineId(item)),
    explanation: sorted.map(x => `${x.year} — ${x.name}`).join("<br>"),
    meta: [era, "drag and drop", "earliest → latest"]
  };
}

function buildMixedQuestion() {
  const builders = [
    buildTimelineDragQuestion,
    buildChronologyQuestion,
    buildLeaderQuestion,
    buildCauseQuestion,
    buildIdentifyQuestion
  ];
  return builders[Math.floor(Math.random() * builders.length)]();
}

function nextQuizizzQuestion() {
  const mode = document.getElementById("quizizz-mode").value;
  quizizzState.mode = mode;
  if (mode === "timeline") quizizzState.current = buildTimelineDragQuestion();
  else if (mode === "chronology") quizizzState.current = buildChronologyQuestion();
  else if (mode === "leaders") quizizzState.current = buildLeaderQuestion();
  else if (mode === "causes") quizizzState.current = buildCauseQuestion();
  else if (mode === "identify") quizizzState.current = buildIdentifyQuestion();
  else quizizzState.current = buildMixedQuestion();
  renderQuizizzQuestion();
}

function updateQuizizzScore() {
  document.getElementById("quizizz-score").textContent = `${quizizzState.score} / ${quizizzState.total} correct`;
}

function renderQuizizzQuestion() {
  const main = document.getElementById("quizizz-main");
  const q = quizizzState.current;
  updateQuizizzScore();

  if (q.kind === "timeline-drag") {
    renderTimelineDragQuestion(q);
    return;
  }

  if (q.kind === "chronology") {
    main.innerHTML = `
      <div class="quizizz-card">
        <div class="quizizz-label">${q.label}</div>
        <div class="quizizz-question">${q.prompt}</div>
        <div class="quizizz-meta">${q.meta.map(m => `<span class="quizizz-pill">${m}</span>`).join("")}</div>
        <div class="quizizz-sub">Use the dropdowns to order the events.</div>
        <div class="quizizz-order-grid">
          ${[0,1,2,3].map(i => `
            <div class="quizizz-order-item">
              <div class="quizizz-order-year">POSITION ${i + 1}</div>
              <select id="chrono-${i}">
                <option value="">Select event...</option>
                ${q.items.map(item => `<option value="${item.name.replace(/"/g, "&quot;")}">${item.name}</option>`).join("")}
              </select>
            </div>
          `).join("")}
        </div>
        <button class="quizizz-next" id="grade-chrono">GRADE ORDER</button>
        <div id="quizizz-feedback"></div>
      </div>
    `;

    document.getElementById("grade-chrono").onclick = () => {
      const picked = [0,1,2,3].map(i => document.getElementById(`chrono-${i}`).value);
      if (picked.some(v => !v) || new Set(picked).size !== 4) {
        document.getElementById("quizizz-feedback").innerHTML =
          `<div class="quizizz-feedback">Pick all 4 events with no duplicates.</div>`;
        return;
      }

      const correct = picked.every((name, i) => name === q.answer[i]);
      quizizzState.total += 1;
      if (correct) quizizzState.score += 1;
      updateQuizizzScore();
      recordStudyAttempt({
        label: q.prompt,
        era: "Multi-era",
        mode: "quizizz",
        questionType: "chronology",
        correct,
        metadata: { answer: q.answer }
      });

      document.getElementById("quizizz-feedback").innerHTML = `
        <div class="quizizz-feedback">
          <strong>${correct ? "Correct." : "Not quite."}</strong><br><br>
          ${q.explanation}
        </div>
        <button class="quizizz-next" id="next-q">NEXT QUESTION</button>
      `;
      document.getElementById("next-q").onclick = nextQuizizzQuestion;
    };

    return;
  }

  main.innerHTML = `
    <div class="quizizz-card">
      <div class="quizizz-label">${q.label}</div>
      <div class="quizizz-question">${q.prompt}</div>
      <div class="quizizz-meta">${q.meta.map(m => `<span class="quizizz-pill">${m}</span>`).join("")}</div>
      <div class="quizizz-sub">${q.sub}</div>
      <div class="quizizz-options">
        ${q.options.map((opt, i) => `<button class="quizizz-option" data-index="${i}">${opt}</button>`).join("")}
      </div>
      <div id="quizizz-feedback"></div>
    </div>
  `;

  main.querySelectorAll(".quizizz-option").forEach(btn => {
    btn.onclick = () => {
      const picked = Number(btn.dataset.index);
      const correct = picked === q.answerIndex;
      quizizzState.total += 1;
      if (correct) quizizzState.score += 1;
      updateQuizizzScore();
      const eraMeta = q.meta.find(item => eraOrder.includes(item)) || "Multi-era";
      recordStudyAttempt({
        label: q.options[q.answerIndex],
        era: eraMeta,
        mode: "quizizz",
        questionType: q.label.toLowerCase().replace(/\s+/g, "-"),
        correct,
        metadata: { prompt: q.prompt }
      });

      main.querySelectorAll(".quizizz-option").forEach((optionBtn, i) => {
        optionBtn.disabled = true;
        if (i === q.answerIndex) optionBtn.classList.add("correct");
        else if (i === picked) optionBtn.classList.add("wrong");
      });

      document.getElementById("quizizz-feedback").innerHTML = `
        <div class="quizizz-feedback">
          <strong>${correct ? "Correct." : "Not quite."}</strong><br><br>
          ${q.explanation}
        </div>
        <button class="quizizz-next" id="next-q">NEXT QUESTION</button>
      `;
      document.getElementById("next-q").onclick = nextQuizizzQuestion;
    };
  });
}

function renderTimelineDragQuestion(q) {
  const main = document.getElementById("quizizz-main");

  main.innerHTML = `
    <div class="quizizz-card">
      <div class="quizizz-label">${q.label}</div>
      <div class="quizizz-question">${q.prompt}</div>
      <div class="quizizz-meta">${q.meta.map(m => `<span class="quizizz-pill">${m}</span>`).join("")}</div>
      <div class="quizizz-sub">Drag from the bank into the 4 timeline slots below.</div>

      <div class="quizizz-timeline-bank" id="timeline-bank">
        ${q.items.map(item => `
          <div class="quizizz-drag-card" draggable="true" data-drag-id="${item.dragId}">
            <strong>${item.name}</strong>
          </div>
        `).join("")}
      </div>

      <div class="quizizz-timeline-dropzone">
        ${[0,1,2,3].map(i => `
          <div class="quizizz-drop-slot" data-slot-index="${i}">
            <div class="quizizz-drop-slot-label">POSITION ${i + 1}</div>
          </div>
        `).join("")}
      </div>

      <button class="quizizz-next" id="grade-timeline">GRADE TIMELINE</button>
      <div id="quizizz-feedback"></div>
    </div>
  `;

  const allSlots = main.querySelectorAll(".quizizz-drop-slot");
  const bank = document.getElementById("timeline-bank");

  main.querySelectorAll(".quizizz-drag-card").forEach(card => {
    card.addEventListener("dragstart", () => {
      draggedTimelineId = card.dataset.dragId;
    });
  });

  bank.addEventListener("dragover", e => e.preventDefault());
  bank.addEventListener("drop", e => {
    e.preventDefault();
    if (!draggedTimelineId) return;
    const card = main.querySelector(`[data-drag-id="${CSS.escape(draggedTimelineId)}"]`);
    if (card) bank.appendChild(card);
    draggedTimelineId = null;
  });

  allSlots.forEach(slot => {
    slot.addEventListener("dragover", e => {
      e.preventDefault();
      slot.classList.add("over");
    });
    slot.addEventListener("dragleave", () => {
      slot.classList.remove("over");
    });
    slot.addEventListener("drop", e => {
      e.preventDefault();
      slot.classList.remove("over");
      if (!draggedTimelineId) return;

      const card = main.querySelector(`[data-drag-id="${CSS.escape(draggedTimelineId)}"]`);
      if (!card) return;

      const existingCard = slot.querySelector(".quizizz-drag-card");
      if (existingCard) bank.appendChild(existingCard);
      slot.appendChild(card);
      draggedTimelineId = null;
    });
  });

  document.getElementById("grade-timeline").onclick = () => {
    const placed = [...allSlots].map(slot => {
      const card = slot.querySelector(".quizizz-drag-card");
      return card ? card.dataset.dragId : "";
    });

    if (placed.some(v => !v)) {
      document.getElementById("quizizz-feedback").innerHTML =
        `<div class="quizizz-feedback">Place all 4 cards before grading.</div>`;
      return;
    }

    const correct = placed.every((id, i) => id === q.answer[i]);
    quizizzState.total += 1;
    if (correct) quizizzState.score += 1;
    updateQuizizzScore();
    const eraMeta = q.meta.find(item => eraOrder.includes(item)) || document.getElementById("quizizz-era").value || "Multi-era";
    recordStudyAttempt({
      label: q.prompt,
      era: eraMeta,
      mode: "quizizz",
      questionType: "timeline-drag",
      correct,
      metadata: { ordered: q.answer }
    });

    allSlots.forEach((slot, i) => {
      slot.classList.remove("correct", "wrong");
      slot.classList.add(placed[i] === q.answer[i] ? "correct" : "wrong");
    });

    document.getElementById("quizizz-feedback").innerHTML = `
      <div class="quizizz-feedback">
        <strong>${correct ? "Correct." : "Not quite."}</strong><br><br>
        ${q.explanation}
      </div>
      <button class="quizizz-next" id="next-q">NEXT QUESTION</button>
    `;
    document.getElementById("next-q").onclick = nextQuizizzQuestion;
  };
}

function buildMasterTimelineApp() {
  const mainEl = document.getElementById("master-timeline-main");
  const searchEl = document.getElementById("master-search");
  const eraEl = document.getElementById("master-era");
  const countEl = document.getElementById("master-count");

  eraOrder.forEach(era => {
    const opt = document.createElement("option");
    opt.value = era;
    opt.textContent = era.toUpperCase();
    eraEl.appendChild(opt);
  });

  const combined = [
    ...data.map(item => ({
      type: "person",
      era: item.era,
      name: item.name,
      yearLabel: item.dates,
      sortYear: yearValue(item.dates),
      preview: item.desc,
      detail: item.desc,
      significance: "",
      tags: item.tags || []
    })),
    ...eventsData.map(item => ({
      type: "event",
      era: item.era,
      name: item.name,
      yearLabel: item.year,
      sortYear: yearValue(item.year),
      preview: item.significance,
      detail: item.desc,
      significance: item.significance,
      tags: item.types || []
    }))
  ];

  searchEl.addEventListener("input", renderMasterTimeline);
  eraEl.addEventListener("change", renderMasterTimeline);

  function renderMasterTimeline() {
    const q = searchEl.value.trim().toLowerCase();
    const selectedEra = eraEl.value;
    mainEl.innerHTML = "";
    let total = 0;

    eraOrder.forEach(era => {
      if (selectedEra !== "ALL" && selectedEra !== era) return;
      const items = combined
        .filter(item => item.era === era)
        .filter(item => {
          if (!q) return true;
          return item.name.toLowerCase().includes(q)
            || item.preview.toLowerCase().includes(q)
            || item.detail.toLowerCase().includes(q)
            || item.tags.some(tag => String(tag).toLowerCase().includes(q));
        })
        .sort((a, b) => a.sortYear - b.sortYear || a.name.localeCompare(b.name));

      if (!items.length) return;
      total += items.length;

      const section = document.createElement("section");
      section.className = "master-era-section";
      section.innerHTML = `
        <div class="master-era-bracket">
          <div class="master-era-name">${era.toUpperCase()}</div>
          <div class="master-era-note">${eraConceptNotes[era] || ""}</div>
        </div>
        <div class="master-items">
          ${items.map((item, index) => `
            <details class="master-item ${index % 2 === 0 ? 'left' : 'right'}">
              <summary class="master-summary">
                <div class="master-topline">
                  <span class="master-year">${item.yearLabel}</span>
                  <span class="master-type">${item.type}</span>
                </div>
                <div class="master-name">${item.name}</div>
              </summary>
              <div class="master-detail">
                <p>${item.detail}</p>
                ${item.significance ? `<p><em>${item.significance}</em></p>` : ""}
                <div class="master-tags">
                  ${item.tags.map(tag => `<span class="master-tag">${tag}</span>`).join("")}
                </div>
              </div>
            </details>
          `).join("")}
        </div>
      `;
      mainEl.appendChild(section);
    });

    countEl.textContent = `${total} timeline entries`;
    if (!total) {
      mainEl.innerHTML = '<div class="no-results">// NO RESULTS FOUND</div>';
    }
  }

  renderMasterTimeline();
}

function buildFlashcardsApp() {
  const deckEl = document.getElementById("flashcard-deck");
  const reviewDeckButton = document.getElementById("flashcard-review-deck");
  const flipButton = document.getElementById("flashcard-flip");
  const nextButton = document.getElementById("flashcard-next");
  const shuffleButton = document.getElementById("flashcard-shuffle");

  getDeckDefinitions().forEach(deck => {
    const option = document.createElement("option");
    option.value = deck.value;
    option.textContent = deck.label;
    deckEl.appendChild(option);
  });

  deckEl.value = flashcardState.deck;

  deckEl.addEventListener("change", () => {
    flashcardState.deck = deckEl.value;
    flashcardState.flipped = false;
    flashcardState.index = 0;
    refreshFlashcardOrder({ shuffleDeck: true });
    renderFlashcardsPage();
  });

  reviewDeckButton.addEventListener("click", () => {
    flashcardState.deck = "review";
    deckEl.value = "review";
    flashcardState.flipped = false;
    flashcardState.index = 0;
    refreshFlashcardOrder({ shuffleDeck: true });
    renderFlashcardsPage();
  });

  flipButton.addEventListener("click", () => {
    flashcardState.flipped = !flashcardState.flipped;
    renderFlashcardsPage();
  });

  nextButton.addEventListener("click", () => {
    if (!flashcardState.order.length) return;
    flashcardState.index = (flashcardState.index + 1) % flashcardState.order.length;
    flashcardState.flipped = false;
    renderFlashcardsPage();
  });

  shuffleButton.addEventListener("click", () => {
    flashcardState.flipped = false;
    refreshFlashcardOrder({ shuffleDeck: true });
    renderFlashcardsPage();
  });

  refreshFlashcardOrder({ shuffleDeck: true });
  renderFlashcardsPage();
}

function buildQuizizzApp() {
  document.getElementById("quizizz-new").addEventListener("click", nextQuizizzQuestion);
  document.getElementById("quizizz-mode").addEventListener("change", nextQuizizzQuestion);
  document.getElementById("quizizz-era").addEventListener("change", () => {
    if (document.getElementById("quizizz-mode").value === "timeline") {
      nextQuizizzQuestion();
    }
  });
  nextQuizizzQuestion();
}

async function init() {
  setupNav();
  buildPeopleApp();
  buildEventsApp();
  buildFlashcardsApp();
  buildQuizizzApp();
  buildMasterTimelineApp();
  await setupAuthUi();
  await renderProgressPage();
}

init();
