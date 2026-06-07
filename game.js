// ========================================================
// FarmCraft — Full Game Logic
// ========================================================

// ===== CROP DEFINITIONS =====
const CROPS = {
  wheat: {
    name: 'Wheat',
    icon: '🌾',
    growingIcon: '🌱',
    cost: 10,
    growthTime: 3,
    profit: 50,
    season: 'Summer'
  },
  rice: {
    name: 'Rice',
    icon: '🍚',
    growingIcon: '🌿',
    cost: 15,
    growthTime: 4,
    profit: 70,
    season: 'Monsoon'
  },
  sugarcane: {
    name: 'Sugarcane',
    icon: '🎋',
    growingIcon: '🪴',
    cost: 25,
    growthTime: 6,
    profit: 120,
    season: 'Monsoon'
  },
  cotton: {
    name: 'Cotton',
    icon: '☁️',
    growingIcon: '🌿',
    cost: 20,
    growthTime: 5,
    profit: 100,
    season: 'Summer'
  }
};

// ===== WEATHER DEFINITIONS =====
const WEATHER_TYPES = [
  { name: 'Sunny', icon: '☀️', probability: 0.5 },
  { name: 'Rain', icon: '🌧️', probability: 0.3 },
  { name: 'Drought', icon: '🏜️', probability: 0.2 }
];

// ===== CONSTANTS =====
const GRID_SIZE = 5;
const TOTAL_TILES = GRID_SIZE * GRID_SIZE;
const DAY_DURATION_MS = 8000; // 8 seconds per game day
const PROGRESS_INTERVAL_MS = 50; // progress bar update interval
const SEASON_CYCLE_DAYS = 10;
const STARTING_MONEY = 100;
const FAMILY_COST = 5;
const WORKER_COST = 3;
const DAILY_EXPENSES = FAMILY_COST + WORKER_COST;
const LOW_MONEY_THRESHOLD = 20;

// ===== GAME STATE =====
let gameState = {
  grid: [],           // 25 tile objects
  money: STARTING_MONEY,
  day: 1,
  season: 'Summer',
  weather: { name: 'Sunny', icon: '☀️' },
  selectedCrop: 'wheat',
  isPaused: false,
  isGameOver: false,
  totalEarned: 0,
  totalSpent: 0,
  cropsHarvested: 0
};

// Drag planting state
let dragState = {
  isDragging: false,
  plantedDuringDrag: new Set()
};

// Timer references
let dayTimer = null;
let progressTimer = null;
let dayProgressStart = 0;

// ===== DOM REFERENCES =====
const DOM = {
  grid: document.getElementById('farm-grid'),
  money: document.getElementById('money-display'),
  day: document.getElementById('day-display'),
  season: document.getElementById('season-display'),
  weather: document.getElementById('weather-display'),
  progressFill: document.getElementById('day-progress-fill'),
  progressPercent: document.getElementById('day-progress-percent'),
  warningBanner: document.getElementById('warning-banner'),
  warningText: document.getElementById('warning-text'),
  gameOverOverlay: document.getElementById('game-over-overlay'),
  finalStats: document.getElementById('final-stats'),
  logEntries: document.getElementById('log-entries'),
  pauseBtn: document.getElementById('pause-btn')
};


// ========================================================
// INITIALIZATION
// ========================================================

function initGrid() {
  gameState.grid = [];
  for (let i = 0; i < TOTAL_TILES; i++) {
    gameState.grid.push({
      index: i,
      state: 'empty',    // 'empty', 'growing', 'ready', 'dead'
      crop: null,         // crop key: 'wheat', 'rice', 'sugarcane', or 'cotton'
      daysGrown: 0,
      growthTarget: 0
    });
  }
}

function initGame() {
  gameState.money = STARTING_MONEY;
  gameState.day = 1;
  gameState.season = 'Summer';
  gameState.weather = { name: 'Sunny', icon: '☀️' };
  gameState.selectedCrop = 'wheat';
  gameState.isPaused = false;
  gameState.isGameOver = false;
  gameState.totalEarned = 0;
  gameState.totalSpent = 0;
  gameState.cropsHarvested = 0;

  initGrid();
  buildGridDOM();
  render();
  clearLog();
  addLogEntry('🌾 Welcome to FarmCraft! Plant wisely and survive.', 'plant');
  addLogEntry('📅 Day 1 begins — Season: Summer — Weather: ' + gameState.weather.name + ' ' + gameState.weather.icon, 'weather');

  // Highlight default selected crop
  selectCrop('wheat');

  // Start timers
  startTimers();
}


// ========================================================
// GRID DOM CONSTRUCTION
// ========================================================

function buildGridDOM() {
  DOM.grid.innerHTML = '';
  for (let i = 0; i < TOTAL_TILES; i++) {
    const tile = document.createElement('div');
    tile.classList.add('tile', 'empty');
    tile.dataset.index = i;
    tile.id = 'tile-' + i;

    // Click to plant/harvest
    tile.addEventListener('mousedown', function(e) {
      e.preventDefault();
      handleTileAction(i);
      dragState.isDragging = true;
      dragState.plantedDuringDrag = new Set();
      dragState.plantedDuringDrag.add(i);
    });

    // Drag planting
    tile.addEventListener('mouseenter', function() {
      if (dragState.isDragging && !dragState.plantedDuringDrag.has(i)) {
        handleTilePlant(i);
        dragState.plantedDuringDrag.add(i);
      }
    });

    // Touch support for drag planting
    tile.addEventListener('touchstart', function(e) {
      e.preventDefault();
      handleTileAction(i);
      dragState.isDragging = true;
      dragState.plantedDuringDrag = new Set();
      dragState.plantedDuringDrag.add(i);
    });

    DOM.grid.appendChild(tile);
  }
}

// Global mouseup to stop dragging
document.addEventListener('mouseup', function() {
  dragState.isDragging = false;
  dragState.plantedDuringDrag.clear();
});

document.addEventListener('touchend', function() {
  dragState.isDragging = false;
  dragState.plantedDuringDrag.clear();
});

// Touch move handler for drag planting on mobile
DOM.grid.addEventListener('touchmove', function(e) {
  if (!dragState.isDragging) return;
  var touch = e.touches[0];
  var element = document.elementFromPoint(touch.clientX, touch.clientY);
  if (element && element.classList.contains('tile')) {
    var index = parseInt(element.dataset.index);
    if (!dragState.plantedDuringDrag.has(index)) {
      handleTilePlant(index);
      dragState.plantedDuringDrag.add(index);
    }
  }
});


// ========================================================
// TILE ACTIONS
// ========================================================

function handleTileAction(index) {
  if (gameState.isGameOver) return;

  var tile = gameState.grid[index];

  if (tile.state === 'ready') {
    harvestTile(index);
  } else if (tile.state === 'empty') {
    handleTilePlant(index);
  }
  // dead tiles can be clicked to clear
  else if (tile.state === 'dead') {
    tile.state = 'empty';
    tile.crop = null;
    tile.daysGrown = 0;
    tile.growthTarget = 0;
    addLogEntry('🧹 Cleared dead crop at tile ' + (index + 1), 'warning');
    render();
  }
}

function handleTilePlant(index) {
  if (gameState.isGameOver) return;

  var tile = gameState.grid[index];
  if (tile.state !== 'empty') return;

  var cropKey = gameState.selectedCrop;
  var crop = CROPS[cropKey];

  // Check if enough money
  if (gameState.money < crop.cost) {
    // Stop drag planting when money runs out
    dragState.isDragging = false;
    return;
  }

  // Plant the crop
  tile.state = 'growing';
  tile.crop = cropKey;
  tile.daysGrown = 0;
  tile.growthTarget = crop.growthTime;

  gameState.money -= crop.cost;
  gameState.totalSpent += crop.cost;

  addLogEntry('🌱 Planted ' + crop.name + ' at tile ' + (index + 1) + ' (cost ₹' + crop.cost + ')', 'plant');
  render();
}

function harvestTile(index) {
  var tile = gameState.grid[index];
  if (tile.state !== 'ready') return;

  var crop = CROPS[tile.crop];
  gameState.money += crop.profit;
  gameState.totalEarned += crop.profit;
  gameState.cropsHarvested++;

  addLogEntry('💰 Harvested ' + crop.name + ' at tile ' + (index + 1) + ' (+₹' + crop.profit + ')', 'harvest');

  // Reset tile
  tile.state = 'empty';
  tile.crop = null;
  tile.daysGrown = 0;
  tile.growthTarget = 0;

  // Harvest animation
  var tileEl = document.getElementById('tile-' + index);
  if (tileEl) {
    tileEl.classList.add('harvesting');
    setTimeout(function() { tileEl.classList.remove('harvesting'); }, 400);
  }

  render();
}


// ========================================================
// COLLECT ALL
// ========================================================

function collectAll() {
  if (gameState.isGameOver) return;

  var harvestedCount = 0;
  var totalProfit = 0;

  for (var i = 0; i < TOTAL_TILES; i++) {
    var tile = gameState.grid[i];
    if (tile.state === 'ready') {
      var crop = CROPS[tile.crop];
      gameState.money += crop.profit;
      gameState.totalEarned += crop.profit;
      gameState.cropsHarvested++;
      totalProfit += crop.profit;
      harvestedCount++;

      tile.state = 'empty';
      tile.crop = null;
      tile.daysGrown = 0;
      tile.growthTarget = 0;

      // Animation
      var tileEl = document.getElementById('tile-' + i);
      if (tileEl) {
        tileEl.classList.add('harvesting');
        (function(el) {
          setTimeout(function() { el.classList.remove('harvesting'); }, 400);
        })(tileEl);
      }
    }
  }

  if (harvestedCount > 0) {
    addLogEntry('💰 Collected ' + harvestedCount + ' crops (+₹' + totalProfit + ')', 'harvest');
    showNotification('💰 Harvested ' + harvestedCount + ' crops for ₹' + totalProfit + '!');
  }

  render();
}


// ========================================================
// CROP SELECTION
// ========================================================

function selectCrop(cropKey) {
  gameState.selectedCrop = cropKey;

  // Update button UI
  var allBtns = document.querySelectorAll('.crop-btn');
  for (var i = 0; i < allBtns.length; i++) {
    allBtns[i].classList.remove('selected');
  }
  var btn = document.getElementById('btn-' + cropKey);
  if (btn) btn.classList.add('selected');
}


// ========================================================
// DAY / SEASON / WEATHER SYSTEMS
// ========================================================

function nextDay() {
  if (gameState.isGameOver || gameState.isPaused) return;

  // 1. Apply daily expenses
  applyExpenses();

  // 2. Check game over
  if (gameState.money < 0) {
    triggerGameOver();
    return;
  }

  // 3. Advance day counter
  gameState.day++;

  // 4. Update season
  updateSeason();

  // 5. Generate new weather
  updateWeather();

  // 6. Update crop growth (with weather + season effects)
  updateCrops();

  // 7. Check low money warning
  checkWarnings();

  // 8. Log new day
  addLogEntry(
    '📅 Day ' + gameState.day + ' — ' + gameState.season + ' — ' + gameState.weather.name + ' ' + gameState.weather.icon,
    'weather'
  );

  // 9. Re-render
  render();
}

function updateSeason() {
  // Day 1-5 → Summer, Day 6-10 → Monsoon, then repeat
  var dayInCycle = ((gameState.day - 1) % SEASON_CYCLE_DAYS) + 1;
  gameState.season = dayInCycle <= 5 ? 'Summer' : 'Monsoon';
}

function updateWeather() {
  var roll = Math.random();
  var cumulative = 0;
  for (var i = 0; i < WEATHER_TYPES.length; i++) {
    var w = WEATHER_TYPES[i];
    cumulative += w.probability;
    if (roll <= cumulative) {
      gameState.weather = { name: w.name, icon: w.icon };
      return;
    }
  }
  // Fallback
  gameState.weather = { name: 'Sunny', icon: '☀️' };
}

function updateCrops() {
  for (var i = 0; i < TOTAL_TILES; i++) {
    var tile = gameState.grid[i];
    if (tile.state !== 'growing') continue;

    var crop = CROPS[tile.crop];
    var growthThisDay = 1; // base growth

    // --- Weather effects ---
    if (gameState.weather.name === 'Rain') {
      // Rain: +2 growth bonus
      growthThisDay += 2;
    } else if (gameState.weather.name === 'Drought') {
      // Drought: 40% chance crop doesn't grow, 20% chance crop dies
      var droughtRoll = Math.random();
      if (droughtRoll < 0.20) {
        // Crop dies
        tile.state = 'dead';
        tile.daysGrown = 0;
        addLogEntry('💀 ' + crop.name + ' at tile ' + (i + 1) + ' died from drought!', 'warning');
        continue;
      } else if (droughtRoll < 0.60) {
        // Doesn't grow this day
        growthThisDay = 0;
      }
    }

    // --- Season penalty ---
    // 50% chance to skip growth if planted in wrong season
    if (crop.season !== gameState.season) {
      if (Math.random() < 0.5) {
        growthThisDay = 0;
      }
    }

    // Apply growth
    tile.daysGrown += growthThisDay;

    // Check if ready to harvest
    if (tile.daysGrown >= tile.growthTarget) {
      tile.state = 'ready';
    }
  }
}


// ========================================================
// EXPENSES & WARNINGS
// ========================================================

function applyExpenses() {
  gameState.money -= DAILY_EXPENSES;
  gameState.totalSpent += DAILY_EXPENSES;
  addLogEntry('📉 Daily expenses: -₹' + DAILY_EXPENSES + ' (Family ₹' + FAMILY_COST + ' + Workers ₹' + WORKER_COST + ')', 'expense');
}

function checkWarnings() {
  if (gameState.money >= 0 && gameState.money < LOW_MONEY_THRESHOLD) {
    DOM.warningBanner.classList.add('visible');
    DOM.warningText.textContent = '⚠️ Low funds! Only ₹' + gameState.money + ' left. Harvest crops quickly!';
    addLogEntry('⚠️ WARNING: Money is low (₹' + gameState.money + ')', 'warning');
  } else {
    DOM.warningBanner.classList.remove('visible');
  }
}


// ========================================================
// GAME OVER
// ========================================================

function triggerGameOver() {
  gameState.isGameOver = true;
  stopTimers();

  DOM.finalStats.innerHTML =
    'Survived ' + gameState.day + ' days<br>' +
    'Earned ₹' + gameState.totalEarned + ' | Spent ₹' + gameState.totalSpent + '<br>' +
    'Crops harvested: ' + gameState.cropsHarvested;

  DOM.gameOverOverlay.classList.add('visible');
}

function restartGame() {
  DOM.gameOverOverlay.classList.remove('visible');
  DOM.warningBanner.classList.remove('visible');
  stopTimers();
  initGame();
}


// ========================================================
// PAUSE / RESUME
// ========================================================

function togglePause() {
  if (gameState.isGameOver) return;

  gameState.isPaused = !gameState.isPaused;

  if (gameState.isPaused) {
    stopTimers();
    DOM.pauseBtn.innerHTML = '▶️ Resume';
    addLogEntry('⏸️ Game paused', 'weather');
  } else {
    startTimers();
    DOM.pauseBtn.innerHTML = '⏸️ Pause';
    addLogEntry('▶️ Game resumed', 'weather');
  }
}


// ========================================================
// TIMERS
// ========================================================

function startTimers() {
  stopTimers(); // clear any existing

  // Day cycle timer
  dayTimer = setInterval(function() {
    nextDay();
  }, DAY_DURATION_MS);

  // Progress bar animation
  dayProgressStart = Date.now();
  progressTimer = setInterval(function() {
    updateProgressBar();
  }, PROGRESS_INTERVAL_MS);
}

function stopTimers() {
  if (dayTimer) {
    clearInterval(dayTimer);
    dayTimer = null;
  }
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
}

function updateProgressBar() {
  if (gameState.isPaused || gameState.isGameOver) return;

  var elapsed = Date.now() - dayProgressStart;
  var progress = Math.min((elapsed % DAY_DURATION_MS) / DAY_DURATION_MS, 1);
  var percent = Math.round(progress * 100);

  DOM.progressFill.style.width = percent + '%';
  DOM.progressPercent.textContent = percent + '%';

  // Reset progress start when a day completes
  if (elapsed >= DAY_DURATION_MS) {
    dayProgressStart = Date.now();
  }
}


// ========================================================
// RENDERING
// ========================================================

function render() {
  renderStats();
  renderGrid();
}

function renderStats() {
  // Money
  DOM.money.textContent = '₹' + gameState.money;
  if (gameState.money < LOW_MONEY_THRESHOLD) {
    DOM.money.style.color = '#ef4444';
  } else {
    DOM.money.style.color = '';
  }

  // Day
  DOM.day.textContent = 'Day ' + gameState.day;

  // Season
  DOM.season.textContent = gameState.season;
  DOM.season.className = 'stat-value';
  if (gameState.season === 'Summer') {
    DOM.season.classList.add('season-summer');
  } else {
    DOM.season.classList.add('season-monsoon');
  }

  // Weather
  DOM.weather.textContent = gameState.weather.name + ' ' + gameState.weather.icon;
}

function renderGrid() {
  for (var i = 0; i < TOTAL_TILES; i++) {
    var tileData = gameState.grid[i];
    var tileEl = document.getElementById('tile-' + i);
    if (!tileEl) continue;

    // Reset classes
    tileEl.className = 'tile';
    tileEl.innerHTML = '';

    switch (tileData.state) {
      case 'empty':
        tileEl.classList.add('empty');
        break;

      case 'growing':
        tileEl.classList.add('growing');
        var cropG = CROPS[tileData.crop];
        var daysLeft = tileData.growthTarget - tileData.daysGrown;

        tileEl.innerHTML =
          '<span class="tile-icon">' + cropG.growingIcon + '</span>' +
          '<span class="tile-label">' + cropG.name + '</span>' +
          '<span class="tile-days">' + Math.max(0, daysLeft) + 'd left</span>';
        break;

      case 'ready':
        tileEl.classList.add('ready');
        var cropR = CROPS[tileData.crop];

        tileEl.innerHTML =
          '<span class="tile-icon">💰</span>' +
          '<span class="tile-label">' + cropR.name + '</span>' +
          '<span class="tile-days">+₹' + cropR.profit + '</span>';
        break;

      case 'dead':
        tileEl.classList.add('dead');
        tileEl.innerHTML =
          '<span class="tile-icon">💀</span>' +
          '<span class="tile-label">Dead</span>' +
          '<span class="tile-days">Click to clear</span>';
        break;
    }
  }
}


// ========================================================
// EVENT LOG
// ========================================================

function addLogEntry(message, type) {
  type = type || '';
  var entry = document.createElement('div');
  entry.classList.add('log-entry');
  if (type) entry.classList.add(type);
  entry.textContent = '[Day ' + gameState.day + '] ' + message;

  DOM.logEntries.prepend(entry);

  // Keep log manageable (max 50 entries)
  while (DOM.logEntries.children.length > 50) {
    DOM.logEntries.removeChild(DOM.logEntries.lastChild);
  }
}

function clearLog() {
  DOM.logEntries.innerHTML = '';
}


// ========================================================
// NOTIFICATIONS
// ========================================================

function showNotification(message) {
  var notif = document.createElement('div');
  notif.classList.add('float-notification');
  notif.textContent = message;
  document.body.appendChild(notif);

  setTimeout(function() {
    if (notif.parentElement) {
      notif.parentElement.removeChild(notif);
    }
  }, 3000);
}


// ========================================================
// START THE GAME
// ========================================================

initGame();
