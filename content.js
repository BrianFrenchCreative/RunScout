/**
 * PlayStation Store Game Hider - Content Script
 * 
 * Features:
 * 1. Catalog Grid:
 *    - Injects Top-Right "Hide" button: hides tile, saves with status: "hidden".
 *    - Injects Top-Left "Save" button: star icon (grey outline -> filled yellow), saves with status: "saved".
 *    - "Saved" games are NEVER hidden from the grid, even if hiding is active.
 *    - Mutual exclusivity: a game cannot be simultaneously "hidden" and "saved".
 * 2. Product Pages:
 *    - Detects product pages via h1[data-qa="mfe-game-title#name"].
 *    - Injects inline actions: "Hide/Unhide" button and "Save/Bookmark" button side-by-side.
 *    - Immediate UI feedback without requiring page reload.
 * 3. Search Auto-Forward & URL Healing:
 *    - Forwards #ps-hider-direct search links to canonical product URLs.
 *    - Upgrades stored URLs to canonical product URLs.
 */

(function () {
  'use strict';

  // Intercept and swallow any orphaned context invalidation errors gracefully
  window.addEventListener('error', (event) => {
    if (event && event.message && event.message.includes('Extension context invalidated')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    if (event && event.reason && String(event.reason).includes('Extension context invalidated')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  function isExtensionValid() {
    try {
      return Boolean(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  function safeStorageGet(keys, callback) {
    if (!isExtensionValid()) return;
    try {
      chrome.storage.local.get(keys, (result) => {
        if (!isExtensionValid() || (chrome.runtime && chrome.runtime.lastError)) return;
        callback(result);
      });
    } catch (e) {}
  }

  function safeStorageSet(data, callback) {
    if (!isExtensionValid()) return;
    try {
      chrome.storage.local.set(data, () => {
        if (!isExtensionValid() || (chrome.runtime && chrome.runtime.lastError)) return;
        if (callback) callback();
      });
    } catch (e) {}
  }

  /**
   * Extracts the current storefront locale (e.g. 'en-us', 'en-gb', 'es-es', 'pt-pt').
   */
  function extractStoreLocale(urlOrPath = window.location.pathname) {
    const match = String(urlOrPath).match(/\/([a-z]{2}-[a-z0-9]{2,4}|[a-z]{2})\//i);
    return match ? match[1].toLowerCase() : 'en-us';
  }

  /**
   * Checks if a URL represents a product or concept page.
   */
  function isProductOrConceptPage(url = window.location.href) {
    return Boolean(url && (url.includes('/product/') || url.includes('/concept/')));
  }

  /**
   * Checks if a URL represents a PlayStation Store browsing/category/grid page.
   */
  function isPlayStationGridUrl(url = window.location.href) {
    if (!url || typeof url !== 'string') return false;
    try {
      const parsed = new URL(url);
      if (!parsed.hostname.includes('store.playstation.com')) return false;
      const path = parsed.pathname.toLowerCase();
      if (path.includes('/product/') || path.includes('/concept/')) {
        return false;
      }
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

  /**
   * Extracts concept or product ID identifier token from a URL.
   */
  function extractConceptOrProductId(url) {
    if (!url || typeof url !== 'string') return '';
    const conceptMatch = url.match(/\/concept\/([0-9]+)/i);
    if (conceptMatch) return `concept:${conceptMatch[1]}`;
    const prodMatch = url.match(/\/product\/([A-Za-z0-9_-]+)/i);
    if (prodMatch) return `product:${prodMatch[1]}`;
    return '';
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

  function extractTitle(item) {
    if (typeof item === 'string') return item.trim();
    if (item && typeof item.title === 'string') return item.title.trim();
    return '';
  }

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

    const currentLocale = extractStoreLocale(window.location.pathname);

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
          url = `https://store.playstation.com/${currentLocale}/search/` + encodeURIComponent(title) + '#ps-hider-direct';
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
          url = `https://store.playstation.com/${currentLocale}/search/` + encodeURIComponent(title) + '#ps-hider-direct';
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
      if (typeof g.runStatus !== 'string') {
        g.runStatus = g.isUntouched ? 'untouched' : (g.hasRuns ? 'has_runs' : 'unverified');
      }
      if (!Array.isArray(g.genres)) g.genres = [];
      if (typeof g.timestamp !== 'number') g.timestamp = Date.now();
    }

    return { masterList, needsSave };
  }

  if (!isExtensionValid()) return;

  // Retrieve initial settings from storage
  safeStorageGet({
    isHidingEnabled: true,
    gamesMasterList: null,
    hiddenGames: null,
    savedGames: null,
    autoHideHasRuns: false,
    autoHideVrGames: false,
    autoHideSimulators: false,
    autoHideSimulatorGames: false,
    customHideKeywords: []
  }, (settings) => {
    const isHiding = settings ? settings.isHidingEnabled !== false : true;
    const autoHideRuns = settings ? Boolean(settings.autoHideHasRuns === true) : false;
    const autoHideVr = settings ? Boolean(settings.autoHideVrGames === true) : false;
    const autoHideSim = settings ? Boolean(settings.autoHideSimulators === true || settings.autoHideSimulatorGames === true) : false;
    const customKeywords = (settings && Array.isArray(settings.customHideKeywords)) ? settings.customHideKeywords : [];
    const { masterList, needsSave } = migrateToGamesMasterList(settings || {});
    if (needsSave) {
      safeStorageSet({ gamesMasterList: masterList });
      try { chrome.storage.local.remove(['hiddenGames', 'savedGames']); } catch (e) {}
    }
    startHiderExtension(masterList, isHiding, autoHideRuns, autoHideVr, autoHideSim, customKeywords);
  });

  function startHiderExtension(initialMasterList, initialHidingEnabled, initialAutoHideHasRuns, initialAutoHideVrGames, initialAutoHideSimulators, initialCustomKeywords) {
    let isHidingActive = initialHidingEnabled;
    let autoHideHasRuns = Boolean(initialAutoHideHasRuns === true);
    let autoHideVrGames = Boolean(initialAutoHideVrGames === true);
    let autoHideSimulators = Boolean(initialAutoHideSimulators === true);
    let customHideKeywords = Array.isArray(initialCustomKeywords) ? initialCustomKeywords : [];
    let gamesMasterList = initialMasterList || {};
    let toastTimeout = null;
    let isBatchScheduled = false;

    // Cache the active storefront locale
    const activeLocale = extractStoreLocale(window.location.pathname);
    safeStorageSet({ lastSeenStoreLocale: activeLocale });

    function getPageProductId() {
      const urlId = extractConceptOrProductId(window.location.href);
      if (urlId.startsWith('product:')) return urlId;
      const ldScript = document.getElementById('mfe-jsonld-tags');
      if (ldScript) {
        try {
          const parsed = JSON.parse(ldScript.textContent);
          if (parsed && parsed.sku) {
            return `product:${parsed.sku}`;
          }
        } catch (e) {}
      }
      return '';
    }

    function getGameRecord(title, url) {
      if (!title || typeof title !== 'string') return null;
      const key = getGameKey(title);
      if (key && gamesMasterList[key]) return gamesMasterList[key];

      // Fallback: Check stripped edition key if different
      const strippedKey = getGameKey(stripEditionSuffix(title));
      if (strippedKey && strippedKey !== key && gamesMasterList[strippedKey]) {
        return gamesMasterList[strippedKey];
      }

      if (url) {
        const id = extractConceptOrProductId(url);
        if (id) {
          for (const k of Object.keys(gamesMasterList)) {
            const item = gamesMasterList[k];
            if (item.url && extractConceptOrProductId(item.url) === id) {
              return item;
            }
          }
        }
      }
      return null;
    }

    function getGameRunStatus(title) {
      const record = getGameRecord(title);
      if (record) {
        if (record.isUntouched) return 'untouched';
        if (record.hasRuns) return 'has_runs';
        if (record.runStatus) return record.runStatus;
      }
      return 'unverified';
    }

    function isGameSaved(title, url = window.location.href) {
      const record = getGameRecord(title, url);
      return Boolean(record && record.isSaved === true);
    }

    function isGameHidden(title, url = window.location.href) {
      const record = getGameRecord(title, url);
      return Boolean(record && record.isHidden === true);
    }

    // Icons
    const EYE_OFF_ICON_SVG = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ps-product-toggle-icon">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
        <line x1="1" y1="1" x2="23" y2="23"></line>
      </svg>
    `;

    const BOOKMARK_OUTLINE_SVG = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ps-bookmark-icon ps-star-icon">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
      </svg>
    `;

    const BOOKMARK_FILLED_SVG = `
      <svg viewBox="0 0 24 24" fill="#facc15" stroke="#facc15" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ps-bookmark-icon ps-star-icon">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
      </svg>
    `;

    const STAR_OUTLINE_SVG = BOOKMARK_OUTLINE_SVG;
    const STAR_FILLED_SVG = BOOKMARK_FILLED_SVG;

    const SEARCH_MAGNIFIER_ICON_SVG = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ps-search-icon ps-stopwatch-icon" aria-hidden="true">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      </svg>
    `;

    const STOPWATCH_ICON_SVG = SEARCH_MAGNIFIER_ICON_SVG;

    const RADAR_ICON_SVG = `
      <svg class="ps-scout-radar-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M12 2a10 10 0 0 1 10 10"></path>
        <line x1="12" y1="12" x2="19" y2="5"></line>
        <circle cx="12" cy="12" r="2"></circle>
      </svg>
    `;

    // Session-level Scout cache to prevent redundant API queries
    const sessionScoutCache = new Map();
    let isScoutingInProgress = false;
    let isBackgroundThrottled = false;
    let scoutAbortController = null;

    /**
     * Halts an active page scouting queue gracefully.
     */
    function cancelPageScout(reason = 'user_cancelled') {
      if (!isScoutingInProgress) return;
      console.log(`[PS Store Scout] Cancelling active scout (reason: ${reason})`);
      isScoutingInProgress = false;
      if (scoutAbortController) {
        try {
          scoutAbortController.abort();
        } catch (e) {}
        scoutAbortController = null;
      }
      try {
        chrome.runtime.sendMessage({ action: 'SCOUT_CANCELLED', reason });
      } catch (e) {}
    }

    /**
     * Cancellable sleep promise for API throttling intervals.
     */
    function abortableSleep(ms, signal) {
      return new Promise((resolve) => {
        if (!signal || signal.aborted) return resolve();
        const timer = setTimeout(resolve, ms);
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          resolve();
        }, { once: true });
      });
    }

    /**
     * Extracts direct product/concept URL from a catalog product tile.
     */
    function getTileProductUrl(tile) {
      if (!tile) return '';
      const prodAnchor = tile.querySelector('a[href*="/product/"], a[href*="/concept/"]');
      if (prodAnchor && prodAnchor.href && !prodAnchor.href.endsWith('#')) {
        return prodAnchor.href;
      }
      const telemAnchor = tile.querySelector('a[data-telemetry-meta]');
      if (telemAnchor && telemAnchor.href && !telemAnchor.href.endsWith('#')) {
        return telemAnchor.href;
      }
      const anyAnchor = tile.querySelector('a[href]:not([href="#"]):not([href=""])');
      if (anyAnchor && anyAnchor.href) {
        return anyAnchor.href;
      }
      return '';
    }

    /**
     * Extracts the game name from a PlayStation store catalog product tile.
     */
    function getCatalogGameTitle(tile) {
      if (!isExtensionValid() || !tile) return null;
      const anchor = tile.querySelector('a[data-telemetry-meta]') || tile.querySelector('a');
      if (anchor) {
        const telemetryMeta = anchor.getAttribute('data-telemetry-meta');
        if (telemetryMeta) {
          try {
            const parsed = JSON.parse(telemetryMeta);
            if (parsed && typeof parsed.name === 'string' && parsed.name.trim()) {
              return parsed.name.trim();
            }
          } catch (err) {}
        }

        const ariaLabel = anchor.getAttribute('aria-label');
        if (ariaLabel && ariaLabel.trim()) {
          return ariaLabel.trim();
        }

        const titleAttr = anchor.getAttribute('title');
        if (titleAttr && titleAttr.trim()) {
          return titleAttr.trim();
        }
      }

      // Fallback 1: Tile container title or aria-label
      const containerAria = tile.getAttribute('aria-label') || tile.getAttribute('title');
      if (containerAria && containerAria.trim()) {
        return containerAria.trim();
      }

      // Fallback 2: Name/title span text
      const nameEl = tile.querySelector('[data-qa*="product-name"], [data-qa*="game-card#name"], .psw-t-title-m, .psw-t-body, .psw-c-t-1');
      if (nameEl && nameEl.textContent && nameEl.textContent.trim()) {
        return nameEl.textContent.trim();
      }

      // Fallback 3: Image alt attribute
      const img = tile.querySelector('img[alt]');
      if (img && img.getAttribute('alt') && img.getAttribute('alt').trim()) {
        return img.getAttribute('alt').trim();
      }

      return null;
    }

    /**
     * Helper function to detect if a game is a VR title from its title or card DOM elements.
     * Inspects title keywords and card innerText, subtitle spans, and aria-label attributes.
     */
    function isVrGame(cardElement, title) {
      if (!cardElement && !title) return false;

      // 1. Check extracted title against VR keywords (VR, PSVR, PSVR2, PS VR, PlayStation VR)
      if (title && typeof title === 'string') {
        if (/\b(?:VR|PSVR2?|PS\s*VR2?|PlayStation(?:\u00AE|\u2122)?\s*VR2?)\b/i.test(title)) {
          return true;
        }
      }

      if (!cardElement) return false;

      const vrDomRegex = /\b(?:PS\s*VR2?|PSVR2?|PlayStation(?:\u00AE|\u2122)?\s*VR2?)\b/i;

      // 2. Query aria-label attributes on cardElement and its children
      const cardAria = cardElement.getAttribute('aria-label') || '';
      if (vrDomRegex.test(cardAria)) {
        return true;
      }
      const childAriaNodes = cardElement.querySelectorAll('[aria-label]');
      for (let i = 0; i < childAriaNodes.length; i++) {
        const ariaVal = childAriaNodes[i].getAttribute('aria-label') || '';
        if (vrDomRegex.test(ariaVal)) {
          return true;
        }
      }

      // 3. Query subtitle spans, platform tags, and compatibility badges
      const subtitleNodes = cardElement.querySelectorAll(
        '[data-qa*="compatibility"], [data-qa*="badge"], [data-qa*="tag"], [data-qa*="sub"], ' +
        '.psw-c-t-2, .psw-c-t-sub-body, .psw-t-meta, .psw-badge, span, p'
      );
      for (let i = 0; i < subtitleNodes.length; i++) {
        const text = subtitleNodes[i].textContent || '';
        if (vrDomRegex.test(text)) {
          return true;
        }
      }

      // 4. Query full inner text of cardElement (and parent list item if applicable)
      const fullText = cardElement.innerText || cardElement.textContent || '';
      if (vrDomRegex.test(fullText)) {
        return true;
      }

      const parentLi = cardElement.closest('li');
      if (parentLi) {
        const liAria = parentLi.getAttribute('aria-label') || '';
        if (vrDomRegex.test(liAria)) {
          return true;
        }
      }

      return false;
    }

    /**
     * Helper function to detect if a game title indicates a simulator game.
     * Matches word boundary for "simulator" or "simulators" case-insensitively.
     */
    function isSimulatorGame(title) {
      if (!title || typeof title !== 'string') return false;
      return /\bsimulators?\b/i.test(title);
    }

    /**
     * Helper function to detect if a game title matches any user-defined keyword.
     * Evaluates case-insensitively against all entries in customHideKeywords.
     */
    function matchesCustomKeyword(title, keywords) {
      if (!title || typeof title !== 'string' || !Array.isArray(keywords) || keywords.length === 0) {
        return null;
      }
      const lowerTitle = title.toLowerCase();
      for (const kw of keywords) {
        if (typeof kw === 'string' && kw.trim()) {
          const trimmed = kw.trim().toLowerCase();
          if (lowerTitle.includes(trimmed)) {
            return kw.trim();
          }
        }
      }
      return null;
    }

    /**
     * Automatically conceals all visible catalog tiles that match active simulator rules or custom keywords.
     */
    function autoHideMatchingCatalogTiles() {
      if (!isHidingActive) return;
      if (!autoHideSimulators && (!customHideKeywords || customHideKeywords.length === 0)) return;

      const tiles = document.querySelectorAll('div.psw-product-tile');
      let changed = false;
      tiles.forEach((tile) => {
        const rawTitle = getCatalogGameTitle(tile);
        if (!rawTitle) return;
        const key = getGameKey(rawTitle);
        const game = gamesMasterList[key];
        if (game && game.isSaved) return;

        let matched = false;
        let genreToAdd = null;

        if (customHideKeywords.length > 0) {
          const matchedKw = matchesCustomKeyword(rawTitle, customHideKeywords);
          if (matchedKw) {
            matched = true;
            if (/^simulator/i.test(matchedKw)) genreToAdd = 'Simulator';
            if (/^vr/i.test(matchedKw) || /^psvr/i.test(matchedKw)) genreToAdd = 'VR';
          } else {
            const hasVrKeyword = customHideKeywords.some((k) => /\b(?:vr|psvr2?)\b/i.test(k));
            if (hasVrKeyword && isVrGame(tile, rawTitle)) {
              matched = true;
              genreToAdd = 'VR';
            }
          }
        }

        if (!matched && autoHideSimulators && isSimulatorGame(rawTitle)) {
          matched = true;
          genreToAdd = 'Simulator';
        }

        if (matched) {
          if (!gamesMasterList[key]) {
            const url = getTileProductUrl(tile);
            gamesMasterList[key] = {
              title: rawTitle,
              url: url || '',
              timestamp: Date.now(),
              genres: genreToAdd ? [genreToAdd] : [],
              isSaved: false,
              isHidden: true,
              isUntouched: false,
              hasRuns: false,
              runStatus: 'unverified',
              isPinned: false
            };
          } else {
            gamesMasterList[key].isHidden = true;
            gamesMasterList[key].timestamp = Date.now();
            if (genreToAdd) {
              if (!gamesMasterList[key].genres) {
                gamesMasterList[key].genres = [genreToAdd];
              } else if (!gamesMasterList[key].genres.includes(genreToAdd)) {
                gamesMasterList[key].genres.push(genreToAdd);
              }
            }
          }
          hideCatalogTile(tile, rawTitle);
          changed = true;
        }
      });

      if (changed) {
        safeStorageSet({ gamesMasterList });
      }
    }

    /**
     * Upgrades any legacy search URL or missing URL in storage to canonical product URL.
     */
    function healProductUrl(gameTitle, canonicalUrl) {
      if (!isExtensionValid() || !gameTitle || !canonicalUrl) return;
      if (!isProductOrConceptPage(canonicalUrl)) return;

      const key = getGameKey(gameTitle);
      if (gamesMasterList[key]) {
        const game = gamesMasterList[key];
        let changed = false;
        if (!game.url || game.url.includes('/search/')) {
          game.url = canonicalUrl;
          changed = true;
        }
        if (!game.genres || game.genres.length === 0) {
          const genres = getProductGenres();
          if (genres.length > 0) {
            game.genres = genres;
            changed = true;
          }
        }
        if (changed) {
          safeStorageSet({ gamesMasterList });
        }
      }
    }

    /**
     * Auto-forwards #ps-hider-direct search links to canonical product URLs.
     */
    function handleSearchAutoRedirect() {
      if (!isExtensionValid()) return;
      if (!window.location.hash.includes('ps-hider-direct')) return;

      const pathParts = window.location.pathname.split('/');
      const searchIndex = pathParts.indexOf('search');
      let query = '';
      if (searchIndex !== -1 && pathParts[searchIndex + 1]) {
        query = decodeURIComponent(pathParts[searchIndex + 1]).trim().toLowerCase();
      }

      const tiles = document.querySelectorAll('div.psw-product-tile');
      if (tiles.length === 0) return;

      let targetTile = null;
      if (query) {
        for (let i = 0; i < tiles.length; i++) {
          const title = getCatalogGameTitle(tiles[i]);
          if (title && title.toLowerCase() === query) {
            targetTile = tiles[i];
            break;
          }
        }
      }
      if (!targetTile) {
        targetTile = tiles[0];
      }

      const productUrl = getTileProductUrl(targetTile);
      const gameTitle = getCatalogGameTitle(targetTile) || query;

      if (productUrl && (productUrl.includes('/product/') || productUrl.includes('/concept/'))) {
        if (gameTitle) {
          healProductUrl(gameTitle, productUrl);
        }
        window.location.replace(productUrl);
      }
    }

    /**
     * Hides the closest parent <li> element of a catalog tile.
     */
    function hideCatalogTile(tile, gameName) {
      const parentLi = tile.closest('li');
      if (parentLi) {
        parentLi.style.setProperty('display', 'none', 'important');
        parentLi.dataset.psHiddenGame = gameName;
      } else {
        tile.style.setProperty('display', 'none', 'important');
        tile.dataset.psHiddenGame = gameName;
      }
    }

    /**
     * Unhides a previously hidden element.
     */
    function unhideElement(element) {
      element.style.removeProperty('display');
      delete element.dataset.psHiddenGame;
    }

    /**
     * Displays toast notification with optional Undo action.
     */
    function showToast(gameName, actionType = 'hidden') {
      const existingToast = document.getElementById('ps-hider-toast');
      if (existingToast) existingToast.remove();
      if (toastTimeout) clearTimeout(toastTimeout);

      const toast = document.createElement('div');
      toast.id = 'ps-hider-toast';
      toast.className = `ps-hider-toast ${actionType === 'saved' ? 'ps-toast-saved' : ''}`;

      let iconSvg;
      let labelText;

      if (actionType === 'saved') {
        iconSvg = BOOKMARK_FILLED_SVG;
        labelText = 'Saved to Bookmarks:';
      } else if (actionType === 'unsaved') {
        iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        labelText = 'Removed from Bookmarks:';
      } else if (actionType === 'status-untouched') {
        iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="#facc15" stroke="#facc15" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
        labelText = 'Speedrun Status: Untouched';
      } else if (actionType === 'status-has-runs') {
        iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"></circle><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="5" x2="12" y2="2"></line><line x1="10" y1="2" x2="14" y2="2"></line></svg>`;
        labelText = 'Speedrun Status: Has Runs';
      } else if (actionType === 'status-unverified') {
        iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" stroke-dasharray="3 3"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
        labelText = 'Speedrun Status: Unverified';
      } else {
        iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        labelText = actionType === 'unhidden' ? 'Restored:' : 'Hidden:';
      }

      toast.innerHTML = `
        <div class="ps-hider-toast-icon">${iconSvg}</div>
        <div class="ps-hider-toast-text">
          ${labelText} <span class="ps-hider-toast-title"></span>
        </div>
        ${actionType !== 'unsaved' ? '<button type="button" class="ps-hider-toast-undo">Undo</button>' : ''}
      `;

      toast.querySelector('.ps-hider-toast-title').textContent = gameName;

      const undoBtn = toast.querySelector('.ps-hider-toast-undo');
      if (undoBtn) {
        undoBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (actionType === 'saved') {
            removeGameFromStorage(gameName);
          } else {
            removeGameFromStorage(gameName);
          }
          toast.remove();
        });
      }

      document.body.appendChild(toast);
      toastTimeout = setTimeout(() => {
        toast.remove();
      }, 4500);
    }

    /**
     * Completely removes a game from storage (unhide or unsave).
     */
    function removeGameFromStorage(gameName) {
      if (!isExtensionValid() || !gameName) return;
      const key = getGameKey(gameName);
      if (gamesMasterList[key]) {
        gamesMasterList[key].isSaved = false;
        gamesMasterList[key].isHidden = false;
        gamesMasterList[key].isUntouched = false;
        safeStorageSet({ gamesMasterList });
      }

      // Restore DOM elements if previously hidden
      document.querySelectorAll(`[data-ps-hidden-game]`).forEach((el) => {
        if (el.dataset.psHiddenGame && getGameKey(el.dataset.psHiddenGame) === key) {
          unhideElement(el);
        }
      });

      // Re-scan tiles to refresh button states
      document.querySelectorAll(`div.psw-product-tile`).forEach((tile) => {
        const title = getCatalogGameTitle(tile);
        if (title && getGameKey(title) === key) {
          const saveBtn = tile.querySelector('.ps-save-btn');
          if (saveBtn) updateCatalogSaveButtonState(saveBtn, false, title);
        }
      });
    }

    /* ==========================================================================
       CATALOG GRID: SAVE & HIDE BUTTONS
       ========================================================================== */

    function updateCatalogSaveButtonState(btn, isSaved, gameName) {
      btn.dataset.gameTitle = gameName;
      if (isSaved) {
        btn.classList.add('ps-is-saved');
        btn.setAttribute('aria-label', `Remove bookmark for ${gameName}`);
        btn.setAttribute('title', `Remove bookmark for "${gameName}"`);
        btn.innerHTML = `${STAR_FILLED_SVG}<span>Saved</span>`;
      } else {
        btn.classList.remove('ps-is-saved');
        btn.setAttribute('aria-label', `Save ${gameName}`);
        btn.setAttribute('title', `Save "${gameName}"`);
        btn.innerHTML = `${STAR_OUTLINE_SVG}<span>Save</span>`;
      }
    }

    function createCatalogSaveButton(gameName, tile) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ps-save-btn';
      btn.dataset.gameTitle = gameName;
      const isSaved = isGameSaved(gameName, getTileProductUrl(tile));
      updateCatalogSaveButtonState(btn, isSaved, gameName);

      btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const currentTitle = getCatalogGameTitle(tile) || btn.dataset.gameTitle || gameName;
        handleToggleSaveCatalogGame(tile, currentTitle);
      });

      btn.addEventListener('mousedown', (event) => {
        event.stopPropagation();
      });

      return btn;
    }

    function createCatalogHideButton(gameName, tile) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ps-hide-btn';
      btn.dataset.gameTitle = gameName;
      btn.setAttribute('aria-label', `Hide ${gameName}`);
      btn.setAttribute('title', `Hide "${gameName}"`);

      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        </svg>
        <span>Hide</span>
      `;

      btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const currentTitle = getCatalogGameTitle(tile) || btn.dataset.gameTitle || gameName;
        handleHideCatalogGame(tile, currentTitle);
      });

      btn.addEventListener('mousedown', (event) => {
        event.stopPropagation();
      });

      return btn;
    }

    /**
     * Toggles bookmark / save state on a catalog product card.
     */
    function handleToggleSaveCatalogGame(tile, gameName) {
      if (!gameName) return;
      const gameUrl = getTileProductUrl(tile) || window.location.href;
      const key = getGameKey(gameName);
      let game = gamesMasterList[key];

      if (!game) {
        game = {
          title: gameName,
          url: gameUrl,
          timestamp: Date.now(),
          genres: [],
          isSaved: true,
          isHidden: false,
          isUntouched: false,
          hasRuns: false,
          isPinned: false
        };
        gamesMasterList[key] = game;
      } else {
        game.isSaved = !game.isSaved;
        game.timestamp = Date.now();
        if (gameUrl && (!game.url || game.url.includes('/search/'))) {
          game.url = gameUrl;
        }
      }

      const nextSaved = game.isSaved;
      const saveBtn = tile.querySelector('.ps-save-btn');
      if (saveBtn) updateCatalogSaveButtonState(saveBtn, nextSaved, gameName);

      safeStorageSet({ gamesMasterList }, () => {
        showToast(gameName, nextSaved ? 'saved' : 'unsaved');
      });

      document.querySelectorAll('div.psw-product-tile').forEach((otherTile) => {
        const otherTitle = getCatalogGameTitle(otherTile);
        if (otherTitle && getGameKey(otherTitle) === key && otherTile !== tile) {
          const otherSaveBtn = otherTile.querySelector('.ps-save-btn');
          if (otherSaveBtn) updateCatalogSaveButtonState(otherSaveBtn, nextSaved, otherTitle);
        }
      });
    }

    /**
     * Action when catalog "Hide" button is clicked:
     * Toggles isHidden flag. Decoupled from isSaved.
     */
    function handleHideCatalogGame(tile, gameName) {
      if (!gameName) return;
      const gameUrl = getTileProductUrl(tile) || window.location.href;
      const key = getGameKey(gameName);
      let game = gamesMasterList[key];

      if (!game) {
        game = {
          title: gameName,
          url: gameUrl,
          timestamp: Date.now(),
          genres: [],
          isSaved: false,
          isHidden: true,
          isUntouched: false,
          hasRuns: false,
          isPinned: false
        };
        gamesMasterList[key] = game;
      } else {
        game.isHidden = !game.isHidden;
        game.timestamp = Date.now();
        if (gameUrl && (!game.url || game.url.includes('/search/'))) {
          game.url = gameUrl;
        }
      }

      if (game.isHidden && isHidingActive) {
        hideCatalogTile(tile, gameName);
      } else if (!game.isHidden) {
        const parentLi = tile.closest('li');
        if (parentLi && parentLi.dataset.psHiddenGame) unhideElement(parentLi);
        else if (tile.dataset.psHiddenGame) unhideElement(tile);
      }

      safeStorageSet({ gamesMasterList }, () => {
        showToast(gameName, game.isHidden ? 'hidden' : 'unhidden');
      });
    }

    /**
     * Processes a single catalog product tile.
     * Evaluates the extracted game title against storage to handle DOM node recycling during pagination.
     */
    function processCatalogTile(tile) {
      if (!isExtensionValid() || !tile || !tile.isConnected) {
        return;
      }

      const gameName = getCatalogGameTitle(tile);
      if (!gameName) return;

      const parentLi = tile.closest('li');
      const tileProductUrl = getTileProductUrl(tile);

      // 1. Check extracted title against chrome.storage.local list
      const isSaved = isGameSaved(gameName, tileProductUrl);
      const isHidden = isHidingActive && isGameHidden(gameName, tileProductUrl);

      if (isHidden) {
        // 2. If the game IS marked as "hidden", apply display: none !important to its parent <li>
        hideCatalogTile(tile, gameName);
        if (tileProductUrl) {
          healProductUrl(gameName, tileProductUrl);
        }
      } else {
        // 3. If the game IS NOT hidden (or is marked as "saved"), explicitly remove any inline display: none styles from its parent <li> element
        if (parentLi) {
          parentLi.style.removeProperty('display');
          delete parentLi.dataset.psHiddenGame;
        }
        tile.style.removeProperty('display');
        delete tile.dataset.psHiddenGame;
      }

      // 1. Inject or update Top-Left Save Button
      let saveBtn = tile.querySelector('.ps-save-btn');
      if (!saveBtn) {
        saveBtn = createCatalogSaveButton(gameName, tile);
        tile.appendChild(saveBtn);
      } else {
        updateCatalogSaveButtonState(saveBtn, isSaved, gameName);
      }

      // 2. Inject or update Top-Right Hide Button
      let hideBtn = tile.querySelector('.ps-hide-btn');
      if (!hideBtn) {
        hideBtn = createCatalogHideButton(gameName, tile);
        tile.appendChild(hideBtn);
      } else {
        hideBtn.dataset.gameTitle = gameName;
        hideBtn.setAttribute('aria-label', `Hide ${gameName}`);
        hideBtn.setAttribute('title', `Hide "${gameName}"`);
      }

      // 3. Update or restore Speedrun Status badge if cached, in master list, or already in DOM
      const key = getGameKey(gameName);
      const gameRecord = gamesMasterList[key] || getGameRecord(gameName);
      const masterStatus = getGameRunStatus(gameName);
      const cachedStatus = sessionScoutCache.has(key) ? sessionScoutCache.get(key) : masterStatus;
      const existingBadge = tile.querySelector('.ps-grid-scout-badge');
      const hasKnownRecord = Boolean(gameRecord && (gameRecord.runStatus || gameRecord.isUntouched || gameRecord.hasRuns || gameRecord.isSaved));

      if (hasKnownRecord || sessionScoutCache.has(key) || existingBadge) {
        injectGridStatusBadge(tile, gameName, tileProductUrl, cachedStatus, isSaved);
      }
    }

    function scanCatalogTiles() {
      if (!isExtensionValid()) return;
      const tiles = document.querySelectorAll('div.psw-product-tile');
      for (let i = 0; i < tiles.length; i++) {
        processCatalogTile(tiles[i]);
      }
      injectOrUpdateScoutButton();
    }

    /* ==========================================================================
       PRODUCT PAGE LOGIC (Inline Hide + Save/Bookmark Buttons)
       ========================================================================== */

    function getProductGenres() {
      const genres = [];
      const addGenre = (raw) => {
        if (!raw || typeof raw !== 'string') return;
        raw.split(/[,/|•\n\t]/).forEach((part) => {
          const cleaned = part.trim();
          if (cleaned && cleaned.length > 1 && !genres.includes(cleaned)) {
            if (!/^(ps4|ps5|playstation|release date|publisher|developer|genre|genres)$/i.test(cleaned)) {
              genres.push(cleaned);
            }
          }
        });
      };

      try {
        // 1. Sony QA selectors and active metadata containers
        const genreElements = document.querySelectorAll(
          '[data-qa="gameInfo#releaseInformation#genre-value"] span, ' +
          '[data-qa="gameInfo#releaseInformation#genre-value"], ' +
          '[data-qa="gameInfo#releaseInformation#subGenre-value"] span, ' +
          '[data-qa="gameInfo#releaseInformation#subGenre-value"], ' +
          '[data-qa*="releaseInformation#genre"] dd, ' +
          '[data-qa*="releaseInformation#genre"] span, ' +
          'dd[data-qa*="genre"] span, ' +
          'dd[data-qa*="genre"], ' +
          '[data-qa*="genre-value"], ' +
          '[data-qa*="game-tags"] span, ' +
          '[data-qa*="genre-tag"] span, ' +
          '[data-qa*="mfe-game-overview#description#genre"] span, ' +
          '[data-qa*="mfe-game-overview#description#genre"] a, ' +
          '[data-qa*="mfe-game-overview#description#genre"], ' +
          '[data-qa*="mfe-game-title#genres"] span, ' +
          '[data-qa*="mfe-game-title#genres"], ' +
          '[data-qa*="category-tag"]'
        );
        genreElements.forEach((el) => {
          const text = (el.innerText || el.textContent || '').trim();
          if (text) addGenre(text);
        });

        // 2. Definition lists (<dt> Genre -> <dd>)
        if (genres.length === 0) {
          const dts = document.querySelectorAll('dt, span, p, h3, h4');
          dts.forEach((dt) => {
            const txt = (dt.innerText || dt.textContent || '').trim().toLowerCase();
            if (txt === 'genre' || txt === 'genres' || txt === 'genre:' || txt === 'genres:') {
              const dd = dt.nextElementSibling || (dt.parentElement && dt.parentElement.querySelector('dd, [data-qa*="value"]'));
              if (dd) {
                const ddText = (dd.innerText || dd.textContent || '').trim();
                if (ddText) addGenre(ddText);
              }
            }
          });
        }

        // 3. JSON-LD structured data
        if (genres.length === 0) {
          const ldScripts = document.querySelectorAll('script[type="application/ld+json"], script#mfe-jsonld-tags');
          ldScripts.forEach((script) => {
            try {
              const data = JSON.parse(script.textContent);
              if (data) {
                const rawGenres = data.genre || (data.about && data.about.genre) || (Array.isArray(data['@graph']) && data['@graph'].find(item => item.genre)?.genre);
                if (Array.isArray(rawGenres)) {
                  rawGenres.forEach((g) => addGenre(String(g)));
                } else if (typeof rawGenres === 'string') {
                  addGenre(rawGenres);
                }
              }
            } catch (err) {}
          });
        }
      } catch (e) {}

      return genres;
    }

    function updateProductHideButtonState(button, isHidden, gameTitle) {
      button.dataset.hidden = isHidden ? 'true' : 'false';
      button.dataset.gameTitle = gameTitle;
      button.setAttribute('aria-label', `${isHidden ? 'Unhide' : 'Hide'} ${gameTitle}`);
      button.title = `${isHidden ? 'Unhide' : 'Hide'} "${gameTitle}"`;

      if (isHidden) {
        button.classList.add('ps-is-hidden');
        button.innerHTML = `${EYE_OFF_ICON_SVG}<span>Unhide</span>`;
      } else {
        button.classList.remove('ps-is-hidden');
        button.innerHTML = `${EYE_OFF_ICON_SVG}<span>Hide</span>`;
      }
    }

    function updateProductSaveButtonState(button, isSaved, gameTitle) {
      button.dataset.saved = isSaved ? 'true' : 'false';
      button.dataset.gameTitle = gameTitle;
      button.setAttribute('aria-label', `${isSaved ? 'Remove bookmark for' : 'Save'} ${gameTitle}`);
      button.title = `${isSaved ? 'Remove bookmark for' : 'Save'} "${gameTitle}"`;

      if (isSaved) {
        button.classList.add('ps-is-saved');
        button.innerHTML = `${STAR_FILLED_SVG}<span>Saved</span>`;
      } else {
        button.classList.remove('ps-is-saved');
        button.innerHTML = `${STAR_OUTLINE_SVG}<span>Save</span>`;
      }
    }

    function createProductSearchButton(titleElement, fallbackTitle) {
      const searchBtn = document.createElement('button');
      searchBtn.type = 'button';
      searchBtn.id = 'ps-product-page-search-btn';
      searchBtn.className = 'psw-btn ps-product-search-btn';
      searchBtn.setAttribute('aria-label', 'Find Runs');
      searchBtn.setAttribute('title', 'Find Runs');
      searchBtn.innerHTML = `${STOPWATCH_ICON_SVG}<span>Find Runs</span>`;

      searchBtn.addEventListener('mouseenter', () => {
        safeStorageGet({ dbProvider: 'therun', customDbUrl: 'https://nudatabase.com/?q=' }, (res) => {
          let provider = 'TheRun.gg';
          if (res && res.dbProvider === 'src') provider = 'Speedrun.com';
          else if (res && res.dbProvider === 'custom') provider = 'Custom Archive';

          const currentTitleEl = document.querySelector('h1[data-qa="mfe-game-title#name"]') || titleElement;
          const raw = (currentTitleEl && currentTitleEl.innerText)
            ? currentTitleEl.innerText.trim()
            : (fallbackTitle || '');
          const cleaned = cleanTitle(raw);
          searchBtn.setAttribute('title', cleaned ? `Find Runs for "${cleaned}" on ${provider}` : `Find Runs on ${provider}`);
          searchBtn.setAttribute('aria-label', cleaned ? `Find Runs for ${cleaned} on ${provider}` : `Find Runs on ${provider}`);
        });
      });

      searchBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const currentTitleEl = document.querySelector('h1[data-qa="mfe-game-title#name"]') || titleElement;
        const titleToSearch = (currentTitleEl && currentTitleEl.innerText)
          ? currentTitleEl.innerText.trim()
          : (fallbackTitle || '');

        openSpeedrunSearch(titleToSearch);
      });

      return searchBtn;
    }

    /**
     * Opens the configured speedrun archive database search in a new tab.
     */
    function openSpeedrunSearch(gameTitle) {
      if (!gameTitle) return;
      safeStorageGet({ dbProvider: 'therun', customDbUrl: 'https://nudatabase.com/?q=' }, (res) => {
        const provider = (res && (res.dbProvider === 'src' || res.dbProvider === 'custom')) ? res.dbProvider : 'therun';
        const key = getGameKey(gameTitle);
        const record = gamesMasterList[key];
        const cleaned = cleanTitle(gameTitle);
        const numeralVariant = getNumeralVariant(cleaned);
        const queryTitle = (record && record.matchedTitle) || (provider === 'src' && numeralVariant ? numeralVariant : (numeralVariant || cleaned));
        const query = encodeURIComponent(queryTitle);
        let url;
        if (provider === 'src') {
          if (record && record.speedrunUrl) {
            url = record.speedrunUrl;
          } else {
            url = `https://www.speedrun.com/search?q=${query}`;
          }
        } else if (provider === 'custom') {
          const baseUrl = (res && res.customDbUrl && res.customDbUrl.trim()) ? res.customDbUrl.trim() : 'https://nudatabase.com/?q=';
          url = `${baseUrl}${query}`;
        } else {
          url = `https://therun.gg/?q=${query}`;
        }
        window.open(url, '_blank');
      });
    }

    function getNextRunStatus(current) {
      if (current === 'unverified') return 'untouched';
      if (current === 'untouched') return 'has_runs';
      if (current === 'has_runs') return 'unverified';
      return 'untouched';
    }

    function getStatusLabel(status) {
      if (status === 'untouched') return 'Untouched';
      if (status === 'has_runs') return 'Has Runs';
      return 'Unverified';
    }

    function getStatusIconSvg(status) {
      if (status === 'untouched') {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="#facc15" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ps-status-icon" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
      }
      if (status === 'has_runs') {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ps-status-icon" aria-hidden="true"><circle cx="12" cy="13" r="8"></circle><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="5" x2="12" y2="2"></line><line x1="10" y1="2" x2="14" y2="2"></line></svg>`;
      }
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="ps-status-icon" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke-dasharray="3 3"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
    }

    function updateProductStatusButtonState(btn, status, gameTitle) {
      const cur = (status === 'untouched' || status === 'has_runs') ? status : 'unverified';
      btn.dataset.status = cur;
      btn.dataset.gameTitle = gameTitle;
      btn.className = `psw-btn ps-product-status-btn ps-status-${cur}`;
      const label = getStatusLabel(cur);
      btn.setAttribute('title', `Speedrun Status: ${label} (Click to change status)`);
      btn.setAttribute('aria-label', `Speedrun Status: ${label}`);
      btn.innerHTML = `${getStatusIconSvg(cur)}<span>${label}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="ps-dropdown-chevron" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
    }

    function createProductStatusDropdown(gameTitle) {
      const wrap = document.createElement('div');
      wrap.id = 'ps-product-page-status-wrap';
      wrap.className = 'ps-product-status-dropdown-wrap';

      const statusBtn = document.createElement('button');
      statusBtn.type = 'button';
      statusBtn.id = 'ps-product-page-status-btn';
      const curStatus = getGameRunStatus(gameTitle);
      updateProductStatusButtonState(statusBtn, curStatus, gameTitle);

      const menu = document.createElement('div');
      menu.id = 'ps-product-page-status-menu';
      menu.className = 'ps-product-status-menu';
      menu.hidden = true;

      const statuses = [
        { id: 'unverified', label: 'Unverified' },
        { id: 'untouched', label: 'Untouched' },
        { id: 'has_runs', label: 'Has Runs' }
      ];

      function renderMenuItems(activeStatus) {
        menu.innerHTML = '';
        statuses.forEach((s) => {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = `ps-product-status-menu-item ps-menu-status-${s.id} ${s.id === activeStatus ? 'active' : ''}`;
          item.innerHTML = `
            <span class="ps-status-menu-icon">${getStatusIconSvg(s.id)}</span>
            <span class="ps-status-menu-label">${s.label}</span>
            ${s.id === activeStatus ? '<span class="ps-status-menu-check">✓</span>' : ''}
          `;
          item.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            setGameStatus(s.id);
            closeMenu();
          });
          menu.appendChild(item);
        });
      }

      function openMenu() {
        renderMenuItems(getGameRunStatus(statusBtn.dataset.gameTitle || gameTitle));
        menu.hidden = false;
        menu.classList.add('open');
        statusBtn.classList.add('dropdown-open');
        document.addEventListener('click', onDocClick);
        document.addEventListener('keydown', onDocKeyDown);
      }

      function closeMenu() {
        menu.hidden = true;
        menu.classList.remove('open');
        statusBtn.classList.remove('dropdown-open');
        document.removeEventListener('click', onDocClick);
        document.removeEventListener('keydown', onDocKeyDown);
      }

      function onDocClick(e) {
        if (!wrap.contains(e.target)) {
          closeMenu();
        }
      }

      function onDocKeyDown(e) {
        if (e.key === 'Escape') {
          closeMenu();
        }
      }

      statusBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (menu.hidden) {
          openMenu();
        } else {
          closeMenu();
        }
      });

      function setGameStatus(newStatus) {
        const titleToUse = statusBtn.dataset.gameTitle || gameTitle;
        const key = getGameKey(titleToUse);
        let game = gamesMasterList[key];

        if (!game) {
          game = {
            title: titleToUse,
            url: window.location.href,
            timestamp: Date.now(),
            genres: getProductGenres(),
            isSaved: false,
            isHidden: false,
            isUntouched: newStatus === 'untouched',
            hasRuns: newStatus === 'has_runs',
            isPinned: false
          };
          gamesMasterList[key] = game;
        } else {
          game.isUntouched = (newStatus === 'untouched');
          game.hasRuns = (newStatus === 'has_runs');
          game.timestamp = Date.now();
          const genres = getProductGenres();
          if (genres.length > 0) game.genres = genres;
        }

        // CRITICAL: Manual status selection NEVER auto-hides the game!
        // If the game was previously auto-hidden while hasRuns was true, but is now manually marked untouched,
        // clear that stale auto-hide so it correctly appears in the Untouched list!
        if (newStatus === 'untouched' && game.isHidden && autoHideHasRuns) {
          game.isHidden = false;
          const hideBtn = document.getElementById('ps-product-page-toggle-btn');
          if (hideBtn) updateProductHideButtonState(hideBtn, false, titleToUse);
        }

        updateProductStatusButtonState(statusBtn, newStatus, titleToUse);

        safeStorageSet({ gamesMasterList }, () => {
          showToast(titleToUse, newStatus === 'untouched' ? 'status-untouched' : (newStatus === 'has_runs' ? 'status-has-runs' : 'status-unverified'));
        });
      }

      wrap.appendChild(statusBtn);
      wrap.appendChild(menu);
      return wrap;
    }

    function injectOrUpdateProductButtons(titleElement, gameTitle) {
      let actionsContainer = document.getElementById('ps-product-page-actions');
      const isHidden = isGameHidden(gameTitle, window.location.href);
      const isSaved = isGameSaved(gameTitle, window.location.href);

      if (actionsContainer) {
        const saveBtn = document.getElementById('ps-product-page-save-btn');
        const hideBtn = document.getElementById('ps-product-page-toggle-btn');
        let searchBtn = document.getElementById('ps-product-page-search-btn');
        let statusWrap = document.getElementById('ps-product-page-status-wrap');
        let statusBtn = document.getElementById('ps-product-page-status-btn');
        if (saveBtn) updateProductSaveButtonState(saveBtn, isSaved, gameTitle);
        if (hideBtn) updateProductHideButtonState(hideBtn, isHidden, gameTitle);
        if (saveBtn && hideBtn && saveBtn.nextElementSibling !== hideBtn) {
          actionsContainer.insertBefore(saveBtn, hideBtn);
        }
        if (!searchBtn) {
          searchBtn = createProductSearchButton(titleElement, gameTitle);
          actionsContainer.appendChild(searchBtn);
        } else {
          searchBtn.innerHTML = `${SEARCH_MAGNIFIER_ICON_SVG}<span>Find Runs</span>`;
        }
        if (!statusWrap) {
          statusWrap = createProductStatusDropdown(gameTitle);
          actionsContainer.appendChild(statusWrap);
        } else if (statusBtn) {
          updateProductStatusButtonState(statusBtn, getGameRunStatus(gameTitle), gameTitle);
        }
        return;
      }

      // Create actions wrapper
      actionsContainer = document.createElement('div');
      actionsContainer.id = 'ps-product-page-actions';
      actionsContainer.className = 'ps-product-page-actions';

      // 1. Save/Bookmark Button (First, matching catalog tiles)
      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.id = 'ps-product-page-save-btn';
      saveBtn.className = 'psw-btn ps-product-save-btn';
      updateProductSaveButtonState(saveBtn, isSaved, gameTitle);

      saveBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const key = getGameKey(gameTitle);
        let game = gamesMasterList[key];
        if (!game) {
          game = {
            title: gameTitle,
            url: window.location.href,
            timestamp: Date.now(),
            genres: getProductGenres(),
            isSaved: true,
            isHidden: false,
            isUntouched: false,
            hasRuns: false,
            isPinned: false
          };
          gamesMasterList[key] = game;
        } else {
          game.isSaved = !game.isSaved;
          game.timestamp = Date.now();
          const genres = getProductGenres();
          if (genres.length > 0) game.genres = genres;
          game.url = window.location.href;
        }

        const nextSaved = game.isSaved;
        updateProductSaveButtonState(saveBtn, nextSaved, gameTitle);

        safeStorageSet({ gamesMasterList }, () => {
          showToast(gameTitle, nextSaved ? 'saved' : 'unsaved');
        });
      });

      // 2. Hide/Unhide Button (Second, matching catalog tiles)
      const hideBtn = document.createElement('button');
      hideBtn.type = 'button';
      hideBtn.id = 'ps-product-page-toggle-btn';
      hideBtn.className = 'psw-btn ps-product-toggle-btn';
      updateProductHideButtonState(hideBtn, isHidden, gameTitle);

      hideBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const key = getGameKey(gameTitle);
        let game = gamesMasterList[key];
        if (!game) {
          game = {
            title: gameTitle,
            url: window.location.href,
            timestamp: Date.now(),
            genres: getProductGenres(),
            isSaved: false,
            isHidden: true,
            isUntouched: false,
            hasRuns: false,
            isPinned: false
          };
          gamesMasterList[key] = game;
        } else {
          game.isHidden = !game.isHidden;
          game.timestamp = Date.now();
          const genres = getProductGenres();
          if (genres.length > 0) game.genres = genres;
          game.url = window.location.href;
        }

        updateProductHideButtonState(hideBtn, game.isHidden, gameTitle);

        safeStorageSet({ gamesMasterList }, () => {
          showToast(gameTitle, game.isHidden ? 'hidden' : 'unhidden');
        });
      });

      // 3. Speedrun Search Button
      const searchBtn = createProductSearchButton(titleElement, gameTitle);

      // 4. Speedrun Status Dropdown
      const statusWrap = createProductStatusDropdown(gameTitle);

      actionsContainer.appendChild(saveBtn);
      actionsContainer.appendChild(hideBtn);
      actionsContainer.appendChild(searchBtn);
      actionsContainer.appendChild(statusWrap);

      // Inject directly below the <h1> element
      if (titleElement.nextSibling) {
        titleElement.parentNode.insertBefore(actionsContainer, titleElement.nextSibling);
      } else {
        titleElement.parentNode.appendChild(actionsContainer);
      }
    }

    function handleProductPage() {
      if (!isExtensionValid()) return;
      if (!isProductOrConceptPage(window.location.href)) {
        const existingActions = document.getElementById('ps-product-page-actions');
        if (existingActions) existingActions.remove();
        return;
      }

      // Remove grid floating scout button if present on product page
      const scoutBtn = document.getElementById('ps-scout-page-btn');
      if (scoutBtn) scoutBtn.remove();

      const titleElement = document.querySelector('h1[data-qa="mfe-game-title#name"]');
      if (!titleElement) return;

      const gameTitle = titleElement.innerText ? titleElement.innerText.trim() : '';
      if (!gameTitle) return;

      const key = getGameKey(gameTitle);
      if (gamesMasterList[key]) {
        healProductUrl(gameTitle, window.location.href);
      }

      injectOrUpdateProductButtons(titleElement, gameTitle);

      // If speedrun status is unverified, proactively query Speedrun.com in background
      const curRunStatus = getGameRunStatus(gameTitle);
      if (curRunStatus === 'unverified' && sessionScoutCache.get(key) !== 'checking') {
        sessionScoutCache.set(key, 'checking');
        const cleanT = cleanTitle(gameTitle);
        requestSpeedrunStatus(cleanT).then((scoutResult) => {
          if (!scoutResult) {
            sessionScoutCache.delete(key);
            return;
          }
          const status = scoutResult.status || 'unverified';
          sessionScoutCache.set(key, status);
          if (status !== 'unverified') {
            let record = gamesMasterList[key];
            if (!record) {
              record = {
                title: gameTitle,
                url: window.location.href,
                timestamp: Date.now(),
                genres: getProductGenres(),
                isSaved: false,
                isHidden: false,
                isUntouched: status === 'untouched',
                hasRuns: status === 'has_runs',
                runStatus: status,
                speedrunUrl: scoutResult.weblink || '',
                matchedTitle: scoutResult.matchedTitle || '',
                isPinned: false
              };
              gamesMasterList[key] = record;
            } else {
              record.isUntouched = (status === 'untouched');
              record.hasRuns = (status === 'has_runs');
              record.runStatus = status;
              if (scoutResult.weblink) record.speedrunUrl = scoutResult.weblink;
              if (scoutResult.matchedTitle) record.matchedTitle = scoutResult.matchedTitle;
              record.timestamp = Date.now();
            }
            safeStorageSet({ gamesMasterList });
            const statusBtn = document.getElementById('ps-product-page-status-btn');
            if (statusBtn) {
              updateProductStatusButtonState(statusBtn, status, gameTitle);
            }
            const searchBtn = document.getElementById('ps-product-page-search-btn');
            if (searchBtn) {
              const displayTitle = scoutResult.matchedTitle || cleanT;
              searchBtn.setAttribute('title', `Find Runs for "${displayTitle}"`);
              searchBtn.setAttribute('aria-label', `Find Runs for ${displayTitle}`);
            }
          }
        }).catch(() => {
          sessionScoutCache.delete(key);
        });
      }
    }

    /* ==========================================================================
       SPEEDRUN.COM AUTO-SCOUT & GRID OVERLAY LOGIC
       ========================================================================== */

    async function executeDirectSpeedrunQuery(title) {
      if (!title || typeof title !== 'string' || !title.trim()) {
        return { status: 'unverified' };
      }
      try {
        const c1 = new AbortController();
        const t1 = setTimeout(() => c1.abort(), 6000);
        const searchUrl = 'https://www.speedrun.com/api/v1/games?name=' + encodeURIComponent(title.trim());
        const searchRes = await fetch(searchUrl, { signal: c1.signal });
        clearTimeout(t1);
        if (!searchRes.ok) return { status: 'unverified' };
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
        if (!gameId) return { status: 'unverified' };

        const weblink = game.weblink || '';
        const matchedTitle = (game.names && game.names.international) ? game.names.international : title;

        const c2 = new AbortController();
        const t2 = setTimeout(() => c2.abort(), 6000);
        const recordsUrl = 'https://www.speedrun.com/api/v1/games/' + encodeURIComponent(gameId) + '/records?top=1';
        const recordsRes = await fetch(recordsUrl, { signal: c2.signal });
        clearTimeout(t2);
        if (!recordsRes.ok) return { status: 'untouched', weblink, matchedTitle };
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
        return { status: 'unverified' };
      }
    }

    async function fetchSpeedrunStatusDirect(cleanTitle) {
      if (!cleanTitle || typeof cleanTitle !== 'string' || !cleanTitle.trim()) {
        return { status: 'unverified' };
      }
      const normalizedTitle = stripEditionSuffix(cleanTitle.trim());
      // Fast single-query search: exactly ONE search request to Speedrun.com
      return await executeDirectSpeedrunQuery(normalizedTitle);
    }

    function requestSpeedrunStatus(cleanTitle, signal, checkRecords = false) {
      return new Promise((resolve) => {
        if (signal && signal.aborted) {
          resolve({ status: 'unverified' });
          return;
        }

        let isCompleted = false;
        let safetyTimeout = null;
        const complete = (result) => {
          if (!isCompleted) {
            isCompleted = true;
            if (safetyTimeout) {
              clearTimeout(safetyTimeout);
              safetyTimeout = null;
            }
            if (typeof result === 'string') {
              resolve({ status: result });
            } else if (result && result.status) {
              resolve(result);
            } else {
              resolve({ status: 'unverified' });
            }
          }
        };

        // Safety timeout so request never hangs the scouting queue (65s allows background rate limit retries)
        const checkSafetyTimeout = () => {
          if (isBackgroundThrottled) {
            safetyTimeout = setTimeout(checkSafetyTimeout, 5000);
            return;
          }
          complete({ status: 'unverified' });
        };
        safetyTimeout = setTimeout(checkSafetyTimeout, 65000);

        if (signal) {
          signal.addEventListener('abort', () => {
            complete({ status: 'unverified' });
          }, { once: true });
        }

        if (!isExtensionValid()) {
          fetchSpeedrunStatusDirect(cleanTitle).then((st) => {
            complete(st);
          }).catch(() => {
            complete({ status: 'unverified' });
          });
          return;
        }

        function attemptSendMessage(isRetry = false) {
          try {
            chrome.runtime.sendMessage({ type: 'FETCH_SPEEDRUN_STATUS', cleanTitle, checkRecords }, (res) => {
              if (chrome.runtime.lastError || !res || !res.status) {
                if (!isRetry) {
                  // Service worker might have been sleeping in MV3; wait 400ms and retry once
                  setTimeout(() => attemptSendMessage(true), 400);
                  return;
                }
                // Fallback to direct query if service worker communication still failed
                fetchSpeedrunStatusDirect(cleanTitle).then((st) => {
                  complete(st);
                }).catch(() => {
                  complete({ status: 'unverified' });
                });
              } else {
                complete({
                  status: res.status,
                  weblink: res.weblink || '',
                  matchedTitle: res.matchedTitle || ''
                });
              }
            });
          } catch (err) {
            if (!isRetry) {
              setTimeout(() => attemptSendMessage(true), 400);
              return;
            }
            fetchSpeedrunStatusDirect(cleanTitle).then((st) => {
              complete(st);
            }).catch(() => {
              complete({ status: 'unverified' });
            });
          }
        }

        attemptSendMessage(false);
      });
    }

    function injectGridStatusBadge(tile, rawTitle, url, status, isSaved) {
      if (!tile || !tile.isConnected) return;

      let badge = tile.querySelector('.ps-grid-scout-badge');
      if (!badge) {
        badge = document.createElement('button');
        badge.type = 'button';
        badge.className = 'ps-grid-scout-badge';
        tile.appendChild(badge);
      }

      const curStatus = (status === 'untouched' || status === 'has_runs') ? status : 'unverified';
      badge.dataset.gameTitle = rawTitle;
      badge.dataset.status = curStatus;
      badge.className = `ps-grid-scout-badge ps-status-${curStatus} ${isSaved ? 'ps-is-saved' : ''}`.trim();

      const label = getStatusLabel(curStatus);
      const iconSvg = getStatusIconSvg(curStatus);

      if (curStatus === 'unverified') {
        const cleaned = cleanTitle(rawTitle);
        badge.setAttribute('aria-label', `Speedrun Status: Unverified (Click to search speedruns for ${cleaned})`);
        badge.title = `Speedrun Status: Unverified (Click to search speedruns for "${cleaned}")`;
      } else {
        const nextStatus = getNextRunStatus(curStatus);
        const nextLabel = getStatusLabel(nextStatus);
        badge.setAttribute('aria-label', `Speedrun Status: ${label} (Click to set: ${nextLabel})`);
        badge.title = `Speedrun Status: ${label} (Click to set: ${nextLabel})`;
      }

      badge.innerHTML = `
        <span class="ps-scout-badge-icon">${iconSvg}</span>
        <span class="ps-scout-badge-label">${label}</span>
      `;

      badge.onmouseenter = () => {
        if (badge.dataset.status === 'unverified') {
          safeStorageGet({ dbProvider: 'therun', customDbUrl: 'https://nudatabase.com/?q=' }, (res) => {
            let provider = 'TheRun.gg';
            if (res && res.dbProvider === 'src') provider = 'Speedrun.com';
            else if (res && res.dbProvider === 'custom') provider = 'Custom Archive';
            const cleaned = cleanTitle(rawTitle);
            badge.title = `Speedrun Status: Unverified (Click to search runs on ${provider})`;
            badge.setAttribute('aria-label', `Speedrun Status: Unverified (Click to search runs on ${provider})`);
          });
        }
      };

      badge.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();

        // For Unverified badges on the grid page, open speedrun archive search in a new tab
        if (curStatus === 'unverified') {
          openSpeedrunSearch(rawTitle);
          return;
        }

        const key = getGameKey(rawTitle);
        let game = gamesMasterList[key];
        const targetUrl = url || getTileProductUrl(tile) || window.location.href;

        const currentStatus = (game && (game.isUntouched ? 'untouched' : (game.hasRuns ? 'has_runs' : 'unverified')))
          || (curStatus === 'untouched' || curStatus === 'has_runs' ? curStatus : 'unverified');
        const next = getNextRunStatus(currentStatus);

        const currentSavedState = isGameSaved(rawTitle, targetUrl);

        if (!game) {
          game = {
            title: rawTitle,
            url: targetUrl,
            timestamp: Date.now(),
            genres: [],
            isSaved: false,
            isHidden: false,
            isUntouched: next === 'untouched',
            hasRuns: next === 'has_runs',
            isPinned: false
          };
          gamesMasterList[key] = game;
        } else {
          game.isUntouched = (next === 'untouched');
          game.hasRuns = (next === 'has_runs');
          game.timestamp = Date.now();
          if (targetUrl && (!game.url || game.url.includes('/search/'))) {
            game.url = targetUrl;
          }
        }

        sessionScoutCache.set(key, next);

        document.querySelectorAll('div.psw-product-tile').forEach((t) => {
          const tTitle = getCatalogGameTitle(t);
          if (tTitle && getGameKey(tTitle) === key) {
            injectGridStatusBadge(t, tTitle, getTileProductUrl(t), next, currentSavedState);
          }
        });

        safeStorageSet({ gamesMasterList }, () => {
          showToast(rawTitle, next === 'untouched' ? 'status-untouched' : (next === 'has_runs' ? 'status-has-runs' : 'status-unverified'));
        });
      };
    }

    async function handleScoutGridPage(options = {}) {
      if (isScoutingInProgress) return;
      isScoutingInProgress = true;
      scoutAbortController = new AbortController();
      const currentAbortSignal = scoutAbortController.signal;

      // Remove any legacy floating button if present
      const oldBtn = document.getElementById('ps-scout-page-btn');
      if (oldBtn) oldBtn.remove();

      safeStorageGet({
        gamesMasterList: null,
        hiddenGames: null,
        savedGames: null,
        autoHideVrGames: false,
        autoHideSimulators: false,
        autoHideSimulatorGames: false,
        autoHideHasRuns: false,
        customHideKeywords: [],
        forceRecheckScouted: false,
        deepScoutEnabled: false
      }, async (settings) => {
        if (currentAbortSignal.aborted || !isScoutingInProgress) return;

        const { masterList, needsSave } = migrateToGamesMasterList(settings || {});
        gamesMasterList = masterList;
        if (settings && settings.autoHideVrGames !== undefined) {
          autoHideVrGames = Boolean(settings.autoHideVrGames === true);
        }
        if (settings && (settings.autoHideSimulators !== undefined || settings.autoHideSimulatorGames !== undefined)) {
          autoHideSimulators = Boolean(settings.autoHideSimulators === true || settings.autoHideSimulatorGames === true);
        }
        if (settings && settings.autoHideHasRuns !== undefined) {
          autoHideHasRuns = Boolean(settings.autoHideHasRuns === true);
        }
        if (settings && Array.isArray(settings.customHideKeywords)) {
          customHideKeywords = settings.customHideKeywords;
        }
        const forceRecheck = Boolean(
          (settings && settings.forceRecheckScouted === true) ||
          (options && options.forceRecheck === true)
        );
        const deepScout = Boolean(
          (options && options.deepScout !== undefined)
            ? options.deepScout
            : (settings && settings.deepScoutEnabled === true)
        );
        if (needsSave) {
          safeStorageSet({ gamesMasterList });
          try { chrome.storage.local.remove(['hiddenGames', 'savedGames']); } catch (e) {}
        }

        const tiles = Array.from(document.querySelectorAll('div.psw-product-tile'));
        if (tiles.length === 0) {
          isScoutingInProgress = false;
          scoutAbortController = null;
          try {
            chrome.runtime.sendMessage({ action: 'SCOUT_COMPLETE', total: 0 });
          } catch (e) {}
          return;
        }

        const unknownMap = new Map();
        let preScoutAutoHiddenCount = 0;

        for (const tile of tiles) {
          if (currentAbortSignal.aborted || !isScoutingInProgress) return;
          const rawTitle = getCatalogGameTitle(tile);
          if (!rawTitle) continue;
          const url = getTileProductUrl(tile);
          const key = getGameKey(rawTitle);
          const game = gamesMasterList[key];

          // Bypass: If hidden, ignore completely!
          if (game && game.isHidden) {
            continue;
          }

          // Auto-Hide Pre-filtering check (VR titles, Simulator games, and Custom Title Keywords):
          const isSaved = Boolean(game && game.isSaved);
          let hideReason = null;
          let hideGenre = null;

          if (!isSaved) {
            // 1. Custom Title Keywords check (including VR and Simulator keywords)
            if (customHideKeywords.length > 0) {
              const matchedKw = matchesCustomKeyword(rawTitle, customHideKeywords);
              if (matchedKw) {
                hideReason = `custom keyword "${matchedKw}"`;
                if (/^simulator/i.test(matchedKw)) hideGenre = 'Simulator';
                if (/^vr/i.test(matchedKw) || /^psvr/i.test(matchedKw)) hideGenre = 'VR';
              } else {
                // If user blacklisted "VR" or "PSVR", also inspect store DOM compatibility tags
                const hasVrKeyword = customHideKeywords.some((k) => /\b(?:vr|psvr2?)\b/i.test(k));
                if (hasVrKeyword && isVrGame(tile, rawTitle)) {
                  hideReason = 'VR title';
                  hideGenre = 'VR';
                }
              }
            }

            // 2. Standalone legacy flags / active speedrun rules
            if (!hideReason) {
              if (autoHideVrGames && isVrGame(tile, rawTitle)) {
                hideReason = 'VR title';
                hideGenre = 'VR';
              } else if (autoHideSimulators && isSimulatorGame(rawTitle)) {
                hideReason = 'Simulator game';
                hideGenre = 'Simulator';
              } else if (autoHideHasRuns && game && game.hasRuns) {
                hideReason = 'active speedruns';
              }
            }
          }

          if (hideReason) {
            console.log(`[PS Store Scout] Pre-scout auto-hiding (${hideReason}): "${rawTitle}"`);
            if (!gamesMasterList[key]) {
              gamesMasterList[key] = {
                title: rawTitle,
                url: url || '',
                timestamp: Date.now(),
                genres: hideGenre ? [hideGenre] : [],
                isSaved: false,
                isHidden: true,
                isUntouched: false,
                hasRuns: false,
                runStatus: 'unverified',
                isPinned: false
              };
            } else {
              gamesMasterList[key].isHidden = true;
              gamesMasterList[key].timestamp = Date.now();
              if (hideGenre) {
                if (!gamesMasterList[key].genres) {
                  gamesMasterList[key].genres = [hideGenre];
                } else if (!gamesMasterList[key].genres.includes(hideGenre)) {
                  gamesMasterList[key].genres.push(hideGenre);
                }
              }
            }

            if (isHidingActive) {
              hideCatalogTile(tile, rawTitle);
              document.querySelectorAll('div.psw-product-tile').forEach((otherTile) => {
                const oTitle = getCatalogGameTitle(otherTile);
                if (oTitle && getGameKey(oTitle) === key) {
                  hideCatalogTile(otherTile, rawTitle);
                }
              });
            }
            preScoutAutoHiddenCount++;
            continue; // Bypass Speedrun.com API queue completely!
          }

          // Normal cache bypass when forceRecheck is FALSE:
          // Any game that has already been scouted (untouched, has_runs, or unverified) bypasses the queue completely!
          if (!forceRecheck) {
            const isAlreadyScouted = Boolean(
              game && (game.isUntouched || game.hasRuns || (game.runStatus && game.runStatus !== 'checking'))
            );
            if (isAlreadyScouted) {
              const cachedStatus = game.isUntouched ? 'untouched' : (game.hasRuns ? 'has_runs' : (game.runStatus || 'unverified'));
              injectGridStatusBadge(tile, rawTitle, url, cachedStatus, game.isSaved);
              continue;
            }

            if (sessionScoutCache.has(key)) {
              const sessionStatus = sessionScoutCache.get(key);
              if (sessionStatus && sessionStatus !== 'checking') {
                injectGridStatusBadge(tile, rawTitle, url, sessionStatus, Boolean(game && game.isSaved));
                continue;
              }
            }
          }

          // If game already has a status, ensure existing badge is visible while waiting in queue
          if (game && (game.isUntouched || game.hasRuns || game.runStatus)) {
            const cachedStatus = game.isUntouched ? 'untouched' : (game.hasRuns ? 'has_runs' : (game.runStatus || 'unverified'));
            injectGridStatusBadge(tile, rawTitle, url, cachedStatus, game.isSaved);
          }

          // Group unknown games
          if (!unknownMap.has(key)) {
            unknownMap.set(key, {
              rawTitle,
              cleanTitle: cleanTitle(rawTitle, true),
              key,
              url,
              tiles: []
            });
          }
          unknownMap.get(key).tiles.push(tile);
        }

        // Persist any auto-hidden titles immediately to chrome.storage.local
        if (preScoutAutoHiddenCount > 0) {
          safeStorageSet({ gamesMasterList });
        }

        const queue = Array.from(unknownMap.values());
        const totalUnknown = queue.length;

        if (totalUnknown === 0) {
          isScoutingInProgress = false;
          scoutAbortController = null;
          try {
            chrome.runtime.sendMessage({ action: 'SCOUT_COMPLETE', total: 0 });
          } catch (e) {}
          return;
        }

        // Send initial progress to sidebar
        try {
          chrome.runtime.sendMessage({ action: 'SCOUT_PROGRESS', current: 0, total: totalUnknown });
        } catch (e) {}

        // Process queue sequentially
        let masterListChanged = false;
        try {
          for (let i = 0; i < totalUnknown; i++) {
            // If background rate limiter is currently cooling down from a 429, wait along with it
            while (isBackgroundThrottled && !currentAbortSignal.aborted && isScoutingInProgress) {
              await abortableSleep(500, currentAbortSignal);
            }

            if (currentAbortSignal.aborted || !isScoutingInProgress) {
              console.log('[PS Store Scout] Scouting cancelled mid-queue.');
              break;
            }

            const item = queue[i];

            try {
              const scoutResult = await requestSpeedrunStatus(item.cleanTitle, currentAbortSignal, deepScout);
              if (currentAbortSignal.aborted || !isScoutingInProgress) {
                console.log('[PS Store Scout] Scouting cancelled after request.');
                break;
              }

              const status = (scoutResult && scoutResult.status) ? scoutResult.status : 'unverified';
              const speedrunUrl = (scoutResult && scoutResult.weblink) ? scoutResult.weblink : '';
              const matchedTitle = (scoutResult && scoutResult.matchedTitle) ? scoutResult.matchedTitle : '';

              sessionScoutCache.set(item.key, status);

              masterListChanged = true;
              const isUntouched = (status === 'untouched');
              const hasRuns = (status === 'has_runs');

              // CRITICAL: A game that is Saved must NEVER be automatically hidden by autoHideHasRuns!
              const isGameAlreadySaved = Boolean(gamesMasterList[item.key]?.isSaved === true);
              const shouldAutoHide = Boolean(hasRuns && autoHideHasRuns && !isGameAlreadySaved);

              if (!gamesMasterList[item.key]) {
                gamesMasterList[item.key] = {
                  title: item.rawTitle,
                  url: item.url,
                  timestamp: Date.now(),
                  genres: [],
                  isSaved: false,
                  isHidden: shouldAutoHide,
                  isUntouched: isUntouched,
                  hasRuns: hasRuns,
                  runStatus: status,
                  speedrunUrl: speedrunUrl,
                  matchedTitle: matchedTitle,
                  isPinned: false
                };
              } else {
                gamesMasterList[item.key].isUntouched = isUntouched;
                gamesMasterList[item.key].hasRuns = hasRuns;
                gamesMasterList[item.key].runStatus = status;
                if (speedrunUrl) gamesMasterList[item.key].speedrunUrl = speedrunUrl;
                if (matchedTitle) gamesMasterList[item.key].matchedTitle = matchedTitle;
                if (shouldAutoHide) {
                  gamesMasterList[item.key].isHidden = true;
                }
                gamesMasterList[item.key].timestamp = Date.now();
              }

              console.log(`[PS Store Scout] Scouted "${item.rawTitle}" -> "${item.cleanTitle}": status=${status}, matched="${matchedTitle || ''}" (saved=${isGameAlreadySaved}, hidden=${gamesMasterList[item.key].isHidden})`);
              // Immediately save discovered speedrun status into chrome.storage.local
              safeStorageSet({ gamesMasterList });

              const isGameHiddenNow = gamesMasterList[item.key]?.isHidden === true;
              item.tiles.forEach((tile) => {
                if (isGameHiddenNow && isHidingActive) {
                  hideCatalogTile(tile, item.rawTitle);
                }
                const isSaved = isGameSaved(item.rawTitle, item.url);
                injectGridStatusBadge(tile, item.rawTitle, item.url, status, isSaved);
              });
            } catch (itemErr) {
              console.warn(`[PS Store Scout] Non-fatal error scouting "${item ? item.rawTitle : 'unknown'}":`, itemErr);
            } finally {
              // Always send real-time progress update to sidebar so counter never freezes
              try {
                chrome.runtime.sendMessage({
                  action: 'SCOUT_PROGRESS',
                  current: i + 1,
                  total: totalUnknown
                });
              } catch (e) {}
            }

            if (i < totalUnknown - 1 && !currentAbortSignal.aborted && isScoutingInProgress) {
              await abortableSleep(300, currentAbortSignal);
            }
          }
        } catch (queueErr) {
          console.error('[PS Store Scout] Fatal error during scouting queue:', queueErr);
        } finally {
          if (masterListChanged) {
            safeStorageSet({ gamesMasterList });
          }

          const wasAborted = currentAbortSignal.aborted || !isScoutingInProgress;
          isScoutingInProgress = false;
          scoutAbortController = null;

          if (!wasAborted) {
            try {
              chrome.runtime.sendMessage({ action: 'SCOUT_COMPLETE', total: totalUnknown });
            } catch (e) {}
          }
        }
      });
    }

    function injectOrUpdateScoutButton() {
      // Remove any old floating/injected "Scout Page" buttons from the storefront DOM
      const existingBtn = document.getElementById('ps-scout-page-btn');
      if (existingBtn) existingBtn.remove();
    }

    /* ==========================================================================
       AUTO-RESTORE LOGIC & REACT DOM OBSERVER
       ========================================================================== */

    /**
     * Auto-Restore Logic:
     * Retrieves gamesMasterList from storage, finds all visible game cards in the DOM,
     * and extracts their titles.
     * If a title matches an entry in the dictionary with a known speedrun state or scouted status,
     * instantly injects the corresponding status badge onto the card (bypassing the API queue).
     * Explicitly checks if a badge already exists with matching status to avoid redundant injections.
     */
    function restoreCachedBadges() {
      if (!isExtensionValid()) return;

      if (!currentObservedGrid || !currentObservedGrid.isConnected) {
        initGridObserver();
      }

      safeStorageGet({ gamesMasterList: null, hiddenGames: null, savedGames: null }, (settings) => {
        if (!isExtensionValid()) return;
        if (settings) {
          const { masterList } = migrateToGamesMasterList(settings);
          gamesMasterList = masterList;
        }

        const tiles = document.querySelectorAll('div.psw-product-tile');
        let restoredCount = 0;
        for (let i = 0; i < tiles.length; i++) {
          const tile = tiles[i];

          const rawTitle = getCatalogGameTitle(tile);
          if (!rawTitle) continue;

          const key = getGameKey(rawTitle);
          const game = gamesMasterList[key] || getGameRecord(rawTitle);
          if (!game) continue;

          // Check if game has a known speedrun state or was scouted/saved
          const isUntouched = Boolean(game.isUntouched === true);
          const hasRuns = Boolean(game.hasRuns === true);
          const isSaved = Boolean(game.isSaved === true);
          const isUnverified = (game.runStatus === 'unverified');

          if (!isUntouched && !hasRuns && !isSaved && !isUnverified) {
            continue;
          }

          const status = isUntouched ? 'untouched' : (hasRuns ? 'has_runs' : (game.runStatus || 'unverified'));
          const existingBadge = tile.querySelector('.ps-grid-scout-badge');
          if (existingBadge && existingBadge.dataset.status === status) {
            continue;
          }

          const url = getTileProductUrl(tile) || game.url;
          injectGridStatusBadge(tile, rawTitle, url, status, isSaved);
          restoredCount++;

          if (game.isHidden && isHidingActive) {
            hideCatalogTile(tile, rawTitle);
          }
        }

        if (restoredCount > 0) {
          console.log(`[PS Store Scout] Restored ${restoredCount} cached badges on page`);
        }
      });
    }

    let isRestoreScheduled = false;
    function scheduleRestoreCachedBadges() {
      if (isRestoreScheduled) return;
      isRestoreScheduled = true;
      requestAnimationFrame(() => {
        isRestoreScheduled = false;
        restoreCachedBadges();
      });
    }

    let gridObserver = null;
    let currentObservedGrid = null;

    function findProductGridContainer() {
      // Direct PS Store grid container selectors across categories, search, collections, and browse pages
      const explicitGrid = (
        document.querySelector('ul.psw-grid-list') ||
        document.querySelector('[data-qa="ems-sdk-grid"]') ||
        document.querySelector('[data-qa="search-results"]') ||
        document.querySelector('section[data-qa*="grid"]') ||
        document.querySelector('div.psw-l-grid')
      );
      if (explicitGrid) return explicitGrid;

      // Fallback: locate the container wrapping existing product tiles
      const firstTile = document.querySelector('div.psw-product-tile');
      if (firstTile) {
        return firstTile.closest('ul, section, [data-qa*="grid"], main') || firstTile.parentElement;
      }

      return document.querySelector('main');
    }

    /**
     * React DOM Observer targeting the main product grid container.
     * When new game cards are added during initial render or infinite scrolling,
     * automatically triggers restoreCachedBadges().
     */
    function initGridObserver() {
      if (!isExtensionValid()) return;

      const gridContainer = findProductGridContainer();
      if (!gridContainer) return;

      if (gridObserver && currentObservedGrid === gridContainer && gridContainer.isConnected) {
        return; // Observer is already active on this container
      }

      if (gridObserver) {
        gridObserver.disconnect();
        gridObserver = null;
      }

      currentObservedGrid = gridContainer;
      gridObserver = new MutationObserver((mutations) => {
        if (!isExtensionValid()) {
          if (gridObserver) gridObserver.disconnect();
          return;
        }

        let hasNewCards = false;
        for (let i = 0; i < mutations.length; i++) {
          const m = mutations[i];
          if (m.type === 'attributes') {
            hasNewCards = true;
            break;
          }
          if (m.addedNodes && m.addedNodes.length > 0) {
            for (let j = 0; j < m.addedNodes.length; j++) {
              const node = m.addedNodes[j];
              if (node.nodeType === 1) {
                // Ignore mutations triggered by our own injections
                if (
                  node.classList?.contains('ps-grid-scout-badge') ||
                  node.classList?.contains('ps-save-btn') ||
                  node.classList?.contains('ps-hide-btn') ||
                  node.classList?.contains('ps-product-search-btn')
                ) {
                  continue;
                }
                // Check if the added node is or contains a game card
                if (
                  node.classList?.contains('psw-product-tile') ||
                  node.matches?.('div.psw-product-tile, li') ||
                  node.querySelector?.('div.psw-product-tile')
                ) {
                  hasNewCards = true;
                  break;
                }
              }
            }
          }
          if (hasNewCards) break;
        }

        if (hasNewCards) {
          scheduleRestoreCachedBadges();
        }
      });

      gridObserver.observe(gridContainer, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-telemetry-meta', 'aria-label']
      });

      // Restore badges for any game cards currently in the DOM
      scheduleRestoreCachedBadges();
    }

    /* ==========================================================================
       OBSERVER & STORAGE EVENT LISTENERS
       ========================================================================== */

    function initObserver() {
      const observer = new MutationObserver((mutations) => {
        if (!isExtensionValid()) {
          observer.disconnect();
          return;
        }

        let isExternalMutation = false;
        for (let i = 0; i < mutations.length; i++) {
          const m = mutations[i];
          const target = m.target;
          if (!target) continue;

          if (
            target.id === 'ps-product-page-actions' ||
            target.id === 'ps-product-page-toggle-btn' ||
            target.id === 'ps-product-page-save-btn' ||
            target.id === 'ps-product-page-search-btn' ||
            target.id === 'ps-scout-page-btn' ||
            target.id === 'ps-hider-toast' ||
            (target.closest && (
              target.closest('#ps-product-page-actions') ||
              target.closest('.ps-hide-btn') ||
              target.closest('.ps-save-btn') ||
              target.closest('.ps-product-search-btn') ||
              target.closest('.ps-grid-scout-badge') ||
              target.closest('#ps-scout-page-btn') ||
              target.closest('.ps-hider-toast')
            ))
          ) {
            continue;
          }

          if (m.addedNodes && m.addedNodes.length > 0) {
            let onlyOurInjections = true;
            for (let n = 0; n < m.addedNodes.length; n++) {
              const node = m.addedNodes[n];
              if (
                node.nodeType === 1 &&
                (node.classList?.contains('ps-save-btn') ||
                 node.classList?.contains('ps-hide-btn') ||
                 node.classList?.contains('ps-product-search-btn') ||
                 node.classList?.contains('ps-grid-scout-badge') ||
                 node.id === 'ps-product-page-search-btn' ||
                 node.id === 'ps-scout-page-btn' ||
                 node.id === 'ps-hider-toast' ||
                 node.id === 'ps-product-page-actions')
              ) {
                continue;
              }
              onlyOurInjections = false;
              break;
            }
            if (onlyOurInjections) {
              continue;
            }
          }

          isExternalMutation = true;
          break;
        }

        if (!isExternalMutation) return;

        if (!isBatchScheduled) {
          isBatchScheduled = true;
          requestAnimationFrame(() => {
            isBatchScheduled = false;
            if (!isExtensionValid()) {
              observer.disconnect();
              return;
            }

            if (isProductOrConceptPage(window.location.href)) {
              handleProductPage();
            } else if (window.location.href.includes('/search/')) {
              handleSearchAutoRedirect();
              scanCatalogTiles();
              if (!currentObservedGrid || !currentObservedGrid.isConnected) {
                initGridObserver();
              }
              restoreCachedBadges();
            } else {
              scanCatalogTiles();
              if (!currentObservedGrid || !currentObservedGrid.isConnected) {
                initGridObserver();
              }
              restoreCachedBadges();
            }
          });
        }
      });

      const target = document.body || document.documentElement;
      observer.observe(target, { childList: true, subtree: true });
    }

    function initStorageListener() {
      if (!isExtensionValid()) return;
      try {
        chrome.storage.onChanged.addListener((changes, areaName) => {
          if (!isExtensionValid() || areaName !== 'local') return;

          if (changes.isHidingEnabled !== undefined) {
            isHidingActive = changes.isHidingEnabled.newValue !== false;
            scanCatalogTiles();
          }

          if (changes.autoHideHasRuns !== undefined) {
            autoHideHasRuns = changes.autoHideHasRuns.newValue === true;
          }

          if (changes.autoHideVrGames !== undefined) {
            autoHideVrGames = changes.autoHideVrGames.newValue === true;
          }

          if (changes.autoHideSimulators !== undefined || changes.autoHideSimulatorGames !== undefined) {
            const newSim = (changes.autoHideSimulators && changes.autoHideSimulators.newValue !== undefined)
              ? changes.autoHideSimulators.newValue === true
              : (changes.autoHideSimulatorGames && changes.autoHideSimulatorGames.newValue === true);
            autoHideSimulators = Boolean(newSim);
            if (autoHideSimulators && isHidingActive) {
              autoHideMatchingCatalogTiles();
            }
          }

          if (changes.customHideKeywords !== undefined) {
            customHideKeywords = Array.isArray(changes.customHideKeywords.newValue) ? changes.customHideKeywords.newValue : [];
            if (isHidingActive && customHideKeywords.length > 0) {
              autoHideMatchingCatalogTiles();
            }
          }

          if (changes.gamesMasterList) {
            gamesMasterList = changes.gamesMasterList.newValue || {};

            // Update product page buttons
            const actions = document.getElementById('ps-product-page-actions');
            if (actions) {
              const titleEl = document.querySelector('h1[data-qa="mfe-game-title#name"]');
              const title = titleEl ? titleEl.innerText.trim() : '';
              if (title) {
                const hideBtn = document.getElementById('ps-product-page-toggle-btn');
                const saveBtn = document.getElementById('ps-product-page-save-btn');
                const statusBtn = document.getElementById('ps-product-page-status-btn');
                if (hideBtn) updateProductHideButtonState(hideBtn, isGameHidden(title, window.location.href), title);
                if (saveBtn) updateProductSaveButtonState(saveBtn, isGameSaved(title, window.location.href), title);
                if (statusBtn) updateProductStatusButtonState(statusBtn, getGameRunStatus(title), title);
              }
            }

            // Restore catalog elements no longer hidden
            document.querySelectorAll('li[data-ps-hidden-game]').forEach((li) => {
              const name = li.dataset.psHiddenGame;
              if (!isGameHidden(name) || !isHidingActive) {
                unhideElement(li);
              }
            });

            // Re-scan catalog tiles and restore cached badges
            scanCatalogTiles();
            restoreCachedBadges();
          }
        });
      } catch (e) {}
    }

    /* ==========================================================================
       SPA HISTORY, POPSTATE & BFCACHE (BACK / FORWARD) RECOVERY
       ========================================================================== */

    function onNavigationOrUrlChange() {
      if (!isExtensionValid()) return;

      const currentUrl = window.location.href;
      const isGrid = isPlayStationGridUrl(currentUrl);

      // Cancel any ongoing scout if user navigated away from the grid page
      if (isScoutingInProgress && !isGrid) {
        console.log('[PS Store Scout] Navigated away from grid page while scouting. Halting scout.');
        cancelPageScout('navigated_away');
      }

      if (isProductOrConceptPage(currentUrl)) {
        handleProductPage();
      } else {
        // Returned to browse/category/grid page
        initGridObserver();
        scanCatalogTiles();
        restoreCachedBadges();

        // Notify runtime/sidebar that grid page context is active
        try {
          chrome.runtime.sendMessage({ action: 'GRID_PAGE_RESTORED', isGrid: true });
        } catch (e) {}

        // Progressive delays to ensure React's async reconciler attaches newly mounted cards
        setTimeout(() => restoreCachedBadges(), 250);
        setTimeout(() => restoreCachedBadges(), 750);
        setTimeout(() => restoreCachedBadges(), 1500);
      }
    }

    // Listen to browser Back/Forward (popstate) and BFCache restore (pageshow)
    window.addEventListener('popstate', onNavigationOrUrlChange);
    window.addEventListener('pageshow', onNavigationOrUrlChange);

    // Cancel in-progress scouting immediately if the tab unloads or navigates away
    window.addEventListener('pagehide', () => {
      if (isScoutingInProgress) {
        cancelPageScout('pagehide');
      }
    });
    window.addEventListener('beforeunload', () => {
      if (isScoutingInProgress) {
        cancelPageScout('beforeunload');
      }
    });

    // Patch history.pushState and history.replaceState for Next.js SPA transitions
    try {
      const originalPushState = history.pushState;
      history.pushState = function() {
        const res = originalPushState.apply(this, arguments);
        setTimeout(onNavigationOrUrlChange, 60);
        return res;
      };
      const originalReplaceState = history.replaceState;
      history.replaceState = function() {
        const res = originalReplaceState.apply(this, arguments);
        setTimeout(onNavigationOrUrlChange, 60);
        return res;
      };
    } catch (e) {}

    // Periodic URL sanity check in case Next.js uses internal router transitions
    let lastUrlCheck = window.location.href;
    setInterval(() => {
      if (!isExtensionValid()) return;
      if (window.location.href !== lastUrlCheck) {
        lastUrlCheck = window.location.href;
        onNavigationOrUrlChange();
      }
    }, 400);

    // Expose devtools inspect helper for user testing
    window.__psScoutList = function() {
      safeStorageGet({ gamesMasterList: {} }, (res) => {
        const list = res?.gamesMasterList || {};
        const entries = Object.values(list);
        console.log(`%c[PS Store Scout] Stored Catalog Database (${entries.length} games cached):`, 'font-weight:bold;color:#3b82f6;font-size:13px;');
        if (entries.length === 0) {
          console.warn('[PS Store Scout] No games cached in storage yet. Scout a page or save/hide games to populate the database.');
          return;
        }
        console.table(entries.map((g) => ({
          Title: g.title,
          Status: g.isUntouched ? 'Untouched (⭐)' : (g.hasRuns ? 'Has Runs' : (g.runStatus || 'Unverified')),
          Saved: g.isSaved ? 'Yes' : 'No',
          Hidden: g.isHidden ? 'Yes' : 'No',
          URL: g.url || ''
        })));
      });
    };

    function init() {
      if (!isExtensionValid()) return;

      if (isProductOrConceptPage(window.location.href)) {
        handleProductPage();
      } else if (window.location.href.includes('/search/')) {
        handleSearchAutoRedirect();
      }

      scanCatalogTiles();
      restoreCachedBadges();
      initGridObserver();
      initObserver();
      initStorageListener();

      if (isExtensionValid()) {
        try {
          chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (!isExtensionValid()) return;
            if (message && message.type === 'GET_PRODUCT_INFO') {
              const titleEl = document.querySelector('h1[data-qa="mfe-game-title#name"]');
              const title = titleEl ? titleEl.innerText.trim() : '';
              const genres = getProductGenres();
              sendResponse({ title: title, url: window.location.href, genres: genres });
              return;
            }
            if (message && (message.action === 'START_PAGE_SCOUT' || message.type === 'START_PAGE_SCOUT')) {
              handleScoutGridPage(message);
              sendResponse({ started: true });
              return true;
            }
            if (message && (message.action === 'CANCEL_PAGE_SCOUT' || message.type === 'CANCEL_PAGE_SCOUT')) {
              cancelPageScout('user_cancelled');
              sendResponse({ cancelled: true });
              return true;
            }
            if (message && (message.action === 'GET_SCOUT_STATUS' || message.type === 'GET_SCOUT_STATUS')) {
              sendResponse({
                isScouting: isScoutingInProgress,
                isGrid: isPlayStationGridUrl(window.location.href)
              });
              return true;
            }
            if (message && message.action === 'API_RATE_LIMIT_STATUS') {
              isBackgroundThrottled = Boolean(message.isThrottled);
            }
          });
        } catch (e) {}
      }

      let retryCount = 0;
      const hydrationInterval = setInterval(() => {
        if (!isExtensionValid()) {
          clearInterval(hydrationInterval);
          return;
        }

        if (isProductOrConceptPage(window.location.href)) {
          handleProductPage();
          if (document.getElementById('ps-product-page-actions')) {
            clearInterval(hydrationInterval);
            return;
          }
        } else if (window.location.href.includes('/search/')) {
          handleSearchAutoRedirect();
          scanCatalogTiles();
          if (isHidingActive) autoHideMatchingCatalogTiles();
          restoreCachedBadges();
        } else {
          scanCatalogTiles();
          if (isHidingActive) autoHideMatchingCatalogTiles();
          restoreCachedBadges();
        }

        retryCount++;
        if (retryCount >= 4) {
          clearInterval(hydrationInterval);
        }
      }, 1000);
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})();
