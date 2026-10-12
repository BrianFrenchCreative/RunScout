/**
 * RunScout - Background Service Worker
 *
 * Manages tab-specific side panel activation:
 * - Enables side panel and toolbar action exclusively on store.playstation.com tabs
 * - Disables side panel and toolbar action on all non-PlayStation tabs
 * - Opens the side panel on action click for the active PlayStation tab
 */

const PS_STORE_HOST = 'store.playstation.com';
const DRY_RUN = false;

// Configure the side panel to open when clicking the toolbar action icon
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('Error setting side panel behavior:', error));

// Disable toolbar action globally by default so it is only active on store.playstation.com
chrome.action.disable().catch(() => {});

/**
 * Configures side panel options for a specific tab based on its URL:
 * - Enables with sidebar.html for store.playstation.com tabs
 * - Disables on all other tabs
 */
async function configureSidePanelForTab(tabId, url) {
  if (!tabId) return;

  try {
    if (url && url.includes(PS_STORE_HOST)) {
      await chrome.sidePanel.setOptions({
        tabId,
        path: 'sidebar.html',
        enabled: true
      });
      await chrome.action.enable(tabId);
    } else {
      await chrome.sidePanel.setOptions({
        tabId,
        enabled: false
      });
      await chrome.action.disable(tabId);
    }
  } catch (error) {
    // Ignore errors for tabs that closed during async call
  }
}

/**
 * Scan all open tabs to initialize side panel states:
 * - PlayStation Store tabs are enabled
 * - Non-PlayStation tabs are disabled
 */
function syncAllOpenTabs() {
  chrome.tabs.query({}, (tabs) => {
    if (chrome.runtime.lastError || !tabs) return;
    for (const tab of tabs) {
      if (!tab.id) continue;
      const url = tab.url || tab.pendingUrl || '';
      configureSidePanelForTab(tab.id, url);
    }
  });
}

// Sync on service worker start
syncAllOpenTabs();

// When a tab navigates or updates its URL
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = tab.url || changeInfo.url;
  if (url) {
    configureSidePanelForTab(tabId, url);
  }
});

// When switching active tabs
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab) return;
    const url = tab.url || tab.pendingUrl || '';
    if (url) {
      configureSidePanelForTab(tabId, url);
    }
  } catch (err) {}
});

// Sync on extension install or update
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error('Error setting sidePanel behavior on install:', error));

  syncAllOpenTabs();
});

/**
 * Speedrun.com Official API Compliance & Autonomous Rate Limiting:
 * 1. DeclarativeNetRequest injects optional X-API-Key (browser default User-Agent preserved).
 * 2. If Speedrun.com API key is provided: 28 req/min, 2000ms spacing, 7-call burst breather (5s).
 * 3. If unauthenticated: Safe 6 req/min ceiling, 4000ms spacing, 4-call burst breather (8s).
 * 4. Never sends `&_bulk=yes` on title lookups.
 */

let currentSpeedrunApiKey = '';

function getEffectiveRateLimits() {
  if (currentSpeedrunApiKey) {
    return {
      minIntervalMs: 2000,
      maxPerMinute: 28,
      breatherThreshold: 7,
      breatherDurationMs: 5000,
      isAuthenticated: true
    };
  }
  return {
    minIntervalMs: 4000,
    maxPerMinute: 6,
    breatherThreshold: 4,
    breatherDurationMs: 8000,
    isAuthenticated: false
  };
}

async function updateDeclarativeNetRules(apiKey = '') {
  if (!chrome.declarativeNetRequest) return;
  try {
    const rulesToAdd = [];

    if (apiKey && typeof apiKey === 'string' && apiKey.trim()) {
      rulesToAdd.push({
        id: 1002,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [
            {
              header: 'X-API-Key',
              operation: 'set',
              value: apiKey.trim()
            }
          ]
        },
        condition: {
          urlFilter: '||speedrun.com/api/',
          resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest', 'other']
        }
      });
    }

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1001, 1002],
      addRules: rulesToAdd
    });
    console.log('[RunScout] DeclarativeNetRequest rules updated (API Key present:', Boolean(apiKey), ')');
  } catch (err) {
    console.warn('[RunScout] Error registering declarativeNetRequest rules:', err);
  }
}

// Initialize API key and rules from storage
chrome.storage.local.get({ speedrunApiKey: '' }, (res) => {
  currentSpeedrunApiKey = (res && typeof res.speedrunApiKey === 'string') ? res.speedrunApiKey.trim() : '';
  updateDeclarativeNetRules(currentSpeedrunApiKey);
});

// Reactively update when user changes API key in Settings
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.speedrunApiKey) {
    currentSpeedrunApiKey = typeof changes.speedrunApiKey.newValue === 'string' ? changes.speedrunApiKey.newValue.trim() : '';
    updateDeclarativeNetRules(currentSpeedrunApiKey);
    broadcastHeatUpdate();
  }
});

let lastRequestTimestamp = 0;
let requestTimestamps = [];
let cooldownUntilTimestamp = 0;
let consecutiveCallCount = 0;
let fetchQueuePromise = Promise.resolve();

// Initialize timestamps from storage if present
chrome.storage.local.get({ requestTimestamps: [] }, (res) => {
  if (res && Array.isArray(res.requestTimestamps)) {
    const now = Date.now();
    requestTimestamps = res.requestTimestamps.filter((t) => (now - t) < 60000);
  }
});

function cleanupRequestTimestamps() {
  const now = Date.now();
  requestTimestamps = requestTimestamps.filter((t) => (now - t) < 60000);
  return requestTimestamps;
}

/**
 * Persistent API Diagnostics & Request Logger
 * Schema: { requestsToday: 0, rateLimitsToday: 0, lastResetDate: "YYYY-MM-DD", logBuffer: [] }
 */
function getLocalDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

let apiDiagnostics = {
  requestsToday: 0,
  rateLimitsToday: 0,
  lastResetDate: getLocalDateString(),
  hourlyVolume: [],
  minuteVolume: [],
  logBuffer: []
};

/**
 * Ensures minuteVolume (60 buckets) and hourlyVolume (24 buckets) are populated,
 * aligned to current timestamps, and zeroes out/prunes expired buckets.
 */
function cleanupVolumeBuckets(diagnostics) {
  if (!diagnostics) return diagnostics;
  const now = Date.now();
  const currentMinuteTs = Math.floor(now / 60000) * 60000;
  const currentHourTs = Math.floor(now / 3600000) * 3600000;

  // 1. Minute Volume (length 60: 59 mins ago -> current minute)
  const minuteMap = new Map();
  if (Array.isArray(diagnostics.minuteVolume)) {
    for (const b of diagnostics.minuteVolume) {
      if (b && typeof b.timestamp === 'number' && typeof b.count === 'number') {
        if (currentMinuteTs - b.timestamp < 60 * 60000 && b.timestamp <= currentMinuteTs) {
          minuteMap.set(b.timestamp, (minuteMap.get(b.timestamp) || 0) + b.count);
        }
      }
    }
  }
  const cleanMinuteVolume = [];
  for (let i = 59; i >= 0; i--) {
    const ts = currentMinuteTs - (i * 60000);
    cleanMinuteVolume.push({
      timestamp: ts,
      count: minuteMap.get(ts) || 0
    });
  }
  diagnostics.minuteVolume = cleanMinuteVolume;

  // 2. Hourly Volume (length 24: 23 hours ago -> current hour)
  const hourMap = new Map();
  if (Array.isArray(diagnostics.hourlyVolume)) {
    for (const b of diagnostics.hourlyVolume) {
      if (b && typeof b.timestamp === 'number' && typeof b.count === 'number') {
        if (currentHourTs - b.timestamp < 24 * 3600000 && b.timestamp <= currentHourTs) {
          hourMap.set(b.timestamp, (hourMap.get(b.timestamp) || 0) + b.count);
        }
      }
    }
  }
  const cleanHourlyVolume = [];
  for (let i = 23; i >= 0; i--) {
    const ts = currentHourTs - (i * 3600000);
    cleanHourlyVolume.push({
      timestamp: ts,
      count: hourMap.get(ts) || 0
    });
  }
  diagnostics.hourlyVolume = cleanHourlyVolume;
  return diagnostics;
}

// Initialize apiDiagnostics from storage
chrome.storage.local.get({ apiDiagnostics: null }, (res) => {
  const today = getLocalDateString();
  if (res && res.apiDiagnostics && typeof res.apiDiagnostics === 'object') {
    const stored = res.apiDiagnostics;
    apiDiagnostics = {
      requestsToday: stored.lastResetDate !== today ? 0 : (Number(stored.requestsToday) || 0),
      rateLimitsToday: stored.lastResetDate !== today ? 0 : (Number(stored.rateLimitsToday) || 0),
      lastResetDate: today,
      hourlyVolume: Array.isArray(stored.hourlyVolume) ? stored.hourlyVolume : [],
      minuteVolume: Array.isArray(stored.minuteVolume) ? stored.minuteVolume : [],
      logBuffer: Array.isArray(stored.logBuffer) ? stored.logBuffer : []
    };
    cleanupVolumeBuckets(apiDiagnostics);
    chrome.storage.local.set({ apiDiagnostics });
  } else {
    apiDiagnostics = {
      requestsToday: 0,
      rateLimitsToday: 0,
      lastResetDate: today,
      hourlyVolume: [],
      minuteVolume: [],
      logBuffer: []
    };
    cleanupVolumeBuckets(apiDiagnostics);
    chrome.storage.local.set({ apiDiagnostics });
  }
});

function checkAndResetDailyDiagnostics() {
  const today = getLocalDateString();
  if (apiDiagnostics.lastResetDate !== today) {
    apiDiagnostics.requestsToday = 0;
    apiDiagnostics.rateLimitsToday = 0;
    apiDiagnostics.lastResetDate = today;
  }
}

let currentRateLimitState = { isThrottled: false, reason: null, secondsRemaining: 0, message: '' };

function broadcastRateLimitStatus(status) {
  currentRateLimitState = { ...status };
  try {
    chrome.runtime.sendMessage({
      action: 'API_RATE_LIMIT_STATUS',
      ...status
    }).catch(() => {});
  } catch (e) {}
}

function broadcastHeatUpdate() {
  cleanupRequestTimestamps();
  const count = requestTimestamps.length;
  const limits = getEffectiveRateLimits();
  try {
    chrome.runtime.sendMessage({
      action: 'API_HEAT_UPDATE',
      count,
      max: limits.maxPerMinute,
      hasApiKey: limits.isAuthenticated
    }).catch(() => {});
  } catch (e) {}
}

/**
 * Smart Rate Limiter Slot Reservation:
 * 1. Enforces active 429 / WAF cooldown lock if any previous request got rate limited.
 * 2. Enforces autonomous Burst Breather after consecutive requests to refresh Cloudflare token bucket.
 * 3. Checks minimum inter-request interval (3000ms anonymous, 600ms authenticated).
 * 4. Checks rolling 60s capacity (8 req/min anonymous, 80 req/min authenticated). If full, pauses and broadcasts countdown.
 */
async function acquireRateLimitSlot() {
  while (true) {
    const limits = getEffectiveRateLimits();
    const now = Date.now();

    // 1. Enforce active 429 / WAF cooldown lock
    if (now < cooldownUntilTimestamp) {
      const waitMs = cooldownUntilTimestamp - now;
      const totalSecs = Math.ceil(waitMs / 1000);
      broadcastRateLimitStatus({
        isThrottled: true,
        reason: '429',
        secondsRemaining: totalSecs,
        message: `Rate limited (429) — cooling down (${totalSecs}s)...`
      });
      await new Promise((r) => setTimeout(r, Math.min(1000, waitMs)));
      continue;
    }

    // 2. Enforce autonomous Burst Breather after consecutive requests
    if (consecutiveCallCount >= limits.breatherThreshold) {
      consecutiveCallCount = 0;
      const breatherSecs = Math.ceil(limits.breatherDurationMs / 1000);
      console.log(`[RunScout] Taking autonomous breather pause (${breatherSecs}s) to refresh Cloudflare token bucket...`);
      for (let sec = breatherSecs; sec > 0; sec--) {
        broadcastRateLimitStatus({
          isThrottled: true,
          reason: 'breather',
          secondsRemaining: sec,
          message: `API breather — cooling down (${sec}s)...`
        });
        await new Promise((r) => setTimeout(r, 1000));
      }
      broadcastRateLimitStatus({
        isThrottled: false,
        reason: null,
        secondsRemaining: 0,
        message: 'Resuming queue...'
      });
    }

    // 3. Enforce minimum inter-request interval (burst prevention: minIntervalMs)
    const elapsedSinceLast = Date.now() - lastRequestTimestamp;
    if (elapsedSinceLast < limits.minIntervalMs) {
      const waitInterval = limits.minIntervalMs - elapsedSinceLast;
      await new Promise((r) => setTimeout(r, waitInterval));
    }

    // 4. Enforce rolling 60-second window capacity (maxPerMinute)
    cleanupRequestTimestamps();
    if (requestTimestamps.length < limits.maxPerMinute) {
      break;
    }
    const oldestTimestamp = requestTimestamps[0] || Date.now();
    const waitMs = Math.max(100, (oldestTimestamp + 60000) - Date.now() + 100);
    const totalSecs = Math.ceil(waitMs / 1000);
    console.log(`[RunScout] Rate limit ceiling reached (${requestTimestamps.length}/${limits.maxPerMinute}). Pausing queue for ${waitMs}ms...`);
    broadcastHeatUpdate();

    // Broadcast live countdown ticks every second so UI displays active status
    for (let sec = totalSecs; sec > 0; sec--) {
      broadcastRateLimitStatus({
        isThrottled: true,
        reason: 'ceiling',
        secondsRemaining: sec,
        message: `API pacing (${limits.maxPerMinute}/min) — waiting ${sec}s...`
      });
      await new Promise((r) => setTimeout(r, Math.min(1000, waitMs)));
    }
    broadcastRateLimitStatus({
      isThrottled: false,
      reason: null,
      secondsRemaining: 0,
      message: 'Resuming queue...'
    });
  }
}

/**
 * Executes a fetch to Speedrun.com under the sequential rolling-window rate limiter.
 * All requests are chained through fetchQueuePromise so only ONE request executes at any time.
 */
async function rateLimitedFetch(url, timeoutMs = 7000, maxRetries = 2, gameTitle = '') {
  const task = async () => {
    return await executeRateLimitedFetch(url, timeoutMs, maxRetries, gameTitle);
  };
  const chained = fetchQueuePromise.then(task, task);
  fetchQueuePromise = chained.catch(() => {});
  return chained;
}

async function executeRateLimitedFetch(url, timeoutMs = 7000, maxRetries = 2, gameTitle = '') {
  let cleanTitle = gameTitle;
  if (!cleanTitle && typeof url === 'string') {
    try {
      const parsedUrl = new URL(url);
      cleanTitle = parsedUrl.searchParams.get('name') || '';
      if (!cleanTitle && url.includes('/games/')) {
        const match = url.match(/\/games\/([^\/]+)/);
        cleanTitle = match ? decodeURIComponent(match[1]) : 'Speedrun API';
      }
    } catch (e) {
      cleanTitle = 'Speedrun API';
    }
  }
  if (!cleanTitle) cleanTitle = 'Speedrun API';

  let attempt = 0;
  while (attempt <= maxRetries) {
    await acquireRateLimitSlot();

    // 1. Check lastResetDate against current local date and increment requestsToday
    checkAndResetDailyDiagnostics();
    apiDiagnostics.requestsToday++;

    // Increment count for current minute and current hour
    cleanupVolumeBuckets(apiDiagnostics);
    if (apiDiagnostics.minuteVolume.length > 0) {
      apiDiagnostics.minuteVolume[apiDiagnostics.minuteVolume.length - 1].count++;
    }
    if (apiDiagnostics.hourlyVolume.length > 0) {
      apiDiagnostics.hourlyVolume[apiDiagnostics.hourlyVolume.length - 1].count++;
    }

    // Record request timestamp in rolling window
    const now = Date.now();
    lastRequestTimestamp = now;
    requestTimestamps.push(now);
    chrome.storage.local.set({ requestTimestamps });
    broadcastHeatUpdate();

    const fetchStart = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const reqHeaders = { 'Accept': 'application/json' };
      if (currentSpeedrunApiKey) {
        reqHeaders['X-API-Key'] = currentSpeedrunApiKey;
      }
      let res;
      if (DRY_RUN) {
        console.log(`[DRY RUN FETCH] - ${url} at ${Date.now()}`);
        res = {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ data: [] }),
          text: async () => JSON.stringify({ data: [] })
        };
      } else {
        res = await fetch(url, { headers: reqHeaders, signal: controller.signal });
      }
      clearTimeout(timer);
      const fetchDuration = Date.now() - fetchStart;

      // Check for 429 Too Many Requests (or 420)
      const isRateLimited = (res.status === 429 || res.status === 420);
      let retryValue = null;
      if (isRateLimited) {
        apiDiagnostics.rateLimitsToday++;
        const retryHeader = res.headers.get('Retry-After');
        if (retryHeader) {
          const parsed = parseInt(retryHeader, 10);
          retryValue = !isNaN(parsed) ? parsed : retryHeader;
        }
      }

      // Construct log object for the request
      const logEntry = {
        time: new Date().toLocaleTimeString(),
        game: cleanTitle,
        status: res.status,
        retryAfter: retryValue,
        durationMs: fetchDuration
      };

      // unshift() into logBuffer array and enforce maximum length of 50
      apiDiagnostics.logBuffer.unshift(logEntry);
      if (apiDiagnostics.logBuffer.length > 50) {
        apiDiagnostics.logBuffer.pop();
      }
      chrome.storage.local.set({ apiDiagnostics });

      if (isRateLimited) {
        let pauseSeconds = 15;
        if (typeof retryValue === 'number' && retryValue > 0) {
          pauseSeconds = retryValue;
        }
        cooldownUntilTimestamp = Date.now() + (pauseSeconds * 1000);
        console.warn(`[RunScout] Rate limited (${res.status}) on ${url}. Pausing queue for ${pauseSeconds}s (Retry-After)...`);
        broadcastHeatUpdate();

        // Broadcast active countdown to sidebar and content scripts
        for (let sec = pauseSeconds; sec > 0; sec--) {
          broadcastRateLimitStatus({
            isThrottled: true,
            reason: '429',
            secondsRemaining: sec,
            message: `Rate limited (429) — cooling down (${sec}s)...`
          });
          await new Promise((r) => setTimeout(r, 1000));
        }

        cooldownUntilTimestamp = 0;
        broadcastRateLimitStatus({
          isThrottled: false,
          reason: null,
          secondsRemaining: 0,
          message: 'Resuming queue...'
        });

        // If Cloudflare gave a severe ban (> 120s, e.g. 600s), cease retrying in background
        if (pauseSeconds > 120) {
          return res;
        }

        attempt++;
        if (attempt > maxRetries) {
          return res; // Cease retrying to avoid extending IP ban
        }
        continue;
      }

      consecutiveCallCount++;
      return res;
    } catch (err) {
      const fetchDuration = Date.now() - fetchStart;
      const logEntry = {
        time: new Date().toLocaleTimeString(),
        game: cleanTitle,
        status: err.name === 'AbortError' ? 408 : 0,
        retryAfter: null,
        durationMs: fetchDuration
      };
      apiDiagnostics.logBuffer.unshift(logEntry);
      if (apiDiagnostics.logBuffer.length > 50) {
        apiDiagnostics.logBuffer.pop();
      }
      chrome.storage.local.set({ apiDiagnostics });

      if (attempt < maxRetries && err.name !== 'AbortError') {
        attempt++;
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Generates an alternative title variant by swapping Arabic digits (2-20)
 * and Roman numerals (II-XX) to handle discrepancies like "Ninja Gaiden 2 Black" vs "Ninja Gaiden II Black".
 */
function getNumeralVariant(title) {
  if (!title || typeof title !== 'string') return null;

  const arabicToRoman = {
    '2': 'II', '3': 'III', '4': 'IV', '5': 'V',
    '6': 'VI', '7': 'VII', '8': 'VIII', '9': 'IX', '10': 'X',
    '11': 'XI', '12': 'XII', '13': 'XIII', '14': 'XIV', '15': 'XV', '16': 'XVI',
    '17': 'XVII', '18': 'XVIII', '19': 'XIX', '20': 'XX'
  };

  const romanToArabic = {
    'XVIII': '18', 'XVII': '17', 'XVI': '16', 'XV': '15', 'XIV': '14',
    'XIII': '13', 'XII': '12', 'XI': '11', 'VIII': '8', 'VII': '7',
    'VI': '6', 'IV': '4', 'IX': '9', 'III': '3', 'II': '2', 'XX': '20',
    'XIX': '19', 'X': '10', 'V': '5'
  };

  // 1. Try converting Arabic digits to Roman numerals (e.g. '2' -> 'II')
  const toRoman = title.replace(/\b([2-9]|1[0-9]|20)\b/g, (m) => arabicToRoman[m] || m);
  if (toRoman !== title) return toRoman;

  // 2. Try converting Roman numerals to Arabic digits (e.g. 'II' -> '2')
  const toArabic = title.replace(/\b(XVIII|XVII|XVI|XV|XIV|XIII|XII|XI|XX|XIX|VIII|VII|VI|IV|IX|III|II|X|V)\b/gi, (m) => romanToArabic[m.toUpperCase()] || m);
  if (toArabic !== title) return toArabic;

  return null;
}

/**
 * Strips marketing bundles and edition suffixes (e.g. "Deluxe Edition", "Definitive Edition", "Director's Cut")
 * to serve as a secondary fallback query if the specific edition does not exist on Speedrun.com.
 */
function stripEditionSuffix(title) {
  if (!title || typeof title !== 'string') return '';
  let cleaned = title.trim();

  // Strip dash-separated marketing bundles / editions / platform versions
  cleaned = cleaned.replace(/\s+[-–—:]\s+.*?(?:Bundle|Edition|Collection|Director['’\u2019]?s\s*Cut|Upgrade|Pack|Version)\s*$/i, '');

  // Strip trailing Edition / Director's Cut / Collection phrases with optional edition adjectives
  const editionAdj = '(?:(?:Digital\\s+|Super\\s+)?(?:Deluxe|Standard|Premium|Ultimate|Complete|Special|Collector[\'’\\u2019]?s|Gold|Silver|Launch|Day\\s+One|Game\\s+of\\s+the\\s+Year|GOTY|Anniversary|Cross-Gen|Enhanced|Definitive|Total\\s+Mayhem)\\s+)';
  cleaned = cleaned.replace(new RegExp(`\\s+${editionAdj}?(?:Bundle|Edition|Collection|Director['’\\u2019]?s\\s*Cut)\\s*$`, 'i'), '');

  // Standalone trailing Director's Cut / Edition / Bundle
  cleaned = cleaned.replace(/\s+Director['’\u2019]?s\s*Cut\s*$/i, '');
  cleaned = cleaned.replace(/\s+(?:Bundle|Edition)\s*$/i, '');

  // Clean dangling hyphens, colons, or commas
  cleaned = cleaned.replace(/[-–—:,]\s*$/, '').trim();

  return cleaned || title.trim();
}

const memoryQueryCache = new Map();

async function executeSpeedrunQuery(title, checkRecords = false) {
  if (!title || typeof title !== 'string' || !title.trim()) {
    return { status: 'unverified' };
  }

  try {
    const searchUrl = `https://www.speedrun.com/api/v1/games?name=${encodeURIComponent(title.trim())}&max=5`;
    const searchRes = await rateLimitedFetch(searchUrl, 7000, 2, title.trim());
    if (!searchRes || !searchRes.ok) {
      return { status: 'unverified', statusCode: searchRes ? searchRes.status : 0 };
    }

    const searchData = await searchRes.json();
    if (!searchData || !Array.isArray(searchData.data) || searchData.data.length === 0) {
      return { status: 'unverified' };
    }

    let game = searchData.data[0];
    const targetLower = title.trim().toLowerCase();

    // 1. First pass: Exact case-insensitive match
    for (const g of searchData.data) {
      const gName = (g.names && g.names.international) ? g.names.international.toLowerCase() : '';
      if (gName === targetLower) {
        game = g;
        break;
      }
    }

    // 2. Second pass: Match ignoring punctuation (colons, hyphens, commas) e.g. "DmC Devil May Cry" vs "DmC: Devil May Cry"
    if ((game.names?.international || '').toLowerCase() !== targetLower) {
      const targetPunctClean = targetLower.replace(/[:\-–—,\.]/g, '').replace(/\s+/g, ' ').trim();
      for (const g of searchData.data) {
        const gName = (g.names && g.names.international) ? g.names.international.toLowerCase() : '';
        const gClean = gName.replace(/[:\-–—,\.]/g, '').replace(/\s+/g, ' ').trim();
        if (gClean === targetPunctClean) {
          game = g;
          break;
        }
      }
    }

    const gameId = game.id;
    if (!gameId) {
      return { status: 'unverified' };
    }

    const weblink = game.weblink || '';
    const matchedTitle = (game.names && game.names.international) ? game.names.international : title;

    // Fast Scout mode: If checkRecords is false, matched game is immediately returned as has_runs (0 extra API queries!)
    if (!checkRecords) {
      return {
        status: 'has_runs',
        weblink,
        matchedTitle
      };
    }

    const recordsUrl = `https://www.speedrun.com/api/v1/games/${encodeURIComponent(gameId)}/records?top=1`;
    const recordsRes = await rateLimitedFetch(recordsUrl, 7000, 2, `${matchedTitle || title} (Records)`);
    if (!recordsRes || !recordsRes.ok) {
      return { status: 'untouched', weblink, matchedTitle };
    }

    const recordsData = await recordsRes.json();
    let hasRuns = false;
    if (recordsData && Array.isArray(recordsData.data)) {
      for (const cat of recordsData.data) {
        if (cat && Array.isArray(cat.runs) && cat.runs.length > 0) {
          hasRuns = true;
          break;
        }
      }
    }

    return {
      status: hasRuns ? 'has_runs' : 'untouched',
      weblink,
      matchedTitle
    };
  } catch (err) {
    console.warn('[RunScout] Error querying Speedrun.com API for "' + title + '":', err);
    return { status: 'unverified', error: String(err) };
  }
}

async function querySpeedrunStatus(cleanTitle, checkRecords = false) {
  if (!cleanTitle || typeof cleanTitle !== 'string' || !cleanTitle.trim()) {
    return { status: 'unverified' };
  }

  // Pre-strip marketing edition suffixes upfront so the single search targets the canonical game
  const normalizedTitle = stripEditionSuffix(cleanTitle.trim());
  const cacheKey = `${normalizedTitle.toLowerCase()}::${checkRecords ? 'deep' : 'fast'}`;
  if (memoryQueryCache.has(cacheKey)) {
    return memoryQueryCache.get(cacheKey);
  }

  // Fast single-query search: exactly ONE search request to Speedrun.com.
  // Never run multi-pass fallbacks during bulk scouting to avoid burning API rate limits or triggering 429s.
  const result = await executeSpeedrunQuery(normalizedTitle, checkRecords);
  memoryQueryCache.set(cacheKey, result);
  return result;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'FETCH_SPEEDRUN_STATUS') {
    querySpeedrunStatus(message.cleanTitle, Boolean(message.checkRecords))
      .then((result) => {
        sendResponse({
          success: true,
          status: result.status,
          weblink: result.weblink || '',
          matchedTitle: result.matchedTitle || '',
          error: result.error || null
        });
      })
      .catch((error) => {
        sendResponse({ success: false, status: 'unverified', error: String(error) });
      });
    return true; // Keep message channel open for async response
  }

  if (message && (message.action === 'GET_API_HEAT' || message.type === 'GET_API_HEAT')) {
    cleanupRequestTimestamps();
    const limits = getEffectiveRateLimits();
    sendResponse({
      count: requestTimestamps.length,
      max: limits.maxPerMinute,
      hasApiKey: limits.isAuthenticated
    });
    return true;
  }

  if (message && (message.action === 'GET_RATE_LIMIT_STATUS' || message.type === 'GET_RATE_LIMIT_STATUS')) {
    sendResponse({ ...currentRateLimitState });
    return true;
  }

  if (message && (message.action === 'GET_API_DIAGNOSTICS' || message.type === 'GET_API_DIAGNOSTICS')) {
    checkAndResetDailyDiagnostics();
    cleanupVolumeBuckets(apiDiagnostics);
    sendResponse({ ...apiDiagnostics });
    return true;
  }
});

