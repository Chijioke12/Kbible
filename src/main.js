import twemoji from "twemoji";
import "./index.css";

console.log("Vanilla JS KaiOS app ready!");

// --- SAFE KAIOS SCROLL LOGIC ---
function ensureVisible(element) {
  if (!element) return;
  const container = element.parentElement;
  if (!container) return;

  const elementTop = element.offsetTop;
  const elementBottom = elementTop + element.offsetHeight;
  const containerTop = container.scrollTop;
  const containerBottom = containerTop + container.clientHeight;

  if (elementTop < containerTop) {
    container.scrollTop = elementTop;
  } else if (elementBottom > containerBottom) {
    container.scrollTop = elementBottom - container.clientHeight;
  }
}

// --- API Configuration ---
const apiBaseUrl = "https://bible-ivory.vercel.app/api/proxy";

// Canonical Book Identifiers for automatic testament sorting
const OT_IDS = [
  "GEN",
  "EXO",
  "LEV",
  "NUM",
  "DEU",
  "JOS",
  "JDG",
  "RUT",
  "1SA",
  "2SA",
  "1KI",
  "2KI",
  "1CH",
  "2CH",
  "EZR",
  "NEH",
  "EST",
  "JOB",
  "PSA",
  "PRO",
  "ECC",
  "SNG",
  "ISA",
  "JER",
  "LAM",
  "EZK",
  "DAN",
  "HOS",
  "JOL",
  "AMO",
  "OBA",
  "JON",
  "MIC",
  "NAM",
  "HAB",
  "ZEP",
  "HAG",
  "ZEC",
  "MAL",
];
const NT_IDS = [
  "MAT",
  "MRK",
  "LUK",
  "JHN",
  "ACT",
  "ROM",
  "1CO",
  "2CO",
  "GAL",
  "EPH",
  "PHP",
  "COL",
  "1TH",
  "2TH",
  "1TI",
  "2TI",
  "TIT",
  "PHM",
  "HEB",
  "JAS",
  "1PE",
  "2PE",
  "1JN",
  "2JN",
  "3JN",
  "JUD",
  "REV",
];

// --- Custom Exponential Backoff Retry System ---
async function apiCallWithRetry(path, retries = 5, delay = 1000) {
  try {
    const url = `${apiBaseUrl}?path=${encodeURIComponent(path)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    return data.data || data;
  } catch (error) {
    if (retries > 1) {
      const attemptNumber = 6 - retries;
      updateLoaderStatus(`Retrying (${attemptNumber}/5)...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return apiCallWithRetry(path, retries - 1, delay * 2);
    }
    throw error;
  }
}

// --- Persisted State & State Tracking ---
let currentBibleId = localStorage.getItem("kai_selected_bible_id") || null;
let currentBibleName =
  localStorage.getItem("kai_selected_bible_name") || "None Selected";

let navStack = [];
let rawListItems = [];
let ctx = {
  view: "menu",
  type: "menu",
  title: "Bible Home",
  items: [],
  index: 0,
  textData: null,
  bibleId: currentBibleId,
  bookId: null,
  failedAction: null,
};
let isLoading = false;
let isModalOpen = false;
let isSearchActive = false;
let isSearchInputFocused = false;

// --- DOM Elements ---
const device = document.getElementById("kaios-device");
const header = document.getElementById("header");
const listContainer = document.getElementById("list-container");
const gridContainer = document.getElementById("grid-container");
const readerContainer = document.getElementById("reader-container");
const errorContainer = document.getElementById("error-container");
const modalOverlay = document.getElementById("modal-overlay");
const modalTitle = document.getElementById("modal-title");
const modalBody = document.getElementById("modal-body");
const loader = document.getElementById("loader");
const loaderStatus = document.getElementById("loader-status");
const skLeft = document.getElementById("softkey-left");
const skCenter = document.getElementById("softkey-center");
const skRight = document.getElementById("softkey-right");
const searchContainer = document.getElementById("search-container");
const searchInput = document.getElementById("search-input");

// --- Navigation Stack Management ---
function pushContext(newCtx) {
  if (ctx.view !== "error") {
    navStack.push({ ...ctx });
  }
  ctx = { ...ctx, ...newCtx, index: 0 };
  if (ctx.type !== "versions" && ctx.type !== "books") deactivateSearch();
  render();
}

function popContext() {
  if (navStack.length > 0) {
    ctx = navStack.pop();
    if (ctx.type !== "versions" && ctx.type !== "books") deactivateSearch();
    render();
  }
}

// --- Fetch & View Actions ---
function loadMainMenu() {
  deactivateSearch();
  ctx = {
    view: "menu",
    type: "menu",
    title: "Bible Home",
    items: [
      { title: "📚 Select Bible Version", sub: "Choose active translation" },
      { title: "📖 Read Scripture", sub: `Active: ${currentBibleName}` },
    ],
    index: 0,
    textData: null,
    bibleId: currentBibleId,
    bookId: null,
    failedAction: null,
  };
  navStack = [];
  render();
}

async function loadVersions() {
  setLoading(true, "Connecting...");
  try {
    const bibles = await apiCallWithRetry("bibles");
    rawListItems = bibles;
    pushContext({
      view: "list",
      type: "versions",
      title: "Select Version",
      items: bibles,
    });
  } catch (e) {
    showErrorScreen(() => loadVersions());
  }
  setLoading(false);
}

async function loadTestaments(bibleId, bibleName) {
  setLoading(true, "Fetching Books...");
  try {
    const books = await apiCallWithRetry(`bibles/${bibleId}/books`);

    const ot = [];
    const nt = [];
    const apocrypha = [];

    books.forEach((b) => {
      const id = (b.id || "").toUpperCase();
      if (OT_IDS.includes(id)) ot.push(b);
      else if (NT_IDS.includes(id)) nt.push(b);
      else apocrypha.push(b);
    });

    const testaments = [];
    if (ot.length > 0)
      testaments.push({
        title: "Old Testament",
        sub: `${ot.length} books`,
        data: ot,
      });
    if (nt.length > 0)
      testaments.push({
        title: "New Testament",
        sub: `${nt.length} books`,
        data: nt,
      });
    if (apocrypha.length > 0)
      testaments.push({
        title: "Deuterocanonicals",
        sub: `${apocrypha.length} books`,
        data: apocrypha,
      });

    if (testaments.length === 0) {
      rawListItems = books;
      pushContext({
        view: "list",
        type: "books",
        title: bibleName,
        items: books,
        bibleId: bibleId,
      });
    } else {
      pushContext({
        view: "menu",
        type: "testaments",
        title: bibleName,
        items: testaments,
        bibleId: bibleId,
      });
    }
  } catch (e) {
    showErrorScreen(() => loadTestaments(bibleId, bibleName));
  }
  setLoading(false);
}

async function loadChapters(bookId, bookName) {
  setLoading(true, "Chapters...");
  try {
    const chapters = await apiCallWithRetry(
      `bibles/${ctx.bibleId}/books/${bookId}/chapters`,
    );
    pushContext({
      view: "grid",
      type: "chapters",
      title: bookName,
      items: chapters,
      bookId: bookId,
    });
  } catch (e) {
    showErrorScreen(() => loadChapters(bookId, bookName));
  }
  setLoading(false);
}

async function loadChapterText(chapterId, chapterName) {
  setLoading(true, "Downloading...");
  try {
    const path = `bibles/${ctx.bibleId}/chapters/${chapterId}?content-type=text&include-notes=false&include-titles=true&include-chapter-numbers=false&include-verse-numbers=true`;
    const data = await apiCallWithRetry(path);
    pushContext({
      view: "reader",
      type: "text",
      title: chapterName,
      items: [],
      textData: data.content,
    });
  } catch (e) {
    showErrorScreen(() => loadChapterText(chapterId, chapterName));
  }
  setLoading(false);
}

// --- Universal Search/Filter Mechanics ---
function toggleSearch() {
  if (ctx.type !== "versions" && ctx.type !== "books") return;

  if (!isSearchActive) activateSearch();
  else {
    deactivateSearch();
    ctx.items = rawListItems;
    ctx.index = 0;
    renderList();
  }
  updateSoftkeys();
}

function activateSearch() {
  isSearchActive = true;
  searchContainer.style.display = "block";
  focusSearchField();
}

function deactivateSearch() {
  isSearchActive = false;
  isSearchInputFocused = false;
  searchContainer.style.display = "none";
  searchInput.value = "";
  searchInput.blur();
  searchInput.classList.remove("focused");
}

function focusSearchField() {
  isSearchInputFocused = true;
  searchInput.classList.add("focused");
  searchInput.focus();
  updateSoftkeys();
}

function unfocusSearchField() {
  isSearchInputFocused = false;
  searchInput.classList.remove("focused");
  searchInput.blur();
  device.focus();
  updateSoftkeys();
}

searchInput.addEventListener("input", () => {
  const query = searchInput.value.toLowerCase().trim();
  if (query === "") {
    ctx.items = rawListItems;
  } else {
    ctx.items = rawListItems.filter((item) => {
      const nameMatch = (item.name || "").toLowerCase().includes(query);
      const abbrMatch = (item.abbreviation || "").toLowerCase().includes(query);
      return nameMatch || abbrMatch;
    });
  }
  ctx.index = 0;
  renderList();
});

// --- Rendering Core ---
function render() {
  header.textContent = ctx.title;

  listContainer.style.display =
    ctx.view === "list" || ctx.view === "menu" ? "block" : "none";
  gridContainer.style.display = ctx.view === "grid" ? "grid" : "none";
  readerContainer.style.display = ctx.view === "reader" ? "block" : "none";
  errorContainer.style.display = ctx.view === "error" ? "flex" : "none";

  if (ctx.view === "menu") renderMenu();
  else if (ctx.view === "list") renderList();
  else if (ctx.view === "grid") renderGrid();
  else if (ctx.view === "reader") renderReader();

  updateSoftkeys();
  twemoji.parse(device, {
    base: "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/",
    folder: "72x72",
    ext: ".png"
  });
}

function renderMenu() {
  listContainer.innerHTML = "";
  ctx.items.forEach((item, i) => {
    const div = document.createElement("div");
    div.className = `menu-item ${i === ctx.index ? "focused" : ""}`;

    const title = document.createElement("span");
    title.className = "menu-title";
    title.textContent = item.title;

    const sub = document.createElement("span");
    sub.className = "menu-sub";
    sub.textContent = item.sub;

    div.appendChild(title);
    div.appendChild(sub);
    listContainer.appendChild(div);
  });

  ensureVisible(listContainer.querySelector(".focused"));
}

function renderList() {
  listContainer.innerHTML = "";
  if (!ctx.items || ctx.items.length === 0) {
    listContainer.innerHTML =
      '<div style="padding: 15px; text-align:center; color:#888;">No items found.</div>';
    return;
  }

  ctx.items.forEach((item, i) => {
    const div = document.createElement("div");
    div.className = `list-item ${!isSearchInputFocused && i === ctx.index ? "focused" : ""}`;
    div.textContent = item.name || item.number || item.reference || item.id;
    listContainer.appendChild(div);
  });

  ensureVisible(listContainer.querySelector(".focused"));
}

function renderGrid() {
  gridContainer.innerHTML = "";
  if (!ctx.items || ctx.items.length === 0) {
    gridContainer.innerHTML =
      '<div style="grid-column: 1 / -1; text-align:center; color:#888;">No chapters</div>';
    return;
  }

  ctx.items.forEach((item, i) => {
    const div = document.createElement("div");
    div.className = `grid-item ${i === ctx.index ? "focused" : ""}`;
    div.textContent = item.number || item.reference || item.id;
    gridContainer.appendChild(div);
  });

  ensureVisible(gridContainer.querySelector(".focused"));
}

function parseVerses(text) {
  const regex = /\[(\d+)\]/g;
  let match;
  let verses = [];
  let lastIndex = 0;
  let lastNum = null;

  while ((match = regex.exec(text)) !== null) {
    if (lastNum !== null) {
      const verseText = text.substring(lastIndex, match.index).trim();
      verses.push({ number: lastNum, text: verseText });
    }
    lastNum = match[1];
    lastIndex = regex.lastIndex;
  }
  if (lastNum !== null) {
    const verseText = text.substring(lastIndex).trim();
    verses.push({ number: lastNum, text: verseText });
  }
  return verses;
}

function renderReader() {
  const rawText = ctx.textData || "Content unavailable.";
  const verses = parseVerses(rawText);

  readerContainer.innerHTML = "";

  if (verses.length === 0) {
    const p = document.createElement("p");
    p.style.margin = "0";
    p.style.lineHeight = "1.6";
    p.textContent = rawText;
    readerContainer.appendChild(p);
  } else {
    verses.forEach((v) => {
      const row = document.createElement("div");
      row.className = "verse-row";

      const num = document.createElement("span");
      num.className = "verse-number";
      num.textContent = v.number;

      const txt = document.createElement("span");
      txt.className = "verse-text";
      txt.textContent = v.text;

      row.appendChild(num);
      row.appendChild(txt);
      readerContainer.appendChild(row);
    });
  }
  readerContainer.scrollTop = 0;
}

function showErrorScreen(retryAction) {
  pushContext({
    view: "error",
    type: "error",
    title: "Connection Lost",
    failedAction: retryAction,
  });
}

function showModal(title, message) {
  isModalOpen = true;
  modalTitle.textContent = title;
  modalBody.textContent = message;
  modalOverlay.style.display = "flex";
}

function hideModal() {
  isModalOpen = false;
  modalOverlay.style.display = "none";
  device.focus();
}

function updateSoftkeys() {
  if (isModalOpen) {
    skLeft.textContent = "";
    skCenter.textContent = "OK";
    skRight.textContent = "";
    return;
  }
  if (isSearchInputFocused) {
    skLeft.textContent = "Cancel";
    skCenter.textContent = "";
    skRight.textContent = "Clear";
    return;
  }

  if (ctx.view === "menu") {
    skLeft.textContent = ctx.type === "testaments" ? "Back" : "";
    skCenter.textContent = "Select";
    skRight.textContent = "";
  } else if (ctx.view === "list" || ctx.view === "grid") {
    skLeft.textContent = "Back";
    skCenter.textContent = ctx.items.length > 0 ? "Select" : "";
    skRight.textContent =
      ctx.type === "versions" || ctx.type === "books"
        ? isSearchActive
          ? "Close"
          : "Search"
        : "";
  } else if (ctx.view === "reader") {
    skLeft.textContent = "Back";
    skCenter.textContent = "";
    skRight.textContent = "";
  } else if (ctx.view === "error") {
    skLeft.textContent = navStack.length > 1 ? "Back" : "";
    skCenter.textContent = "Retry";
    skRight.textContent = "";
  }
}

function setLoading(state, label = "Loading...") {
  isLoading = state;
  loader.style.display = state ? "flex" : "none";
  if (state) {
    document.getElementById("loader-text").textContent = label;
    updateLoaderStatus("");
  } else {
    device.focus();
  }
}

function updateLoaderStatus(status) {
  loaderStatus.textContent = status;
}

// --- Interaction Logic ---
function handleSelect() {
  if (isModalOpen) {
    hideModal();
    return;
  }

  if (ctx.view === "menu") {
    if (ctx.type === "menu") {
      if (ctx.index === 0) loadVersions();
      else if (ctx.index === 1) {
        if (!currentBibleId)
          showModal(
            "Select Version",
            "Please select a Bible translation from option 1 before reading.",
          );
        else loadTestaments(currentBibleId, currentBibleName);
      }
    } else if (ctx.type === "testaments") {
      const item = ctx.items[ctx.index];
      rawListItems = item.data;
      pushContext({
        view: "list",
        type: "books",
        title: item.title,
        items: item.data,
        bibleId: ctx.bibleId,
      });
    }
  } else if (ctx.view === "error") {
    if (ctx.failedAction) {
      const actionToRetry = ctx.failedAction;
      popContext();
      actionToRetry();
    }
  } else if (
    (ctx.view === "list" || ctx.view === "grid") &&
    ctx.items.length > 0
  ) {
    const item = ctx.items[ctx.index];

    if (ctx.type === "versions") {
      currentBibleId = item.id;
      currentBibleName = item.abbreviation || item.name;
      localStorage.setItem("kai_selected_bible_id", currentBibleId);
      localStorage.setItem("kai_selected_bible_name", currentBibleName);
      loadMainMenu();
    } else if (ctx.type === "books") {
      loadChapters(item.id, item.name);
    } else if (ctx.type === "chapters") {
      loadChapterText(item.id, item.reference || `Chapter ${item.number}`);
    }
  }
}

function handleBack() {
  if (isModalOpen) {
    hideModal();
    return;
  }
  if (isSearchInputFocused) {
    unfocusSearchField();
    return;
  }
  if (navStack.length > 0) popContext();
}

// --- Dynamic Navigation Control Engine ---
function processKey(key) {
  if (isLoading) return;

  if (isModalOpen) {
    if (
      key === "Enter" ||
      key === "SoftLeft" ||
      key === "q" ||
      key === "Backspace"
    )
      handleBack();
    return;
  }

  // Fix for Input Focus Key Blocking
  if (isSearchInputFocused) {
    if (key === "ArrowDown" || key === "Enter") {
      if (ctx.items.length > 0) {
        unfocusSearchField();
        renderList();
      }
    } else if (key === "SoftLeft" || key === "Escape") {
      deactivateSearch();
      ctx.items = rawListItems;
      ctx.index = 0;
      renderList();
    } else if (key === "Backspace") {
      if (searchInput.value.length === 0) {
        deactivateSearch();
        ctx.items = rawListItems;
        ctx.index = 0;
        renderList();
      }
    } else if (key === "SoftRight") {
      searchInput.value = "";
      ctx.items = rawListItems;
      ctx.index = 0;
      renderList();
    }
    return;
  }

  if (ctx.view === "menu") {
    const length = ctx.items.length;
    switch (key) {
      case "ArrowDown":
        ctx.index = (ctx.index + 1) % length;
        renderMenu();
        break;
      case "ArrowUp":
        ctx.index = (ctx.index - 1 + length) % length;
        renderMenu();
        break;
      case "Enter":
        handleSelect();
        break;
      case "SoftLeft":
      case "q":
      case "Backspace":
        handleBack();
        break;
    }
  } else if (ctx.view === "list") {
    const length = ctx.items.length;
    switch (key) {
      case "ArrowDown":
        if (length > 0) {
          ctx.index = (ctx.index + 1) % length;
          renderList();
        }
        break;
      case "ArrowUp":
        if (isSearchActive && ctx.index === 0) focusSearchField();
        else if (length > 0) {
          ctx.index = (ctx.index - 1 + length) % length;
          renderList();
        }
        break;
      case "ArrowRight":
        if (length > 0) {
          ctx.index = (ctx.index + 5) % length;
          renderList();
        }
        break;
      case "ArrowLeft":
        if (length > 0) {
          ctx.index = (ctx.index - 5 + length) % length;
          renderList();
        }
        break;
      case "Enter":
        handleSelect();
        break;
      case "SoftLeft":
      case "q":
      case "Backspace":
        handleBack();
        break;
      case "SoftRight":
      case "e":
        toggleSearch();
        break;
    }
  } else if (ctx.view === "grid") {
    const cols = 4;
    const length = ctx.items.length;
    switch (key) {
      case "ArrowRight":
        if (length > 0) {
          ctx.index = (ctx.index + 1) % length;
          renderGrid();
        }
        break;
      case "ArrowLeft":
        if (length > 0) {
          ctx.index = (ctx.index - 1 + length) % length;
          renderGrid();
        }
        break;
      case "ArrowDown":
        if (length > 0) {
          const col = ctx.index % cols;
          const next = ctx.index + cols;
          if (next >= length) ctx.index = col;
          else ctx.index = next;
          renderGrid();
        }
        break;
      case "ArrowUp":
        if (length > 0) {
          const col = ctx.index % cols;
          const prev = ctx.index - cols;
          if (prev < 0) {
            let lastInCol = col;
            while (lastInCol + cols < length) lastInCol += cols;
            ctx.index = lastInCol;
          } else {
            ctx.index = prev;
          }
          renderGrid();
        }
        break;
      case "Enter":
        handleSelect();
        break;
      case "SoftLeft":
      case "q":
      case "Backspace":
        handleBack();
        break;
    }
  } else if (ctx.view === "reader") {
    switch (key) {
      case "ArrowDown":
        readerContainer.scrollTop += 40;
        break;
      case "ArrowUp":
        readerContainer.scrollTop -= 40;
        break;
      case "SoftLeft":
      case "q":
      case "Backspace":
        handleBack();
        break;
    }
  } else if (ctx.view === "error") {
    switch (key) {
      case "Enter":
        handleSelect();
        break;
      case "SoftLeft":
      case "q":
      case "Backspace":
        handleBack();
        break;
    }
  }
}

device.addEventListener("keydown", (e) => {
  if (
    [
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Enter",
      "Backspace",
      "SoftLeft",
      "SoftRight",
    ].includes(e.key)
  ) {
    if (isSearchInputFocused && e.key !== "Enter") return;
    e.preventDefault();
  }
  processKey(e.key);
});

window.simulateKey = function (keyName) {
  processKey(keyName);
  if (isSearchInputFocused) searchInput.focus();
  else device.focus();
};

// --- Initialization ---
device.focus();
loadMainMenu();
