document.addEventListener("DOMContentLoaded", () => {
    if (window.location.href.includes("/active-matches/?") || window.location.href.includes("/active-matches?")) {
        chrome.storage.local.get(["enabled"], (data) => {
            if (data.enabled !== false)
                handleStatlockerMatchesFilters();
        });
    }
});

function handleStatlockerMatchesFilters() {
    setTimeout(() => {
        const url = new URL(window.location.href);
        const searchby = url.searchParams.get('searchby');
        const value = url.searchParams.get('value');
        switch (searchby) {
            case 'steamid':
                addStatlockerMatchesFilter(0, value);
                break;
            case 'accountid':
                addStatlockerMatchesFilter(1, value);
                break;
            case 'matchid':
                addStatlockerMatchesFilter(2, value);
                break;
            case 'mymatches':
                addStatlockerMatchesFilter(3);
                break;
        }
    }, 500);
}

function addStatlockerMatchesFilter(searchby, value) {
    const filtersContainer = document.querySelector('.amp-search-control-group');
    if (!filtersContainer) {
        handleStatlockerMatchesFilters();
        return;
    }
    
    filtersContainer.querySelector("div.sort-dropdown > button").click();

    setTimeout(() => {
        const searchbyOptions = document.querySelectorAll("div.sort-dropdown-menu > div");
        searchbyOptions[searchby].click();
        
        setTimeout(() => {
            if (value) {
                const inputField = filtersContainer.querySelector('input.search-input-field');
                inputField.value = value;
                inputField.dispatchEvent(new Event('input', { bubbles: true }));

                filtersContainer.querySelector(":scope > button").click();
            }
            
            window.scrollBy({top: 200, behavior: "smooth"});
        }, 1);
    }, 1);
}
