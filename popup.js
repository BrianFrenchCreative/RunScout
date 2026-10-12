/**
 * PS Store Scout - Popup Logic
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

  const tabSavedBtn = document.getElementById('tabSaved');
  const tabUntouchedBtn = document.getElementById('tabUntouched');
  const tabHiddenBtn = document.getElementById('tabHidden');
  const tabSavedBadge = document.getElementById('tabSavedBadge');
  const tabUntouchedBadge = document.getElementById('tabUntouchedBadge');
  const tabHiddenBadge = document.getElementById('tabHiddenBadge');

  const RECENT_LIMIT = 15;
  let currentTab = 'saved'; // 'saved' | 'untouched' | 'hidden'
  let gamesMasterList = {};
  let isShowAllExpanded = false;
  let isUntouchedFilterActive = false;
  let confirmClearTimeout = null;
  let activeDbProvider = 'therun'; // 'therun' | 'src' | 'custom'
  let customDbUrl = 'https://nudatabase.com/?q=';

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

  // Initialize and track search provider preference (default to 'therun')
  chrome.storage.local.get({ dbProvider: 'therun', customDbUrl: 'https://nudatabase.com/?q=' }, (res) => {
    activeDbProvider = (res && (res.dbProvider === 'src' || res.dbProvider === 'custom')) ? res.dbProvider : 'therun';
    customDbUrl = (res && res.customDbUrl) ? res.customDbUrl : 'https://nudatabase.com/?q=';
    if (dbSelector) {
      dbSelector.value = activeDbProvider;
    }
  });

  if (dbSelector) {
    dbSelector.addEventListener('change', () => {
      const selected = dbSelector.value;
      activeDbProvider = (selected === 'src' || selected === 'custom') ? selected : 'therun';
      chrome.storage.local.set({ dbProvider: activeDbProvider }, () => {
        renderList();
      });
    });
  }

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
   * - Untouched Tab: isUntouched === true (decoupled from isHidden)
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
      customDbUrl: 'https://nudatabase.com/?q='
    }, (result) => {
      if (result.dbProvider) {
        activeDbProvider = (result.dbProvider === 'src' || result.dbProvider === 'custom') ? result.dbProvider : 'therun';
        if (dbSelector) dbSelector.value = activeDbProvider;
      }
      if (result.customDbUrl !== undefined) {
        customDbUrl = result.customDbUrl || 'https://nudatabase.com/?q=';
      }
      const { masterList, needsSave } = migrateToGamesMasterList(result || {});
      gamesMasterList = masterList;
      if (needsSave) {
        chrome.storage.local.set({ gamesMasterList: masterList }, () => {
          chrome.storage.local.remove(['hiddenGames', 'savedGames']);
        });
      }
      updateGenreFilterOptions();
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
        downloadLink.download = `PS_Store_Scout_Backup_${timestamp}.json`;
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
        renderList();
      }
      if (changes.customDbUrl !== undefined) {
        customDbUrl = changes.customDbUrl.newValue || 'https://nudatabase.com/?q=';
        if (activeDbProvider === 'custom') {
          renderList();
        }
      }
      if (changes.gamesMasterList) {
        gamesMasterList = changes.gamesMasterList.newValue || {};
        updateGenreFilterOptions();
        renderList();
      }
    }
  });

  function healActiveTabIfProductPage() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError || !tabs || tabs.length === 0) return;
      const activeTab = tabs[0];
      if (!activeTab || !activeTab.url || !activeTab.id) return;

      if (activeTab.url.includes('/product/') || activeTab.url.includes('/concept/')) {
        const activeLocale = extractStoreLocale(activeTab.url);
        if (activeLocale) {
          currentStoreLocale = activeLocale;
          chrome.storage.local.set({ lastSeenStoreLocale: activeLocale });
        }

        chrome.tabs.sendMessage(activeTab.id, { type: 'GET_PRODUCT_INFO' }, (response) => {
          if (chrome.runtime.lastError || !response || !response.title) return;
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

  if (headerSubtitle) {
    headerSubtitle.textContent = 'Saved Games Manager';
  }

  initMasterToggle();
  loadMasterList();
  healActiveTabIfProductPage();

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
