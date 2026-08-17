const SERVICE_VISIBILITY_KEY = "steamnotesServiceVisibility";
const EMPTY_MATCH_NAMES_KEY = "steamnotesShowEmptyActiveMatchNames";
const AUTO_EXPAND_SINGLE_MATCH_KEY = "steamnotesAutoExpandSingleActiveMatch";

const STATIC_SERVICES = [
    {
        id: "steam",
        label: "Steam",
        mode: "steamid64",
        icon: "steam.png",
        pages: ["steam", "tracklock", "statlocker", "twitch"],
        template: "https://steamcommunity.com/profiles/{id}"
    },
    {
        id: "tracklock",
        label: "Tracklock",
        mode: "steamid3",
        icon: "tracklock.png",
        pages: ["steam", "tracklock", "statlocker", "twitch"],
        template: "https://tracklock.gg/players/{id}"
    },
    {
        id: "statlocker",
        label: "Statlocker",
        mode: "steamid3",
        icon: "statlocker.png",
        pages: ["steam", "tracklock", "statlocker", "twitch"],
        template: "https://statlocker.gg/profile/{id}"
    },
    {
        id: "statlockerMatches",
        label: "Statlocker Matches",
        mode: "steamid3",
        icon: "statlocker.png",
        pages: ["steam", "tracklock", "statlocker", "twitch"],
        template: "https://statlocker.gg/active-matches/?searchby=accountid&value={id}"
    },
    {
        id: "deadlockApi",
        label: "Deadlock API",
        mode: "steamid3",
        icon: "builds.png",
        pages: ["steam", "tracklock", "statlocker", "twitch"],
        template: "https://api.deadlock-api.com/v1/builds?only_latest=true&limit=100&sort_by=updated_at&author_id={id}"
    },
    {
        id: "twitch",
        label: "Twitch",
        mode: "custom",
        icon: "twitch.png",
        pages: ["steam", "tracklock", "statlocker", "statlockerMatches"],
        legacyKey: "twitch",
        template: "https://twitch.tv/{id}"
    },
    {
        id: "faceit",
        label: "Faceit",
        mode: "custom",
        icon: "faceit.png",
        pages: ["steam", "tracklock", "statlocker", "statlockerMatches", "twitch"],
        legacyKey: "faceit",
        template: "https://faceit.com/en/players/{id}"
    }
];

const DEFAULT_SERVICE_VISIBILITY = Object.fromEntries(STATIC_SERVICES.map((service) => [
    service.id,
    { popup: true, profile: true }
]));

document.addEventListener("DOMContentLoaded", () => {
    chrome.storage.local.get(["enabled"], (data) => {
        if (data.enabled === false) return;
        activateCurrentPage(true);
    });
});

chrome.runtime.onMessage.addListener((message) => {
    if (message.type == "setting_changed") {
        const { name, value } = message;

        if (name === "enabled") {
            if (value) activateCurrentPage(true);
            else {
                handleAddNotes(false);
                handleStatlockerMatchPlayers(false);
                handleAddTwitch(false);
            }
        }
        else if (name === SERVICE_VISIBILITY_KEY) {
            refreshSteamNotesPanels();
        }
        else if ((name === EMPTY_MATCH_NAMES_KEY || name === AUTO_EXPAND_SINGLE_MATCH_KEY) && getCurrentPageKey() === "statlockerMatches") {
            handleStatlockerMatchPlayers(true);
        }
    }
    else if (message.type == "urlChanged") {
        chrome.storage.local.get(["enabled"], (data) => {
            if (data.enabled === false) return;

            if (window.location.hostname == "www.twitch.tv") {
                let twitchUsername = window.location.href.match(/https:\/\/www\.twitch\.tv\/([a-zA-Z0-9_]{4,25})/);
                if (twitchUsername) twitchUsername = twitchUsername[1].toLowerCase();

                if (twitchUsername !== lastPanelUser) {
                    lastPanelUser = twitchUsername;
                    document.getElementById("turbo-notes-twitch-container")?.remove();
                    handleAddTwitch(true);
                }
            }
            else if (window.location.hostname == "statlocker.gg") {
                const panel = document.getElementById("turbo-notes-panel");
                if (window.location.pathname.includes("/profile/")) {
                    const match = window.location.pathname.match(/profile\/(\d+)/);
                    const steamId = match?.[1];

                    if (steamId && steamId !== lastPanelUser) {
                        lastPanelUser = steamId;
                        if (panel) panel.remove();
                        createNotes(steamId);
                    }
                }
                else if (panel) {
                    panel.remove();
                }

                if (window.location.href.includes("statlocker.gg/active-matches")) {
                    handleStatlockerMatchPlayers(true);
                }
            }
        });
    }
});

function activateCurrentPage(value) {
    const pageKey = getCurrentPageKey();
    if (pageKey === "steam" || pageKey === "tracklock" || pageKey === "statlocker") {
        handleAddNotes(value);
    }
    else if (pageKey === "statlockerMatches") {
        handleStatlockerMatchPlayers(value);
    }
    else if (pageKey === "twitch") {
        handleAddTwitch(value);
    }
}

function getSteamIDFromURL() {
    const profileURL = window.location.pathname;
    const match = profileURL.match(/\/profiles\/(\d+)/);
    return match ? match[1] : null;
}

function getSteamIDFromXML() {
    return fetch(window.location.href + "?xml=1")
        .then((response) => response.text())
        .then((text) => {
            const match = text.match(/<steamID64>(\d+)<\/steamID64>/);
            return match ? match[1] : null;
        })
        .catch(() => null);
}

function steamID64ToAccountID(steamID64) {
    return BigInt(steamID64) - BigInt("76561197960265728");
}

function handleAddNotes(value) {
    if (value) {
        if (document.getElementById("turbo-notes-panel")) return;

        if (window.location.hostname == "steamcommunity.com") {
            const steamId = getSteamIDFromURL();

            if (steamId && !isNaN(steamId)) {
                createNotes(steamID64ToAccountID(steamId).toString());
            }
            else {
                getSteamIDFromXML().then((id) => {
                    if (id) createNotes(steamID64ToAccountID(id).toString());
                });
            }
        }
        else {
            const match = window.location.pathname.match(/(profile|profiles|player|players)\/(\d+)/);
            const steamId = match?.[2];
            if (!steamId) return;
            createNotes(steamId);

            if (window.location.hostname == "statlocker.gg") {
                lastPanelUser = steamId;
            }
        }
    }
    else {
        document.getElementById("turbo-notes-panel")?.remove();
    }
}

function createNotes(steamId) {
    chrome.storage.local.get(["steamNotes", SERVICE_VISIBILITY_KEY, "steamnotesServices"], (data) => {
        const saved = parseNotes(data.steamNotes);
        const userData = saved[steamId] || { nickname: "", info: "", twitch: "", faceit: "", cheater: false, suspect: false };
        const visibility = normalizeServiceVisibility(data[SERVICE_VISIBILITY_KEY], data.steamnotesServices);
        const pageDisplayName = getCurrentDisplayName(steamId);
        const savedDisplayName = cleanDisplayName(userData.displayName, steamId);
        userData.displayName = savedDisplayName || pageDisplayName;

        if (saved[steamId] && pageDisplayName && savedDisplayName !== pageDisplayName) {
            saved[steamId] = { ...saved[steamId], displayName: pageDisplayName };
            chrome.storage.local.set({ steamNotes: JSON.stringify(saved) });
        }

        const panel = document.createElement("div");
        panel.id = "turbo-notes-panel";

        const editorBlock = document.createElement("div");
        editorBlock.className = "turbo-notes-editor-block";
        panel.appendChild(editorBlock);

        const close = document.createElement("button");
        close.id = "turbo-notes-close";
        close.type = "button";
        close.textContent = "x";
        close.addEventListener("click", () => {
            panel.classList.add("turbo-notes-removed");
            setTimeout(() => panel.remove(), 150);
        });

        const flagsRow = document.createElement("div");
        flagsRow.className = "turbo-notes-flags";

        function addField(labelText, type, key, multiline = false) {
            const label = document.createElement("label");
            label.className = "turbo-notes-label";
            label.classList.add(`turbo-notes-label-${key}`);
            if (type === "checkbox") {
                label.classList.add("turbo-notes-flag");
            }

            const span = document.createElement("span");
            span.className = "turbo-notes-span";
            span.textContent = labelText;

            let input;
            if (multiline) {
                input = document.createElement("textarea");
                input.style.height = "60px";
            } else if (type === "checkbox") {
                input = document.createElement("input");
                input.type = "checkbox";
                input.checked = !!userData[key];
                label.classList.toggle("is-checked", input.checked);
            } else {
                input = document.createElement("input");
                input.type = type;
            }

            if (type === "checkbox") {
                label.append(input, span);
            }
            else {
                label.appendChild(span);
                input.value = getPageCustomValue(userData, key) || userData[key] || "";
                label.appendChild(input);
            }

            input.id = `turbo-notes-${key}`;
            if (key === "nickname") {
                label.appendChild(close);
            }
            input.addEventListener("input", saveData);
            if (type === "checkbox") {
                input.addEventListener("change", () => {
                    label.classList.toggle("is-checked", input.checked);
                });
            }
            if (type === "checkbox") flagsRow.appendChild(label);
            else editorBlock.appendChild(label);

            function saveData() {
                chrome.storage.local.get(["steamNotes"], (storageData) => {
                    const all = parseNotes(storageData.steamNotes);
                    all[steamId] = all[steamId] || {};
                    all[steamId][key] = type === "checkbox" ? input.checked : input.value.trim();
                    if (pageDisplayName) all[steamId].displayName = all[steamId].displayName || pageDisplayName;
                    if (key === "twitch" || key === "faceit") {
                        all[steamId].serviceLogins = all[steamId].serviceLogins || {};
                        all[steamId].serviceLogins[key] = input.value.trim();
                    }
                    all[steamId].createdAt = all[steamId].createdAt || Date.now();
                    chrome.storage.local.set({ steamNotes: JSON.stringify(all) });
                });
            }
        }

        addField("Nick", "text", "nickname");
        addField("Info", "text", "info", true);
        addField("Twitch", "text", "twitch");
        if (isServiceEnabledAnywhere("faceit", visibility)) {
            addField("Faceit", "text", "faceit");
        }
        addField("Cheater", "checkbox", "cheater");
        addField("Suspect", "checkbox", "suspect");
        editorBlock.appendChild(flagsRow);
        addPageServiceLinks(panel, visibility, steamId, userData);

        document.body.appendChild(panel);
    });
}

function handleStatlockerMatchPlayers(value) {
    if (value) {
        replacePlayerLinks();
        statlockerMatchObserver.observe(document.body, { childList: true, subtree: true });
    }
    else {
        statlockerMatchObserver.disconnect();

        chrome.storage.local.get("steamNotes", (data) => {
            const saved = parseNotes(data.steamNotes);

            document.querySelectorAll('.lm-player-name > a[href^="/profile/"]').forEach((a) => {
                const match = a.getAttribute("href").match(/\/profile\/(\d+)/);
                const id = match?.[1];

                if (saved[id]) {
                    a.textContent = a.parentElement.title;
                    a.style.color = "#fff";
                }
            });
        });
    }
}

function replacePlayerLinks() {
    chrome.storage.local.get(["steamNotes", SERVICE_VISIBILITY_KEY, "steamnotesServices", EMPTY_MATCH_NAMES_KEY, AUTO_EXPAND_SINGLE_MATCH_KEY], (data) => {
        const saved = parseNotes(data.steamNotes);
        const visibility = normalizeServiceVisibility(data[SERVICE_VISIBILITY_KEY], data.steamnotesServices);
        const showEmptyNames = data[EMPTY_MATCH_NAMES_KEY] !== false;
        if (data[AUTO_EXPAND_SINGLE_MATCH_KEY] !== false) autoExpandSingleStatlockerMatch();

        document.querySelectorAll('.lm-player-name > a[href^="/profile/"]').forEach((a) => {
            const match = a.getAttribute("href").match(/\/profile\/(\d+)/);
            const id = match?.[1];
            if (!id) return;

            if (!showEmptyNames && a.dataset.steamnotesEmptyName === "true") {
                a.textContent = "";
                a.style.color = "";
                delete a.dataset.steamnotesEmptyName;
                return;
            }

            if (saved[id]) {
                a.textContent = "";
                delete a.dataset.steamnotesEmptyName;
                a.appendChild(document.createTextNode(getNoteDisplayTitle(id, saved[id], a.parentElement.title)));

                ["twitch"].forEach((serviceId) => {
                    const service = STATIC_SERVICES.find((item) => item.id === serviceId);
                    const href = buildPageServiceUrl(service, id, saved[id], visibility);
                    if (!href) return;

                    const icon = document.createElement("img");
                    icon.src = getPageServiceIconUrl(service);
                    icon.style.width = icon.style.height = "15px";
                    icon.style.marginLeft = "5px";
                    icon.addEventListener("pointerup", (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (event.button === 0) window.location.href = href;
                        else if (event.button === 1) window.open(href, "_blank", "noopener");
                    });
                    a.appendChild(icon);
                });

                a.style.color = saved[id].cheater ? "red" : saved[id].suspect ? "#d19042" : "#5fda72";
            }
            else if (a.textContent.trim() === "" || a.textContent.trim() === "็็็") {
                if (!showEmptyNames) return;
                a.textContent = "*empty*";
                a.style.color = "gray";
                a.dataset.steamnotesEmptyName = "true";
            }
        });
    });
}

function autoExpandSingleStatlockerMatch() {
    document.querySelectorAll("div.lobby-live-list").forEach((list) => {
        const cards = [...list.querySelectorAll("div.lobby-live-card")]
            .filter((card) => card.closest("div.lobby-live-list") === list);
        if (cards.length !== 1) return;

        const card = cards[0];
        if (card.dataset.steamnotesAutoExpanded === "true") return;

        const button = card.querySelector("button.llc-collapsed");
        if (!button) return;

        card.dataset.steamnotesAutoExpanded = "true";
        button.click();
    });
}

const statlockerMatchObserver = new MutationObserver(() => {
    chrome.storage.local.get(["enabled"], (data) => {
        if (data.enabled !== false) handleStatlockerMatchPlayers(true);
    });
});

let lastPanelUser;
let twitchPanelRenderVersion = 0;

function handleAddTwitch(value) {
    const renderVersion = ++twitchPanelRenderVersion;
    if (value) {
        let container = document.getElementById("turbo-notes-twitch-container");
        if (!container) {
            container = document.createElement("div");
            container.id = "turbo-notes-twitch-container";
            document.body.appendChild(container);
        }
        else {
            container.innerHTML = "";
        }

        let twitchUsername = window.location.href.match(/https:\/\/www\.twitch\.tv\/([a-zA-Z0-9_]{4,25})/);
        if (twitchUsername) twitchUsername = twitchUsername[1].toLowerCase();
        lastPanelUser = twitchUsername;

        chrome.storage.local.get(["steamNotes", SERVICE_VISIBILITY_KEY, "steamnotesServices"], (data) => {
            if (renderVersion !== twitchPanelRenderVersion || !container.isConnected) return;

            let currentUsername = window.location.href.match(/https:\/\/www\.twitch\.tv\/([a-zA-Z0-9_]{4,25})/);
            if (currentUsername) currentUsername = currentUsername[1].toLowerCase();
            if (currentUsername !== twitchUsername) return;

            container.replaceChildren();
            const saved = parseNotes(data.steamNotes);
            const visibility = normalizeServiceVisibility(data[SERVICE_VISIBILITY_KEY], data.steamnotesServices);
            const renderedIds = new Set();
            const matchingNotes = Object.entries(saved)
                .filter(([, note]) => {
                    const savedTwitch = getPageCustomValue(note, "twitch");
                    return savedTwitch && twitchUsername === savedTwitch.toLowerCase() && !note.hideOnTwitch;
                })
                .sort(compareTwitchNotes);

            matchingNotes.forEach(([id, note]) => {
                const savedTwitch = getPageCustomValue(note, "twitch");
                if (savedTwitch && twitchUsername == savedTwitch.toLowerCase() && !note.hideOnTwitch && !renderedIds.has(id)) {
                    renderedIds.add(id);
                    const panel = document.createElement("div");
                    panel.classList.add("turbo-notes-twitch-panel");
                    panel.dataset.steamNotesId = id;

                    const close = document.createElement("div");
                    close.classList.add("turbo-notes-twitch-close");
                    close.textContent = "x";
                    close.addEventListener("mouseenter", () => (close.style.color = "#fff"));
                    close.addEventListener("mouseleave", () => (close.style.color = "#aaa"));
                    close.addEventListener("click", () => {
                        panel.classList.add("turbo-notes-removed");
                        setTimeout(() => panel.remove(), 150);
                    });
                    panel.appendChild(close);

                    addPageServiceLinks(panel, visibility, id, note);
                    container.appendChild(panel);
                }
            });
        });
    }
    else {
        document.getElementById("turbo-notes-twitch-container")?.remove();
    }
}

function compareTwitchNotes([, a], [, b]) {
    if (!!a.pinned !== !!b.pinned) return Number(!!b.pinned) - Number(!!a.pinned);

    const aOrder = Number.isFinite(Number(a.order)) ? Number(a.order) : Number.MAX_SAFE_INTEGER;
    const bOrder = Number.isFinite(Number(b.order)) ? Number(b.order) : Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;

    return (b.createdAt || 0) - (a.createdAt || 0);
}

function getCurrentPageKey() {
    if (window.location.hostname == "steamcommunity.com") return "steam";
    if (window.location.hostname == "tracklock.gg") return "tracklock";
    if (window.location.hostname == "statlocker.gg" && window.location.href.includes("statlocker.gg/active-matches")) return "statlockerMatches";
    if (window.location.hostname == "statlocker.gg" && window.location.href.includes("statlocker.gg/profile/")) return "statlocker";
    if (window.location.hostname == "www.twitch.tv") return "twitch";
    return "";
}

function refreshSteamNotesPanels() {
    chrome.storage.local.get(["enabled"], (data) => {
        if (data.enabled === false) return;
        const pageKey = getCurrentPageKey();

        if (pageKey === "steam" || pageKey === "tracklock" || pageKey === "statlocker") {
            document.getElementById("turbo-notes-panel")?.remove();
            handleAddNotes(true);
        }
        else if (pageKey === "statlockerMatches") {
            handleStatlockerMatchPlayers(true);
        }
        else if (pageKey === "twitch") {
            document.getElementById("turbo-notes-twitch-container")?.remove();
            handleAddTwitch(true);
        }
    });
}

function addPageServiceLinks(container, visibility, steamId, note) {
    const pageKey = getCurrentPageKey();
    const links = STATIC_SERVICES
        .filter((service) => service.pages.includes(pageKey))
        .map((service) => ({ service, href: buildPageServiceUrl(service, steamId, note, visibility) }))
        .filter((item) => item.href);

    if (!links.length) return;

    const linksBlock = document.createElement("div");
    linksBlock.className = "turbo-notes-links-card";

    links.forEach(({ service, href }) => {
        const a = document.createElement("a");
        a.href = href;
        a.title = service.label;
        a.rel = "noopener noreferrer";
        a.innerHTML = `<img src="${getPageServiceIconUrl(service)}" width="15" height="15" style="filter:brightness(0.9)">`;
        linksBlock.appendChild(a);
    });
    
    container.appendChild(linksBlock);
}

function buildPageServiceUrl(service, id, note, visibility = DEFAULT_SERVICE_VISIBILITY) {
    if (!service || !getServiceVisibility(visibility, service.id).profile) return "";
    const mode = service.mode || "custom";
    const steamid3 = String(id);
    const steamid64 = accountIdToSteamId64(steamid3);
    const login = getPageCustomValue(note, service.id, service);
    if (mode === "custom" && !login) return "";
    return applyPageTemplate(service.template, getPageTemplateValues(mode, steamid3, steamid64, login));
}

function getPageTemplateValues(mode, steamid3, steamid64, login) {
    const value = mode === "steamid64" ? steamid64 : mode === "steamid3" ? steamid3 : login;
    return {
        id: value,
        steamid3,
        steamid64,
        login,
        custom: login,
        value
    };
}

function getPageCustomValue(note, serviceId, service) {
    service = service || STATIC_SERVICES.find((item) => item.id === serviceId);
    return note?.serviceLogins?.[serviceId] || (service?.legacyKey ? note?.[service.legacyKey] : "") || "";
}

function getNoteDisplayTitle(id, note, fallback = "") {
    return note?.nickname || cleanDisplayName(note?.displayName, id) || cleanDisplayName(fallback, id) || id;
}

function getCurrentDisplayName(steamId) {
    const commonSelectors = [
        ".actual_persona_name",
        ".persona_name_text_content",
        ".profile_header .persona_name",
        ".profile_header_centered_persona .persona_name",
        ".profile-name",
        ".player-name",
        ".user-name",
        ".username",
        "[class*='profile'][class*='name']",
        "[class*='player'][class*='name']",
        "h1"
    ];

    const statlockerSelectors = [
        "[class*='player'][class*='name']",
        "[class*='profile'][class*='name']",
        "main h1",
        "h1"
    ];

    const selectors = window.location.hostname === "statlocker.gg" ? statlockerSelectors : commonSelectors;
    const selectorValue = getDisplayNameFromSelectors(selectors, steamId);
    if (selectorValue) return selectorValue;

    if (window.location.hostname === "statlocker.gg") {
        return "";
    }

    const metaTitle = document.querySelector('meta[property="og:title"]')?.content;
    const metaValue = cleanDisplayName(metaTitle, steamId);
    if (metaValue) return metaValue;

    return cleanDisplayName(document.title, steamId);
}

function getDisplayNameFromSelectors(selectors, steamId) {
    for (const selector of selectors) {
        const value = cleanDisplayName(document.querySelector(selector)?.textContent, steamId);
        if (value) return value;
    }

    return "";
}

function cleanDisplayName(value, steamId) {
    const text = String(value || "")
        .replace(/\s+/g, " ")
        .replace(/\s*[-|–]\s*(Steam Community|Tracklock|Statlocker.*|Deadlock.*|Twitch).*$/i, "")
        .replace(/^Profile\s*[-|–]\s*/i, "")
        .trim();

    if (/^(loading|profile|player|overview|matches?|stats?|statlocker|tracklock|deadlock)$/i.test(text)) return "";
    if (/statlocker|tracklock|deadlock api|active matches|searchby=/i.test(text)) return "";
    if (!text || text === steamId || /^\d+$/.test(text)) return "";
    return text;
}

function normalizeServiceVisibility(value, legacyServices) {
    const next = createDefaultServiceVisibility();
    const hasVisibility = value && typeof value === "object" && !Array.isArray(value);
    if (hasVisibility) {
        STATIC_SERVICES.forEach((service) => {
            if (!(service.id in value)) return;
            const saved = value[service.id];
            if (saved && typeof saved === "object" && !Array.isArray(saved)) {
                next[service.id] = {
                    popup: saved.popup !== false,
                    profile: saved.profile !== false
                };
            } else {
                const enabled = saved !== false;
                next[service.id] = { popup: enabled, profile: enabled };
            }
        });
    }

    if (!hasVisibility && Array.isArray(legacyServices)) {
        legacyServices.forEach((service) => {
            if (!service || !STATIC_SERVICES.some((item) => item.id === service.id)) return;
            const enabled = service.showOnPage !== false && (!Array.isArray(service.pages) || service.pages.length > 0);
            next[service.id] = { popup: enabled, profile: enabled };
        });
    }

    return next;
}

function createDefaultServiceVisibility() {
    return Object.fromEntries(STATIC_SERVICES.map((service) => [
        service.id,
        { popup: true, profile: true }
    ]));
}

function getServiceVisibility(visibility, serviceId) {
    const value = visibility?.[serviceId];
    if (value && typeof value === "object") {
        return {
            popup: value.popup !== false,
            profile: value.profile !== false
        };
    }
    const enabled = value !== false;
    return { popup: enabled, profile: enabled };
}

function isServiceEnabledAnywhere(serviceId, visibility) {
    const state = getServiceVisibility(visibility, serviceId);
    return state.popup || state.profile;
}

function parseNotes(value) {
    if (!value) return {};
    if (typeof value === "object") return value;
    try {
        return JSON.parse(value);
    } catch {
        return {};
    }
}

function accountIdToSteamId64(id) {
    try {
        return (BigInt(id) + BigInt("76561197960265728")).toString();
    } catch {
        return id;
    }
}

function getPageServiceIconUrl(service) {
    return chrome.runtime.getURL(`icons/i/${service.icon}`);
}

function applyPageTemplate(template, values) {
    return String(template)
        .replaceAll("{id}", encodeURIComponent(values.id || ""))
        .replaceAll("{steamid64}", encodeURIComponent(values.steamid64 || ""))
        .replaceAll("{steamid3}", encodeURIComponent(values.steamid3 || ""))
        .replaceAll("{login}", encodeURIComponent(values.login || ""))
        .replaceAll("{custom}", encodeURIComponent(values.custom || ""))
        .replaceAll("{value}", encodeURIComponent(values.value || ""));
}
