document.addEventListener("DOMContentLoaded", () => {
    if (!window.location.href.includes("/active-matches?") && !window.location.href.includes("/active-matches/?")) return;

    chrome.storage.local.get(["enabled"], (data) => {
        if (data.enabled !== false) handleStatlockerMatchesFilters();
    });
});

async function handleStatlockerMatchesFilters() {
    await sleep(500);

    const url = new URL(window.location.href);
    const searchby = url.searchParams.get("searchby");
    const value = url.searchParams.get("value");
    const searchTypes = {
        player: 0,
        accountid: 0,
        steamid: 0,
        matchid: 1,
        mymatches: 2
    };
    const playerSearchTypes = new Set(["player", "accountid", "steamid"]);

    if (!(searchby in searchTypes)) return;
    await addStatlockerMatchesFilter(searchTypes[searchby], value, playerSearchTypes.has(searchby));
}

async function addStatlockerMatchesFilter(searchby, value, isPlayerSearch) {
    const filtersContainer = await waitFor(() => document.querySelector(".amp-rail-panel"), 7000);
    if (!filtersContainer) return;

    await selectSearchType(filtersContainer, searchby);

    if (value) {
        if (isPlayerSearch) {
            await selectPlayerSearchResult(filtersContainer, value);
        }
        else {
            await applyTextFilter(filtersContainer, value);
        }
    }

    window.scrollBy({ top: 200, behavior: "smooth" });
}

async function selectSearchType(filtersContainer, searchby) {
    const dropdownButton = filtersContainer.querySelectorAll(".sort-dropdown > button")[2];
    if (!dropdownButton) return;

    dropdownButton.click();
    const options = await waitFor(() => {
        const items = Array.from(document.querySelectorAll(".sort-dropdown-menu .sort-option, .sort-dropdown-menu > div"));
        return items.length > searchby ? items : null;
    }, 2500);
    options?.[searchby]?.click();
    await sleep(80);
}

async function selectPlayerSearchResult(filtersContainer, value) {
    const input = await waitFor(() => filtersContainer.querySelector(".amp-player-search input.search-input, input.search-input"), 4000);
    if (!input) return;

    input.focus();
    setNativeInputValue(input, value);
    input.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }));
    input.dispatchEvent(new Event("change", { bubbles: true }));

    const result = await waitFor(() => getFirstPlayerSearchResult(filtersContainer), 6000);
    if (result) {
        clickElement(result);
        await sleep(180);
    }

    if (!filtersContainer.querySelector(".amp-picked, .amp-not-live")) {
        pressEnter(input);
        await sleep(120);
    }
    input.blur();
}

async function applyTextFilter(filtersContainer, value) {
    const input = await waitFor(() => filtersContainer.querySelector("input.search-input, input.search-input-field"), 4000);
    if (!input) return;

    input.focus();
    setNativeInputValue(input, value);
    input.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }));
    input.dispatchEvent(new Event("change", { bubbles: true }));

    const applyButton = filtersContainer.querySelector(".amp-rail-actions > button");
    if (applyButton) applyButton.click();
    else pressEnter(input);
    input.blur();
}

function getFirstPlayerSearchResult(filtersContainer) {
    const items = Array.from(filtersContainer.querySelectorAll(".amp-player-search .search-results .profile-item, .search-results .profile-item"));
    return items.find(isElementVisible) || null;
}

function isElementVisible(element) {
    if (!element.getClientRects().length || element.closest("[hidden]")) return false;
    let current = element;
    while (current && current !== document.body) {
        const style = window.getComputedStyle(current);
        if (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none" || Number(style.opacity) === 0) return false;
        current = current.parentElement;
    }
    return true;
}

function clickElement(element) {
    ["pointerdown", "mousedown", "mouseup", "click"].forEach((type) => {
        element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, composed: true, view: window }));
    });
}

function pressEnter(input) {
    ["keydown", "keypress", "keyup"].forEach((type) => {
        input.dispatchEvent(new KeyboardEvent(type, { key: "Enter", code: "Enter", bubbles: true, cancelable: true, composed: true }));
    });
}

function setNativeInputValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(input, value);
    else input.value = value;
}

function waitFor(callback, timeout = 4000, interval = 80) {
    return new Promise((resolve) => {
        const startedAt = Date.now();
        const tick = () => {
            const value = callback();
            if (value) {
                resolve(value);
                return;
            }
            if (Date.now() - startedAt >= timeout) {
                resolve(null);
                return;
            }
            setTimeout(tick, interval);
        };
        tick();
    });
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
