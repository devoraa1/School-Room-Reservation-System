// Sidebar uses one menu button. It sits beside the Room Reservation heading
// while the desktop sidebar is open, and moves into the topbar when the
// sidebar is collapsed or on mobile.
var SIDEBAR_DESKTOP = window.matchMedia("(min-width: 901px)");
var SIDEBAR_MENU_BUTTON = document.querySelector(".sidebar-menu-btn");

function placeSidebarMenuButton() {
    if (!SIDEBAR_MENU_BUTTON) return;
    var sidebarHeading = document.querySelector(".sidebar-heading");
    var topbar = document.querySelector(".topbar");
    if (!sidebarHeading || !topbar) return;

    var collapsed = document.documentElement.classList.contains("sidebar-collapsed");
    var shouldBeInTopbar = !SIDEBAR_DESKTOP.matches || collapsed;
    if (shouldBeInTopbar) {
        topbar.insertBefore(SIDEBAR_MENU_BUTTON, topbar.firstChild);
        SIDEBAR_MENU_BUTTON.classList.add("topbar-menu-btn");
        SIDEBAR_MENU_BUTTON.classList.remove("sidebar-menu-btn");
    } else {
        sidebarHeading.appendChild(SIDEBAR_MENU_BUTTON);
        SIDEBAR_MENU_BUTTON.classList.add("sidebar-menu-btn");
        SIDEBAR_MENU_BUTTON.classList.remove("topbar-menu-btn");
    }
}

function syncMenuButton() {
    if (!SIDEBAR_MENU_BUTTON) return;
    placeSidebarMenuButton();
    var sidebar = document.getElementById("sidebar");
    var shown = SIDEBAR_DESKTOP.matches
        ? !document.documentElement.classList.contains("sidebar-collapsed")
        : !!sidebar && sidebar.classList.contains("open");
    SIDEBAR_MENU_BUTTON.setAttribute("aria-expanded", shown ? "true" : "false");
    SIDEBAR_MENU_BUTTON.setAttribute("aria-label", shown && SIDEBAR_DESKTOP.matches ? "Hide menu" : "Show menu");
    SIDEBAR_MENU_BUTTON.setAttribute("title", shown && SIDEBAR_DESKTOP.matches ? "Hide sidebar" : "Show sidebar");
}

function toggleSidebar(force) {
    if (SIDEBAR_DESKTOP.matches) {
        // closeSidebar() (nav click, Esc) passes a boolean and must not hide the desktop panel.
        if (typeof force === "boolean") return;
        var collapsed = document.documentElement.classList.toggle("sidebar-collapsed");
        try { localStorage.setItem("rr-sidebar", collapsed ? "collapsed" : "open"); } catch (e) {}
        syncMenuButton();
        return;
    }

    var open = typeof force === "boolean"
        ? force
        : !document.getElementById("sidebar").classList.contains("open");
    document.getElementById("sidebar").classList.toggle("open", open);
    document.getElementById("sidebarOverlay").classList.toggle("open", open);
    syncMenuButton();
}

function closeSidebar() { toggleSidebar(false); }

document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeSidebar();
});

// Close the drawer whenever a nav item is tapped on mobile.
document.getElementById("dashNav").addEventListener("click", function (e) {
    if (e.target.closest(".dash-nav-btn")) closeSidebar();
});

SIDEBAR_DESKTOP.addEventListener("change", syncMenuButton);
syncMenuButton();
