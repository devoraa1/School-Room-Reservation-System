// Theme toggle: light (default) / dark, persisted in localStorage.
// (The initial theme is applied by an inline script in <head> to avoid a flash.)
function syncThemeButton() {
    var btn = document.getElementById("themeBtn");
    if (!btn) return;
    var isLight = document.documentElement.getAttribute("data-theme") === "light";
    var label = isLight ? "Switch to dark mode" : "Switch to light mode";
    btn.setAttribute("aria-label", label);
    btn.setAttribute("title", label);
}

function toggleTheme() {
    var isLight = document.documentElement.getAttribute("data-theme") === "light";
    if (isLight) {
        document.documentElement.removeAttribute("data-theme");
        localStorage.setItem("rr-theme", "dark");
    } else {
        document.documentElement.setAttribute("data-theme", "light");
        localStorage.setItem("rr-theme", "light");
    }
    var thumbs = document.querySelectorAll(".theme-toggle-thumb");
    thumbs.forEach(function (t) {
        t.textContent = document.documentElement.getAttribute("data-theme") === "light" ? "☀️" : "🌙";
    });
    syncThemeButton();
    document.dispatchEvent(new Event("themechange"));
}

document.addEventListener("DOMContentLoaded", function () {
    syncThemeButton();
    var thumbs = document.querySelectorAll(".theme-toggle-thumb");
    var isLight = document.documentElement.getAttribute("data-theme") === "light";
    thumbs.forEach(function (t) {
        t.textContent = isLight ? "☀️" : "🌙";
    });
});