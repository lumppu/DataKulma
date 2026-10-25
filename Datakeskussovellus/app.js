// Datakeskussovellus: onboarding -> aihealueet -> maskotin esitys.
// Ei backendiä: kunnat tulevat kunnat.js:stä ja sisältö content.js- ja content-kuopio.js-tiedostoista.
// Sisältö on kovakoodattu: Kuopio -> kuopiolaisen opettajan näkökulma, muuten tamperelaisen rakennusmiehen.

const STORAGE_KEY = 'datakeskus-profiili';
const MASCOT_POSES = ['wave', 'point', 'think'];
const TYPE_SPEED_MS = 18;
const THINKING_DELAY_MS = 700;

const state = {
    municipalities: [],
    profile: null,          // { municipality, profession }
    categories: [],
    visited: new Set(),
    presentation: null,     // { category, steps, index }
};

const $ = (id) => document.getElementById(id);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Apufunktiot ----------

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Sisältöprofiilit: ensimmäinen, jonka ehto täyttyy, valitaan. Viimeinen on oletus.
const CONTENT_PROFILES = [
    { id: 'kuopio-opettaja', matches: (p) => p.municipality === 'Kuopio',
      presentations: KUOPIO_PRESENTATIONS, answers: KUOPIO_ANSWERS },
    { id: 'tampere-rakennusmies', matches: () => true,
      presentations: TAMPERE_PRESENTATIONS, answers: TAMPERE_ANSWERS },
];

function activeContent() {
    return CONTENT_PROFILES.find(c => c.matches(state.profile));
}

function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
}

// Valitsee tekstivärin (tumma tai valkoinen), joka erottuu paremmin annetun taustavärin päällä
function inkFor(hex) {
    const channel = (i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
    const contrastWithWhite = 1.05 / (luminance + 0.05);
    const contrastWithInk = (luminance + 0.05) / 0.0587;   // #0f172a
    return contrastWithInk > contrastWithWhite ? '#0f172a' : '#ffffff';
}

function setTopicColor(element, color) {
    element.style.setProperty('--topic', color);
    element.style.setProperty('--topic-ink', inkFor(color));
}

function saveSession() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            profile: state.profile,
            visited: [...state.visited],
        }));
    } catch { /* tallennus ei ole välttämätöntä */ }
}

function loadSession() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (saved?.profile) {
            state.profile = saved.profile;
            state.visited = new Set(saved.visited || []);
        }
    } catch { /* tyhjä tai estetty tallennus */ }
}

function clearSession() {
    state.profile = null;
    state.categories = [];
    state.visited = new Set();
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ohitetaan */ }
}

// ---------- Reititys ----------
// #/aloitus, #/aihealueet, #/aihe/<id>  (selaimen takaisin-painike toimii)

function showOnly(viewId) {
    document.querySelectorAll('.view').forEach(view => { view.hidden = view.id !== viewId; });
    window.scrollTo(0, 0);
}

function route() {
    const hash = location.hash || '#/aloitus';
    if (!state.profile) {
        if (hash !== '#/aloitus') history.replaceState(null, '', '#/aloitus');
        showOnboarding();
        return;
    }
    if (hash.startsWith('#/aihe/')) {
        startPresentation(hash.slice('#/aihe/'.length));
    } else if (hash === '#/aloitus') {
        showOnboarding();
    } else {
        showTopics();
    }
}

window.addEventListener('hashchange', route);

// ---------- Onboarding ----------

const municipalityInput = $('municipalityInput');
const municipalityList = $('municipalityList');
const professionInput = $('professionInput');
const onboardingSubmit = $('onboardingSubmit');
const onboardingError = $('onboardingError');
let comboMatches = [];
let comboActive = -1;
let selectedMunicipality = null;

function resetTopicColor() {
    document.documentElement.style.removeProperty('--topic');
    document.documentElement.style.removeProperty('--topic-ink');
}

function showOnboarding() {
    resetTopicColor();
    if (state.profile) {
        selectedMunicipality = state.profile.municipality;
        municipalityInput.value = state.profile.municipality;
        professionInput.value = state.profile.profession;
    }
    updateSubmitState();
    showOnly('onboardingView');
}

function findMunicipality(name) {
    const wanted = name.trim().toLocaleLowerCase('fi');
    return state.municipalities.find(m => m.name.toLocaleLowerCase('fi') === wanted) || null;
}

function filterMunicipalities(query) {
    const q = query.trim().toLocaleLowerCase('fi');
    if (!q) return state.municipalities;
    // Alusta alkavat ensin, sitten muut osumat
    const starts = [];
    const contains = [];
    state.municipalities.forEach(m => {
        const name = m.name.toLocaleLowerCase('fi');
        if (name.startsWith(q)) starts.push(m);
        else if (name.includes(q)) contains.push(m);
    });
    return starts.concat(contains);
}

function highlight(name, query) {
    const q = query.trim();
    const i = name.toLocaleLowerCase('fi').indexOf(q.toLocaleLowerCase('fi'));
    if (!q || i < 0) return escapeHtml(name);
    return escapeHtml(name.slice(0, i)) + '<mark>' + escapeHtml(name.slice(i, i + q.length)) + '</mark>' + escapeHtml(name.slice(i + q.length));
}

function renderCombo() {
    comboMatches = filterMunicipalities(municipalityInput.value);
    comboActive = comboMatches.length ? 0 : -1;
    municipalityList.innerHTML = comboMatches.length
        ? comboMatches.map((m, i) =>
            `<li role="option" id="kunta-${i}" data-index="${i}" aria-selected="${i === comboActive}">${highlight(m.name, municipalityInput.value)}</li>`
        ).join('')
        : '<li class="combo-empty" role="option" aria-disabled="true">Ei osumia</li>';
    openCombo();
    updateActiveOption();
}

function openCombo() {
    municipalityList.hidden = false;
    municipalityInput.setAttribute('aria-expanded', 'true');
}

function closeCombo() {
    municipalityList.hidden = true;
    municipalityInput.setAttribute('aria-expanded', 'false');
    municipalityInput.removeAttribute('aria-activedescendant');
}

function updateActiveOption() {
    municipalityList.querySelectorAll('li[data-index]').forEach(li => {
        const active = Number(li.dataset.index) === comboActive;
        li.setAttribute('aria-selected', String(active));
        if (active) {
            municipalityInput.setAttribute('aria-activedescendant', li.id);
            li.scrollIntoView({ block: 'nearest' });
        }
    });
}

function chooseMunicipality(m) {
    selectedMunicipality = m.name;
    municipalityInput.value = m.name;
    closeCombo();
    onboardingError.textContent = '';
    updateSubmitState();
}

function updateSubmitState() {
    const match = findMunicipality(municipalityInput.value);
    selectedMunicipality = match ? match.name : null;
    onboardingSubmit.disabled = !selectedMunicipality;
}

municipalityInput.addEventListener('input', () => {
    renderCombo();
    updateSubmitState();
});

municipalityInput.addEventListener('focus', renderCombo);

municipalityInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (municipalityList.hidden) renderCombo();
        if (!comboMatches.length) return;
        const step = e.key === 'ArrowDown' ? 1 : -1;
        comboActive = (comboActive + step + comboMatches.length) % comboMatches.length;
        updateActiveOption();
    } else if (e.key === 'Enter' && !municipalityList.hidden && comboActive >= 0) {
        e.preventDefault();
        chooseMunicipality(comboMatches[comboActive]);
    } else if (e.key === 'Escape') {
        closeCombo();
    }
});

municipalityList.addEventListener('mousedown', (e) => {
    // mousedown ennen blur-tapahtumaa, jotta valinta ehtii toteutua
    const li = e.target.closest('li[data-index]');
    if (!li) return;
    e.preventDefault();
    chooseMunicipality(comboMatches[Number(li.dataset.index)]);
});

municipalityInput.addEventListener('blur', () => {
    closeCombo();
    if (municipalityInput.value && !findMunicipality(municipalityInput.value)) {
        onboardingError.textContent = 'Valitse paikkakunta listasta.';
    }
});

$('onboardingForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!selectedMunicipality) {
        onboardingError.textContent = 'Valitse paikkakunta listasta.';
        return;
    }
    onboardingError.textContent = '';
    // Syötteet tallennetaan ja näytetään, mutta sisältö on aina sama (Tampere, rakennusmies)
    state.profile = {
        municipality: selectedMunicipality,
        profession: professionInput.value.trim().slice(0, 80),
    };
    state.visited = new Set();
    saveSession();
    location.hash = '#/aihealueet';
});

// ---------- Aihealueiden valinta ----------

function showTopics() {
    resetTopicColor();
    const { municipality, profession } = state.profile;
    $('profileChip').innerHTML = `<i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${escapeHtml(municipality)}${profession ? ' · ' + escapeHtml(profession) : ''}`;
    $('topicsTitle').textContent = state.visited.size
        ? 'Mihin tutustutaan seuraavaksi?'
        : 'Mihin haluat tutustua ensin?';
    $('topicGrid').innerHTML = state.categories.map(c => `
        <button type="button" class="topic-card" data-id="${c.id}" style="--card-color: ${c.color}; --card-ink: ${inkFor(c.color)}">
            <span class="topic-card-icon" aria-hidden="true"><i class="fa-solid ${escapeHtml(c.icon)}"></i></span>
            <span class="topic-card-text"><strong>${escapeHtml(c.title)}</strong><span>${escapeHtml(c.teaser)}</span></span>
            ${state.visited.has(c.id) ? '<span class="visited"><i class="fa-solid fa-check"></i> Katsottu</span>' : '<span class="visited" aria-hidden="true"><i class="fa-solid fa-chevron-right"></i></span>'}
        </button>`).join('');
    showOnly('topicsView');
}

$('topicGrid').addEventListener('click', (e) => {
    const card = e.target.closest('.topic-card');
    if (card) location.hash = `#/aihe/${card.dataset.id}`;
});

$('changeProfileBtn').addEventListener('click', () => {
    location.hash = '#/aloitus';
});

// ---------- Esitys ----------

const mascotImg = $('mascotImg');
const bubble = $('bubble');
const bubbleLabel = $('bubbleLabel');
const bubbleText = $('bubbleText');
const bubblePill = $('bubblePill');
const resumeBtn = $('resumeBtn');
const promptForm = $('promptForm');
const promptInput = $('promptInput');
let typing = null;   // { timer, fullText }

// Maskotilla on yksi kuva; asento näkyy pienenä kallistuksena (styles.css, data-pose)
function setPose(pose) {
    mascotImg.dataset.pose = MASCOT_POSES.includes(pose) ? pose : 'point';
    mascotImg.classList.remove('bounce');
    void mascotImg.offsetWidth;   // käynnistää animaation uudelleen
    mascotImg.classList.add('bounce');
}

// Kirjoittaa tekstin kuplaan; lähdepilleri ilmestyy perään, kun teksti on valmis
function typeText(text, sources = []) {
    stopTyping();
    bubbleText.classList.remove('loading');
    bubblePill.innerHTML = '';
    pendingSources = sources;
    if (reducedMotion) {
        bubbleText.textContent = text;
        showSourcePill();
        return;
    }
    let i = 0;
    bubbleText.textContent = '';
    typing = {
        fullText: text,
        timer: setInterval(() => {
            i += 1;
            bubbleText.textContent = text.slice(0, i);
            if (i >= text.length) stopTyping();
        }, TYPE_SPEED_MS),
    };
}

function stopTyping() {
    if (!typing) return;
    clearInterval(typing.timer);
    bubbleText.textContent = typing.fullText;
    typing = null;
    showSourcePill();
}

// ---------- Lähdepilleri ja lähdeluettelo ----------

const citePopover = $('citePopover');
let pendingSources = [];

function showSourcePill() {
    const ids = pendingSources.filter(id => SOURCES[id]);
    if (!ids.length) return;
    const more = ids.length > 1 ? ` +${ids.length - 1}` : '';
    bubblePill.innerHTML = `<button type="button" class="cite" aria-expanded="false" aria-haspopup="dialog"
        data-sources="${ids.join(',')}"><i class="fa-solid fa-link" aria-hidden="true"></i>
        ${escapeHtml(SOURCES[ids[0]].publisher)}${more}</button>`;
}

function formatDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return d ? `${Number(d)}.${Number(m)}.${y}` : y;
}

function closeCitePopover() {
    citePopover.hidden = true;
    document.querySelectorAll('.cite[aria-expanded="true"]').forEach(b => b.setAttribute('aria-expanded', 'false'));
}

function openCitePopover(pill) {
    if (pill.getAttribute('aria-expanded') === 'true') {
        closeCitePopover();
        return;
    }
    closeCitePopover();
    citePopover.innerHTML = `<p class="cite-heading">Lähteet</p>` + pill.dataset.sources.split(',').map(id => {
        const src = SOURCES[id];
        const meta = [src.publisher, formatDate(src.date)].filter(Boolean).join(' · ');
        return `<a class="cite-item" href="${escapeHtml(src.url)}" target="_blank" rel="noopener">
            <span class="cite-meta">${escapeHtml(meta)}</span>
            <span class="cite-title">${escapeHtml(src.title)}</span>
        </a>`;
    }).join('');
    citePopover.hidden = false;

    // Pillerin alle, ikkunan sisään; jos tila loppuu alhaalla, pillerin yläpuolelle
    const rect = pill.getBoundingClientRect();
    const left = Math.min(Math.max(16, rect.left), window.innerWidth - citePopover.offsetWidth - 16);
    const below = rect.bottom + 6;
    const top = below + citePopover.offsetHeight > window.innerHeight - 16
        ? Math.max(16, rect.top - citePopover.offsetHeight - 6)
        : below;
    citePopover.style.left = `${left}px`;
    citePopover.style.top = `${top}px`;
    pill.setAttribute('aria-expanded', 'true');
}

document.addEventListener('click', (e) => {
    const pill = e.target.closest('.cite');
    if (pill) openCitePopover(pill);
    else if (!e.target.closest('.cite-popover')) closeCitePopover();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeCitePopover();
});

window.addEventListener('scroll', closeCitePopover, { passive: true });

function startPresentation(categoryId) {
    const category = state.categories.find(c => c.id === categoryId);
    if (!category) {
        location.hash = '#/aihealueet';
        return;
    }

    setTopicColor(document.documentElement, category.color);
    $('presTitle').textContent = category.title;
    promptInput.value = '';
    $('presControls').hidden = false;
    $('presEnd').hidden = true;
    resumeBtn.hidden = true;
    closeCitePopover();
    showOnly('presentationView');

    const steps = activeContent().presentations[categoryId];
    state.presentation = { category, steps, index: 0 };
    $('dots').innerHTML = steps.map(() => '<span></span>').join('');
    showStep(0);
}

// Kuvakekaavio: yksi kuvake = `per` yksikköä. Osittainen kuvake rajataan,
// ja `total` (esim. kaikki tamperelaiset) näkyy harmaina kuvakkeina.
function pictogramHtml(chart) {
    const icon = `<i class="fa-solid ${escapeHtml(chart.icon)}" aria-hidden="true"></i>`;
    let order = 0;   // kuvakkeet ilmestyvät järjestyksessä rivistä toiseen
    const rows = chart.rows.map(row => {
        const count = Math.ceil(Math.max(row.value, row.total || 0) / chart.per);
        const icons = Array.from({ length: count }, (_, i) => {
            const fill = Math.min(Math.max((row.value - i * chart.per) / chart.per, 0), 1);
            const delay = fill > 0 ? (order++) * 45 : 0;
            return `<span class="picto-icon" style="--fill: ${(fill * 100).toFixed(0)}%; --delay: ${delay}ms">
                <span class="picto-base">${icon}</span><span class="picto-fill">${icon}</span></span>`;
        }).join('');
        return `<div class="picto-row">
            <div class="picto-head"><span class="chart-label">${escapeHtml(row.label)}</span>
                <span class="chart-value">${escapeHtml(row.display || row.value.toLocaleString('fi-FI'))}</span></div>
            <div class="picto-icons" role="img" aria-label="${escapeHtml(`${row.label}: ${row.display || row.value}`)}">${icons}</div>
        </div>`;
    }).join('');
    return `
        <figcaption class="chart-title">${escapeHtml(chart.title)}</figcaption>
        <div class="picto-rows">${rows}</div>
        <p class="chart-note">${escapeHtml(chart.legend)}${chart.note ? '. ' + escapeHtml(chart.note) : ''}</p>`;
}

// Havainnollistava kuva ikoneista: rivi tai virtaus (flow: nuolet kohtien välissä)
function illustrationHtml(chart) {
    const items = chart.items.map((item, i) => `
        <div class="illu-item" style="--delay: ${i * 180}ms">
            <span class="illu-icon"><i class="fa-solid ${escapeHtml(item.icon)}" aria-hidden="true"></i></span>
            ${item.value ? `<strong class="illu-value">${escapeHtml(item.value)}</strong>` : ''}
            <span class="illu-label">${escapeHtml(item.label)}</span>
        </div>`);
    const arrow = '<i class="fa-solid fa-arrow-right illu-arrow" aria-hidden="true"></i>';
    return `<div class="illu ${chart.flow ? 'illu-flow' : ''}" role="img"
        aria-label="${escapeHtml(chart.items.map(i => [i.value, i.label].filter(Boolean).join(' ')).join(', '))}">
        ${items.join(chart.flow ? arrow : '')}</div>`;
}

// Valokuva (Wikimedia Commons) ja sen lisenssin vaatima tekijämerkintä
function photoHtml(chart) {
    const c = chart.credit;
    return `<img class="photo" src="${escapeHtml(chart.src)}" alt="${escapeHtml(chart.alt)}">
        <p class="photo-credit">Kuva: <a href="${escapeHtml(c.url)}" target="_blank" rel="noopener">${escapeHtml(c.author)}</a>,
            Wikimedia Commons, ${escapeHtml(c.license)}</p>`;
}

const VISUAL_RENDERERS = {
    pictogram: pictogramHtml,
    illustration: illustrationHtml,
    photo: photoHtml,
};

// Vaakapylväskaavio puhekuplaan; pylväät kasvavat näkyviin
function renderChart(chart) {
    const chartEl = $('bubbleChart');
    if (!chart) {
        chartEl.hidden = true;
        chartEl.innerHTML = '';
        $('presentationView').classList.remove('compact');
        return;
    }
    if (chart.type in VISUAL_RENDERERS) {
        chartEl.innerHTML = VISUAL_RENDERERS[chart.type](chart);
        chartEl.hidden = false;
        $('presentationView').classList.add('compact');
        requestAnimationFrame(() => requestAnimationFrame(() => chartEl.classList.add('grown')));
        chartEl.classList.remove('grown');
        return;
    }
    const max = Math.max(...chart.bars.map(b => b.value));
    chartEl.innerHTML = `
        <figcaption class="chart-title">${escapeHtml(chart.title)} <span>(${escapeHtml(chart.unit)})</span></figcaption>
        <div class="chart-bars">
            ${chart.bars.map(b => `
                <div class="chart-row">
                    <span class="chart-label">${escapeHtml(b.label)}</span>
                    <span class="chart-track">
                        <span class="chart-bar" style="--w: ${(b.value / max) * 100}%"></span>
                        <span class="chart-value">${escapeHtml(b.display || b.value.toLocaleString('fi-FI'))}</span>
                    </span>
                </div>`).join('')}
        </div>
        ${chart.note ? `<p class="chart-note">${escapeHtml(chart.note)}</p>` : ''}`;
    chartEl.hidden = false;
    $('presentationView').classList.add('compact');
    // Seuraavassa ruudussa leveys asetetaan, jotta siirtymä näkyy
    requestAnimationFrame(() => requestAnimationFrame(() => chartEl.classList.add('grown')));
    chartEl.classList.remove('grown');
}

function showStep(index) {
    const p = state.presentation;
    p.index = index;
    const step = p.steps[index];
    bubbleLabel.textContent = '';
    resumeBtn.hidden = true;
    $('presControls').hidden = false;
    closeCitePopover();
    setPose(step.pose);
    typeText(step.text, step.sources);
    renderChart(step.chart);

    $('dots').querySelectorAll('span').forEach((dot, i) => dot.classList.toggle('active', i === index));
    $('prevBtn').disabled = index === 0;
    $('nextBtn').innerHTML = index === p.steps.length - 1
        ? 'Valmis <i class="fa-solid fa-check" aria-hidden="true"></i>'
        : 'Seuraava <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>';
}

function nextStep() {
    const p = state.presentation;
    if (!p) return;
    if (typing) {
        stopTyping();   // ensimmäinen napautus näyttää koko tekstin
        return;
    }
    if (p.index < p.steps.length - 1) showStep(p.index + 1);
    else finishPresentation();
}

function prevStep() {
    const p = state.presentation;
    if (p && p.index > 0) showStep(p.index - 1);
}

// Seuraava katsomaton aihealue järjestyksessä nykyisen jälkeen
function nextUnvisitedCategory(currentId) {
    const order = state.categories;
    const start = order.findIndex(c => c.id === currentId);
    for (let i = 1; i < order.length; i++) {
        const candidate = order[(start + i) % order.length];
        if (!state.visited.has(candidate.id)) return candidate;
    }
    return null;
}

function finishPresentation() {
    const { category } = state.presentation;
    state.visited.add(category.id);
    saveSession();

    const next = nextUnvisitedCategory(category.id);
    renderChart(null);
    setPose('wave');
    bubbleLabel.textContent = '';
    typeText(next
        ? `Siinä tärkeimmät asiat aiheesta ${category.title}! Haluatko jatkaa seuraavaan aiheeseen?`
        : 'Kävit läpi kaikki aihealueet. Hienoa! Voit yhä kysyä minulta lisää alhaalta.');

    $('presControls').hidden = true;
    $('presEnd').hidden = false;
    const nextBtn = $('nextTopicBtn');
    nextBtn.hidden = !next;
    if (next) {
        nextBtn.innerHTML = `Seuraava aihealue: ${escapeHtml(next.title)} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>`;
        setTopicColor(nextBtn, next.color);
        nextBtn.onclick = () => { location.hash = `#/aihe/${next.id}`; };
    }
    $('allTopicsBtn').textContent = next ? 'Tai tutustu muihin aihealueisiin' : 'Takaisin aihealueisiin';
}

$('nextBtn').addEventListener('click', nextStep);
$('prevBtn').addEventListener('click', prevStep);
bubble.addEventListener('click', (e) => {
    if (e.target.closest('button, a, .cite-popover')) return;
    if (typing) stopTyping();
    else if (resumeBtn.hidden && !$('presControls').hidden) nextStep();
});
$('presBackBtn').addEventListener('click', () => { location.hash = '#/aihealueet'; });
$('allTopicsBtn').addEventListener('click', () => { location.hash = '#/aihealueet'; });

resumeBtn.addEventListener('click', () => {
    if (!$('presEnd').hidden) {
        resumeBtn.hidden = true;
        finishPresentation();
    } else {
        showStep(state.presentation.index);
    }
});

document.addEventListener('keydown', (e) => {
    if ($('presentationView').hidden || e.target.closest('input')) return;
    if (e.key === 'ArrowRight') nextStep();
    if (e.key === 'ArrowLeft') prevStep();
});

// Lisäkysymys maskotille
promptForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const question = promptInput.value.trim();
    if (!question || !state.presentation) return;

    const sendBtn = promptForm.querySelector('button');
    sendBtn.disabled = true;
    promptInput.value = '';
    stopTyping();
    renderChart(null);
    $('presentationView').classList.add('compact');   // pitkä vastaus mahtuu puhelimen ruudulle
    // Vastauksen ajan kuplassa on "Jatka esitystä", joten askelpainikkeita ei tarvita
    $('presControls').hidden = true;
    setPose('think');
    bubbleLabel.textContent = `Kysyit: ${question}`;
    bubbleText.textContent = '';
    bubblePill.innerHTML = '';
    bubbleText.classList.add('loading');
    resumeBtn.hidden = true;
    closeCitePopover();

    // Vastaus on kovakoodattu: kohdan oma vastaus, muuten aiheen yleinen vastaus
    await wait(THINKING_DELAY_MS);
    const { steps, index, category } = state.presentation;
    const answer = steps[index].answer || activeContent().answers[category.id];
    setPose(answer.pose);
    typeText(answer.text, answer.sources);
    resumeBtn.hidden = false;
    sendBtn.disabled = false;
});

// ---------- Käynnistys ----------

function init() {
    state.municipalities = KUNNAT.map(name => ({ name }));
    state.categories = CATEGORIES;
    loadSession();
    route();
}

init();
