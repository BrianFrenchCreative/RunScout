/**
 * RunScout - Side Panel Logic
 * 
 * Features:
 * - Segmented tabs: "Saved Games", "Untouched", and "Hidden Games"
 * - Dynamic badge counts for individual tabs
 * - Dynamic subtitle ("Saved Games Manager" vs "Untouched Speedruns" vs "Hidden Games Manager")
 * - Independent boolean states: { isSaved, isHidden, isUntouched, hasRuns, isPinned }
 * - Direct in-tab navigation when clicking game titles
 * - Unhide / Remove / Unsave / Untouched toggles
 * - Search filter per active tab
 * - Recent 15 limit with Show All expander
 * - Master Hiding toggle with live tab reload
 * - JSON Export and Import backups
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const masterToggle = document.getElementById('masterToggle');
  const masterToggleStatus = document.getElementById('masterToggleStatus');
  const gamesListEl = document.getElementById('gamesList');
  const emptyStateEl = document.getElementById('emptyState');
  const emptyIconWrap = document.getElementById('emptyIconWrap');
  const emptyTitle = document.getElementById('emptyTitle');
  const emptyDescription = document.getElementById('emptyDescription');
  const noResultsStateEl = document.getElementById('noResultsState');
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const filtersRow = document.getElementById('filtersRow');
  const genreFilter = document.getElementById('genreFilter');
  const untouchedFilterBtn = document.getElementById('untouchedFilterBtn');
  const dbSelector = document.getElementById('dbSelector');
  const badgeCountEl = document.getElementById('badgeCount');
  const footerInfoEl = document.getElementById('footerInfo');
  const clearAllBtn = document.getElementById('clearAllBtn');
  const exportBackupBtn = document.getElementById('exportBackupBtn');
  const importBackupBtn = document.getElementById('importBackupBtn');
  const importFile = document.getElementById('importFile');
  const searchContainer = document.getElementById('searchContainer');
  const showAllContainer = document.getElementById('showAllContainer');
  const toggleShowAllBtn = document.getElementById('toggleShowAllBtn');
  const toggleShowAllText = document.getElementById('toggleShowAllText');
  const headerSubtitle = document.getElementById('headerSubtitle');

  const scoutPageBtn = document.getElementById('scoutPageBtn');
  const scoutBtnText = document.getElementById('scoutBtnText');
  const scoutProgress = document.getElementById('scoutProgress');
  const scoutProgressStatus = document.getElementById('scoutProgressStatus');
  const scoutProgressCounter = document.getElementById('scoutProgressCounter');
  const scoutProgressBar = document.getElementById('scoutProgressBar');
  const scoutCancelBtn = document.getElementById('scoutCancelBtn');
  const apiHeatFill = document.getElementById('apiHeatFill');
  const apiHeatCounter = document.getElementById('apiHeatCounter');
  const apiHeatIcon = document.getElementById('apiHeatIcon');

  let isPageScoutInProgress = false;
  let activePlayStationTabId = null;
  let isCurrentTabPlayStationGrid = false;

  const settingsBtn = document.getElementById('settingsBtn');
  const backToListBtn = document.getElementById('backToListBtn');
  const mainListContainer = document.getElementById('mainListContainer');
  const settingsView = document.getElementById('settingsView');
  const customDbContainer = document.getElementById('customDbContainer');
  const customDbUrlInput = document.getElementById('customDbUrl');
  const mediaProviderUrlInput = document.getElementById('mediaProviderUrl');
  const presetChips = document.querySelectorAll('.preset-chip-btn');
  const autoHideHasRunsCheckbox = document.getElementById('autoHideHasRunsCheckbox');
  const customKeywordInput = document.getElementById('customKeywordInput');
  const addKeywordBtn = document.getElementById('addKeywordBtn');
  const customKeywordsChips = document.getElementById('customKeywordsChips');
  let customHideKeywords = [];

  const forceRecheckScoutedCheckbox = document.getElementById('forceRecheckScoutedCheckbox');
  let forceRecheckScouted = false;
  const deepScoutCheckbox = document.getElementById('deepScoutCheckbox');
  const settingsDeepScoutCheckbox = document.getElementById('settingsDeepScoutCheckbox');
  let deepScoutEnabled = false;

  const settingsSpeedrunApiKeyInput = document.getElementById('settingsSpeedrunApiKeyInput');
  const toggleApiKeyVisibilityBtn = document.getElementById('toggleApiKeyVisibilityBtn');
  const apiKeyStatusBadge = document.getElementById('apiKeyStatusBadge');
  let speedrunApiKey = '';

  const diagRequestsToday = document.getElementById('diagRequestsToday');
  const diagRateLimitsToday = document.getElementById('diagRateLimitsToday');
  const copyApiLogBtn = document.getElementById('copyApiLogBtn');
  const copyApiLogText = document.getElementById('copyApiLogText');
  const apiMinuteChart = document.getElementById('apiMinuteChart');
  const apiHourChart = document.getElementById('apiHourChart');
  const minutePeakLabel = document.getElementById('minutePeakLabel');
  const hourPeakLabel = document.getElementById('hourPeakLabel');

  const tabSavedBtn = document.getElementById('tabSaved');
  const tabUntouchedBtn = document.getElementById('tabUntouched');
  const tabHiddenBtn = document.getElementById('tabHidden');
  const tabSavedBadge = document.getElementById('tabSavedBadge');
  const tabUntouchedBadge = document.getElementById('tabUntouchedBadge');
  const tabHiddenBadge = document.getElementById('tabHiddenBadge');
  const mainVersionBadge = document.getElementById('mainVersionBadge');
  const settingsVersionBadge = document.getElementById('settingsVersionBadge');

  // Dynamic SemVer Release Versioning
  function initDynamicVersionDisplay() {
    try {
      const manifest = (chrome.runtime && chrome.runtime.getManifest) ? chrome.runtime.getManifest() : null;
      const ver = manifest && manifest.version ? `v${manifest.version}` : '';
      if (mainVersionBadge) {
        mainVersionBadge.textContent = ver;
        mainVersionBadge.title = `RunScout Release ${ver}`;
      }
      if (settingsVersionBadge) {
        settingsVersionBadge.textContent = ver;
        settingsVersionBadge.title = `RunScout Release ${ver}`;
      }
    } catch (e) {}
  }
  initDynamicVersionDisplay();

  const RECENT_LIMIT = 15;
  let currentTab = 'saved'; // 'saved' | 'untouched' | 'hidden'
  let gamesMasterList = {};
  let isShowAllExpanded = false;
  let isUntouchedFilterActive = false;
  let confirmClearTimeout = null;
  let currentStoreLocale = 'en-us';
  let activeDbProvider = 'therun'; // 'therun' | 'src' | 'custom'
  let customDbUrl = 'https://nudatabase.com/?q=';
  let mediaProviderUrl = 'https://www.youtube.com/results?search_query=';

  const EYE_OFF_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

  const BOOKMARK_SVG = `<svg viewBox="0 0 24 24" fill="#facc15" stroke="#facc15" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>`;

  const STAR_EMPTY_SVG = `<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#facc15" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;

  const MAGNIFIER_SVG = `<svg class="speedrun-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`;

  const CLOSE_SVG = `<svg class="remove-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

  const PIN_SVG = `<svg class="pin-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.77V5h1a1 1 0 0 0 0-2H8a1 1 0 0 0 0 2h1v5.77a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24V17z"></path></svg>`;

  // Speedrun Status helper functions
  function getStatusLabel(status) {
    if (status === 'untouched') return 'Untouched';
    if (status === 'has_runs') return 'Has Runs';
    return 'Unverified';
  }

  function getNextRunStatus(status) {
    if (status === 'unverified') return 'has_runs';
    if (status === 'has_runs') return 'untouched';
    if (status === 'untouched') return 'unverified';
    return 'has_runs';
  }

  function getStatusIconSvg(status) {
    if (status === 'untouched') {
      return `<svg class="run-status-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#facc15" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
    }
    if (status === 'has_runs') {
      return `<svg class="run-status-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"></circle><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="5" x2="12" y2="2"></line><line x1="10" y1="2" x2="14" y2="2"></line></svg>`;
    }
    return `<svg class="run-status-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke-dasharray="3 3"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
  }

  /**
   * Sanitizes game titles by stripping common PlayStation Store marketing suffixes
   * to ensure clean, accurate search queries and canonical dictionary keys.
   */
  /**
   * Strips marketing bundles and edition suffixes (e.g. "Deluxe Edition", "Definitive Edition", "Director's Cut")
   * to serve as a secondary fallback query if the specific edition does not exist on Speedrun.com.
   */
  function stripEditionSuffix(title) {
    if (!title || typeof title !== 'string') return '';
    let cleaned = title.trim();

    // 1. Strip dash-separated marketing bundles / editions / platform versions
    cleaned = cleaned.replace(/\s+[-–—:]\s+.*?(?:Bundle|Edition|Collection|Director['’\u2019]?s\s*Cut|Upgrade|Pack|Version)\s*$/i, '');

    // 2. Strip trailing Edition / Director's Cut / Collection phrases with optional edition adjectives
    const editionAdj = '(?:(?:Digital\\s+|Super\\s+)?(?:Deluxe|Standard|Premium|Ultimate|Complete|Special|Collector[\'’\\u2019]?s|Gold|Silver|Launch|Day\\s+One|Game\\s+of\\s+the\\s+Year|GOTY|Anniversary|Cross-Gen|Enhanced|Definitive|Total\\s+Mayhem)\\s+)';
    cleaned = cleaned.replace(new RegExp(`\\s+${editionAdj}?(?:Bundle|Edition|Collection|Director['’\\u2019]?s\\s*Cut)\\s*$`, 'i'), '');

    // 3. Standalone trailing Director's Cut / Edition / Bundle
    cleaned = cleaned.replace(/\s+Director['’\u2019]?s\s*Cut\s*$/i, '');
    cleaned = cleaned.replace(/\s+(?:Bundle|Edition)\s*$/i, '');

    // 4. Clean dangling hyphens, colons, or commas
    cleaned = cleaned.replace(/[-–—:,]\s*$/, '').trim();

    return cleaned || title.trim();
  }

  /**
   * Sanitizes game titles by stripping common PlayStation Store marketing suffixes
   * to ensure clean, accurate search queries and canonical dictionary keys.
   */
  function cleanTitle(rawTitle, stripEdition = false) {
    if (!rawTitle || typeof rawTitle !== 'string') return '';
    let cleaned = rawTitle.trim();

    // 1. Strip trademark / registered symbols
    cleaned = cleaned.replace(/[\u2122\u00AE]/g, '');

    // 2. Strip multiline/newlines and collapse whitespace
    cleaned = cleaned.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ');

    // 3. Strip trailing store ownership, library, or pricing status tags e.g. "Purchased", "In Library", "Included"
    const storeStatusPattern = '(?:Purchased|In\\s+Library|Included|Play\\s+Included|Pre-?Order|Free|Demo|Trial)';
    cleaned = cleaned.replace(new RegExp('(?:\\s*[-–—:,]?\\s*|\\s*[\(\\[])' + storeStatusPattern + '[\\]\\)]?\\s*$', 'i'), '');
    cleaned = cleaned.replace(new RegExp('\\s+' + storeStatusPattern + '\\s*$', 'i'), '');

    // 4. Strip console tags in parentheses or brackets e.g. (PS4 & PS5), [PS5], (PS4™), (PS4 Version)
    cleaned = cleaned.replace(/\s*[\(\[][^()\[\]]*(?:PS[45]|PlayStation)[^()\[\]]*[\)\]]/gi, '');

    // 5. Strip standalone trailing console and version tags e.g. " PS4 Version", " PS5 Version", " PS4 & PS5 Version", " PS4/PS5", " for PS5"
    const platformPattern = '(?:(?:for\\s+)?(?:PlayStation\\s*[45]|PS[45]|PSVR2?|PS\\s*VR2?)(?:\\s*(?:&|\\+|\\/|and)\\s*(?:PlayStation\\s*[45]|PS[45]))?(?:\\s*Version)?)';
    cleaned = cleaned.replace(new RegExp(`\\s+${platformPattern}(?:\\s*\\/\\s*${platformPattern})?\\s*$`, 'i'), '');

    // 6. Strip trailing store status AGAIN in case it appeared before or after platform tags
    cleaned = cleaned.replace(new RegExp('(?:\\s*[-–—:,]?\\s*|\\s*[\(\\[])' + storeStatusPattern + '[\\]\\)]?\\s*$', 'i'), '');
    cleaned = cleaned.replace(new RegExp(`\\s+${platformPattern}\\s*$`, 'i'), '');

    // 7. Strip trailing price or discount fragments e.g. " -75%", " $14.99"
    cleaned = cleaned.replace(/\s+-\d+%\s*$/i, '');
    cleaned = cleaned.replace(/\s+[\$£€¥]\d+(?:\.\d{2})?\s*$/i, '');

    // 8. Optionally strip edition tags if requested
    if (stripEdition) {
      cleaned = stripEditionSuffix(cleaned);
    }

    // 9. Clean dangling hyphens, colons, or commas
    cleaned = cleaned.replace(/[-–—:,]\s*$/, '').trim();

    return cleaned || rawTitle.trim();
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
   * Generates a canonical storage dictionary key from a game title.
   */
  function getGameKey(title) {
    if (!title || typeof title !== 'string') return '';
    const cleaned = cleanTitle(title);
    return (cleaned || title).trim().toLowerCase();
  }

  function extractStoreLocale(urlOrPath) {
    if (!urlOrPath) return null;
    const match = String(urlOrPath).match(/store\.playstation\.com\/([a-z]{2}-[a-z0-9]{2,4}|[a-z]{2})\//i);
    return match ? match[1].toLowerCase() : null;
  }

  function localizePlayStationUrl(rawUrl, targetLocale) {
    if (!rawUrl || !targetLocale) return rawUrl;
    return rawUrl.replace(
      /(store\.playstation\.com\/)[a-z]{2}-[a-z0-9]{2,4}(\/|$)/i,
      `$1${targetLocale}$2`
    );
  }

  // Initialize and track active store region
  chrome.storage.local.get({ lastSeenStoreLocale: 'en-us' }, (res) => {
    if (res && res.lastSeenStoreLocale) {
      currentStoreLocale = res.lastSeenStoreLocale;
    }
  });

  // Stored Catalog Database UI Sync
  function updateCatalogStatsUI(list = gamesMasterList) {
    const totalEl = document.getElementById('catalogCardTotal');
    const untouchedEl = document.getElementById('statUntouchedCount');
    const hasRunsEl = document.getElementById('statHasRunsCount');
    const unverifiedEl = document.getElementById('statUnverifiedCount');
    const savedEl = document.getElementById('statSavedCount');
    const hiddenEl = document.getElementById('statHiddenCount');

    if (!totalEl) return;

    const entries = list ? Object.values(list) : [];
    let untouchedCount = 0;
    let hasRunsCount = 0;
    let unverifiedCount = 0;
    let savedCount = 0;
    let hiddenCount = 0;

    for (let i = 0; i < entries.length; i++) {
      const g = entries[i];
      if (g.isUntouched) untouchedCount++;
      else if (g.hasRuns) hasRunsCount++;
      else if (g.runStatus === 'unverified') unverifiedCount++;

      if (g.isSaved) savedCount++;
      if (g.isHidden) hiddenCount++;
    }

    totalEl.textContent = `${entries.length} games`;
    if (untouchedEl) untouchedEl.textContent = untouchedCount;
    if (hasRunsEl) hasRunsEl.textContent = hasRunsCount;
    if (unverifiedEl) unverifiedEl.textContent = unverifiedCount;
    if (savedEl) savedEl.textContent = savedCount;
    if (hiddenEl) hiddenEl.textContent = hiddenCount;
  }

  // Cleanup Volume Buckets Helper (Ensures 60 minute and 24 hour buckets aligned to current time)
  function cleanupVolumeBuckets(diagnostics) {
    if (!diagnostics) return { minuteVolume: [], hourlyVolume: [] };
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

  function renderMinuteChart(minuteVolume = []) {
    if (!apiMinuteChart) return;
    apiMinuteChart.innerHTML = '';

    const busiestMinute = minuteVolume.reduce((max, b) => Math.max(max, Number(b.count) || 0), 0);
    if (minutePeakLabel) {
      minutePeakLabel.textContent = `Peak: ${busiestMinute} req/m`;
    }

    const ceiling = Math.max(busiestMinute, 1);

    minuteVolume.forEach((bucket) => {
      const count = Number(bucket.count) || 0;
      const bar = document.createElement('div');
      bar.className = 'api-bar';

      const timeStr = bucket.timestamp
        ? new Date(bucket.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
        : '';
      bar.title = `${timeStr || 'Minute'}: ${count} request${count === 1 ? '' : 's'}`;
      bar.setAttribute('aria-label', bar.title);

      if (count === 0) {
        bar.classList.add('bar-empty');
        bar.style.height = '2px';
      } else {
        const heightPercent = Math.max(10, Math.round((count / ceiling) * 100));
        bar.style.height = `${heightPercent}%`;

        const ratio = count / ceiling;
        if (ratio >= 0.7) {
          bar.classList.add('bar-high');
        } else if (ratio >= 0.35) {
          bar.classList.add('bar-med');
        } else {
          bar.classList.add('bar-low');
        }
      }

      apiMinuteChart.appendChild(bar);
    });
  }

  function renderHourChart(hourlyVolume = []) {
    if (!apiHourChart) return;
    apiHourChart.innerHTML = '';

    const busiestHour = hourlyVolume.reduce((max, b) => Math.max(max, Number(b.count) || 0), 0);
    if (hourPeakLabel) {
      hourPeakLabel.textContent = `Peak: ${busiestHour} req/h`;
    }

    const ceiling = Math.max(busiestHour, 1);

    hourlyVolume.forEach((bucket) => {
      const count = Number(bucket.count) || 0;
      const bar = document.createElement('div');
      bar.className = 'api-bar';

      const timeStr = bucket.timestamp
        ? new Date(bucket.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
        : '';
      bar.title = `${timeStr || 'Hour'}: ${count} request${count === 1 ? '' : 's'}`;
      bar.setAttribute('aria-label', bar.title);

      if (count === 0) {
        bar.classList.add('bar-empty');
        bar.style.height = '2px';
      } else {
        const heightPercent = Math.max(10, Math.round((count / ceiling) * 100));
        bar.style.height = `${heightPercent}%`;

        const ratio = count / ceiling;
        if (ratio >= 0.7) {
          bar.classList.add('bar-high');
        } else if (ratio >= 0.35) {
          bar.classList.add('bar-med');
        } else {
          bar.classList.add('bar-low');
        }
      }

      apiHourChart.appendChild(bar);
    });
  }

  // API Diagnostics UI & Audit Log Exporter
  function updateApiDiagnosticsUI(diagnostics) {
    if (!diagRequestsToday || !diagRateLimitsToday) return;

    if (diagnostics && typeof diagnostics === 'object') {
      const cleanDiag = cleanupVolumeBuckets({ ...diagnostics });
      const requestsToday = Number(cleanDiag.requestsToday) || 0;
      const rateLimitsToday = Number(cleanDiag.rateLimitsToday) || 0;
      diagRequestsToday.textContent = requestsToday;
      diagRateLimitsToday.textContent = rateLimitsToday;
      diagRateLimitsToday.classList.toggle('has-strikes', rateLimitsToday > 0);
      renderMinuteChart(cleanDiag.minuteVolume);
      renderHourChart(cleanDiag.hourlyVolume);
      return;
    }

    chrome.storage.local.get({ apiDiagnostics: null }, (res) => {
      const rawDiag = res && res.apiDiagnostics ? res.apiDiagnostics : {};
      const cleanDiag = cleanupVolumeBuckets({ ...rawDiag });
      const requestsToday = Number(cleanDiag.requestsToday) || 0;
      const rateLimitsToday = Number(cleanDiag.rateLimitsToday) || 0;
      diagRequestsToday.textContent = requestsToday;
      diagRateLimitsToday.textContent = rateLimitsToday;
      diagRateLimitsToday.classList.toggle('has-strikes', rateLimitsToday > 0);
      renderMinuteChart(cleanDiag.minuteVolume);
      renderHourChart(cleanDiag.hourlyVolume);
    });
  }

  if (copyApiLogBtn) {
    copyApiLogBtn.addEventListener('click', () => {
      chrome.storage.local.get({ apiDiagnostics: null }, (res) => {
        const diag = res && res.apiDiagnostics ? res.apiDiagnostics : {};
        const buffer = Array.isArray(diag.logBuffer) ? diag.logBuffer : [];
        const formatted = JSON.stringify(buffer, null, 2);

        const showCopiedState = () => {
          if (copyApiLogBtn && copyApiLogText) {
            copyApiLogBtn.classList.add('copied');
            copyApiLogText.textContent = 'Copied!';
            setTimeout(() => {
              copyApiLogBtn.classList.remove('copied');
              copyApiLogText.textContent = 'Copy Audit Log';
            }, 2000);
          }
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(formatted).then(showCopiedState).catch(() => {
            const ta = document.createElement('textarea');
            ta.value = formatted;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
            showCopiedState();
          });
        } else {
          const ta = document.createElement('textarea');
          ta.value = formatted;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
          showCopiedState();
        }
      });
    });
  }

  // Settings View Navigation
  function openSettings() {
    if (mainListContainer) mainListContainer.classList.add('hidden');
    if (settingsView) settingsView.classList.remove('hidden');
    if (settingsBtn) settingsBtn.classList.add('is-active');
    updateCatalogStatsUI(gamesMasterList);
    updateApiDiagnosticsUI();
    if (headerSubtitle) {
      headerSubtitle.dataset.prevSubtitle = headerSubtitle.textContent;
      headerSubtitle.textContent = 'Settings & Preferences';
    }
  }

  function closeSettings() {
    if (settingsView) settingsView.classList.add('hidden');
    if (mainListContainer) mainListContainer.classList.remove('hidden');
    if (settingsBtn) settingsBtn.classList.remove('is-active');
    if (headerSubtitle) {
      if (currentTab === 'hidden') {
        headerSubtitle.textContent = 'Hidden Games Manager';
      } else if (currentTab === 'untouched') {
        headerSubtitle.textContent = 'Untouched Speedruns';
      } else {
        headerSubtitle.textContent = 'Saved Games Manager';
      }
    }
  }

  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      if (settingsView && settingsView.classList.contains('hidden')) {
        openSettings();
      } else {
        closeSettings();
      }
    });
  }

  if (backToListBtn) {
    backToListBtn.addEventListener('click', closeSettings);
  }

  function updateCustomDbVisibility() {
    if (customDbContainer) {
      customDbContainer.classList.toggle('hidden', activeDbProvider !== 'custom');
    }
  }

  function updatePresetChipsActiveState() {
    if (!mediaProviderUrlInput) return;
    const currentVal = mediaProviderUrlInput.value.trim();
    presetChips.forEach((chip) => {
      chip.classList.toggle('is-active', chip.dataset.url === currentVal);
    });
  }

  // Initialize and track preferences in chrome.storage.local
  chrome.storage.local.get({
    dbProvider: 'therun',
    customDbUrl: 'https://nudatabase.com/?q=',
    mediaProviderUrl: 'https://www.youtube.com/results?search_query=',
    autoHideHasRuns: false,
    autoHideVrGames: false,
    autoHideSimulators: false,
    autoHideSimulatorGames: false,
    customHideKeywords: [],
    forceRecheckScouted: false,
    deepScoutEnabled: false,
    speedrunApiKey: '',
    apiDiagnostics: null
  }, (res) => {
    if (res) {
      activeDbProvider = (res.dbProvider === 'src' || res.dbProvider === 'custom') ? res.dbProvider : 'therun';
      customDbUrl = res.customDbUrl || 'https://nudatabase.com/?q=';
      mediaProviderUrl = res.mediaProviderUrl || 'https://www.youtube.com/results?search_query=';
      forceRecheckScouted = Boolean(res.forceRecheckScouted === true);
      deepScoutEnabled = Boolean(res.deepScoutEnabled === true);
      speedrunApiKey = typeof res.speedrunApiKey === 'string' ? res.speedrunApiKey : '';

      if (dbSelector) dbSelector.value = activeDbProvider;
      if (customDbUrlInput) customDbUrlInput.value = customDbUrl;
      if (mediaProviderUrlInput) {
        mediaProviderUrlInput.value = mediaProviderUrl;
        updatePresetChipsActiveState();
      }
      if (autoHideHasRunsCheckbox) {
        autoHideHasRunsCheckbox.checked = Boolean(res.autoHideHasRuns === true);
      }
      if (forceRecheckScoutedCheckbox) {
        forceRecheckScoutedCheckbox.checked = forceRecheckScouted;
      }
      if (deepScoutCheckbox) {
        deepScoutCheckbox.checked = deepScoutEnabled;
      }
      if (settingsDeepScoutCheckbox) {
        settingsDeepScoutCheckbox.checked = deepScoutEnabled;
      }
      if (settingsSpeedrunApiKeyInput) {
        settingsSpeedrunApiKeyInput.value = speedrunApiKey;
      }
      updateApiKeyStatusBadge();

      customHideKeywords = Array.isArray(res.customHideKeywords) ? res.customHideKeywords : [];

      // Auto-migrate previous standalone flags into customHideKeywords if they were active
      let keywordsChanged = false;
      if (res.autoHideVrGames === true && !customHideKeywords.some((k) => k.toLowerCase() === 'vr')) {
        customHideKeywords.push('VR');
        keywordsChanged = true;
      }
      if ((res.autoHideSimulators === true || res.autoHideSimulatorGames === true) && !customHideKeywords.some((k) => k.toLowerCase() === 'simulator')) {
        customHideKeywords.push('Simulator');
        keywordsChanged = true;
      }
      if (keywordsChanged) {
        chrome.storage.local.set({ customHideKeywords });
      }

      renderCustomKeywordChips();

      updateCustomDbVisibility();
      if (res.apiDiagnostics) {
        updateApiDiagnosticsUI(res.apiDiagnostics);
      }
    }
  });

  // Auto-save auto-hide has runs preference
  if (autoHideHasRunsCheckbox) {
    autoHideHasRunsCheckbox.addEventListener('change', () => {
      chrome.storage.local.set({ autoHideHasRuns: autoHideHasRunsCheckbox.checked });
    });
  }

  // Custom keywords chips rendering and management
  function renderCustomKeywordChips() {
    if (!customKeywordsChips) return;
    customKeywordsChips.innerHTML = '';
    if (!customHideKeywords || customHideKeywords.length === 0) {
      const emptyEl = document.createElement('span');
      emptyEl.className = 'custom-keywords-empty';
      emptyEl.textContent = 'No custom keywords added yet.';
      customKeywordsChips.appendChild(emptyEl);
      return;
    }

    customHideKeywords.forEach((kw, index) => {
      const chip = document.createElement('span');
      chip.className = 'keyword-chip';

      const textSpan = document.createElement('span');
      textSpan.className = 'keyword-chip-text';
      textSpan.textContent = kw;
      textSpan.title = kw;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'keyword-chip-remove';
      removeBtn.innerHTML = '&times;';
      removeBtn.title = `Remove "${kw}"`;
      removeBtn.setAttribute('aria-label', `Remove "${kw}"`);
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeCustomKeyword(index);
      });

      chip.appendChild(textSpan);
      chip.appendChild(removeBtn);
      customKeywordsChips.appendChild(chip);
    });
  }

  function addCustomKeywordFromInput() {
    if (!customKeywordInput) return;
    const rawVal = customKeywordInput.value.trim();
    if (!rawVal) return;

    const lower = rawVal.toLowerCase();
    const alreadyExists = customHideKeywords.some((k) => k.toLowerCase() === lower);
    if (!alreadyExists) {
      customHideKeywords.push(rawVal);
      chrome.storage.local.set({ customHideKeywords });
      renderCustomKeywordChips();
    }
    customKeywordInput.value = '';
    customKeywordInput.focus();
  }

  function removeCustomKeyword(index) {
    if (index >= 0 && index < customHideKeywords.length) {
      customHideKeywords.splice(index, 1);
      chrome.storage.local.set({ customHideKeywords });
      renderCustomKeywordChips();
    }
  }

  if (addKeywordBtn) {
    addKeywordBtn.addEventListener('click', addCustomKeywordFromInput);
  }

  if (customKeywordInput) {
    customKeywordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addCustomKeywordFromInput();
      }
    });
  }

  // Auto-save force re-check scouted games preference (single source of truth under Scout Current Page)
  if (forceRecheckScoutedCheckbox) {
    forceRecheckScoutedCheckbox.addEventListener('change', () => {
      forceRecheckScouted = forceRecheckScoutedCheckbox.checked;
      chrome.storage.local.set({ forceRecheckScouted });
    });
  }

  // Auto-save Deep Scout preference (synced between main scout bar and settings view)
  function handleDeepScoutChange(val) {
    deepScoutEnabled = Boolean(val);
    if (deepScoutCheckbox) deepScoutCheckbox.checked = deepScoutEnabled;
    if (settingsDeepScoutCheckbox) settingsDeepScoutCheckbox.checked = deepScoutEnabled;
    chrome.storage.local.set({ deepScoutEnabled });
  }

  if (deepScoutCheckbox) {
    deepScoutCheckbox.addEventListener('change', () => handleDeepScoutChange(deepScoutCheckbox.checked));
  }
  if (settingsDeepScoutCheckbox) {
    settingsDeepScoutCheckbox.addEventListener('change', () => handleDeepScoutChange(settingsDeepScoutCheckbox.checked));
  }

  // Auto-save search archive preference
  if (dbSelector) {
    dbSelector.addEventListener('change', () => {
      const selected = dbSelector.value;
      activeDbProvider = (selected === 'src' || selected === 'custom') ? selected : 'therun';
      updateCustomDbVisibility();
      chrome.storage.local.set({ dbProvider: activeDbProvider }, () => {
        renderList();
      });
    });
  }

  function updateApiKeyStatusBadge() {
    if (!apiKeyStatusBadge) return;
    if (speedrunApiKey && speedrunApiKey.trim().length > 0) {
      apiKeyStatusBadge.textContent = '✓ Authenticated (80/min)';
      apiKeyStatusBadge.style.color = '#38ef7d';
      apiKeyStatusBadge.style.background = 'rgba(56, 239, 125, 0.15)';
    } else {
      apiKeyStatusBadge.textContent = 'Anonymous (8/min)';
      apiKeyStatusBadge.style.color = 'var(--color-text-dim, #888)';
      apiKeyStatusBadge.style.background = 'rgba(255, 255, 255, 0.06)';
    }
  }

  if (settingsSpeedrunApiKeyInput) {
    settingsSpeedrunApiKeyInput.addEventListener('input', () => {
      speedrunApiKey = settingsSpeedrunApiKeyInput.value.trim();
      chrome.storage.local.set({ speedrunApiKey });
      updateApiKeyStatusBadge();
    });
  }

  if (toggleApiKeyVisibilityBtn && settingsSpeedrunApiKeyInput) {
    toggleApiKeyVisibilityBtn.addEventListener('click', () => {
      if (settingsSpeedrunApiKeyInput.type === 'password') {
        settingsSpeedrunApiKeyInput.type = 'text';
        toggleApiKeyVisibilityBtn.textContent = '🔒';
      } else {
        settingsSpeedrunApiKeyInput.type = 'password';
        toggleApiKeyVisibilityBtn.textContent = '👁';
      }
    });
  }

  // Auto-save custom archive base URL
  if (customDbUrlInput) {
    customDbUrlInput.addEventListener('change', () => {
      customDbUrl = customDbUrlInput.value.trim() || 'https://nudatabase.com/?q=';
      chrome.storage.local.set({ customDbUrl }, () => {
        if (activeDbProvider === 'custom') {
          renderList();
        }
      });
    });
  }

  // Auto-save gameplay & media search provider URL
  if (mediaProviderUrlInput) {
    mediaProviderUrlInput.addEventListener('change', () => {
      mediaProviderUrl = mediaProviderUrlInput.value.trim() || 'https://www.youtube.com/results?search_query=';
      chrome.storage.local.set({ mediaProviderUrl }, () => {
        updatePresetChipsActiveState();
      });
    });
  }

  // Media provider quick preset chips
  presetChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const targetUrl = chip.dataset.url;
      if (targetUrl && mediaProviderUrlInput) {
        mediaProviderUrlInput.value = targetUrl;
        mediaProviderUrl = targetUrl;
        chrome.storage.local.set({ mediaProviderUrl }, () => {
          updatePresetChipsActiveState();
        });
      }
    });
  });

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs[0] && tabs[0].url) {
      const tabLocale = extractStoreLocale(tabs[0].url);
      if (tabLocale) {
        currentStoreLocale = tabLocale;
        chrome.storage.local.set({ lastSeenStoreLocale: tabLocale });
      }
    }
  });

  /**
   * One-time migration script converting legacy hiddenGames and savedGames arrays
   * into gamesMasterList dictionary format with independent boolean flags:
   * { isSaved, isHidden, isUntouched, hasRuns, isPinned }
   */
  function migrateToGamesMasterList(storageData) {
    let masterList = {};
    let needsSave = false;

    if (storageData.gamesMasterList && typeof storageData.gamesMasterList === 'object' && !Array.isArray(storageData.gamesMasterList)) {
      masterList = { ...storageData.gamesMasterList };
    } else {
      needsSave = true;
    }

    const locale = currentStoreLocale || 'en-us';

    // Migrate legacy hiddenGames array if present
    if (Array.isArray(storageData.hiddenGames) && storageData.hiddenGames.length > 0) {
      needsSave = true;
      for (const item of storageData.hiddenGames) {
        if (!item) continue;
        const title = typeof item === 'string' ? item.trim() : (typeof item.title === 'string' ? item.title.trim() : '');
        if (!title) continue;
        const key = getGameKey(title);
        if (!key) continue;

        const isItemSaved = typeof item === 'object' && item.status === 'saved';
        const isItemHidden = typeof item === 'string' || (typeof item === 'object' && item.status !== 'saved');
        const isUntouched = typeof item === 'object' && item.runStatus === 'untouched';
        const hasRuns = typeof item === 'object' && item.runStatus === 'has_runs';
        const isPinned = typeof item === 'object' && Boolean(item.pinned === true);
        const genres = (typeof item === 'object' && Array.isArray(item.genres)) ? item.genres : [];
        const timestamp = (typeof item === 'object' && typeof item.timestamp === 'number') ? item.timestamp : Date.now();
        let url = (typeof item === 'object' && typeof item.url === 'string') ? item.url : '';
        if (!url || url.includes('/search/')) {
          url = `https://store.playstation.com/${locale}/search/` + encodeURIComponent(title) + '#ps-hider-direct';
        }

        if (!masterList[key]) {
          masterList[key] = {
            title,
            url,
            timestamp,
            genres,
            isSaved: isItemSaved,
            isHidden: isItemHidden,
            isUntouched,
            hasRuns,
            isPinned
          };
        } else {
          if (isItemSaved) masterList[key].isSaved = true;
          if (isItemHidden) masterList[key].isHidden = true;
          if (isUntouched) masterList[key].isUntouched = true;
          if (hasRuns) masterList[key].hasRuns = true;
          if (isPinned) masterList[key].isPinned = true;
          if (genres.length > 0 && (!masterList[key].genres || masterList[key].genres.length === 0)) {
            masterList[key].genres = genres;
          }
          if (url && (!masterList[key].url || masterList[key].url.includes('/search/'))) {
            masterList[key].url = url;
          }
        }
      }
    }

    // Migrate legacy savedGames array if present
    if (Array.isArray(storageData.savedGames) && storageData.savedGames.length > 0) {
      needsSave = true;
      for (const item of storageData.savedGames) {
        if (!item) continue;
        const title = typeof item === 'string' ? item.trim() : (typeof item.title === 'string' ? item.title.trim() : '');
        if (!title) continue;
        const key = getGameKey(title);
        if (!key) continue;

        const isUntouched = typeof item === 'object' && item.runStatus === 'untouched';
        const hasRuns = typeof item === 'object' && item.runStatus === 'has_runs';
        const isPinned = typeof item === 'object' && Boolean(item.pinned === true);
        const genres = (typeof item === 'object' && Array.isArray(item.genres)) ? item.genres : [];
        const timestamp = (typeof item === 'object' && typeof item.timestamp === 'number') ? item.timestamp : Date.now();
        let url = (typeof item === 'object' && typeof item.url === 'string') ? item.url : '';
        if (!url || url.includes('/search/')) {
          url = `https://store.playstation.com/${locale}/search/` + encodeURIComponent(title) + '#ps-hider-direct';
        }

        if (!masterList[key]) {
          masterList[key] = {
            title,
            url,
            timestamp,
            genres,
            isSaved: true,
            isHidden: false,
            isUntouched,
            hasRuns,
            isPinned
          };
        } else {
          masterList[key].isSaved = true;
          if (isUntouched) masterList[key].isUntouched = true;
          if (hasRuns) masterList[key].hasRuns = true;
          if (isPinned) masterList[key].isPinned = true;
          if (genres.length > 0 && (!masterList[key].genres || masterList[key].genres.length === 0)) {
            masterList[key].genres = genres;
          }
          if (url && (!masterList[key].url || masterList[key].url.includes('/search/'))) {
            masterList[key].url = url;
          }
        }
      }
    }

    // Ensure all boolean fields exist and are booleans
    for (const k of Object.keys(masterList)) {
      const g = masterList[k];
      g.isSaved = Boolean(g.isSaved === true);
      g.isHidden = Boolean(g.isHidden === true);
      g.isUntouched = Boolean(g.isUntouched === true);
      g.hasRuns = Boolean(g.hasRuns === true);
      g.isPinned = Boolean(g.isPinned === true);
      if (!Array.isArray(g.genres)) g.genres = [];
      if (typeof g.timestamp !== 'number') g.timestamp = Date.now();
    }

    return { masterList, needsSave };
  }

  /**
   * Filters gamesMasterList based on the active tab:
   * - Saved Games Tab: isSaved === true (decoupled from isHidden)
   * - Untouched Tab: isUntouched === true && isHidden !== true
   * - Hidden Games Tab: isHidden === true
   */
  function getActiveTabGames() {
    const all = Object.values(gamesMasterList);
    let list;
    if (currentTab === 'untouched') {
      list = all.filter((item) => item.isUntouched === true && item.isHidden !== true);
    } else if (currentTab === 'hidden') {
      list = all.filter((item) => item.isHidden === true);
    } else {
      // 'saved'
      list = all.filter((item) => item.isSaved === true);
    }
    list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    return list;
  }

  function updateMasterToggleUI(isEnabled) {
    if (masterToggle) masterToggle.checked = isEnabled;
    if (masterToggleStatus) {
      masterToggleStatus.textContent = isEnabled ? 'Active' : 'Disabled';
      if (isEnabled) {
        masterToggleStatus.classList.remove('disabled');
      } else {
        masterToggleStatus.classList.add('disabled');
      }
    }
  }

  function reloadPlayStationTabIfActive() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError || !tabs || tabs.length === 0) return;
      const activeTab = tabs[0];
      if (!activeTab || !activeTab.url) return;

      try {
        const url = new URL(activeTab.url);
        if (url.hostname === 'store.playstation.com' || url.hostname.endsWith('.store.playstation.com')) {
          chrome.tabs.reload(activeTab.id);
        }
      } catch (e) {
        if (activeTab.url.includes('store.playstation.com')) {
          chrome.tabs.reload(activeTab.id);
        }
      }
    });
  }

  function initMasterToggle() {
    chrome.storage.local.get({ isHidingEnabled: true }, (result) => {
      const isEnabled = result.isHidingEnabled !== false;
      updateMasterToggleUI(isEnabled);
    });

    if (masterToggle) {
      masterToggle.addEventListener('change', () => {
        const isEnabled = masterToggle.checked;
        updateMasterToggleUI(isEnabled);
        chrome.storage.local.set({ isHidingEnabled: isEnabled }, () => {
          reloadPlayStationTabIfActive();
        });
      });
    }
  }

  function updateGenreFilterOptions() {
    if (!genreFilter) return;

    const visibleGames = Object.values(gamesMasterList).filter((g) => g.isSaved || g.isUntouched);
    const currentVal = genreFilter.value || 'all';

    const uniqueGenres = new Set();
    visibleGames.forEach((game) => {
      if (Array.isArray(game.genres)) {
        game.genres.forEach((genre) => {
          if (typeof genre === 'string') {
            const trimmed = genre.trim();
            if (trimmed.length > 0) {
              uniqueGenres.add(trimmed);
            }
          }
        });
      }
    });

    const sortedGenres = Array.from(uniqueGenres).sort((a, b) => a.localeCompare(b));

    genreFilter.innerHTML = '<option value="all">All Genres</option>';

    sortedGenres.forEach((genre) => {
      const option = document.createElement('option');
      option.value = genre;
      option.textContent = genre;
      genreFilter.appendChild(option);
    });

    if (sortedGenres.includes(currentVal)) {
      genreFilter.value = currentVal;
    } else {
      genreFilter.value = 'all';
    }
  }

  function switchTab(newTab) {
    if (currentTab === newTab) return;
    currentTab = newTab;
    isShowAllExpanded = false;
    isUntouchedFilterActive = false;
    if (untouchedFilterBtn) {
      untouchedFilterBtn.classList.remove('active');
      untouchedFilterBtn.setAttribute('aria-pressed', 'false');
    }
    searchInput.value = '';
    clearSearchBtn.style.display = 'none';
    if (genreFilter) genreFilter.value = 'all';
    resetClearAllButton();

    tabSavedBtn.classList.toggle('active', currentTab === 'saved');
    tabSavedBtn.setAttribute('aria-selected', currentTab === 'saved' ? 'true' : 'false');
    tabUntouchedBtn.classList.toggle('active', currentTab === 'untouched');
    tabUntouchedBtn.setAttribute('aria-selected', currentTab === 'untouched' ? 'true' : 'false');
    tabHiddenBtn.classList.toggle('active', currentTab === 'hidden');
    tabHiddenBtn.setAttribute('aria-selected', currentTab === 'hidden' ? 'true' : 'false');

    if (currentTab === 'hidden') {
      if (badgeCountEl) badgeCountEl.classList.remove('badge-saved');
      if (headerSubtitle) headerSubtitle.textContent = 'Hidden Games Manager';
      searchInput.placeholder = 'Search hidden games...';
      if (filtersRow) filtersRow.style.display = 'flex';
      if (genreFilter) genreFilter.style.display = 'none';
      if (untouchedFilterBtn) untouchedFilterBtn.style.display = 'inline-flex';
    } else if (currentTab === 'untouched') {
      if (badgeCountEl) badgeCountEl.classList.add('badge-saved');
      if (headerSubtitle) headerSubtitle.textContent = 'Untouched Speedruns';
      searchInput.placeholder = 'Search untouched games...';
      updateGenreFilterOptions();
      if (filtersRow) filtersRow.style.display = 'flex';
      if (genreFilter) genreFilter.style.display = 'block';
      if (untouchedFilterBtn) untouchedFilterBtn.style.display = 'none';
    } else {
      // 'saved'
      if (badgeCountEl) badgeCountEl.classList.add('badge-saved');
      if (headerSubtitle) headerSubtitle.textContent = 'Saved Games Manager';
      searchInput.placeholder = 'Search saved games...';
      updateGenreFilterOptions();
      if (filtersRow) filtersRow.style.display = 'flex';
      if (genreFilter) genreFilter.style.display = 'block';
      if (untouchedFilterBtn) untouchedFilterBtn.style.display = 'inline-flex';
    }

    renderList();
  }

  tabHiddenBtn.addEventListener('click', () => switchTab('hidden'));
  tabSavedBtn.addEventListener('click', () => switchTab('saved'));
  tabUntouchedBtn.addEventListener('click', () => switchTab('untouched'));

  if (genreFilter) {
    genreFilter.addEventListener('change', () => {
      renderList();
    });
  }

  if (untouchedFilterBtn) {
    untouchedFilterBtn.addEventListener('click', () => {
      isUntouchedFilterActive = !isUntouchedFilterActive;
      untouchedFilterBtn.classList.toggle('active', isUntouchedFilterActive);
      untouchedFilterBtn.setAttribute('aria-pressed', isUntouchedFilterActive ? 'true' : 'false');
      renderList();
    });
  }

  function updateUIState(renderedCount = 0, isFiltered = false) {
    const all = Object.values(gamesMasterList);
    const hiddenCount = all.filter((g) => g.isHidden === true).length;
    const savedCount = all.filter((g) => g.isSaved === true).length;
    const untouchedCount = all.filter((g) => g.isUntouched === true && g.isHidden !== true).length;
    const activeList = getActiveTabGames();
    const activeTotalCount = activeList.length;

    if (tabHiddenBadge) tabHiddenBadge.textContent = hiddenCount;
    if (tabSavedBadge) tabSavedBadge.textContent = savedCount;
    if (tabUntouchedBadge) tabUntouchedBadge.textContent = untouchedCount;
    if (badgeCountEl) {
      if (currentTab === 'saved') {
        badgeCountEl.textContent = savedCount;
        badgeCountEl.classList.add('badge-saved');
      } else if (currentTab === 'untouched') {
        badgeCountEl.textContent = untouchedCount;
        badgeCountEl.classList.add('badge-saved');
      } else {
        badgeCountEl.textContent = hiddenCount;
        badgeCountEl.classList.remove('badge-saved');
      }
    }

    clearAllBtn.disabled = activeTotalCount === 0;

    if (activeTotalCount === 0) {
      searchContainer.style.display = 'none';
      if (filtersRow) filtersRow.style.display = 'none';
      if (genreFilter) genreFilter.style.display = 'none';
      if (untouchedFilterBtn) untouchedFilterBtn.style.display = 'none';
      gamesListEl.style.display = 'none';
      if (showAllContainer) showAllContainer.style.display = 'none';
      noResultsStateEl.style.display = 'none';
      emptyStateEl.style.display = 'flex';

      if (currentTab === 'hidden') {
        emptyIconWrap.innerHTML = EYE_OFF_SVG;
        emptyTitle.textContent = 'No hidden games';
        emptyDescription.innerHTML = `Browse <a href="https://store.playstation.com" target="_blank" rel="noopener noreferrer">store.playstation.com</a> and click the <strong>Hide</strong> button on any product tile to conceal it.`;
        footerInfoEl.textContent = 'No games hidden';
        clearAllBtn.textContent = 'Unhide All';
      } else if (currentTab === 'untouched') {
        emptyIconWrap.innerHTML = STAR_EMPTY_SVG;
        emptyTitle.textContent = 'No untouched games';
        emptyDescription.innerHTML = `Click the <strong>star icon</strong> on any game or use <strong>Auto-Scout</strong> on store pages to discover games with untouched speedrun leaderboards.`;
        footerInfoEl.textContent = 'No untouched games';
        clearAllBtn.textContent = 'Remove All';
      } else {
        emptyIconWrap.innerHTML = BOOKMARK_SVG;
        emptyTitle.textContent = 'No saved games';
        emptyDescription.innerHTML = `Browse <a href="https://store.playstation.com" target="_blank" rel="noopener noreferrer">store.playstation.com</a> and click the <strong>bookmark icon</strong> on any product tile to save it.`;
        footerInfoEl.textContent = 'No games saved';
        clearAllBtn.textContent = 'Remove All';
      }
      return;
    }

    searchContainer.style.display = 'flex';
    if (filtersRow) {
      filtersRow.style.display = 'flex';
    }
    if (genreFilter) {
      genreFilter.style.display = currentTab !== 'hidden' ? 'block' : 'none';
    }
    if (untouchedFilterBtn) {
      untouchedFilterBtn.style.display = currentTab !== 'untouched' ? 'inline-flex' : 'none';
    }
    emptyStateEl.style.display = 'none';
    const itemNoun = currentTab === 'hidden' ? 'hidden' : (currentTab === 'untouched' ? 'untouched' : 'saved');
    searchInput.placeholder = `Search all ${activeTotalCount} ${itemNoun} game${activeTotalCount === 1 ? '' : 's'}...`;

    if (isFiltered) {
      if (renderedCount === 0) {
        gamesListEl.style.display = 'none';
        noResultsStateEl.style.display = 'flex';
        footerInfoEl.textContent = `0 of ${activeTotalCount} matching`;
      } else {
        gamesListEl.style.display = 'flex';
        noResultsStateEl.style.display = 'none';
        footerInfoEl.textContent = `${renderedCount} of ${activeTotalCount} matching`;
      }
    } else {
      gamesListEl.style.display = 'flex';
      noResultsStateEl.style.display = 'none';
      if (activeTotalCount > RECENT_LIMIT && !isShowAllExpanded) {
        footerInfoEl.textContent = `Recent ${renderedCount} of ${activeTotalCount} ${itemNoun}`;
      } else {
        footerInfoEl.textContent = `${activeTotalCount} game${activeTotalCount === 1 ? '' : 's'} ${itemNoun}`;
      }
    }
  }

  function createGameListItem(game) {
    const li = document.createElement('li');
    li.className = 'game-item';
    li.dataset.gameTitle = game.title;

    // 1. Column 1: Left Status Anchor
    if (currentTab !== 'hidden') {
      const statusWrapper = document.createElement('div');
      statusWrapper.className = 'run-status-wrapper game-status-anchor';

      const statusBtn = document.createElement('button');
      statusBtn.type = 'button';
      const curStatus = game.isUntouched ? 'untouched' : (game.hasRuns ? 'has_runs' : 'unverified');
      statusBtn.className = `run-status-btn run-status-${curStatus}`;
      statusBtn.dataset.status = curStatus;
      const curLabel = getStatusLabel(curStatus);
      statusBtn.title = `Speedrun Status: ${curLabel} (Click to change status)`;
      statusBtn.setAttribute('aria-label', `Speedrun Status: ${curLabel}`);
      statusBtn.innerHTML = getStatusIconSvg(curStatus);

      const statusMenu = document.createElement('div');
      statusMenu.className = 'run-status-menu';
      statusMenu.hidden = true;

      const statuses = [
        { id: 'unverified', label: 'Unverified' },
        { id: 'untouched', label: 'Untouched' },
        { id: 'has_runs', label: 'Has Runs' }
      ];

      statuses.forEach((s) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = `run-status-menu-item run-status-menu-${s.id} ${s.id === curStatus ? 'active' : ''}`;
        item.innerHTML = `
          <span class="run-status-menu-icon">${getStatusIconSvg(s.id)}</span>
          <span class="run-status-menu-label">${s.label}</span>
          ${s.id === curStatus ? '<span class="run-status-menu-check">✓</span>' : ''}
        `;
        item.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const key = getGameKey(game.title);
          if (gamesMasterList[key]) {
            gamesMasterList[key].isUntouched = (s.id === 'untouched');
            gamesMasterList[key].hasRuns = (s.id === 'has_runs');
            gamesMasterList[key].runStatus = s.id;
            // CRITICAL: Manual status selection NEVER alters isHidden!
            chrome.storage.local.set({ gamesMasterList }, () => {
              renderList();
            });
          }
          statusMenu.hidden = true;
        });
        statusMenu.appendChild(item);
      });

      statusBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const willOpen = statusMenu.hidden;
        document.querySelectorAll('.run-status-menu:not([hidden])').forEach((m) => {
          m.hidden = true;
        });
        if (willOpen) {
          const rect = statusBtn.getBoundingClientRect();
          if (window.innerHeight - rect.bottom < 125) {
            statusMenu.classList.add('opens-up');
          } else {
            statusMenu.classList.remove('opens-up');
          }
          statusMenu.hidden = false;
        }
      });

      statusWrapper.appendChild(statusBtn);
      statusWrapper.appendChild(statusMenu);
      li.appendChild(statusWrapper);
    } else {
      const hiddenIcon = document.createElement('span');
      hiddenIcon.className = 'hidden-status-icon game-status-anchor';
      hiddenIcon.setAttribute('aria-hidden', 'true');
      hiddenIcon.title = 'Hidden Game';
      hiddenIcon.innerHTML = EYE_OFF_SVG;
      li.appendChild(hiddenIcon);
    }

    // 2. Column 2: Center Content (.game-info)
    const infoWrap = document.createElement('div');
    infoWrap.className = 'game-info';

    // Inline-flex container wrapping Title link and Search icon
    const titleRow = document.createElement('div');
    titleRow.className = 'game-title-row';

    const titleLink = document.createElement('a');
    titleLink.className = 'game-name game-link';
    titleLink.href = game.url;
    titleLink.textContent = game.title;
    titleLink.title = `Navigate to: ${game.title}`;

    titleLink.addEventListener('click', (event) => {
      if (event.ctrlKey || event.metaKey || event.button === 1) return;
      event.preventDefault();
      if (game.url) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const activeTab = tabs && tabs[0];
          const activeLocale = (activeTab && activeTab.url) ? extractStoreLocale(activeTab.url) : currentStoreLocale;
          const targetUrl = activeLocale ? localizePlayStationUrl(game.url, activeLocale) : game.url;

          if (activeTab && activeTab.id) {
            chrome.tabs.update(activeTab.id, { url: targetUrl });
          } else {
            chrome.tabs.update({ url: targetUrl });
          }
        });
      }
    });

    const speedrunLink = document.createElement('a');
    speedrunLink.className = 'speedrun-link';
    speedrunLink.target = '_blank';
    speedrunLink.rel = 'noopener noreferrer';
    const cleaned = cleanTitle(game.title);
    const numeralVariant = getNumeralVariant(cleaned);
    const queryTitle = game.matchedTitle || (activeDbProvider === 'src' && numeralVariant ? numeralVariant : (numeralVariant || cleaned));
    const providerParam = encodeURIComponent(queryTitle);

    let providerHref = '';
    let providerLabel = '';
    let linkTitle = '';

    if (activeDbProvider === 'custom') {
      const baseUrl = (customDbUrl && customDbUrl.trim()) ? customDbUrl.trim() : 'https://nudatabase.com/?q=';
      providerHref = `${baseUrl}${providerParam}`;
      providerLabel = 'Custom Archive';
      linkTitle = `Search Custom Archive for "${queryTitle}"`;
    } else if (activeDbProvider === 'src') {
      providerLabel = 'Speedrun.com';
      if (game.speedrunUrl) {
        providerHref = game.speedrunUrl;
        linkTitle = `View leaderboard on Speedrun.com (${queryTitle})`;
      } else {
        providerHref = `https://www.speedrun.com/search?q=${providerParam}`;
        linkTitle = `Search Speedrun.com for "${queryTitle}"`;
      }
    } else {
      providerHref = `https://therun.gg/?q=${providerParam}`;
      providerLabel = 'TheRun.gg';
      linkTitle = `Search TheRun.gg for "${queryTitle}"`;
    }

    speedrunLink.href = providerHref;
    speedrunLink.title = linkTitle;
    speedrunLink.setAttribute('aria-label', linkTitle);
    speedrunLink.innerHTML = MAGNIFIER_SVG;

    speedrunLink.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    titleRow.appendChild(titleLink);
    titleRow.appendChild(speedrunLink);
    infoWrap.appendChild(titleRow);

    // Display game genres directly beneath the title for Saved and Untouched tabs
    if (currentTab !== 'hidden') {
      const genreEl = document.createElement('div');
      genreEl.className = 'game-genre';

      const genresList = (Array.isArray(game.genres) ? game.genres : [])
        .map((g) => (typeof g === 'string' ? g.trim() : String(g || '').trim()))
        .filter((g) => g.length > 0);

      if (genresList.length > 0) {
        genreEl.textContent = genresList.join(', ');
      } else {
        genreEl.textContent = 'Uncategorized';
        genreEl.classList.add('uncategorized');
      }

      infoWrap.appendChild(genreEl);
    }

    li.appendChild(infoWrap);

    // 3. Column 3: Top-Right Actions Container (.game-actions-wrap)
    const actionsWrap = document.createElement('div');
    actionsWrap.className = 'game-actions-wrap';

    if (currentTab !== 'hidden') {
      const pinBtn = document.createElement('button');
      pinBtn.type = 'button';
      const isPinned = Boolean(game.isPinned === true);
      pinBtn.className = `pin-btn ${isPinned ? 'is-pinned' : ''}`.trim();
      pinBtn.setAttribute('aria-label', isPinned ? `Unpin ${game.title}` : `Pin ${game.title} to top`);
      pinBtn.setAttribute('title', isPinned ? `Unpin "${game.title}"` : `Pin "${game.title}" to top`);
      pinBtn.innerHTML = PIN_SVG;

      pinBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const key = getGameKey(game.title);
        if (gamesMasterList[key]) {
          gamesMasterList[key].isPinned = !gamesMasterList[key].isPinned;
          chrome.storage.local.set({ gamesMasterList }, () => {
            renderList();
          });
        }
      });

      actionsWrap.appendChild(pinBtn);
    }

    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    if (currentTab === 'saved') {
      actionBtn.className = 'unsave-btn remove-ghost-btn';
      actionBtn.setAttribute('aria-label', `Remove ${game.title}`);
      actionBtn.setAttribute('title', `Remove "${game.title}" from saved`);
    } else if (currentTab === 'untouched') {
      actionBtn.className = 'unsave-btn remove-ghost-btn';
      actionBtn.setAttribute('aria-label', `Remove ${game.title}`);
      actionBtn.setAttribute('title', `Remove "${game.title}" from untouched`);
    } else {
      actionBtn.className = 'unhide-btn remove-ghost-btn';
      actionBtn.setAttribute('aria-label', `Unhide ${game.title}`);
      actionBtn.setAttribute('title', `Unhide "${game.title}"`);
    }
    actionBtn.innerHTML = CLOSE_SVG;

    actionBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      handleDeleteGame(game.title);
    });

    actionsWrap.appendChild(actionBtn);
    li.appendChild(actionsWrap);
    return li;
  }

  function handleDeleteGame(gameTitle) {
    const key = getGameKey(gameTitle);
    if (gamesMasterList[key]) {
      if (currentTab === 'saved') {
        gamesMasterList[key].isSaved = false;
      } else if (currentTab === 'untouched') {
        gamesMasterList[key].isUntouched = false;
      } else if (currentTab === 'hidden') {
        gamesMasterList[key].isHidden = false;
      }

      chrome.storage.local.set({ gamesMasterList }, () => {
        updateGenreFilterOptions();
        renderList();
        reloadPlayStationTabIfActive();
      });
    }
  }

  function renderList() {
    const activeList = getActiveTabGames();
    const query = searchInput.value.trim().toLowerCase();
    const isSearching = query.length > 0;
    const selectedGenre = (genreFilter && currentTab !== 'hidden') ? genreFilter.value : 'all';
    const isFilteringGenre = selectedGenre && selectedGenre !== 'all';
    const isFilteringUntouched = (currentTab === 'saved' || currentTab === 'hidden') && isUntouchedFilterActive;
    const isFiltered = isSearching || isFilteringGenre || isFilteringUntouched;
    const totalCount = activeList.length;

    let displayList = [];

    if (isFiltered) {
      displayList = activeList.filter((game) => {
        const matchesQuery = !isSearching || game.title.toLowerCase().includes(query);

        let matchesGenre = true;
        if (isFilteringGenre) {
          matchesGenre = Array.isArray(game.genres) && game.genres.some((g) => {
            return typeof g === 'string' && g.trim().toLowerCase() === selectedGenre.trim().toLowerCase();
          });
        }

        let matchesUntouched = true;
        if (isFilteringUntouched) {
          matchesUntouched = game.isUntouched === true;
        }

        return matchesQuery && matchesGenre && matchesUntouched;
      });

      if (showAllContainer) showAllContainer.style.display = 'none';
    } else {
      if (totalCount > RECENT_LIMIT) {
        if (showAllContainer) showAllContainer.style.display = 'flex';
        if (isShowAllExpanded) {
          displayList = activeList;
          if (toggleShowAllText) toggleShowAllText.textContent = `Show recent ${RECENT_LIMIT} only`;
          if (toggleShowAllBtn) toggleShowAllBtn.classList.add('expanded');
        } else {
          const prioritized = [...activeList].sort((a, b) => (b.isPinned === true ? 1 : 0) - (a.isPinned === true ? 1 : 0));
          displayList = prioritized.slice(0, RECENT_LIMIT);
          if (toggleShowAllText) toggleShowAllText.textContent = `Show all ${totalCount} games`;
          if (toggleShowAllBtn) toggleShowAllBtn.classList.remove('expanded');
        }
      } else {
        displayList = activeList;
        if (showAllContainer) showAllContainer.style.display = 'none';
        if (toggleShowAllBtn) toggleShowAllBtn.classList.remove('expanded');
      }
    }

    // Sort displayList so pinned items float to the top
    displayList.sort((a, b) => (b.isPinned === true ? 1 : 0) - (a.isPinned === true ? 1 : 0));

    gamesListEl.innerHTML = '';
    displayList.forEach((game) => {
      const itemEl = createGameListItem(game);
      gamesListEl.appendChild(itemEl);
    });

    updateUIState(displayList.length, isFiltered);
  }

  function loadMasterList() {
    chrome.storage.local.get({
      gamesMasterList: null,
      hiddenGames: null,
      savedGames: null,
      dbProvider: 'therun',
      customDbUrl: 'https://nudatabase.com/?q=',
      mediaProviderUrl: 'https://www.youtube.com/results?search_query=',
      autoHideHasRuns: false,
      autoHideVrGames: false,
      autoHideSimulators: false,
      autoHideSimulatorGames: false,
      customHideKeywords: [],
      forceRecheckScouted: false
    }, (result) => {
      if (result.autoHideHasRuns !== undefined && autoHideHasRunsCheckbox) {
        autoHideHasRunsCheckbox.checked = Boolean(result.autoHideHasRuns === true);
      }
      if (result.customHideKeywords !== undefined) {
        customHideKeywords = Array.isArray(result.customHideKeywords) ? result.customHideKeywords : [];
        renderCustomKeywordChips();
      }
      if (result.forceRecheckScouted !== undefined) {
        forceRecheckScouted = Boolean(result.forceRecheckScouted === true);
        if (forceRecheckScoutedCheckbox) forceRecheckScoutedCheckbox.checked = forceRecheckScouted;
      }
      if (result.dbProvider) {
        activeDbProvider = (result.dbProvider === 'src' || result.dbProvider === 'custom') ? result.dbProvider : 'therun';
        if (dbSelector) dbSelector.value = activeDbProvider;
        updateCustomDbVisibility();
      }
      if (result.customDbUrl !== undefined) {
        customDbUrl = result.customDbUrl || 'https://nudatabase.com/?q=';
        if (customDbUrlInput) customDbUrlInput.value = customDbUrl;
      }
      if (result.mediaProviderUrl !== undefined) {
        mediaProviderUrl = result.mediaProviderUrl || 'https://www.youtube.com/results?search_query=';
        if (mediaProviderUrlInput) {
          mediaProviderUrlInput.value = mediaProviderUrl;
          updatePresetChipsActiveState();
        }
      }
      const { masterList, needsSave } = migrateToGamesMasterList(result || {});
      gamesMasterList = masterList;
      if (needsSave) {
        chrome.storage.local.set({ gamesMasterList: masterList }, () => {
          chrome.storage.local.remove(['hiddenGames', 'savedGames']);
        });
      }
      updateGenreFilterOptions();
      updateCatalogStatsUI(gamesMasterList);
      renderList();
    });
  }

  if (toggleShowAllBtn) {
    toggleShowAllBtn.addEventListener('click', () => {
      isShowAllExpanded = !isShowAllExpanded;
      renderList();
    });
  }

  function resetClearAllButton() {
    clearAllBtn.dataset.confirming = 'false';
    clearAllBtn.textContent = currentTab === 'hidden' ? 'Unhide All' : 'Remove All';
    clearAllBtn.style.color = '';
    clearAllBtn.style.borderColor = '';
  }

  clearAllBtn.addEventListener('click', () => {
    const actionWord = currentTab === 'hidden' ? 'Unhide' : 'Remove';
    if (clearAllBtn.dataset.confirming === 'true') {
      const activeList = getActiveTabGames();
      activeList.forEach((item) => {
        const key = getGameKey(item.title);
        if (gamesMasterList[key]) {
          if (currentTab === 'saved') {
            gamesMasterList[key].isSaved = false;
          } else if (currentTab === 'untouched') {
            gamesMasterList[key].isUntouched = false;
          } else if (currentTab === 'hidden') {
            gamesMasterList[key].isHidden = false;
          }
        }
      });
      isShowAllExpanded = false;

      chrome.storage.local.set({ gamesMasterList }, () => {
        resetClearAllButton();
        updateGenreFilterOptions();
        renderList();
        reloadPlayStationTabIfActive();
      });
    } else {
      clearAllBtn.dataset.confirming = 'true';
      clearAllBtn.textContent = `Confirm ${actionWord} All?`;
      clearAllBtn.style.color = '#ef4444';
      clearAllBtn.style.borderColor = 'rgba(239, 68, 68, 0.5)';

      if (confirmClearTimeout) clearTimeout(confirmClearTimeout);
      confirmClearTimeout = setTimeout(resetClearAllButton, 3500);
    }
  });

  searchInput.addEventListener('input', () => {
    clearSearchBtn.style.display = searchInput.value ? 'block' : 'none';
    renderList();
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.style.display = 'none';
    searchInput.focus();
    renderList();
  });

  // JSON Backup Export
  if (exportBackupBtn) {
    exportBackupBtn.addEventListener('click', () => {
      chrome.storage.local.get({ gamesMasterList: {} }, (result) => {
        const master = result.gamesMasterList || {};
        const jsonString = JSON.stringify(master, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-') + 'Z';
        downloadLink.download = `RunScout_Backup_${timestamp}.json`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
    });
  }

  // JSON Backup Import
  if (importBackupBtn && importFile) {
    importBackupBtn.addEventListener('click', () => {
      importFile.value = '';
      importFile.click();
    });

    importFile.addEventListener('change', (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsed = JSON.parse(e.target.result);
          if (!parsed || typeof parsed !== 'object') {
            alert('Invalid backup file: The file must contain a JSON object or array.');
            return;
          }

          chrome.storage.local.get({ gamesMasterList: {} }, (result) => {
            const currentMaster = { ...(result.gamesMasterList || {}) };

            if (Array.isArray(parsed)) {
              // Legacy array backup
              const { masterList: importedList } = migrateToGamesMasterList({ hiddenGames: parsed });
              Object.assign(currentMaster, importedList);
            } else if (parsed.gamesMasterList && typeof parsed.gamesMasterList === 'object') {
              // Wrapped object
              const { masterList: importedList } = migrateToGamesMasterList(parsed);
              Object.assign(currentMaster, importedList);
            } else {
              // Dictionary of games
              const { masterList: importedList } = migrateToGamesMasterList({ gamesMasterList: parsed });
              Object.assign(currentMaster, importedList);
            }

            chrome.storage.local.set({ gamesMasterList: currentMaster }, () => {
              gamesMasterList = currentMaster;
              updateGenreFilterOptions();
              renderList();
              reloadPlayStationTabIfActive();
            });
          });
        } catch (err) {
          console.error('Failed to import backup:', err);
          alert('Failed to parse backup file. Please ensure it is a valid JSON file.');
        }
      };

      reader.onerror = () => {
        alert('Failed to read the selected backup file.');
      };

      reader.readAsText(file);
    });
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      if (changes.isHidingEnabled !== undefined) {
        updateMasterToggleUI(changes.isHidingEnabled.newValue !== false);
      }
      if (changes.dbProvider !== undefined) {
        const val = changes.dbProvider.newValue;
        activeDbProvider = (val === 'src' || val === 'custom') ? val : 'therun';
        if (dbSelector) dbSelector.value = activeDbProvider;
        updateCustomDbVisibility();
        renderList();
      }
      if (changes.customDbUrl !== undefined) {
        customDbUrl = changes.customDbUrl.newValue || 'https://nudatabase.com/?q=';
        if (customDbUrlInput && document.activeElement !== customDbUrlInput) {
          customDbUrlInput.value = customDbUrl;
        }
        if (activeDbProvider === 'custom') {
          renderList();
        }
      }
      if (changes.mediaProviderUrl !== undefined) {
        mediaProviderUrl = changes.mediaProviderUrl.newValue || 'https://www.youtube.com/results?search_query=';
        if (mediaProviderUrlInput && document.activeElement !== mediaProviderUrlInput) {
          mediaProviderUrlInput.value = mediaProviderUrl;
          updatePresetChipsActiveState();
        }
      }
      if (changes.autoHideHasRuns !== undefined) {
        if (autoHideHasRunsCheckbox) {
          autoHideHasRunsCheckbox.checked = changes.autoHideHasRuns.newValue === true;
        }
      }
      if (changes.customHideKeywords !== undefined) {
        customHideKeywords = Array.isArray(changes.customHideKeywords.newValue) ? changes.customHideKeywords.newValue : [];
        renderCustomKeywordChips();
      }
      if (changes.forceRecheckScouted !== undefined) {
        forceRecheckScouted = changes.forceRecheckScouted.newValue === true;
        if (forceRecheckScoutedCheckbox) forceRecheckScoutedCheckbox.checked = forceRecheckScouted;
      }
      if (changes.deepScoutEnabled !== undefined) {
        deepScoutEnabled = changes.deepScoutEnabled.newValue === true;
        if (deepScoutCheckbox) deepScoutCheckbox.checked = deepScoutEnabled;
        if (settingsDeepScoutCheckbox) settingsDeepScoutCheckbox.checked = deepScoutEnabled;
      }
      if (changes.gamesMasterList) {
        gamesMasterList = changes.gamesMasterList.newValue || {};
        updateGenreFilterOptions();
        updateCatalogStatsUI(gamesMasterList);
        renderList();
      }
      if (changes.apiDiagnostics !== undefined) {
        updateApiDiagnosticsUI(changes.apiDiagnostics.newValue);
      }
    }
  });

  function healActiveTabIfProductPage() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError || !tabs || tabs.length === 0) return;
      const activeTab = tabs[0];
      if (!activeTab || !activeTab.url || !activeTab.id) return;
      if (!activeTab.url.startsWith('https://store.playstation.com/')) return;

      if (activeTab.url.includes('/product/') || activeTab.url.includes('/concept/')) {
        const activeLocale = extractStoreLocale(activeTab.url);
        if (activeLocale) {
          currentStoreLocale = activeLocale;
          chrome.storage.local.set({ lastSeenStoreLocale: activeLocale });
        }

        const handleProductResponse = (response) => {
          if (!response || !response.title) return;
          const currentTitle = response.title.trim();
          const currentUrl = response.url || activeTab.url;
          const responseGenres = Array.isArray(response.genres) ? response.genres : [];

          chrome.storage.local.get({ gamesMasterList: {} }, (result) => {
            const master = { ...(result.gamesMasterList || {}) };
            const key = getGameKey(currentTitle);
            if (master[key]) {
              const game = master[key];
              const needsUrlUpdate = !game.url || game.url.includes('/search/');
              const needsGenreUpdate = responseGenres.length > 0 && (!game.genres || game.genres.length === 0);
              if (needsUrlUpdate || needsGenreUpdate) {
                if (needsUrlUpdate) game.url = currentUrl;
                if (needsGenreUpdate) game.genres = responseGenres;
                chrome.storage.local.set({ gamesMasterList: master }, () => {
                  loadMasterList();
                });
              }
            }
          });
        };

        chrome.tabs.sendMessage(activeTab.id, { type: 'GET_PRODUCT_INFO' }, (response) => {
          if (chrome.runtime.lastError) {
            const errMsg = chrome.runtime.lastError.message || '';
            if (errMsg.includes('Receiving end does not exist') && chrome.scripting) {
              chrome.scripting.executeScript({
                target: { tabId: activeTab.id },
                files: ['content.js']
              }).then(() => {
                setTimeout(() => {
                  chrome.tabs.sendMessage(activeTab.id, { type: 'GET_PRODUCT_INFO' }, (retryRes) => {
                    if (!chrome.runtime.lastError && retryRes) {
                      handleProductResponse(retryRes);
                    }
                  });
                }, 200);
              }).catch(() => {});
            }
            return;
          }
          handleProductResponse(response);
        });
      }
    });
  }

  if (currentTab === 'saved') {
    tabSavedBtn.classList.add('active');
    tabSavedBtn.setAttribute('aria-selected', 'true');
    tabUntouchedBtn.classList.remove('active');
    tabUntouchedBtn.setAttribute('aria-selected', 'false');
    tabHiddenBtn.classList.remove('active');
    tabHiddenBtn.setAttribute('aria-selected', 'false');
    if (badgeCountEl) badgeCountEl.classList.add('badge-saved');
    searchInput.placeholder = 'Search saved games...';
    clearAllBtn.textContent = 'Remove All';
    if (genreFilter) genreFilter.style.display = 'block';
  }

  function isPlayStationGridUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
      const parsed = new URL(url);
      if (!parsed.hostname.includes('store.playstation.com')) return false;
      const path = parsed.pathname.toLowerCase();
      // Exclude single product / concept detail pages
      if (path.includes('/product/') || path.includes('/concept/')) {
        return false;
      }
      // PS Store browsing/grid routes: category, pages, search, grid, collections, view, etc.
      return (
        path.includes('/category/') ||
        path.includes('/pages/') ||
        path.includes('/grid/') ||
        path.includes('/search/') ||
        path.includes('/view/') ||
        path.includes('/collections/') ||
        path.split('/').filter(Boolean).length >= 2
      );
    } catch (e) {
      return false;
    }
  }

  function cancelScouting(isSilent = false) {
    if (!isPageScoutInProgress) return;
    stopScoutWatchdog();
    isPageScoutInProgress = false;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0] && tabs[0].id) {
        try {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'CANCEL_PAGE_SCOUT' }, () => {
            if (chrome.runtime.lastError) {}
          });
        } catch (e) {}
      }
    });

    if (scoutBtnText) {
      scoutBtnText.textContent = 'Scout Current Page';
    }
    if (scoutPageBtn) {
      scoutPageBtn.classList.remove('is-scouting', 'is-done');
      scoutPageBtn.title = 'Scout current PlayStation Store page';
    }

    if (isSilent) {
      if (scoutProgress) scoutProgress.classList.add('hidden');
      updateScoutButtonContext();
    } else {
      if (scoutProgressStatus) {
        scoutProgressStatus.textContent = 'Scouting stopped.';
      }
      setTimeout(() => {
        if (!isPageScoutInProgress) {
          if (scoutProgress) scoutProgress.classList.add('hidden');
          resetScoutButtonState();
        }
      }, 1500);
    }
  }

  function setScoutButtonEnabled(enabled) {
    if (!scoutPageBtn) return;
    if (isPageScoutInProgress) {
      scoutPageBtn.disabled = false;
      scoutPageBtn.classList.remove('disabled');
      scoutPageBtn.style.opacity = '1';
      scoutPageBtn.title = 'Click to stop scouting current page';
      return;
    }

    if (enabled) {
      scoutPageBtn.disabled = false;
      scoutPageBtn.classList.remove('disabled');
      scoutPageBtn.style.opacity = '1';
      scoutPageBtn.title = 'Scout current PlayStation Store page';
    } else {
      scoutPageBtn.disabled = true;
      scoutPageBtn.classList.add('disabled');
      scoutPageBtn.style.opacity = '0.5';
      scoutPageBtn.title = 'Navigate to a PS Store game list to scout';
    }
  }

  function updateScoutButtonContext(changeInfo) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError || !tabs || tabs.length === 0) {
        if (isPageScoutInProgress) cancelScouting(true);
        setScoutButtonEnabled(false);
        return;
      }
      const activeTab = tabs[0];
      if (!activeTab || !activeTab.url || !activeTab.url.startsWith('https://store.playstation.com/')) {
        if (isPageScoutInProgress) cancelScouting(true);
        setScoutButtonEnabled(false);
        return;
      }

      activePlayStationTabId = activeTab.id;
      const isGrid = isPlayStationGridUrl(activeTab.url);
      isCurrentTabPlayStationGrid = isGrid;

      // If URL changed away from grid page, or page reloaded while scouting:
      if (!isGrid && isPageScoutInProgress) {
        cancelScouting(true);
        setScoutButtonEnabled(false);
        return;
      } else if (changeInfo && changeInfo.status === 'loading' && isPageScoutInProgress) {
        cancelScouting(true);
        setScoutButtonEnabled(isGrid);
        return;
      }

      // Health-check with active tab content script if we think scouting is in progress
      if (isPageScoutInProgress) {
        chrome.tabs.sendMessage(activeTab.id, { action: 'GET_SCOUT_STATUS' }, (res) => {
          if (chrome.runtime.lastError || !res || res.isScouting !== true) {
            // Content script is not actually scouting! Heal the state!
            resetScoutButtonState();
          }
        });
        return;
      }

      setScoutButtonEnabled(isGrid);
    });
  }

  let scoutWatchdogInterval = null;

  function stopScoutWatchdog() {
    if (scoutWatchdogInterval) {
      clearInterval(scoutWatchdogInterval);
      scoutWatchdogInterval = null;
    }
  }

  function startScoutWatchdog(tabId) {
    stopScoutWatchdog();
    scoutWatchdogInterval = setInterval(() => {
      if (!isPageScoutInProgress || !tabId) {
        stopScoutWatchdog();
        return;
      }
      chrome.tabs.sendMessage(tabId, { action: 'GET_SCOUT_STATUS' }, (res) => {
        if (chrome.runtime.lastError || !res || res.isScouting !== true) {
          console.log('[RunScout] Watchdog: Content script scouting ended or port closed. Syncing UI.');
          stopScoutWatchdog();
          resetScoutButtonState();
        }
      });
    }, 2500);
  }

  let currentRateLimitState = { isThrottled: false, reason: null, secondsRemaining: 0, message: '' };
  let lastProgressStatusText = '';

  function resetScoutButtonState() {
    stopScoutWatchdog();
    isPageScoutInProgress = false;
    currentRateLimitState = { isThrottled: false, reason: null, secondsRemaining: 0, message: '' };
    lastProgressStatusText = '';
    if (scoutPageBtn) {
      scoutPageBtn.classList.remove('is-scouting', 'is-done', 'is-throttled');
    }
    if (scoutBtnText) {
      scoutBtnText.textContent = 'Scout Current Page';
    }
    if (scoutProgressStatus) {
      scoutProgressStatus.classList.remove('is-paused');
      scoutProgressStatus.title = '';
    }
    if (apiHeatMeter) {
      apiHeatMeter.classList.remove('is-throttled');
    }
    updateScoutButtonContext();
  }

  function initScoutButton() {
    if (!scoutPageBtn) return;

    updateScoutButtonContext();

    // Clicking the scout button toggles scouting (starts when idle, stops when in-progress)
    scoutPageBtn.addEventListener('click', () => {
      if (isPageScoutInProgress) {
        cancelScouting(false);
        return;
      }

      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (chrome.runtime.lastError || !tabs || tabs.length === 0) return;
        const activeTab = tabs[0];
        if (!activeTab || !activeTab.id || !activeTab.url || !activeTab.url.startsWith('https://store.playstation.com/')) {
          setScoutButtonEnabled(false);
          if (scoutProgress) scoutProgress.classList.remove('hidden');
          if (scoutProgressStatus) scoutProgressStatus.textContent = 'Please open an active PlayStation Store browse page.';
          setTimeout(() => {
            if (scoutProgress) scoutProgress.classList.add('hidden');
            resetScoutButtonState();
          }, 3500);
          return;
        }

        if (!isPlayStationGridUrl(activeTab.url)) {
          setScoutButtonEnabled(false);
          if (scoutProgress) scoutProgress.classList.remove('hidden');
          if (scoutProgressStatus) scoutProgressStatus.textContent = 'Please open an active PlayStation Store browse page.';
          setTimeout(() => {
            if (scoutProgress) scoutProgress.classList.add('hidden');
            resetScoutButtonState();
          }, 3500);
          return;
        }

        activePlayStationTabId = activeTab.id;
        isPageScoutInProgress = true;
        startScoutWatchdog(activeTab.id);
        scoutPageBtn.disabled = false; // Kept clickable to allow cancelling!
        scoutPageBtn.classList.add('is-scouting');
        scoutPageBtn.classList.remove('is-done');
        scoutPageBtn.title = 'Click to stop scouting current page';
        if (scoutBtnText) scoutBtnText.textContent = 'Scouting...';

        if (scoutProgress) {
          scoutProgress.classList.remove('hidden');
          if (scoutProgressStatus) scoutProgressStatus.textContent = 'Scanning game cards...';
          if (scoutProgressCounter) scoutProgressCounter.textContent = '0 / 0';
          if (scoutProgressBar) scoutProgressBar.style.width = '0%';
        }

        const showScoutPrompt = (text) => {
          if (scoutProgressStatus) scoutProgressStatus.textContent = text;
          setTimeout(() => {
            if (scoutProgress) scoutProgress.classList.add('hidden');
            resetScoutButtonState();
          }, 3500);
        };

        const attemptSendMessage = (isRetry = false) => {
          chrome.tabs.sendMessage(activeTab.id, {
            action: 'START_PAGE_SCOUT',
            forceRecheck: Boolean(forceRecheckScouted),
            deepScout: Boolean(deepScoutEnabled)
          }, async (response) => {
            if (chrome.runtime.lastError) {
              const errMsg = chrome.runtime.lastError.message || '';
              console.warn('Could not contact content script:', errMsg);
              if (!isRetry && errMsg.includes('Receiving end does not exist')) {
                try {
                  await chrome.scripting.executeScript({
                    target: { tabId: activeTab.id },
                    files: ['content.js']
                  });
                  // Brief pause to allow content script to bind message listeners
                  setTimeout(() => {
                    attemptSendMessage(true);
                  }, 200);
                  return;
                } catch (injErr) {
                  console.warn('Programmatic script injection failed:', injErr);
                  showScoutPrompt('Page not connected. Please refresh the PlayStation Store tab.');
                  return;
                }
              }
              showScoutPrompt('Page not connected. Please refresh the PlayStation Store tab.');
            }
          });
        };

        attemptSendMessage(false);
      });
    });

    // Hover feedback on scoutPageBtn while scouting
    scoutPageBtn.addEventListener('mouseenter', () => {
      if (isPageScoutInProgress && scoutBtnText) {
        scoutBtnText.textContent = 'Stop Scouting';
      }
    });

    scoutPageBtn.addEventListener('mouseleave', () => {
      if (isPageScoutInProgress && scoutBtnText) {
        scoutBtnText.textContent = 'Scouting...';
      }
    });

    // Dedicated Stop button in progress header
    if (scoutCancelBtn) {
      scoutCancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        cancelScouting(false);
      });
    }

    // Tab switch and navigation context listeners
    if (chrome.tabs && chrome.tabs.onActivated) {
      chrome.tabs.onActivated.addListener(() => {
        updateScoutButtonContext();
      });
    }

    if (chrome.tabs && chrome.tabs.onUpdated) {
      chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.url || changeInfo.status === 'complete' || changeInfo.status === 'loading') {
          updateScoutButtonContext(changeInfo);
        }
      });
    }

    // Real-time progress and completion listener from content script
    chrome.runtime.onMessage.addListener((message) => {
      if (!message) return;

      if (message.action === 'SCOUT_PROGRESS') {
        const current = message.current || 0;
        const total = message.total || 0;
        if (scoutProgress) scoutProgress.classList.remove('hidden');
        const statusText = total > 0 ? `Scouting (${current}/${total})...` : 'Scouting...';
        if (currentRateLimitState && currentRateLimitState.isThrottled) {
          lastProgressStatusText = statusText;
        } else if (scoutProgressStatus) {
          scoutProgressStatus.textContent = statusText;
          scoutProgressStatus.classList.remove('is-paused');
          scoutProgressStatus.title = '';
        }
        if (scoutProgressCounter) {
          scoutProgressCounter.textContent = `${current} / ${total}`;
        }
        if (scoutProgressBar) {
          const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
          scoutProgressBar.style.width = `${pct}%`;
        }
      } else if (message.action === 'SCOUT_COMPLETE') {
        const total = message.total || 0;
        if (scoutProgressBar) scoutProgressBar.style.width = '100%';
        if (scoutProgressStatus) {
          scoutProgressStatus.textContent = total === 0 ? 'All games already scouted!' : `Scouted ${total} game${total === 1 ? '' : 's'}!`;
          scoutProgressStatus.classList.remove('is-paused');
        }
        if (scoutBtnText) scoutBtnText.textContent = 'Scouted!';
        scoutPageBtn.classList.remove('is-scouting', 'is-throttled');
        scoutPageBtn.classList.add('is-done');

        setTimeout(() => {
          if (scoutProgress) scoutProgress.classList.add('hidden');
          resetScoutButtonState();
        }, 2500);
      } else if (message.action === 'SCOUT_CANCELLED') {
        isPageScoutInProgress = false;
        if (scoutProgressStatus) {
          scoutProgressStatus.textContent = message.reason === 'navigated_away'
            ? 'Scouting stopped (navigated away).'
            : 'Scouting stopped.';
          scoutProgressStatus.classList.remove('is-paused');
        }
        if (scoutBtnText) scoutBtnText.textContent = 'Scout Current Page';
        scoutPageBtn.classList.remove('is-scouting', 'is-throttled');
        setTimeout(() => {
          if (!isPageScoutInProgress) {
            if (scoutProgress) scoutProgress.classList.add('hidden');
            resetScoutButtonState();
          }
        }, 1500);
      } else if (message.action === 'GRID_PAGE_RESTORED') {
        updateScoutButtonContext();
      } else if (message.action === 'API_HEAT_UPDATE') {
        if (!currentRateLimitState || !currentRateLimitState.isThrottled) {
          updateHeatMeter(message.count, message.max);
        }
      } else if (message.action === 'API_RATE_LIMIT_STATUS') {
        if (message.isThrottled) {
          currentRateLimitState = message;
          if (apiHeatMeter) {
            apiHeatMeter.classList.add('is-throttled');
          }
          if (apiHeatCounter) {
            apiHeatCounter.textContent = `Throttled: ${message.secondsRemaining}s cooldown`;
            apiHeatCounter.classList.remove('heat-safe', 'heat-warm');
            apiHeatCounter.classList.add('heat-throttled');
          }
          if (apiHeatFill) {
            apiHeatFill.classList.remove('heat-safe', 'heat-warm');
            apiHeatFill.classList.add('heat-throttled');
            apiHeatFill.style.width = '100%';
          }
          if (apiHeatIcon) {
            apiHeatIcon.classList.remove('heat-safe', 'heat-warm');
            apiHeatIcon.classList.add('heat-throttled');
          }

          if (isPageScoutInProgress) {
            if (!lastProgressStatusText && scoutProgressStatus && !scoutProgressStatus.classList.contains('is-paused')) {
              lastProgressStatusText = scoutProgressStatus.textContent;
            }
            if (scoutProgressStatus) {
              scoutProgressStatus.textContent = `⏸ ${message.message}`;
              scoutProgressStatus.classList.add('is-paused');
              scoutProgressStatus.title = message.message;
            }
            if (scoutBtnText) {
              scoutBtnText.textContent = `Paused (${message.secondsRemaining}s)`;
            }
            if (scoutPageBtn) {
              scoutPageBtn.classList.add('is-throttled');
            }
          }
        } else {
          currentRateLimitState = { isThrottled: false, reason: null, secondsRemaining: 0, message: '' };
          if (apiHeatMeter) {
            apiHeatMeter.classList.remove('is-throttled');
          }
          if (scoutPageBtn) {
            scoutPageBtn.classList.remove('is-throttled');
          }
          if (scoutProgressStatus) {
            scoutProgressStatus.classList.remove('is-paused');
            scoutProgressStatus.title = '';
            if (isPageScoutInProgress && lastProgressStatusText) {
              scoutProgressStatus.textContent = lastProgressStatusText;
              lastProgressStatusText = '';
            }
          }
          if (isPageScoutInProgress && scoutBtnText) {
            scoutBtnText.textContent = 'Scouting...';
          }
          pollApiHeat();
        }
      }
    });
  }

  function updateHeatMeter(count, max = 8) {
    if (!apiHeatFill || !apiHeatCounter) return;
    const safeCount = Math.max(0, Number(count) || 0);
    const safeMax = Math.max(1, Number(max) || 8);
    const percentage = Math.min(100, Math.round((safeCount / safeMax) * 100));

    apiHeatFill.style.width = `${percentage}%`;
    apiHeatCounter.textContent = `API Heat: ${safeCount}/${safeMax}`;

    // Color transition based on capacity:
    // 0% - 60%: Cool Cyan (Safe)
    // 61% - 85%: Yellow/Orange (Warming up)
    // 86% - 100%: Red (Throttled/Waiting)
    apiHeatFill.classList.remove('heat-safe', 'heat-warm', 'heat-throttled');
    apiHeatCounter.classList.remove('heat-safe', 'heat-warm', 'heat-throttled');
    if (apiHeatIcon) {
      apiHeatIcon.classList.remove('heat-safe', 'heat-warm', 'heat-throttled');
    }

    if (percentage <= 60) {
      apiHeatFill.classList.add('heat-safe');
      apiHeatCounter.classList.add('heat-safe');
      if (apiHeatIcon) apiHeatIcon.classList.add('heat-safe');
    } else if (percentage <= 85) {
      apiHeatFill.classList.add('heat-warm');
      apiHeatCounter.classList.add('heat-warm');
      if (apiHeatIcon) apiHeatIcon.classList.add('heat-warm');
    } else {
      apiHeatFill.classList.add('heat-throttled');
      apiHeatCounter.classList.add('heat-throttled');
      if (apiHeatIcon) apiHeatIcon.classList.add('heat-throttled');
    }
  }

  function pollApiHeat() {
    try {
      chrome.runtime.sendMessage({ action: 'GET_API_HEAT' }, (res) => {
        if (chrome.runtime.lastError || !res) return;
        if (typeof res.count === 'number' && (!currentRateLimitState || !currentRateLimitState.isThrottled)) {
          updateHeatMeter(res.count, res.max);
        }
      });
      chrome.runtime.sendMessage({ action: 'GET_RATE_LIMIT_STATUS' }, (res) => {
        if (chrome.runtime.lastError || !res) return;
        if (res.isThrottled) {
          currentRateLimitState = res;
          if (apiHeatMeter) apiHeatMeter.classList.add('is-throttled');
          if (apiHeatCounter) {
            apiHeatCounter.textContent = `Throttled: ${res.secondsRemaining}s cooldown`;
            apiHeatCounter.classList.remove('heat-safe', 'heat-warm');
            apiHeatCounter.classList.add('heat-throttled');
          }
        }
      });
    } catch (e) {}
  }

  if (headerSubtitle) {
    headerSubtitle.textContent = 'Saved Games Manager';
  }

  initMasterToggle();
  loadMasterList();
  healActiveTabIfProductPage();
  initScoutButton();
  pollApiHeat();
  setInterval(pollApiHeat, 1000);

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.run-status-wrapper')) {
      document.querySelectorAll('.run-status-menu:not([hidden])').forEach((m) => {
        m.hidden = true;
      });
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.run-status-menu:not([hidden])').forEach((m) => {
        m.hidden = true;
      });
    }
  });
});
   