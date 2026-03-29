import { signUp, signIn, signOut, getSession, onAuthChange, currentUser, userProfile } from './auth.js';
import { BIOMES, calcHabitability, calcPopulation, formatPopulation } from './biomes.js';
import { PlanetRenderer } from './planetRenderer.js';
import { savePlanet, fetchMyPlanets, deletePlanet, fetchPublicPlanets, fetchLeaderboard, fetchPlanetRatings, ratePlanet, getUserProfile } from './db.js';

const app = document.getElementById('app');
let currentView = 'auth';
let planetRenderer = null;
let atmosphere = { oxygen: 0, co2: 0.95, temperature: -40 };
let activeBiomeId = null;
let brushSize = 8;

// ── Router ──
function navigate(view) {
  if (planetRenderer && currentView === 'terraform' && view !== 'terraform') {
    planetRenderer.dispose();
    planetRenderer = null;
  }
  currentView = view;
  render();
}

// ── Toast ──
function showToast(msg, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${isError ? 'toast-error' : 'toast-success'} show`;
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// ── Auth ──
function renderAuth() {
  app.innerHTML = `
    <div class="auth-container">
      <div class="auth-card">
        <div class="auth-logo">🪐</div>
        <h1 class="auth-title">PLANET TERRAFORMER</h1>
        <p class="auth-sub">Create worlds. Shape life.</p>
        <div class="auth-tabs">
          <button class="tab-btn active" data-tab="login">Login</button>
          <button class="tab-btn" data-tab="signup">Sign Up</button>
        </div>
        <form id="auth-form">
          <div id="name-field" class="form-group" style="display:none">
            <input type="text" id="auth-name" placeholder="Display Name" class="input" />
          </div>
          <div class="form-group">
            <input type="email" id="auth-email" placeholder="Email" class="input" required />
          </div>
          <div class="form-group">
            <input type="password" id="auth-password" placeholder="Password" class="input" required />
          </div>
          <button type="submit" class="btn btn-primary btn-full" id="auth-submit">Login</button>
        </form>
        <p id="auth-error" class="error-msg"></p>
        <p id="auth-success" class="success-msg"></p>
      </div>
    </div>
  `;
  let isLogin = true;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      isLogin = btn.dataset.tab === 'login';
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('name-field').style.display = isLogin ? 'none' : 'block';
      document.getElementById('auth-submit').textContent = isLogin ? 'Login' : 'Sign Up';
      document.getElementById('auth-error').textContent = '';
      document.getElementById('auth-success').textContent = '';
    });
  });
  document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const name = document.getElementById('auth-name').value;
    const errEl = document.getElementById('auth-error');
    const successEl = document.getElementById('auth-success');
    errEl.textContent = ''; successEl.textContent = '';
    try {
      if (isLogin) {
        await signIn(email, password);
        await getSession();
        navigate('home');
      } else {
        await signUp(email, password, name);
        successEl.textContent = 'Check your email to confirm, then log in!';
      }
    } catch (err) { errEl.textContent = err.message; }
  });
}

// ── Home ──
function renderHome() {
  const profile = userProfile;
  app.innerHTML = `
    <div class="home-container">
      <header class="home-header">
        <div class="header-left">
          <span class="header-avatar">${profile?.avatar_emoji || '🌍'}</span>
          <span class="header-name">${profile?.display_name || 'Explorer'}</span>
        </div>
        <button class="btn btn-ghost" id="logout-btn">Logout</button>
      </header>
      <div class="home-hero">
        <h1>🪐 PLANET TERRAFORMER</h1>
        <p>Shape barren worlds into living ecosystems</p>
      </div>
      <div class="home-grid">
        <button class="home-card" data-nav="terraform">
          <span class="card-icon">🌍</span>
          <span class="card-title">New Planet</span>
          <span class="card-desc">Start terraforming</span>
        </button>
        <button class="home-card" data-nav="myplanets">
          <span class="card-icon">📁</span>
          <span class="card-title">My Planets</span>
          <span class="card-desc">View saved</span>
        </button>
        <button class="home-card" data-nav="galaxy">
          <span class="card-icon">🌌</span>
          <span class="card-title">Galaxy</span>
          <span class="card-desc">Browse & rate</span>
        </button>
        <button class="home-card" data-nav="leaderboard">
          <span class="card-icon">🏆</span>
          <span class="card-title">Leaderboard</span>
          <span class="card-desc">Most habitable</span>
        </button>
      </div>
    </div>
  `;
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await signOut(); navigate('auth');
  });
  document.querySelectorAll('.home-card').forEach(card => {
    card.addEventListener('click', () => {
      const nav = card.dataset.nav;
      if (nav === 'terraform') {
        atmosphere = { oxygen: 0, co2: 0.95, temperature: -40 };
        activeBiomeId = null;
        brushSize = 8;
      }
      navigate(nav);
    });
  });
}

// ── Terraform ──
function renderTerraform() {
  const biomeCounts = planetRenderer ? planetRenderer.getBiomeCounts() : {};
  const habitability = calcHabitability(atmosphere, biomeCounts);
  const population = calcPopulation(habitability);
  const moonCount = planetRenderer ? planetRenderer.moonMeshes.length : 0;

  app.innerHTML = `
    <div class="terraform-container">
      <header class="terraform-header">
        <button class="btn btn-ghost btn-sm" id="back-btn">← Back</button>
        <h2>🪐 Terraform</h2>
        <button class="btn btn-primary btn-sm" id="save-btn">💾 Save</button>
      </header>
      <div class="planet-viewport" id="planet-viewport">
        <div class="hud-population">👥 <span id="pop-val">${formatPopulation(population)}</span></div>
        <div class="hud-habitability">🌡️ Habitability: <strong id="hab-val">${habitability}%</strong></div>
      </div>
      <div class="controls-panel">
        <!-- Biome Tools -->
        <div class="controls-section">
          <div class="section-label">🎨 Biome Paint</div>
          <div class="biome-tools">
            <div class="biome-btn ${!activeBiomeId ? 'active' : ''}" data-biome="none">
              <span class="emoji">👆</span><span class="label">Rotate</span>
            </div>
            ${BIOMES.map(b => `
              <div class="biome-btn ${activeBiomeId === b.id ? 'active' : ''}" data-biome="${b.id}">
                <span class="emoji">${b.emoji}</span><span class="label">${b.name}</span>
              </div>
            `).join('')}
          </div>
          <div class="brush-size-row">
            <label>Brush: ${brushSize}px</label>
            <input type="range" min="3" max="20" value="${brushSize}" id="brush-slider" class="slider-track" />
          </div>
        </div>

        <!-- Atmosphere -->
        <div class="controls-section">
          <div class="section-label">🌫️ Atmosphere</div>
          <div class="slider-group">
            <div class="slider-header"><label>🫧 Oxygen</label><span class="slider-val" id="o2-val">${atmosphere.oxygen.toFixed(1)}%</span></div>
            <input type="range" min="0" max="100" step="0.5" value="${atmosphere.oxygen}" id="o2-slider" class="slider-track slider-o2" />
          </div>
          <div class="slider-group">
            <div class="slider-header"><label>💨 CO₂</label><span class="slider-val" id="co2-val">${atmosphere.co2.toFixed(2)}</span></div>
            <input type="range" min="0" max="2" step="0.01" value="${atmosphere.co2}" id="co2-slider" class="slider-track slider-co2" />
          </div>
          <div class="slider-group">
            <div class="slider-header"><label>🌡️ Temperature</label><span class="slider-val" id="temp-val">${atmosphere.temperature}°C</span></div>
            <input type="range" min="-100" max="100" step="1" value="${atmosphere.temperature}" id="temp-slider" class="slider-track slider-temp" />
          </div>
        </div>

        <!-- Moons -->
        <div class="controls-section">
          <div class="section-label">🌙 Moons (${moonCount})</div>
          <div class="moon-row">
            <button class="btn btn-sm btn-cyan" id="add-moon">+ Add Moon</button>
            ${planetRenderer ? planetRenderer.moonMeshes.map((_, i) => `
              <span class="moon-badge">🌙 Moon ${i + 1} <span class="remove-moon" data-moon="${i}">✕</span></span>
            `).join('') : ''}
          </div>
        </div>
      </div>
    </div>
  `;

  // Init renderer
  const viewport = document.getElementById('planet-viewport');
  if (!planetRenderer || planetRenderer.disposed) {
    planetRenderer = new PlanetRenderer(viewport, {
      interactive: true,
      onPaint: () => updateHUD()
    });
    planetRenderer.updateAtmosphere(atmosphere);
  } else {
    viewport.appendChild(planetRenderer.renderer.domElement);
    planetRenderer.resize();
  }

  bindTerraformEvents();
}

function updateHUD() {
  if (!planetRenderer) return;
  const biomeCounts = planetRenderer.getBiomeCounts();
  const hab = calcHabitability(atmosphere, biomeCounts);
  const pop = calcPopulation(hab);
  const popEl = document.getElementById('pop-val');
  const habEl = document.getElementById('hab-val');
  if (popEl) popEl.textContent = formatPopulation(pop);
  if (habEl) habEl.textContent = hab + '%';
}

function bindTerraformEvents() {
  document.getElementById('back-btn').addEventListener('click', () => navigate('home'));
  document.getElementById('save-btn').addEventListener('click', showSaveModal);

  // Biome selection
  document.querySelectorAll('.biome-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.biome;
      if (id === 'none') {
        activeBiomeId = null;
        if (planetRenderer) planetRenderer.activeBiome = null;
      } else {
        activeBiomeId = id;
        if (planetRenderer) planetRenderer.activeBiome = BIOMES.find(b => b.id === id);
      }
      document.querySelectorAll('.biome-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Brush size
  document.getElementById('brush-slider').addEventListener('input', (e) => {
    brushSize = parseInt(e.target.value);
    if (planetRenderer) planetRenderer.brushSize = brushSize;
    e.target.previousElementSibling.textContent = `Brush: ${brushSize}px`;
  });

  // Atmosphere sliders
  document.getElementById('o2-slider').addEventListener('input', (e) => {
    atmosphere.oxygen = parseFloat(e.target.value);
    document.getElementById('o2-val').textContent = atmosphere.oxygen.toFixed(1) + '%';
    if (planetRenderer) planetRenderer.updateAtmosphere(atmosphere);
    updateHUD();
  });
  document.getElementById('co2-slider').addEventListener('input', (e) => {
    atmosphere.co2 = parseFloat(e.target.value);
    document.getElementById('co2-val').textContent = atmosphere.co2.toFixed(2);
    if (planetRenderer) planetRenderer.updateAtmosphere(atmosphere);
    updateHUD();
  });
  document.getElementById('temp-slider').addEventListener('input', (e) => {
    atmosphere.temperature = parseInt(e.target.value);
    document.getElementById('temp-val').textContent = atmosphere.temperature + '°C';
    if (planetRenderer) planetRenderer.updateAtmosphere(atmosphere);
    updateHUD();
  });

  // Moon controls
  document.getElementById('add-moon').addEventListener('click', () => {
    if (planetRenderer && planetRenderer.moonMeshes.length < 5) {
      planetRenderer.addMoon();
      renderTerraform();
    }
  });
  document.querySelectorAll('.remove-moon').forEach(btn => {
    btn.addEventListener('click', () => {
      planetRenderer.removeMoon(parseInt(btn.dataset.moon));
      renderTerraform();
    });
  });

  // Resize
  window.addEventListener('resize', () => {
    if (planetRenderer && !planetRenderer.disposed) planetRenderer.resize();
  });
}

function showSaveModal() {
  if (!planetRenderer) return;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card">
      <h3>💾 Save Planet</h3>
      <input type="text" id="planet-name" class="input" placeholder="Planet name" value="New World" />
      <label class="checkbox-label">
        <input type="checkbox" id="planet-public" /> Share to Galaxy
      </label>
      <div class="modal-btns">
        <button class="btn btn-ghost" id="modal-cancel">Cancel</button>
        <button class="btn btn-primary" id="modal-save">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('modal-cancel').addEventListener('click', () => overlay.remove());
  document.getElementById('modal-save').addEventListener('click', async () => {
    const name = document.getElementById('planet-name').value || 'New World';
    const isPublic = document.getElementById('planet-public').checked;
    const btn = document.getElementById('modal-save');
    btn.textContent = 'Saving...'; btn.disabled = true;

    const biomeCounts = planetRenderer.getBiomeCounts();
    const hab = calcHabitability(atmosphere, biomeCounts);
    const pop = calcPopulation(hab);
    const exportData = planetRenderer.exportData();

    const saved = await savePlanet({
      planetData: exportData,
      atmosphere,
      biomeCounts,
      moonCount: planetRenderer.moonMeshes.length,
      population: pop,
      habitability: hab
    }, name, isPublic);
    overlay.remove();
    showToast(saved ? 'Planet saved! 🌍' : 'Failed to save.', !saved);
  });
}

// ── My Planets ──
async function renderMyPlanets() {
  app.innerHTML = `<div class="page-container"><header class="page-header"><button class="btn btn-ghost" id="back-btn">← Back</button><h2>📁 My Planets</h2><div></div></header><div class="loading">Loading...</div></div>`;
  document.getElementById('back-btn').addEventListener('click', () => navigate('home'));
  const planets = await fetchMyPlanets();
  const list = app.querySelector('.loading');
  if (planets.length === 0) {
    list.innerHTML = '<div class="empty-state"><span class="empty-icon">🪐</span><p>No planets yet!</p><button class="btn btn-primary" id="start-build">Start Terraforming</button></div>';
    document.getElementById('start-build')?.addEventListener('click', () => {
      atmosphere = { oxygen: 0, co2: 0.95, temperature: -40 };
      activeBiomeId = null;
      navigate('terraform');
    });
    return;
  }
  list.className = 'planet-list';
  list.innerHTML = planets.map(p => `
    <div class="planet-card">
      <div class="planet-card-header">
        <h3>${p.name}</h3>
        <span class="planet-badge ${p.is_public ? 'public' : 'private'}">${p.is_public ? '🌌 Public' : '🔒 Private'}</span>
      </div>
      <div class="planet-stats">
        <span>🌡️ Hab: ${Math.round(p.habitability_score)}%</span>
        <span>👥 Pop: ${formatPopulation(p.population)}</span>
        <span>🌙 ${p.moon_count} moons</span>
      </div>
      <div class="planet-card-actions">
        <button class="btn btn-sm btn-cyan" data-load="${p.id}">✏️ Edit</button>
        <button class="btn btn-sm btn-danger" data-delete="${p.id}">🗑️</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('[data-load]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = planets.find(x => x.id === btn.dataset.load);
      if (p?.planet_data) {
        atmosphere = p.atmosphere || { oxygen: 0, co2: 0.95, temperature: -40 };
        activeBiomeId = null;
        // Navigate first, then load data
        navigate('terraform');
        setTimeout(() => {
          if (planetRenderer) {
            planetRenderer.loadFromData(typeof p.planet_data === 'string' ? JSON.parse(p.planet_data) : p.planet_data);
            planetRenderer.updateAtmosphere(atmosphere);
            updateHUD();
          }
        }, 100);
      }
    });
  });
  list.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await deletePlanet(btn.dataset.delete);
      renderMyPlanets();
    });
  });
}

// ── Galaxy ──
async function renderGalaxy() {
  app.innerHTML = `<div class="page-container"><header class="page-header"><button class="btn btn-ghost" id="back-btn">← Back</button><h2>🌌 Galaxy</h2><div></div></header><div class="loading">Loading worlds...</div></div>`;
  document.getElementById('back-btn').addEventListener('click', () => navigate('home'));
  const planets = await fetchPublicPlanets();
  const list = app.querySelector('.loading');
  if (planets.length === 0) {
    list.innerHTML = '<div class="empty-state"><span class="empty-icon">🌌</span><p>No public planets yet. Be the first!</p></div>';
    return;
  }
  // Enrich with ratings + profiles
  const enriched = await Promise.all(planets.map(async p => {
    const rating = await fetchPlanetRatings(p.id);
    const profile = await getUserProfile(p.user_id);
    return { ...p, rating, profile };
  }));
  list.className = 'galaxy-list';
  list.innerHTML = enriched.map(p => `
    <div class="gallery-card">
      <div class="gallery-card-top">
        <span class="gallery-avatar">${p.profile.avatar_emoji}</span>
        <span class="gallery-author">${p.profile.display_name}</span>
      </div>
      <h3 class="gallery-name">${p.name}</h3>
      <div class="planet-stats">
        <span>🌡️ Hab: ${Math.round(p.habitability_score)}%</span>
        <span>👥 ${formatPopulation(p.population)}</span>
        <span>🌙 ${p.moon_count} moons</span>
      </div>
      <div class="gallery-rating">
        <span class="stars">${renderStars(p.rating.avg)}</span>
        <span class="rating-text">${p.rating.avg} (${p.rating.count})</span>
      </div>
      <div class="star-buttons" data-planet="${p.id}">
        ${[1,2,3,4,5].map(s => `<button class="star-btn" data-stars="${s}">${s <= Math.round(p.rating.avg) ? '⭐' : '☆'}</button>`).join('')}
      </div>
      <button class="btn btn-sm btn-ghost" data-view="${p.id}">🔭 View Planet</button>
    </div>
  `).join('');

  // Rating buttons
  list.querySelectorAll('.star-buttons').forEach(group => {
    group.querySelectorAll('.star-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        await ratePlanet(group.dataset.planet, parseInt(btn.dataset.stars));
        showToast('Rated! ⭐');
        renderGalaxy();
      });
    });
  });

  // View planet
  list.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = planets.find(x => x.id === btn.dataset.view);
      if (p?.planet_data) {
        atmosphere = p.atmosphere || { oxygen: 0, co2: 0.95, temperature: -40 };
        activeBiomeId = null;
        navigate('terraform');
        setTimeout(() => {
          if (planetRenderer) {
            planetRenderer.loadFromData(typeof p.planet_data === 'string' ? JSON.parse(p.planet_data) : p.planet_data);
            planetRenderer.updateAtmosphere(atmosphere);
            updateHUD();
          }
        }, 100);
      }
    });
  });
}

function renderStars(avg) {
  let s = '';
  for (let i = 1; i <= 5; i++) s += i <= Math.round(avg) ? '⭐' : '☆';
  return s;
}

// ── Leaderboard ──
async function renderLeaderboard() {
  app.innerHTML = `<div class="page-container"><header class="page-header"><button class="btn btn-ghost" id="back-btn">← Back</button><h2>🏆 Leaderboard</h2><div></div></header><div class="loading">Loading...</div></div>`;
  document.getElementById('back-btn').addEventListener('click', () => navigate('home'));
  const planets = await fetchLeaderboard();
  const list = app.querySelector('.loading');
  if (planets.length === 0) {
    list.innerHTML = '<div class="empty-state"><span class="empty-icon">🏆</span><p>No planets on the leaderboard yet!</p></div>';
    return;
  }
  const enriched = await Promise.all(planets.map(async (p, i) => {
    const rating = await fetchPlanetRatings(p.id);
    const profile = await getUserProfile(p.user_id);
    return { ...p, rating, profile, rank: i + 1 };
  }));
  list.className = 'leaderboard';
  list.innerHTML = enriched.map(p => `
    <div class="leader-row ${p.rank <= 3 ? 'top-' + p.rank : ''}">
      <span class="leader-rank">${p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : '#' + p.rank}</span>
      <span class="leader-avatar">${p.profile.avatar_emoji}</span>
      <span class="leader-name">${p.profile.display_name}</span>
      <span class="leader-score">🌡️ ${Math.round(p.habitability_score)}%</span>
      <span>👥 ${formatPopulation(p.population)}</span>
      <span class="leader-rating">${renderStars(p.rating.avg)} ${p.rating.avg}</span>
    </div>
  `).join('');
}

// ── Render ──
function render() {
  switch (currentView) {
    case 'auth': renderAuth(); break;
    case 'home': renderHome(); break;
    case 'terraform': renderTerraform(); break;
    case 'myplanets': renderMyPlanets(); break;
    case 'galaxy': renderGalaxy(); break;
    case 'leaderboard': renderLeaderboard(); break;
  }
}

// ── Init ──
async function init() {
  try {
    const user = await getSession();
    navigate(user ? 'home' : 'auth');
    onAuthChange((event) => {
      if (event === 'SIGNED_OUT') navigate('auth');
    });
  } catch (e) {
    console.error('Init error:', e);
    navigate('auth');
  }
}

init();