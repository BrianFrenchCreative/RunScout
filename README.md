# RunScout (Chrome Extension - Manifest V3)

A Chrome extension designed to declutter your browsing experience on [store.playstation.com](https://store.playstation.com), bookmark your favorite titles, and scout games for speedrunning and glitch hunting.

---

## Features

- **Master Enable/Disable Toggle:** Quickly pause or activate game hiding via a prominent toggle switch in the popup; automatically refreshes active PlayStation Store tabs so changes apply instantly.
- **One-Click Hiding:** Injects a subtle, stylized **"Hide"** button directly onto each game tile (`div.psw-product-tile`).
- **Telemetry-Based Title Extraction:** Reliably extracts game titles by inspecting the tile's `<a>` tag and parsing the `name` property from `data-telemetry-meta`.
- **Zero Grid Gaps:** Hides catalog tile parent `<li>` elements using `display: none !important`, ensuring the PlayStation Store grid layout re-flows smoothly without blank spaces or broken rows.
- **Dynamic Content Detection:** Powered by `MutationObserver` to automatically detect and hide games during infinite scrolling, lazy loading, and SPA page transitions.
- **Concept & Product Page QA Integration:** Supports both `/product/` and `/concept/` pages (e.g. `store.playstation.com/en-us/concept/10011569`), inspecting Sony's QA selector `h1[data-qa="mfe-game-title#name"]` to extract titles and product/concept IDs.
- **Multi-Region Storefront Support:** Automatically detects the user's active storefront locale (`/en-us/`, `/en-gb/`, `/es-es/`, `/pt-pt/`, etc.), localizing outbound game links and normalizing URLs so identical titles aren't duplicated across regional stores.
- **Global Iconography Overhaul:**
  - **Bookmark Icon:** Standard Bookmark SVG represents the **"Save"** action across the entire extension (catalog grid cards, product page action buttons, sidebar tabs, and empty state placeholders).
  - **Magnifying Glass Icon:** Clean Magnifying Glass SVG represents the **"Find Runs"** speedrun database search across list items and product pages.
  - **Star Icon:** Repurposed exclusively to highlight prime glitch-hunting targets in the speedrun status tracking system.
- **Speedrun Status Tracking (`runStatus`):**
  - **Direct Status Dropdowns:** Interactive status dropdown menu on product pages and saved/untouched list items allows 1-click selection between **Unverified (`?`)**, **Untouched (&starf;)**, and **Has Runs (&target;)** without cycling through intermediate states.
  - **Decoupled Manual Curation:** Manual status selections never auto-hide games, preventing unintended hide states when tagging titles.
  - **Untouched State:** Standout gold accent Star SVG highlighting prime glitch-hunting targets with no verified runs.
  - **Has Runs State:** Subtle, muted slate Timer/Stopwatch SVG indicating an established leaderboard.
  - **Unverified State:** Dimmed dashed circle with "?" indicating pending verification.
- **"Untouched Only" Quick Filter:**
  - Instant filter pill button next to the genre dropdown in both the Side Panel and Popup.
  - Filters your Saved Games list instantly to display only games tagged as `runStatus === "untouched"`.
- **Smart Title Sanitization:** Automatically strips marketing fluff, platform/console suffixes (e.g. "PS4 Version", "PS5 Version", "PS4 & PS5", "[PS5]"), bundles (" - Total Mayhem Bundle"), and edition strings ("Deluxe Edition", "Director's Cut") before querying Speedrun.com or TheRun.gg.
- **Quad-Action Product Page Buttons:** Injects compact, native-matching pill buttons for **Save** (Bookmark), **Hide**, **Find Runs** (Magnifying Glass), and **Speedrun Status Dropdown** directly under the game title.
- **Side Panel & Popup Interfaces:** Full management interface available as both a persistent Chrome Side Panel (`sidebar.html`) and a classic action popup (`popup.html`).
- **Internal Settings View (`sidebar.html`):**
  - Dedicated view accessible via a header gear icon with a smooth "Back to List" navigation button.
  - **Speedrun Archive Source Configuration:** Select between TheRun.gg, Speedrun.com, or Custom Archive (with customizable base query URL).
  - **Gameplay & Media Provider:** Configure preferred engines (YouTube, Twitch, Google, or custom query URLs) for gameplay and review searches with instant preset chips.
  - **Relocated Data Management:** Cleanly houses JSON backup export and import controls away from the main list.
- **Universal ISO 8601 UTC Backup:** Export library backups formatted with universal timestamps (`RunScout_Backup_YYYY-MM-DDTHH-mm-ssZ.json`) to prevent accidental overwrites, along with reliable JSON import.
- **Instant Undo Toast:** Shows a brief, non-intrusive toast with an **"Undo"** button when a game is hidden, saved, or updated.

---

## Project Structure

```
├── manifest.json        # Manifest V3 extension configuration
├── content.js           # Content script (concept/product page detection, tile observer, inline buttons)
├── content.css          # Injected styles for Hide/Save buttons, status toggles, and toasts
├── sidebar.html         # Chrome Side Panel management interface
├── sidebar.js           # Side panel logic, search, genre & status filters, export/import
├── popup.html           # Extension toolbar popup interface
├── popup.js             # Popup manager logic
├── popup.css            # Dark PlayStation-themed aesthetic for popup and side panel
├── icons/               # Extension icons (16px, 48px, 128px)
└── README.md            # Documentation and installation instructions
```

---

## Installation Instructions

1. Open **Google Chrome** (or any Chromium browser such as Edge, Brave, etc.).
2. Navigate to `chrome://extensions` in the address bar.
3. Enable **Developer mode** using the toggle switch in the top-right corner.
4. Click the **Load unpacked** button in the top-left corner.
5. Select the extension directory:
   ```
   RunScout
   ```
6. The extension is now installed and active!

---

## How It Works

1. Visit any regional [store.playstation.com](https://store.playstation.com) catalog or browse pages.
2. Click the **Bookmark** icon to save games to your library or the **Hide** button to declutter your view.
3. Open any **Concept** or **Product** page to access inline **Save**, **Hide**, **Find Runs**, and **Speedrun Status** buttons.
4. Open the Chrome Side Panel or popup toolbar icon to manage bookmarks, search leaderboards, cycle run statuses, or toggle the **Untouched Only** filter to find your next speedrun project!

