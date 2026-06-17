const SERVICE_VISIBILITY_KEY = "steamnotesServiceVisibility";
const STORAGE_KEYS = [
    "enabled",
    SERVICE_VISIBILITY_KEY
];

const STATIC_SERVICES = [
    {
        id: "steam",
        label: "Steam",
        mode: "steamid64",
        icon: "steam.png",
        template: "https://steamcommunity.com/profiles/{id}"
    },
    {
        id: "tracklock",
        label: "Tracklock",
        mode: "steamid3",
        icon: "tracklock.png",
        template: "https://tracklock.gg/players/{id}"
    },
    {
        id: "statlocker",
        label: "Statlocker",
        mode: "steamid3",
        icon: "statlocker.png",
        template: "https://statlocker.gg/profile/{id}"
    },
    {
        id: "statlockerMatches",
        label: "Statlocker Matches",
        mode: "steamid3",
        icon: "statlocker.png",
        template: "https://statlocker.gg/active-matches/?searchby=accountid&value={id}"
    },
    {
        id: "deadlockApi",
        label: "Deadlock API",
        mode: "steamid3",
        icon: "builds.png",
        template: "https://api.deadlock-api.com/v1/builds?only_latest=true&limit=100&sort_by=updated_at&author_id={id}"
    },
    {
        id: "twitch",
        label: "Twitch",
        mode: "custom",
        icon: "twitch.png",
        legacyKey: "twitch",
        template: "https://twitch.tv/{id}"
    },
    {
        id: "faceit",
        label: "Faceit",
        mode: "custom",
        icon: "faceit.png",
        legacyKey: "faceit",
        template: "https://faceit.com/en/players/{id}"
    }
];

const DEFAULT_SERVICE_VISIBILITY = Object.fromEntries(STATIC_SERVICES.map((service) => [service.id, true]));

const DEFAULT_SETTINGS = {
    enabled: true,
    [SERVICE_VISIBILITY_KEY]: DEFAULT_SERVICE_VISIBILITY
};

const els = {
    mainView: document.getElementById("mainView"),
    settingsView: document.getElementById("settingsView"),
    editView: document.getElementById("editView"),
    navButton: document.getElementById("navButton"),
    enabled: document.getElementById("enabled"),
    status: document.getElementById("status"),
    editBackBtn: document.getElementById("editBackBtn"),
    search: document.getElementById("search"),
    nickOnly: document.getElementById("nickOnly"),
    cheatersOnly: document.getElementById("cheatersOnly"),
    suspectsOnly: document.getElementById("suspectsOnly"),
    notesList: document.getElementById("notesList"),
    serviceModes: document.getElementById("serviceModes"),
    customServiceFields: document.getElementById("customServiceFields"),
    editTitle: document.getElementById("editTitle"),
    editNickname: document.getElementById("editNickname"),
    editInfo: document.getElementById("editInfo"),
    editCheater: document.getElementById("editCheater"),
    editSuspect: document.getElementById("editSuspect"),
    editHideOnTwitch: document.getElementById("editHideOnTwitch"),
    createdAt: document.getElementById("createdAt"),
    deleteNote: document.getElementById("deleteNote"),
    importFile: document.getElementById("importFile"),
    importBtn: document.getElementById("importBtn"),
    exportBtn: document.getElementById("exportBtn"),
    resetBtn: document.getElementById("resetBtn")
};

let notes = {};
let serviceVisibility = { ...DEFAULT_SERVICE_VISIBILITY };
let editingId = null;
let renderRequest = 0;

init();

function init() {
    els.navButton.addEventListener("click", toggleSettings);
    els.enabled.addEventListener("change", () => saveSetting("enabled", els.enabled.checked));
    els.editBackBtn.addEventListener("click", () => {
        saveEdit();
        showView("main");
    });
    els.search.addEventListener("input", renderNotes);
    els.nickOnly.addEventListener("change", renderNotes);
    els.cheatersOnly.addEventListener("change", renderNotes);
    els.suspectsOnly.addEventListener("change", renderNotes);
    els.deleteNote.addEventListener("click", deleteCurrentNote);
    els.importBtn.addEventListener("click", () => els.importFile.click());
    els.exportBtn.addEventListener("click", exportData);
    els.importFile.addEventListener("change", importData);
    els.resetBtn.addEventListener("click", resetData);

    [els.editNickname, els.editInfo, els.editCheater, els.editSuspect, els.editHideOnTwitch]
        .forEach((input) => input.addEventListener("input", saveEdit));

    chrome.storage.local.get([
        "steamNotes",
        "steamnotesServices",
        ...STORAGE_KEYS
    ], (data) => {
        notes = sanitizeNotes(parseNotes(data.steamNotes));
        serviceVisibility = normalizeServiceVisibility(data[SERVICE_VISIBILITY_KEY], data.steamnotesServices);
        els.enabled.checked = "enabled" in data ? !!data.enabled : DEFAULT_SETTINGS.enabled;

        if (!data[SERVICE_VISIBILITY_KEY] && data.steamnotesServices) {
            chrome.storage.local.set({ [SERVICE_VISIBILITY_KEY]: serviceVisibility });
        }

        renderServiceSettings();
        updateHeader();
        renderNotes();
        requestAnimationFrame(() => {
            els.search.focus();
            els.search.select();
        });
    });
}

function showView(view) {
    els.mainView.classList.toggle("hidden", view !== "main");
    els.settingsView.classList.toggle("hidden", view !== "settings");
    els.editView.classList.toggle("hidden", view !== "edit");
    const backVisible = view === "settings";
    els.navButton.textContent = backVisible ? String.fromCharCode(0x21a9) : String.fromCharCode(0x2699);
    els.navButton.classList.toggle("back-button", backVisible);
    els.navButton.title = backVisible ? "Back" : "Settings";
    els.navButton.setAttribute("aria-label", els.navButton.title);
}

function toggleSettings() {
    showView(els.settingsView.classList.contains("hidden") ? "settings" : "main");
}

function updateHeader() {
    els.status.textContent = els.enabled.checked ? "Enabled" : "Disabled";
    els.status.style.color = els.enabled.checked ? "var(--accent)" : "var(--muted)";
}

function saveSetting(key, value) {
    chrome.storage.local.set({ [key]: value }, () => {
        updateHeader();
        broadcastSetting(key, value);
    });
}

function renderNotes() {
    const requestId = ++renderRequest;
    const query = els.search.value.trim().toLowerCase();
    els.notesList.textContent = "";

    const entries = Object.entries(notes)
        .filter(([id, note]) => note && hasVisibleData(id, note))
        .filter(([id, note]) => matchesFilters(id, note, query));

    chrome.tabs.query({}, (tabs) => {
        if (requestId !== renderRequest) return;

        entries.sort((a, b) => {
            const aOpen = isStreamOpened(tabs, getCustomValue(a[1], "twitch"));
            const bOpen = isStreamOpened(tabs, getCustomValue(b[1], "twitch"));
            if (aOpen !== bOpen) return bOpen - aOpen;
            return (b[1].createdAt || 0) - (a[1].createdAt || 0);
        });

        if (!entries.length) {
            const empty = document.createElement("div");
            empty.className = "empty-state";
            empty.textContent = "No notes";
            els.notesList.appendChild(empty);
            return;
        }

        entries.forEach(([id, note]) => {
            const row = createNoteRow(id, note);
            if (isStreamOpened(tabs, getCustomValue(note, "twitch"))) row.classList.add("is-live");
            els.notesList.appendChild(row);
        });
    });
}

function createNoteRow(id, note) {
    const row = document.createElement("article");
    row.className = "note-row";
    if (note.cheater) row.classList.add("cheater");
    else if (note.suspect) row.classList.add("suspect");

    const main = document.createElement("button");
    main.type = "button";
    main.className = "note-main";
    main.addEventListener("click", (event) => {
        if (!event.ctrlKey) return;
        event.preventDefault();
        openEdit(id);
    });
    main.addEventListener("dblclick", (event) => {
        event.preventDefault();
        openEdit(id);
    });

    const title = document.createElement("strong");
    title.textContent = getNoteListTitle(id, note);
    main.appendChild(title);
    row.appendChild(main);

    const links = document.createElement("div");
    links.className = "note-links";
    STATIC_SERVICES.forEach((service) => {
        const href = buildServiceUrl(service, id, note);
        if (href) addIconLink(links, service, href);
    });
    row.appendChild(links);

    return row;
}

function addIconLink(container, service, href) {
    const link = document.createElement("a");
    link.href = href;
    link.title = service.label;
    const img = document.createElement("img");
    img.src = getServiceIconUrl(service);
    img.alt = "";
    link.appendChild(img);
    link.addEventListener("click", (event) => {
        event.preventDefault();
        chrome.tabs.update({ url: href });
    });
    link.addEventListener("auxclick", (event) => {
        if (event.button !== 1) return;
        event.preventDefault();
        chrome.tabs.create({ url: href, active: false });
    });
    container.appendChild(link);
}

function openEdit(id) {
    editingId = id;
    const note = notes[id] || {};
    els.editTitle.textContent = note.nickname || note.displayName || "Edit Note";
    els.editNickname.value = note.nickname || "";
    els.editInfo.value = note.info || "";
    els.editCheater.checked = !!note.cheater;
    els.editSuspect.checked = !!note.suspect;
    els.editHideOnTwitch.checked = !!note.hideOnTwitch;
    els.createdAt.textContent = note.createdAt ? formatDate(note.createdAt) : "";
    renderCustomServiceFields(note);
    showView("edit");
}

function saveEdit() {
    if (!editingId) return;
    const serviceLogins = getCustomServiceValues();
    const next = {
        nickname: els.editNickname.value.trim(),
        info: els.editInfo.value.trim(),
        cheater: els.editCheater.checked,
        suspect: els.editSuspect.checked,
        hideOnTwitch: els.editHideOnTwitch.checked,
        serviceLogins,
        displayName: notes[editingId]?.displayName || "",
        createdAt: notes[editingId]?.createdAt || Date.now()
    };

    getCustomServices().forEach((service) => {
        if (service.legacyKey) next[service.legacyKey] = serviceLogins[service.id] || "";
    });

    notes[editingId] = next;
    chrome.storage.local.set({ steamNotes: JSON.stringify(notes) }, renderNotes);
}

function deleteCurrentNote() {
    if (!editingId || !confirm("Delete this note?")) return;
    delete notes[editingId];
    chrome.storage.local.set({ steamNotes: JSON.stringify(notes) }, () => {
        editingId = null;
        showView("main");
        renderNotes();
    });
}

function exportData() {
    chrome.storage.local.get(["steamNotes", ...STORAGE_KEYS], (data) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `steam-notes-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
}

function importData() {
    const file = els.importFile.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        try {
            const parsed = JSON.parse(String(reader.result || "{}"));
            const source = parsed.storage && typeof parsed.storage === "object" ? parsed.storage : parsed;
            const next = {};

            if (typeof source.steamNotes === "string") {
                next.steamNotes = source.steamNotes;
            } else if (source.steamNotes && typeof source.steamNotes === "object") {
                next.steamNotes = JSON.stringify(source.steamNotes);
            }

            if ("enabled" in source) next.enabled = !!source.enabled;
            if (source[SERVICE_VISIBILITY_KEY] || source.steamnotesServices) {
                next[SERVICE_VISIBILITY_KEY] = normalizeServiceVisibility(source[SERVICE_VISIBILITY_KEY], source.steamnotesServices);
            }

            if (!next.steamNotes && !Object.keys(next).length) {
                alert("No Steam Notes data found.");
                return;
            }

            chrome.storage.local.set(next, () => {
                notes = next.steamNotes ? sanitizeNotes(parseNotes(next.steamNotes)) : notes;
                if (next[SERVICE_VISIBILITY_KEY]) {
                    serviceVisibility = normalizeServiceVisibility(next[SERVICE_VISIBILITY_KEY]);
                    broadcastSetting(SERVICE_VISIBILITY_KEY, serviceVisibility);
                }
                if ("enabled" in next) {
                    els.enabled.checked = !!next.enabled;
                    broadcastSetting("enabled", !!next.enabled);
                }
                renderServiceSettings();
                updateHeader();
                renderNotes();
                alert("Import completed.");
            });
        } catch (error) {
            alert(`Unable to import data: ${error.message}`);
        } finally {
            els.importFile.value = "";
        }
    };
    reader.readAsText(file);
}

function resetData() {
    if (!confirm("Delete all Steam Notes data and settings?")) return;

    serviceVisibility = { ...DEFAULT_SERVICE_VISIBILITY };
    chrome.storage.local.set({
        enabled: DEFAULT_SETTINGS.enabled,
        [SERVICE_VISIBILITY_KEY]: { ...DEFAULT_SERVICE_VISIBILITY },
        steamNotes: "{}"
    }, () => {
        notes = {};
        els.enabled.checked = DEFAULT_SETTINGS.enabled;
        broadcastSetting("enabled", DEFAULT_SETTINGS.enabled);
        broadcastSetting(SERVICE_VISIBILITY_KEY, serviceVisibility);
        renderServiceSettings();
        updateHeader();
        renderNotes();
    });
}

function sanitizeNotes(value) {
    if (!value || typeof value !== "object") return {};
    return value;
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

function matchesFilters(id, note, query) {
    if (els.cheatersOnly.checked && !note.cheater) return false;
    if (els.suspectsOnly.checked && !note.suspect) return false;
    if (!query) return true;

    const haystack = els.nickOnly.checked
        ? [id, note.nickname, note.displayName]
        : [id, note.nickname, note.displayName, note.info, getCustomValue(note, "twitch"), getCustomValue(note, "faceit"), ...Object.values(note.serviceLogins || {})];

    const steamId64 = accountIdToSteamId64(id);
    haystack.push(steamId64);
    return haystack.some((value) => String(value || "").toLowerCase().includes(query));
}

function hasVisibleData(id, note) {
    return !!(note.nickname || note.displayName || note.info || getCustomValue(note, "twitch") || getCustomValue(note, "faceit") || note.cheater || note.suspect);
}

function getNoteListTitle(id, note) {
    return note.nickname || note.displayName || id;
}

function renderServiceSettings() {
    els.serviceModes.textContent = "";

    STATIC_SERVICES.forEach((service) => {
        const row = document.createElement("label");
        row.className = "service-mode-row";
        const checked = serviceVisibility[service.id] !== false;
        row.classList.toggle("service-enabled", checked);
        row.classList.toggle("service-disabled", !checked);

        const body = document.createElement("span");
        body.className = "service-mode-body";

        const icon = document.createElement("span");
        icon.className = "service-list-icon";
        const img = document.createElement("img");
        img.src = getServiceIconUrl(service);
        img.alt = "";
        icon.appendChild(img);

        const title = document.createElement("span");
        title.className = "service-mode-title";
        title.textContent = service.label;

        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = checked;
        input.addEventListener("change", () => {
            serviceVisibility = {
                ...serviceVisibility,
                [service.id]: input.checked
            };
            saveServiceVisibility();
            row.classList.toggle("service-enabled", input.checked);
            row.classList.toggle("service-disabled", !input.checked);
            renderNotes();
        });

        body.append(icon, title);
        row.append(body, input);
        els.serviceModes.appendChild(row);
    });
}

function renderCustomServiceFields(note) {
    els.customServiceFields.textContent = "";
    const customServices = getCustomServices();
    els.customServiceFields.classList.toggle("hidden", !customServices.length);

    customServices.forEach((service) => {
        const label = document.createElement("label");
        label.textContent = `${service.label} login`;
        const input = document.createElement("input");
        input.type = "text";
        input.dataset.serviceLogin = service.id;
        input.value = getCustomValue(note, service.id);
        input.addEventListener("input", saveEdit);
        label.appendChild(input);
        els.customServiceFields.appendChild(label);
    });
}

function getCustomServiceValues() {
    const previous = notes[editingId]?.serviceLogins || {};
    const values = { ...previous };
    els.customServiceFields.querySelectorAll("[data-service-login]").forEach((input) => {
        values[input.dataset.serviceLogin] = input.value.trim();
    });
    return values;
}

function buildServiceUrl(service, id, note) {
    if (serviceVisibility[service.id] === false) return "";
    const mode = service.mode || "custom";
    const steamid3 = String(id);
    const steamid64 = accountIdToSteamId64(id);
    const login = getCustomValue(note, service.id);
    if (mode === "custom" && !login) return "";
    return applyTemplate(service.template, getTemplateValues(mode, steamid3, steamid64, login));
}

function getTemplateValues(mode, steamid3, steamid64, login) {
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

function getCustomValue(note, serviceId) {
    const service = STATIC_SERVICES.find((item) => item.id === serviceId);
    return note?.serviceLogins?.[serviceId] || (service?.legacyKey ? note?.[service.legacyKey] : "") || "";
}

function getCustomServices() {
    return STATIC_SERVICES.filter((service) => service.mode === "custom");
}

function normalizeServiceVisibility(value, legacyServices) {
    const next = { ...DEFAULT_SERVICE_VISIBILITY };
    const hasVisibility = value && typeof value === "object" && !Array.isArray(value);
    if (hasVisibility) {
        STATIC_SERVICES.forEach((service) => {
            if (service.id in value) next[service.id] = value[service.id] !== false;
        });
    }

    if (!hasVisibility && Array.isArray(legacyServices)) {
        legacyServices.forEach((service) => {
            if (!service || !STATIC_SERVICES.some((item) => item.id === service.id)) return;
            next[service.id] = service.showOnPage !== false && (!Array.isArray(service.pages) || service.pages.length > 0);
        });
    }

    return next;
}

function saveServiceVisibility() {
    chrome.storage.local.set({ [SERVICE_VISIBILITY_KEY]: serviceVisibility }, () => {
        broadcastSetting(SERVICE_VISIBILITY_KEY, serviceVisibility);
    });
}

function getServiceIconUrl(service) {
    return chrome.runtime.getURL(`icons/i/${service.icon}`);
}

function applyTemplate(template, values) {
    return String(template)
        .replaceAll("{id}", encodeURIComponent(values.id || ""))
        .replaceAll("{steamid64}", encodeURIComponent(values.steamid64 || ""))
        .replaceAll("{steamid3}", encodeURIComponent(values.steamid3 || ""))
        .replaceAll("{login}", encodeURIComponent(values.login || ""))
        .replaceAll("{custom}", encodeURIComponent(values.custom || ""))
        .replaceAll("{value}", encodeURIComponent(values.value || ""));
}

function isStreamOpened(tabs, twitch) {
    if (!twitch) return false;
    const normalized = twitch.toLowerCase();
    return tabs.some((tab) => {
        const match = tab.url?.match(/https:\/\/www\.twitch\.tv\/([a-zA-Z0-9_]{4,25})/);
        return match && match[1].toLowerCase() === normalized;
    });
}

function broadcastSetting(name, value) {
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
            if (!tab.url || !isSuitableTab(tab.url, name)) return;
            chrome.tabs.sendMessage(tab.id, { type: "setting_changed", name, value }, () => {
                if (chrome.runtime.lastError) {}
            });
        });
    });
}

function isSuitableTab(url, name) {
    if (name === "enabled" || name === SERVICE_VISIBILITY_KEY) {
        return url.startsWith("https://steamcommunity.com/")
            || url.startsWith("https://tracklock.gg/players/")
            || url.startsWith("https://statlocker.gg/")
            || url.startsWith("https://www.twitch.tv/");
    }

    return false;
}

function accountIdToSteamId64(id) {
    try {
        return (BigInt(id) + BigInt("76561197960265728")).toString();
    } catch {
        return id;
    }
}

function formatDate(value) {
    const date = new Date(Number(value));
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat(undefined, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    }).format(date);
}
