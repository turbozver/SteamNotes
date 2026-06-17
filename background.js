const DEFAULT_SETTINGS = {
    enabled: true,
    steamnotesServiceVisibility: {
        steam: true,
        tracklock: true,
        statlocker: true,
        statlockerMatches: true,
        deadlockApi: true,
        twitch: true,
        faceit: true
    }
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
