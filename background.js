const DEFAULT_SETTINGS = {
    enabled: true,
    steamnotesServiceVisibility: {
        steam: { popup: true, profile: true },
        tracklock: { popup: true, profile: true },
        statlocker: { popup: true, profile: true },
        statlockerMatches: { popup: true, profile: true },
        deadlockApi: { popup: true, profile: true },
        twitch: { popup: true, profile: true },
        faceit: { popup: true, profile: true }
    },
    steamnotesShowEmptyActiveMatchNames: true
};

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS), (data) => {
        const next = {};
        Object.entries(DEFAULT_SETTINGS).forEach(([key, value]) => {
            if (!(key in data)) next[key] = value;
        });
        if (Object.keys(next).length) chrome.storage.local.set(next);
    });
});

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
    if (details.frameId !== 0) return;
    if (!details.url.includes("twitch.tv") && !details.url.includes("statlocker.gg")) return;

    chrome.tabs.sendMessage(details.tabId, { type: "urlChanged" }, () => {
        if (chrome.runtime.lastError) {}
    });
});
