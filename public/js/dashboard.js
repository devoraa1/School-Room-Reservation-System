// Dashboard logic. Every read/write goes to the Laravel backend (see routes/web.php).
// The server enforces all booking rules; the checks here only give instant feedback.
// Shared UI helpers (icon(), uiConfirm(), uiPrompt(), focus handling, loading states,
// agenda view) live in ui-kit.js, which must be loaded before this file.

let rooms = [];
let SCHEDULE = {};            // roomId -> [{ day, start, end }]  (rooms with no entry are open all day)
let usersList = [];           // admin only
let resetRequestsList = [];   // admin only
let notificationsList = [];
let currentUser = null;

const API_BASE = window.APP.apiBase;

// ---------------------------------------------------------------
// Talking to the server
// ---------------------------------------------------------------
async function api(method, url, body) {

    const res = await fetch(API_BASE + url, {
        method: method,
        credentials: "same-origin",
        headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
            "X-CSRF-TOKEN": window.APP.csrf
        },
        body: body === undefined ? undefined : JSON.stringify(body)
    });

    let data = {};
    try { data = await res.json(); } catch (e) { /* empty body */ }

    if (res.status === 401 || res.status === 419) {
        window.location.href = window.APP.loginUrl;
        throw new Error("Session expired.");
    }

    if (!res.ok) {
        let msg = data.message || "Something went wrong. Please try again.";
        if (data.errors) {
            const first = Object.values(data.errors)[0];
            if (first && first[0]) msg = first[0];
        }
        const err = new Error(msg);
        err.status = res.status;
        err.data = data;
        throw err;
    }

    return data;
}

let serverClockOffset = 0;

// Loads everything the dashboard shows from /api/state.
async function loadState() {

    const s = await api("GET", "/state");

    serverClockOffset = s.serverNow ? Date.parse(s.serverNow) - Date.now() : 0;

    currentUser = s.me;
    rooms = s.rooms;
    SCHEDULE = s.schedule || {};
    bookings = s.bookings;
    notificationsList = s.notifications || [];
    usersList = s.users || [];
    resetRequestsList = s.resetRequests || [];
}

// Reloads from the server and redraws. `quiet` keeps open forms untouched.
async function refresh(quiet) {

    try {
        await loadState();
    } catch (e) {
        if (!quiet) alertMessage(e.message, "error");
        return;
    }

    renderAll(quiet);
}

function renderAll(quiet) {

    displayUser(quiet);
    displayRooms();
    displayBookings();
    renderNavBadges();

    if (currentUser.role === "admin") {
        renderUsers();
    }

    if (document.getElementById("notifModal").style.display === "block") {
        renderNotifications();
    }
}

// Runs a server action, shows its message, redraws. Returns true on success.
async function act(request, fallbackMessage) {

    try {
        const data = await request();
        await refresh(true);
        alertMessage(data && data.message ? data.message : fallbackMessage, "success");
        return true;
    } catch (e) {
        alertMessage(e.message, "error");
        await refresh(true);
        return false;
    }
}

function logout() {
    document.getElementById("logoutForm").submit();
}

// ---------------------------------------------------------------
// Class schedule (data comes from the room_schedules table).
// Every row is a CLASS from the CCIS schedule PDF. Class time is blue and can
// never be reserved. It keeps its full PDF time (a 10 AM - 1 PM class is not cut
// at lunch). Everything else from 7 AM to 9 PM is free time that can be booked.
// ---------------------------------------------------------------

function getClassBlocks(roomId, date) {
    const blocks = SCHEDULE[roomId];
    if (!blocks) return [];
    const [y, m, d] = date.split("-").map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    return blocks.filter(c => c.day === dow);
}

// True when any part of start-end falls inside a class of that room.
function overlapsClass(roomId, date, start, end) {
    return getClassBlocks(roomId, date).some(c => start < c.end && end > c.start);
}

// The class block (with its course & section and instructor) that holds this time.
function classBlockAt(roomId, date, start, end) {
    return getClassBlocks(roomId, date).find(c => start < c.end && end > c.start) || null;
}

// "10:00-13:00" for the class that holds this time (keeps back-to-back classes apart).
function classBlockKey(roomId, date, start, end) {
    const c = getClassBlocks(roomId, date).find(c => start < c.end && end > c.start);
    return c ? c.start + "-" + c.end : "";
}


let bookings = [];



// The building's open hours. Free-choice start/end times in the
// booking form must fall within this window.
const OPERATING_HOURS = { start: "07:00", end: "21:00" };

// Pagination state
const BOOKINGS_PER_PAGE = 5;
const USERS_PER_PAGE = 5;
const RESETS_PER_PAGE = 5;
let bookingPage = 1;
let userPage = 1;
let resetPage = 1;
let userStatusFilter = "all";

// Today's date as YYYY-MM-DD in the user's LOCAL time zone.
// (toISOString() uses UTC, which shows yesterday's date during the
// early morning hours in time zones ahead of UTC, such as the
// Philippines.)
function getTodayString() {
    let d = new Date();
    let month = String(d.getMonth() + 1).padStart(2, "0");
    let day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + month + "-" + day;
}

// The day the date inputs were last synced to, used to notice when
// midnight passes while the page is still open.
let lastKnownToday = null;

// Keeps the date inputs tied to the real current date:
// - the Rooms "Check Availability Date" jumps to today on load and
//   whenever a new day starts, and can never sit on a past date;
// - the Reserve form's date can never sit on a past date either.
function syncTodayDates() {

    let today = getTodayString();
    let dayChanged = lastKnownToday !== today;
    lastKnownToday = today;

    let availInput = document.getElementById("availabilityDate");
    let dateInput = document.getElementById("date");

    if (!availInput || !dateInput) {
        return;
    }

    availInput.min = today;
    dateInput.min = today;

    let availChanged = false;

    // Never rewrite a date field while the person is typing in it (a half-typed
    // date can briefly look like the past); the blur handler below fixes it afterwards.
    if (document.activeElement !== availInput &&
        (dayChanged || !availInput.value || availInput.value < today)) {
        availChanged = availInput.value !== today;
        availInput.value = today;
    }

    let bookingDateCleared = false;

    if (document.activeElement !== dateInput && dateInput.value && dateInput.value < today) {
        dateInput.value = "";
        bookingDateCleared = true;
    }

    if (availChanged) {
        displayRooms();
    }

    if (bookingDateCleared) {
        checkTimeAvailability();
    }
}

// Messages disappear on their own after a few seconds.
const ALERT_SECONDS = 4;
let alertTimer = null;

function alertMessage(message, type = "success") {

    let html = `<div class="alert ${type}">${message}</div>`;

    document.getElementById("alertBox").innerHTML = html;

    clearTimeout(alertTimer);

    alertTimer = setTimeout(function () {

        document.getElementById("alertBox").innerHTML = "";

        document.querySelectorAll(".modal-alert").forEach(slot => {
            slot.innerHTML = "";
        });

    }, ALERT_SECONDS * 1000);

    // A floating modal sits on top of everything else, so alertBox
    // (back in the page behind it) would be invisible while a modal
    // is open. Mirror the message into that modal's own alert slot.
    document.querySelectorAll(".modal-overlay").forEach(overlay => {
        if (overlay.style.display === "flex") {
            let slot = overlay.querySelector(".modal-alert");
            if (slot) slot.innerHTML = html;
        }
    });
}

// Blocking modal shown to anyone still on an admin-set password (a
// new account, or a password reset an admin fulfilled). Unlike a
// dismissible banner, this has no close/cancel button and the
// backdrop click is not wired to dismiss it — the only way out is to
// submit a new password, which is what actually clears
// mustChangePassword (in auth.js).
function checkForcePasswordChange() {

    let modal = document.getElementById("forcePasswordModal");

    if (!modal || !currentUser || !currentUser.mustChangePassword) {
        return;
    }

    modal.style.display = "flex";
}

// Escapes text before it goes into innerHTML (names/emails are typed
// in by the admin and users, so never trust them as raw HTML).
function escapeHtml(text) {
    return String(text == null ? "" : text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// Human-readable label for a stored role value.
function roleLabel(role) {
    const labels = {
        student: "Student Leader",
        teacher: "Teacher",
        staff: "School Staff",
        admin: "Administrator"
    };
    return labels[role] || role;
}

function getInitials(name) {
    if (!name) return "?";
    let parts = name.trim().split(/\s+/);
    let initials = parts.slice(0, 2)
        .map(p => (p[0] || "").toUpperCase())
        .join("");
    return initials || "?";
}

// Opens/closes the sidebar Settings popover (profile / theme / logout).
function toggleSettingsMenu(e) {
    if (e) e.stopPropagation();
    let menu = document.getElementById("settingsMenu");
    if (!menu) return;
    let isOpen = menu.classList.toggle("open");
    menu.querySelector(".settings-trigger").setAttribute("aria-expanded", isOpen ? "true" : "false");
}

function closeSettingsMenu() {
    let menu = document.getElementById("settingsMenu");
    if (!menu) return;
    menu.classList.remove("open");
    menu.querySelector(".settings-trigger").setAttribute("aria-expanded", "false");
}

document.addEventListener("click", function (e) {
    let menu = document.getElementById("settingsMenu");
    if (menu && menu.classList.contains("open") && !menu.contains(e.target)) {
        closeSettingsMenu();
    }
});

document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
        closeSettingsMenu();
        closeNotifications();
    }
});

function displayUser(quiet) {

    let avatarHtml = currentUser.photo
        ? `<img src="${currentUser.photo}" class="userbar-avatar" alt="Profile">`
        : `<span class="userbar-avatar userbar-avatar-fallback">${getInitials(currentUser.name)}</span>`;

    document.getElementById("userBar").innerHTML = `
        <span class="userbar-identity">
            ${avatarHtml}
            <span class="userbar-text">
                <span class="userbar-name">${escapeHtml(currentUser.name)}</span>
                <span class="userbar-role">${roleLabel(currentUser.role)}</span>
            </span>
        </span>
    `;

    if (currentUser.role === "admin") {
        document.querySelectorAll(".admin-only").forEach(
            el => el.style.display = "inline-flex"
        );
        renderUsers();
        renderNavBadges();

        // The admin sees every user's reservations here (and approves
        // or rejects the pending ones), so "My Reservations" would be
        // misleading.
        document.getElementById("reservationsNavLabel").textContent =
            "All Reservations";
    }

    if (!quiet || document.getElementById("profileModal").style.display !== "flex") {
        renderProfilePanel();
    }
}

function renderNavBadges() {

    renderNotificationBadge();

    if (currentUser.role !== "admin") {
        return;
    }

    let pendingResetCount = resetRequestsList.length;

    let pendingBookingCount = bookings.filter(
        b => b.status === "pending"
    ).length;

    setNavBadge("manage-users", pendingResetCount);
    setNavBadge("reservations", pendingBookingCount);
}

function setNavBadge(panelName, count) {

    let btn = document.querySelector(
        '.dash-nav-btn[data-panel="' + panelName + '"], ' +
        '.notif-bell[data-panel="' + panelName + '"]'
    );

    if (!btn) {
        return;
    }

    let badge = btn.querySelector(".nav-badge");

    if (count > 0) {

        if (!badge) {
            badge = document.createElement("span");
            badge.className = "nav-badge";
            btn.appendChild(badge);
        }

        badge.textContent = count;

    } else if (badge) {
        badge.remove();
    }
}

// Switches which dashboard tab/panel is visible. All panels stay
// in the DOM (so their render functions keep working normally) —
// only the active one is shown.
function switchPanel(name) {

    // Notifications are a small modal now, not a full panel.
    if (name === "notifications") {
        openNotifications();
        return;
    }

    document.querySelectorAll(".panel").forEach(
        p => p.classList.remove("active")
    );

    let panel = document.getElementById("panel-" + name);
    if (panel) panel.classList.add("active");

    document.querySelectorAll(".dash-nav-btn").forEach(
        b => b.classList.remove("active")
    );

    let btn = document.querySelector(
        '.dash-nav-btn[data-panel="' + name + '"]'
    );
    if (btn) btn.classList.add("active");

    // Accounts may have been created, blocked or removed since the
    // admin last looked, so refresh the "Reserve For" list on entry.
    if (name === "reserve") {
        populateReserveForUsers();
    }

    if (name === "rooms" || name === "reserve") {
        syncTodayDates();
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
}

// Admin only: fills the "Reserve For" dropdown with the accounts a
// reservation can be made for. Each option shows name, role and email
// (names can repeat, the email is unique) and its value is the email.
// The admin is never listed - reservations are always for someone else.
function populateReserveForUsers() {

    let wrap = document.getElementById("reserveForWrap");
    let select = document.getElementById("reserveFor");

    if (!wrap || !select) {
        return;
    }

    if (currentUser.role !== "admin") {
        wrap.style.display = "none";
        select.required = false;
        return;
    }

    wrap.style.display = "block";
    select.required = true;

    let previous = select.value;

    let users = usersList
        .filter(u => u.role !== "admin" && u.status !== "blocked")
        .sort((a, b) => a.name.localeCompare(b.name));

    let html = `<option value="">Select a user...</option>`;

    users.forEach(u => {
        html += `
            <option value="${escapeHtml(u.email)}">
                ${escapeHtml(u.name)} - ${escapeHtml(u.email)} (${roleLabel(u.role)})
            </option>
        `;
    });

    select.innerHTML = html;

    // Keep the admin's choice if that account is still in the list.
    if (previous && users.some(u => u.email === previous)) {
        select.value = previous;
    }
}

// Fills in the profile details, the email field and the avatar preview.
// Also clears the password fields, so it doubles as the "Cancel" reset.
function renderProfilePanel() {

    document.getElementById("profileHeading").textContent =
        `${currentUser.name} (${roleLabel(currentUser.role)})`;
    document.getElementById("profileCurrentEmail").textContent = currentUser.email;

    document.getElementById("profileEmailInput").value = "";
    document.getElementById("profileCurrentPassword").value = "";
    document.getElementById("profileNewPassword").value = "";
    document.getElementById("profileConfirmPassword").value = "";

    let img = document.getElementById("profileAvatarImg");
    let initials = document.getElementById("profileAvatarInitials");

    if (currentUser.photo) {
        img.src = currentUser.photo;
        img.style.display = "block";
        initials.style.display = "none";
    } else {
        img.style.display = "none";
        initials.style.display = "flex";
        initials.textContent = getInitials(currentUser.name);
    }
}

// Profile is a floating modal now, not a dashboard panel — opening
// or cancelling it never touches switchPanel, so whatever panel was
// showing underneath stays exactly as it was.
// Notifications: a dropdown that opens right under the bell (top right).
// Opening it counts as reading: the unread highlights show once, then the
// badge clears.
function toggleNotifications() {
    let pop = document.getElementById("notifModal");
    if (pop.style.display === "block") {
        closeNotifications();
    } else {
        openNotifications();
    }
}

function openNotifications() {
    closeSettingsMenu();
    renderNotifications();
    document.getElementById("notifModal").style.display = "block";
    document.querySelector(".notif-bell").setAttribute("aria-expanded", "true");
    markAllNotificationsRead();
}

function closeNotifications() {
    let pop = document.getElementById("notifModal");
    if (pop) pop.style.display = "none";
    let bell = document.querySelector(".notif-bell");
    if (bell) bell.setAttribute("aria-expanded", "false");
}

// Tapping anywhere outside the bell or its dropdown closes it.
document.addEventListener("click", function (e) {
    if (!e.target.closest("#notifWrap")) closeNotifications();
});

function openProfileModal() {
    closeSettingsMenu();
    renderProfilePanel();
    clearModalAlert("profileModal");
    document.getElementById("profileModal").style.display = "flex";
}

function closeProfileModal() {
    document.getElementById("profileModal").style.display = "none";
    renderProfilePanel();
}

function openCreateUserModal() {
    document.getElementById("createUserForm").reset();
    clearModalAlert("createUserModal");
    document.getElementById("createUserModal").style.display = "flex";
}

function closeCreateUserModal() {
    document.getElementById("createUserModal").style.display = "none";
}

function clearModalAlert(modalId) {
    let modal = document.getElementById(modalId);
    let slot = modal && modal.querySelector(".modal-alert");
    if (slot) slot.innerHTML = "";
}

// Downsizes and compresses an uploaded photo before it's stored.
// Phone camera photos can be several MB straight out of the file
// picker; storing that raw in localStorage and re-rendering it for
// every user in the admin list is what was causing the slow,
// sometimes-white-screen dashboard on mobile. Shrinking to a small
// square JPEG keeps each avatar down to a few KB.
function resizeImageFile(file, maxWidth, maxHeight, quality) {

    return new Promise(function (resolve, reject) {

        if (!file.type || file.type.indexOf("image/") !== 0) {
            reject(new Error("Not an image file."));
            return;
        }

        let reader = new FileReader();

        reader.onerror = function () {
            reject(new Error("Could not read file."));
        };

        reader.onload = function (evt) {

            let img = new Image();

            img.onerror = function () {
                reject(new Error("Could not load image."));
            };

            img.onload = function () {

                let width = img.width;
                let height = img.height;

                let scale = Math.min(
                    1,
                    maxWidth / width,
                    maxHeight / height
                );

                let targetWidth = Math.max(1, Math.round(width * scale));
                let targetHeight = Math.max(1, Math.round(height * scale));

                let canvas = document.createElement("canvas");
                canvas.width = targetWidth;
                canvas.height = targetHeight;

                let ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

                let dataUrl = canvas.toDataURL("image/jpeg", quality);

                resolve(dataUrl);
            };

            img.src = evt.target.result;
        };

        reader.readAsDataURL(file);
    });
}

// ------------------------------------------------------------
// Manage Users (admin only)
// Accounts only come from the Create User form. The list is split
// into tabs by role so each group is easy to scan.
// ------------------------------------------------------------
const USER_ROLE_TABS = [
    { key: "all",     label: "All" },
    { key: "teacher", label: "Teachers" },
    { key: "staff",   label: "School Staff" },
    { key: "student", label: "Student Leaders" }
];

let userRoleTab = "all";

function switchUserTab(key) {
    userRoleTab = key;
    userPage = 1;
    renderUsers();
}

function renderUsers() {

    if (currentUser.role !== "admin") {
        return;
    }

    renderResetRequests();

    // The admin manages their own login from the Profile tab, so the
    // list only holds the accounts the admin created.
    let users = usersList.filter(u => u.role !== "admin");

    document.getElementById("statUsers").textContent = users.length;

    document.getElementById("statBlockedUsers").textContent =
        users.filter(u => u.status === "blocked").length;

    document.getElementById("userRoleTabs").innerHTML =
        USER_ROLE_TABS.map(t => {

            let count = t.key === "all"
                ? users.length
                : users.filter(u => u.role === t.key).length;

            return `
                <button
                    type="button"
                    class="role-tab ${t.key === userRoleTab ? "active" : ""}"
                    onclick="switchUserTab('${t.key}')"
                >
                    ${t.label}
                    <span class="role-tab-count">${count}</span>
                </button>
            `;

        }).join("");

    let visible = users;

    if (userRoleTab !== "all") {
        visible = visible.filter(u => u.role === userRoleTab);
    }

    if (userStatusFilter !== "all") {
        visible = visible.filter(
            u => (u.status || "approved") === userStatusFilter
        );
    }

    let totalPages = Math.max(1, Math.ceil(visible.length / USERS_PER_PAGE));
    if (userPage > totalPages) userPage = totalPages;
    if (userPage < 1) userPage = 1;

    let pageItems = visible.slice(
        (userPage - 1) * USERS_PER_PAGE,
        userPage * USERS_PER_PAGE
    );

    let html = "";

    if (visible.length === 0) {

        html = `
            <div class="empty">
                No accounts here yet. Use the form above to create one.
            </div>
        `;
    }

    pageItems.forEach(u => {

        let isBlocked = u.status === "blocked";

        let statusBadge = isBlocked
            ? `<span class="status blocked">${icon("ban")}Blocked</span>`
            : `<span class="status approved">${icon("check-circle")}Active</span>`;

        let name = escapeHtml(u.name);

        let avatar = u.photo
            ? `<img src="${u.photo}" alt="${name}" class="user-row-avatar">`
            : `<span class="user-row-avatar user-row-avatar-fallback">${escapeHtml(getInitials(u.name))}</span>`;

        html += `
            <div class="user-row">
                <div class="user-row-photo">${avatar}</div>
                <div class="user-row-info">
                    <strong>${name}</strong>
                    <p>
                        ${escapeHtml(u.email)} &middot;
                        <select
                            class="role-select"
                            onchange="changeUserRole(${u.id}, this.value)"
                        >
                            <option value="teacher" ${u.role === "teacher" ? "selected" : ""}>Teacher</option>
                            <option value="staff" ${u.role === "staff" ? "selected" : ""}>School Staff</option>
                            <option value="student" ${u.role === "student" ? "selected" : ""}>Student Leader</option>
                        </select>
                    </p>
                </div>
                <div class="user-row-actions">
                    ${statusBadge}
                    ${
                        isBlocked
                        ? `<button class="btn success" onclick="reactivateUserAccount(${u.id})">Reactivate</button>`
                        : `<button class="btn" onclick="blockUserAccount(${u.id})">Block</button>`
                    }
                    <button class="btn danger" onclick="deleteUserAccount(${u.id})">Remove</button>
                </div>
            </div>
        `;
    });

    document.getElementById("userList").innerHTML = html;

    document.getElementById("userPagination").innerHTML =
        paginationHTML(userPage, totalPages, "goToUserPage");

    renderNavBadges();
}

function filterUsersByStatus() {
    userStatusFilter =
        document.getElementById("userStatusFilter").value;
    userPage = 1;
    renderUsers();
}

function goToUserPage(page) {
    userPage = page;
    renderUsers();
}

function renderResetRequests() {

    if (currentUser.role !== "admin") {
        return;
    }

    let requests = resetRequestsList;

    let box = document.getElementById("resetRequestsBox");
    let list = document.getElementById("resetRequestList");
    let pager = document.getElementById("resetPagination");

    if (requests.length === 0) {
        box.style.display = "none";
        list.innerHTML = "";
        pager.innerHTML = "";
        return;
    }

    box.style.display = "block";

    let totalPages = Math.max(1, Math.ceil(requests.length / RESETS_PER_PAGE));
    if (resetPage > totalPages) resetPage = totalPages;
    if (resetPage < 1) resetPage = 1;

    let pageItems = requests.slice(
        (resetPage - 1) * RESETS_PER_PAGE,
        resetPage * RESETS_PER_PAGE
    );

    let html = "";

    pageItems.forEach(r => {

        html += `
            <div class="user-row">
                <div class="user-row-info">
                    <strong>${escapeHtml(r.name)}</strong>
                    <p>${escapeHtml(r.email)}</p>
                </div>
                <div class="user-row-actions">
                    <button
                        class="btn success"
                        onclick="resolveResetRequest(${r.id})"
                    >
                        Set New Password
                    </button>
                    <button
                        class="btn ghost"
                        onclick="dismissResetRequest(${r.id})"
                    >
                        Dismiss
                    </button>
                </div>
            </div>
        `;
    });

    list.innerHTML = html;

    pager.innerHTML =
        paginationHTML(resetPage, totalPages, "goToResetPage");
}

function goToResetPage(page) {
    resetPage = page;
    renderResetRequests();
}

// The overview tiles are gone; this just keeps the nav badges fresh
// for the callers that still ask for a stats refresh.
function renderStats() {
    renderNavBadges();
}

function formatNotifTime(ts) {
    return new Date(ts).toLocaleString("en-US", {
        month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
    });
}

function renderNotifications() {

    let mine = myNotifications();
    let icons = { approved: "check-circle", rejected: "ban", cancelled: "x-circle", pending: "hourglass" };

    document.getElementById("notificationList").innerHTML = mine.length === 0
        ? `<div class="empty">No notifications yet.</div>`
        : mine.map(n => `
            <div class="notif-item ${n.read ? "" : "unread"}">
                <span class="notif-icon">${icon(icons[n.type] || "bell")}</span>
                <div>
                    <p>${escapeHtml(n.message)}</p>
                    <small>${formatNotifTime(n.createdAt)}</small>
                </div>
            </div>
        `).join("");
}

// True when the chosen date is today and the start time already passed.
function isPastTimeToday(date, start) {

    if (date !== getTodayString()) {
        return false;
    }

    let now = new Date();
    let nowTime =
        String(now.getHours()).padStart(2, "0") + ":" +
        String(now.getMinutes()).padStart(2, "0");

    return start < nowTime;
}

function formatTime(time) {
    let [hour, minute] = time.split(":");
    hour = parseInt(hour);

    let ampm = hour >= 12 ? "PM" : "AM";
    let displayHour = hour % 12 || 12;

    return `${displayHour}:${minute} ${ampm}`;
}

function formatDate(dateStr) {
    if (!dateStr) return "";

    // Parse as local date (avoid UTC off-by-one from new Date("YYYY-MM-DD"))
    let [y, m, d] = dateStr.split("-").map(Number);
    let date = new Date(y, m - 1, d);

    return date.toLocaleDateString("en-US", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric"
    });
}

// Returns the status ("available", "pending", or "approved") and
// matching booking (if any) for a single fixed slot on a given
// room/date, based on time overlap with existing reservations.
function toMinutes(time) {
    let [h, m] = time.split(":").map(Number);
    return h * 60 + m;
}

function formatDuration(minutes) {
    let h = Math.floor(minutes / 60);
    let m = minutes % 60;
    if (h && m) return `${h}h ${m}m`;
    if (h) return `${h}h`;
    return `${m}m`;
}

// Bookable time slots: every 30 minutes from 7:00 AM to 9:00 PM
// (same as the weekly schedule grid in the Rooms panel).
function minutesToTime(total) {
    return String(Math.floor(total / 60)).padStart(2, "0") + ":" +
           String(total % 60).padStart(2, "0");
}

const TIME_SLOTS = (function () {
    let list = [];
    for (let m = 7 * 60; m < 21 * 60; m += 30) {
        list.push({ start: minutesToTime(m), end: minutesToTime(m + 30) });
    }
    return list;
})();

// One entry per 30-minute slot: "class" (blue, never reservable), the
// pending/approved booking that overlaps it, or "available" (free to reserve).
function getRoomSegments(roomId, date) {

    let dayBookings = bookings.filter(b =>
        b.roomId == roomId &&
        b.date == date &&
        (b.status === "pending" || b.status === "approved")
    );

    return TIME_SLOTS.map(slot => {

        // Class time (from the PDF) can not be reserved.
        if (overlapsClass(roomId, date, slot.start, slot.end)) {
            return {
                start: slot.start,
                end: slot.end,
                type: "class",
                block: classBlockKey(roomId, date, slot.start, slot.end)
            };
        }

        let hits = dayBookings.filter(b =>
            slot.start < b.end && slot.end > b.start
        );

        let hit = hits.find(b => b.status === "approved") || hits[0];

        if (!hit) {
            // Blank cells and the old lunch hour are free time.
            return { start: slot.start, end: slot.end, type: "available" };
        }

        return {
            start: slot.start,
            end: slot.end,
            type: hit.status,
            purpose: hit.purpose,
            name: hit.name
        };
    });
}

// Rooms can be reserved Monday to Saturday. Sunday is unavailable (no schedule).
function isClosedDate(date) {
    if (!date) return false;
    let [y, m, d] = date.split("-").map(Number);
    let dow = new Date(y, m - 1, d).getDay();
    return dow === 0;
}

// The free stretches of a room on a date: the gaps between classes and
// pending/approved reservations. A new reservation splits a stretch in two, so
// the time before and after it stays free. Used for the time picker and to
// suggest alternatives once a requested time conflicts.
function getFreeWindows(roomId, date) {

    let windows = [];

    if (isClosedDate(date)) {
        return windows;
    }

    getRoomSegments(roomId, date).forEach(s => {

        if (s.type !== "available" || isPastTimeToday(date, s.start)) {
            return;
        }

        let last = windows[windows.length - 1];

        if (last && last.end === s.start) {
            last.end = s.end;
        } else {
            windows.push({ start: s.start, end: s.end });
        }
    });

    return windows;
}

// ---------------------------------------------------------------
// Time picker (shared by the Reserve form and the room view).
// Step 1: tap a free stretch. Step 2: set the start and end you
// actually need inside it (30-minute steps).
// ---------------------------------------------------------------
function timeStepOptions(from, to, selected) {
    let html = "";
    for (let m = toMinutes(from); m <= toMinutes(to); m += 30) {
        let t = minutesToTime(m);
        html += `<option value="${t}"${t === selected ? " selected" : ""}>${formatTime(t)}</option>`;
    }
    return html;
}

function windowHolding(windows, start, end) {
    if (!start || !end) return null;
    return windows.find(w => start >= w.start && end <= w.end) || null;
}

function timePickerHtml(windows, selStart, selEnd, idPrefix) {

    let win = windowHolding(windows, selStart, selEnd);

    let chips = windows.map(w => {

        let selected = w === win;

        return `
            <button type="button"
                class="ta-chip ta-wide${selected ? " selected" : ""}"
                aria-pressed="${selected ? "true" : "false"}"
                data-start="${w.start}" data-end="${w.end}">
                Free ${formatTime(w.start)} – ${formatTime(w.end)}
                <small>${formatDuration(toMinutes(w.end) - toMinutes(w.start))}</small>
            </button>
        `;
    }).join("");

    let range = "";

    if (win) {
        range = `
            <div class="ta-range">
                <div>
                    <label for="${idPrefix}Start">From</label>
                    <select id="${idPrefix}Start" data-role="start">
                        ${timeStepOptions(win.start, minutesToTime(toMinutes(win.end) - 30), selStart)}
                    </select>
                </div>
                <div>
                    <label for="${idPrefix}End">To</label>
                    <select id="${idPrefix}End" data-role="end">
                        ${timeStepOptions(minutesToTime(toMinutes(selStart) + 30), win.end, selEnd)}
                    </select>
                </div>
            </div>
            <p class="note">Set the time you need inside this free stretch. The rest of it stays free for others.</p>
        `;
    }

    return `<div class="ta-list">${chips}</div>${range}` +
        (win ? "" : `<p class="note">Tap a free time, then set your own start and end.</p>`);
}

// New { start, end } after the person changes one of the two selects.
function adjustTimeSelection(windows, sel, role, value) {

    let win = windowHolding(windows, sel.start, sel.end);

    if (!win) return sel;

    let start = sel.start;
    let end = sel.end;

    if (role === "start") {
        start = value;
        if (end <= start) {
            end = minutesToTime(Math.min(toMinutes(win.end), toMinutes(start) + 30));
        }
    } else {
        end = value;
    }

    return { start: start, end: end };
}

// Writes html into a box only when it changed, so an open dropdown is not
// closed by the 10-second refresh. Keeps keyboard focus on the same control.
function setBoxHtml(box, html) {

    if (box.dataset.html === html) return;

    let activeId = box.contains(document.activeElement) ? document.activeElement.id : "";

    box.innerHTML = html;
    box.dataset.html = html;

    if (activeId) {
        let again = document.getElementById(activeId);
        if (again) again.focus();
    }
}

// The Rooms panel is the building blueprint (blueprint.js). This keeps
// the blueprint and the booking form's room dropdown in sync.
function displayRooms() {

    let select = document.getElementById("room");
    let keepRoom = select.value;

    select.innerHTML =
        `<option value="">Select a room</option>`;

    rooms.forEach(room => {

        select.innerHTML += `
            <option value="${room.id}">
                ${escapeHtml(room.name)}
            </option>
        `;
    });

    select.value = keepRoom;

    if (window.renderRoomBlueprint) {
        window.renderRoomBlueprint();
    }

    renderTimeAvailability();

    renderStats();
}

// Shared pagination control markup used by both the rooms grid
// and the reservations list.
function paginationHTML(page, totalPages, gotoFn) {

    if (totalPages <= 1) {
        return "";
    }

    return `
        <div class="pagination">
            <button
                type="button"
                class="btn"
                ${page <= 1 ? "disabled" : ""}
                onclick="${gotoFn}(${page - 1})"
            >
                ‹ Prev
            </button>

            <span class="page-indicator">
                Page ${page} of ${totalPages}
            </span>

            <button
                type="button"
                class="btn"
                ${page >= totalPages ? "disabled" : ""}
                onclick="${gotoFn}(${page + 1})"
            >
                Next ›
            </button>
        </div>
    `;
}

function goToBookingPage(page) {
    bookingPage = page;
    displayBookings();
}

// Called when a room is clicked on the blueprint: jumps to the booking
// form with the room and date pre-filled, so the available times for that
// date show up right under the date.
function reserveRoom(roomId, date) {

    switchPanel("reserve");

    document.getElementById("room").value = roomId;
    document.getElementById("date").value = date || getTodayString();
    document.getElementById("startTime").value = "";
    document.getElementById("endTime").value = "";

    checkTimeAvailability();

    window.scrollTo({ top: 0, behavior: "smooth" });
}

// True when every 30-minute slot from `from` to `to` is still open.
function rangeIsFree(roomId, date, from, to) {
    return getRoomSegments(roomId, date)
        .filter(seg => seg.start >= from && seg.end <= to)
        .every(seg => seg.type === "available" && !isPastTimeToday(date, seg.start));
}

// Shows the free times for the chosen room and date (class time and existing
// reservations are left out; past times are too). The chosen start/end are kept
// in the hidden #startTime / #endTime inputs.
function renderTimeAvailability() {

    let box = document.getElementById("timeAvailability");

    if (!box) return;

    let roomId = document.getElementById("room").value;
    let date = document.getElementById("date").value;
    let room = rooms.find(r => r.id == roomId);

    if (!room || !date) {
        setBoxHtml(box,
            `<p class="note">Choose a room and a date to see the free times.</p>`);
        return;
    }

    let title = `Free times · ${escapeHtml(room.name)} · ${formatDate(date)}`;

    if (isClosedDate(date)) {
        setBoxHtml(box, `
            <div class="ta-title">${title}</div>
            <p class="ta-empty">Unavailable: Sunday has no schedule. Please pick Monday to Saturday.</p>
        `);
        return;
    }

    let windows = getFreeWindows(roomId, date);

    if (windows.length === 0) {
        setBoxHtml(box, `
            <div class="ta-title">${title}</div>
            <p class="ta-empty">No free time for this room on this date (classes or reservations fill it). Try another date or room.</p>
        `);
        return;
    }

    let selStart = document.getElementById("startTime").value;
    let selEnd = document.getElementById("endTime").value;

    // The chosen time may have just passed or been taken: drop it.
    if (selStart && !windowHolding(windows, selStart, selEnd)) {
        selStart = "";
        selEnd = "";
        document.getElementById("startTime").value = "";
        document.getElementById("endTime").value = "";
    }

    setBoxHtml(box, `
        <div class="ta-title">${title}</div>
        ${timePickerHtml(windows, selStart, selEnd, "ta")}
    `);
}

// A free stretch was tapped: choose all of it (then trim it with the
// From / To lists), or clear it if it is already chosen.
function pickTimeSlot(start, end) {

    let selStart = document.getElementById("startTime").value;
    let selEnd = document.getElementById("endTime").value;

    let windows = getFreeWindows(
        document.getElementById("room").value,
        document.getElementById("date").value
    );

    let current = windowHolding(windows, selStart, selEnd);
    let same = current && current.start === start && current.end === end;

    document.getElementById("startTime").value = same ? "" : start;
    document.getElementById("endTime").value = same ? "" : end;

    checkTimeAvailability();
}

// The From / To lists changed: keep the booking inside the free stretch.
function changeTimeRange(role, value) {

    let windows = getFreeWindows(
        document.getElementById("room").value,
        document.getElementById("date").value
    );

    let next = adjustTimeSelection(windows, {
        start: document.getElementById("startTime").value,
        end: document.getElementById("endTime").value
    }, role, value);

    document.getElementById("startTime").value = next.start;
    document.getElementById("endTime").value = next.end;

    checkTimeAvailability();
}

document.addEventListener("click", function (e) {
    let chip = e.target.closest("#timeAvailability button[data-start]");
    if (chip) pickTimeSlot(chip.dataset.start, chip.dataset.end);
});

document.addEventListener("change", function (e) {
    let sel = e.target.closest("#timeAvailability select[data-role]");
    if (sel) changeTimeRange(sel.dataset.role, sel.value);
});

// Clears the chosen time and refreshes the list (room or date changed).
function resetChosenTime() {
    document.getElementById("startTime").value = "";
    document.getElementById("endTime").value = "";
    checkTimeAvailability();
}

function hasConflict(roomId, date, start, end) {

    return bookings.some(b =>
        b.roomId == roomId &&
        b.date == date &&
        (b.status === "pending" || b.status === "approved") &&
        start < b.end &&
        end > b.start
    );
}

// Live feedback under the Start/End time inputs in the booking form.
// Uses the same overlap check as hasConflict() — a chosen range can
// start or end mid-way through an existing booking and still conflict,
// it doesn't need to match any fixed block exactly.
function checkTimeAvailability() {

    let roomId = document.getElementById("room").value;
    let date = document.getElementById("date").value;
    let start = document.getElementById("startTime").value;
    let end = document.getElementById("endTime").value;
    let msgEl = document.getElementById("timeAvailabilityMsg");

    renderTimeAvailability();

    if (!msgEl) return;

    if (!roomId || !date || !start || !end) {
        msgEl.className = "time-availability-msg";
        msgEl.textContent = "Choose a room, a date, then a free time from the list above.";
        return;
    }

    if (isClosedDate(date)) {
        msgEl.className = "time-availability-msg conflict";
        msgEl.textContent = "❌ Sunday is unavailable. Please pick a date from Monday to Saturday.";
        return;
    }

    if (start >= end) {
        msgEl.className = "time-availability-msg conflict";
        msgEl.textContent = "❌ End time must be after start time.";
        return;
    }

    if (start < OPERATING_HOURS.start || end > OPERATING_HOURS.end) {
        msgEl.className = "time-availability-msg conflict";
        msgEl.textContent =
            `❌ Rooms can only be booked between ${formatTime(OPERATING_HOURS.start)} and ${formatTime(OPERATING_HOURS.end)}.`;
        return;
    }

    if (isPastTimeToday(date, start)) {
        msgEl.className = "time-availability-msg conflict";
        msgEl.textContent = "❌ That start time has already passed today.";
        return;
    }

    let classBusy = overlapsClass(roomId, date, start, end);

    if (classBusy || hasConflict(roomId, date, start, end)) {

        let reason = classBusy
            ? "❌ That time overlaps a scheduled class in this room."
            : "❌ That time overlaps an existing reservation for this room.";

        let freeWindows = getFreeWindows(roomId, date)
            .filter(w => toMinutes(w.end) - toMinutes(w.start) > 0);

        msgEl.className = "time-availability-msg conflict";

        if (freeWindows.length === 0) {
            msgEl.textContent =
                reason + " This room has no other open time on this date.";
            return;
        }

        let chips = freeWindows.map(w => `
            <button type="button" class="time-suggestion-chip"
                onclick="applySuggestedTime('${w.start}', '${w.end}')">
                ${formatTime(w.start)} - ${formatTime(w.end)}
            </button>
        `).join("");

        msgEl.innerHTML = `
            ${reason}
            <div class="time-suggestions">
                <span>This room is free:</span>
                ${chips}
            </div>
        `;

        return;
    }

    msgEl.className = "time-availability-msg ok";
    msgEl.textContent =
        `🟢 ${formatTime(start)} - ${formatTime(end)} is available (${formatDuration(toMinutes(end) - toMinutes(start))}).`;
}

// Fills the Start/End inputs with a suggested free window (from the
// conflict message) and re-checks availability, so picking a
// suggestion is a single click.
function applySuggestedTime(start, end) {
    document.getElementById("startTime").value = start;
    document.getElementById("endTime").value = end;
    checkTimeAvailability();
}

// Status chip = icon + text, so status never depends on colour alone.
function bookingStatusChip(b) {
    const map = {
        pending: ["hourglass", "Pending"],
        approved: ["check-circle", "Approved"],
        rejected: ["ban", "Rejected"],
        cancelled: ["x-circle", "Cancelled"]
    };
    const m = map[b.status];
    if (!m) return "";

    let html = `<span class="status ${b.status}">${icon(m[0])}${m[1]}</span>`;

    // Teachers have priority on approval: their pending requests are listed
    // first for the admin and are decided sooner.
    if (b.status === "pending" && b.role === "teacher") {
        html += ` <span class="status priority">${icon("star")}Priority</span>`;
    }
    return html;
}

function autoApproveLine(b) {
    if (currentUser.role !== "admin" || b.status !== "pending" || !b.createdAt) return "";

    let waitMinutes = b.role === "teacher" ? 15 : 30;
    let remaining = b.createdAt + waitMinutes * 60000 - (Date.now() + serverClockOffset);

    let text = remaining <= 0
        ? "Approving automatically…"
        : "Auto-approves in " + (remaining < 60000 ? "less than 1 min" : "about " + Math.ceil(remaining / 60000) + " min") + " unless you decide first";

    return `<p class="note">${icon("hourglass")}${text}</p>`;
}

// Approve / Reject / Cancel buttons for one reservation (used by the list and the agenda).
function bookingActionsHtml(b) {
    const isAdmin = currentUser.role === "admin";
    let html = "";

    if (isAdmin && b.status === "pending") {
        html += `<button type="button" class="btn success" onclick="approveBooking(${b.id})">${icon("check")}Approve</button>`;
        html += `<button type="button" class="btn danger" onclick="rejectBooking(${b.id})">${icon("ban")}Reject</button>`;

        let pendingCount = seriesMembers(b, ["pending"]).length;
        if (b.seriesId && pendingCount > 1) {
            html += `<button type="button" class="btn success" onclick="approveBooking(${b.id}, true)">${icon("check")}Approve all (${pendingCount})</button>`;
            html += `<button type="button" class="btn danger" onclick="rejectBooking(${b.id}, true)">${icon("ban")}Reject all (${pendingCount})</button>`;
        }
    }

    const canCancel =
        (b.status === "pending" || b.status === "approved") &&
        !hasBookingStarted(b.date, b.start) &&
        (b.mine || (isAdmin && b.status === "approved"));

    if (canCancel) {
        html += `<button type="button" class="btn danger" onclick="cancelBooking(${b.id})">${icon("x")}Cancel</button>`;

        let upcoming = b.seriesId
            ? seriesMembers(b, ["pending", "approved"]).filter(x => !hasBookingStarted(x.date, x.start)).length
            : 1;
        if (b.seriesId && upcoming > 1) {
            html += `<button type="button" class="btn danger" onclick="cancelBooking(${b.id}, true)">${icon("x")}Cancel all (${upcoming})</button>`;
        }
    }
    return html;
}

// 0 = needs a decision first (a teacher's pending request, admin view only), 1 = everything else.
function approvalPriority(b) {
    return currentUser.role === "admin" && b.status === "pending" && b.role === "teacher" ? 0 : 1;
}

function displayBookings() {

    renderNavBadges();

    let list = bookings;

    if (currentUser.role !== "admin") {

        list = bookings.filter(
            b => b.mine
        );
    }

    let statusFilter =
        document.getElementById("statusFilter").value;

    if (statusFilter !== "all") {
        list = list.filter(b => b.status === statusFilter);
    }

    let sortOrder =
        document.getElementById("sortOrder").value;

    list = list.slice().sort((a, b) => {

        // Teachers' pending requests come first for the admin (priority approval).
        let byPriority = approvalPriority(a) - approvalPriority(b);
        if (byPriority !== 0) return byPriority;

        // "Newest" / "Oldest" = when the reservation was MADE, so a request
        // that was just submitted is always at the top of "Newest First".
        let cmp = (a.createdAt || 0) - (b.createdAt || 0) || a.id - b.id;

        return sortOrder === "oldest" ? cmp : -cmp;
    });

    let totalPages = Math.max(1, Math.ceil(list.length / BOOKINGS_PER_PAGE));
    if (bookingPage > totalPages) bookingPage = totalPages;
    if (bookingPage < 1) bookingPage = 1;

    if (list.length === 0) {

        document.getElementById("bookingList").innerHTML = `
            <div class="empty">
                No reservations match this filter.
            </div>
        `;

        document.getElementById("bookingPagination").innerHTML = "";

        renderStats();

        return;
    }

    let pageList = list.slice(
        (bookingPage - 1) * BOOKINGS_PER_PAGE,
        bookingPage * BOOKINGS_PER_PAGE
    );

    let html = "";

    pageList.forEach(b => {

        let room =
            rooms.find(r => r.id == b.roomId);

        html += `
            <div class="booking">

                <div>

                    <h3>
                        ${room
                            ? escapeHtml(room.name)
                            : "Room Removed"}
                        - ${escapeHtml(b.purpose)}
                    </h3>

                    <p>${icon("user")}${escapeHtml(b.name)}${
                        b.reservedByAdmin
                        ? ` <span class="note">(reserved by admin)</span>`
                        : ""
                    }</p>

                    <p>${icon("calendar")}${formatDate(b.date)}</p>

                    <p>${icon("clock")}${formatTime(b.start)} - ${formatTime(b.end)}</p>

                    <p>${bookingStatusChip(b)}</p>

                    ${autoApproveLine(b)}

                    ${b.seriesId ? `<p class="note">${icon("repeat")}${seriesLabel(b)}</p>` : ""}

                    ${
                        b.status === "rejected" && b.rejectReason
                        ? `<p class="note">Reason: ${escapeHtml(b.rejectReason)}</p>`
                        : ""
                    }

                </div>

                <div>${bookingActionsHtml(b)}</div>

            </div>
        `;
    });

    document.getElementById("bookingList").innerHTML =
        html;

    document.getElementById("bookingPagination").innerHTML =
        paginationHTML(bookingPage, totalPages, "goToBookingPage");

    renderStats();
}

let editingRoomId = null;

// Populates the admin room form with an existing room's data so it
// can be updated instead of adding a duplicate.
function editRoom(id) {

    if (currentUser.role !== "admin") {
        return;
    }

    let room = rooms.find(r => r.id == id);

    if (!room) {
        return;
    }

    editingRoomId = room.id;

    document.getElementById("roomName").value = room.name;
    document.getElementById("roomLocation").value = room.location || "";

    document.getElementById("roomFormTitle").textContent =
        "Edit Room";

    document.getElementById("roomSubmitBtn").textContent =
        "Update Room";

    document.getElementById("cancelEditBtn").style.display =
        "inline-flex";

    switchPanel("manage-rooms");
}

function cancelRoomEdit() {

    editingRoomId = null;

    document.getElementById("roomForm").reset();

    document.getElementById("roomFormTitle").textContent =
        "Add Room";

    document.getElementById("roomSubmitBtn").textContent =
        "Add Room";

    document.getElementById("cancelEditBtn").style.display =
        "none";
}
// True once a reservation has started (from its start time on). A started
// reservation can no longer be cancelled.
function hasBookingStarted(date, start) {

    let today = getTodayString();

    if (date < today) return true;
    if (date > today) return false;

    let now = new Date();
    let nowTime =
        String(now.getHours()).padStart(2, "0") + ":" +
        String(now.getMinutes()).padStart(2, "0");

    return start <= nowTime;
}

// True once a time slot has fully finished. A slot still counts as running
// through the minute it ends in (8:00-8:30 PM is still "now" at 8:28 and 8:30 PM,
// and has ended from 8:31 PM).
function hasSlotEnded(date, end) {

    let today = getTodayString();

    if (date < today) return true;
    if (date > today) return false;

    let now = new Date();
    let nowTime =
        String(now.getHours()).padStart(2, "0") + ":" +
        String(now.getMinutes()).padStart(2, "0");

    return end < nowTime;
}

// ---------------------------------------------------------------
// Overrides: everything below talks to the server
// ---------------------------------------------------------------

// --- Force password change ---------------------------------------
async function submitForcePasswordChange(event) {

    event.preventDefault();

    let next = document.getElementById("forcePwNew").value;
    let confirmNext = document.getElementById("forcePwConfirm").value;
    let slot = document.querySelector("#forcePasswordModal .modal-alert");

    function fail(message) {
        if (slot) slot.innerHTML = `<div class="alert error">${escapeHtml(message)}</div>`;
    }

    if (next.length < 8) return fail("New password must be at least 8 characters, with letters and numbers.");
    if (next !== confirmNext) return fail("New passwords do not match.");

    try {
        const data = await api("POST", "/profile/force-password", {
            new_password: next,
            new_password_confirmation: confirmNext
        });

        currentUser.mustChangePassword = false;
        document.getElementById("forcePasswordModal").style.display = "none";
        document.getElementById("forcePasswordForm").reset();
        alertMessage(data.message, "success");

    } catch (e) {
        fail(e.message);
    }
}

// --- Profile -----------------------------------------------------
async function saveProfile() {

    let email = document.getElementById("profileEmailInput").value.trim();
    let current = document.getElementById("profileCurrentPassword").value;
    let next = document.getElementById("profileNewPassword").value;
    let confirmNext = document.getElementById("profileConfirmPassword").value;

    function fail(message) {
        alertMessage(message, "error");
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    let emailChanged = email.length > 0 && email !== currentUser.email;
    let passwordChanged = next.length > 0;

    if (!emailChanged && !passwordChanged) return fail("No changes to save.");
    if (passwordChanged && next.length < 8) return fail("New password must be at least 8 characters, with letters and numbers.");
    if (passwordChanged && next !== confirmNext) return fail("New passwords do not match.");
    if (!current) return fail("Enter your current password to save these changes.");

    try {
        const data = await api("PUT", "/profile", {
            email: emailChanged ? email : null,
            current_password: current,
            new_password: passwordChanged ? next : null,
            new_password_confirmation: passwordChanged ? confirmNext : null
        });

        closeProfileModal();
        await refresh(true);
        alertMessage(data.message, "success");
        window.scrollTo({ top: 0, behavior: "smooth" });

    } catch (e) {
        fail(e.message);
    }
}

// --- Manage users ------------------------------------------------
async function createUserFromForm() {

    if (currentUser.role !== "admin") return;

    let name = document.getElementById("newUserName").value;
    let email = document.getElementById("newUserEmail").value;
    let password = document.getElementById("newUserPassword").value;
    let role = document.getElementById("newUserRole").value;

    window.scrollTo({ top: 0, behavior: "smooth" });

    try {
        const data = await api("POST", "/users", { name: name, email: email, password: password, role: role });

        document.getElementById("createUserForm").reset();
        closeCreateUserModal();

        // Jump to the tab the new account landed in so the admin sees it.
        userRoleTab = role;
        userStatusFilter = "all";
        document.getElementById("userStatusFilter").value = "all";
        userPage = 1;

        await refresh(true);
        alertMessage(data.message, "success");

    } catch (e) {
        alertMessage(e.message, "error");
    }
}

async function blockUserAccount(id) {
    if (currentUser.role !== "admin") return;
    if (!await uiConfirm({
        title: "Block this account?",
        message: "They will not be able to log in until you reactivate the account.",
        confirmText: "Block account", danger: true, icon: "ban"
    })) return;
    act(() => api("PATCH", "/users/" + id, { status: "blocked" }));
}

function reactivateUserAccount(id) {
    if (currentUser.role !== "admin") return;
    act(() => api("PATCH", "/users/" + id, { status: "approved" }));
}

function changeUserRole(id, role) {
    if (currentUser.role !== "admin") return;
    act(() => api("PATCH", "/users/" + id, { role: role }));
}

async function deleteUserAccount(id) {
    if (currentUser.role !== "admin") return;
    if (!await uiConfirm({
        title: "Remove this user account?",
        message: "This can't be undone.",
        confirmText: "Remove user", danger: true, icon: "trash"
    })) return;
    act(() => api("DELETE", "/users/" + id));
}

async function resolveResetRequest(id) {
    if (currentUser.role !== "admin") return;

    // type "password" keeps the temporary password hidden while it's typed.
    let newPassword = await uiPrompt({
        title: "Set a temporary password",
        message: "The user will be asked to choose their own password after signing in.",
        confirmText: "Set password", icon: "key",
        field: {
            label: "Temporary password (8+ characters, letters and numbers)",
            type: "password", required: true,
            validate: v => (v.length < 8 || !/[A-Za-z]/.test(v) || !/\d/.test(v))
                ? "Use at least 8 characters, with letters and numbers." : ""
        }
    });

    if (newPassword === null) return;

    act(() => api("POST", "/reset-requests/" + id + "/resolve", { password: newPassword }));
}

async function dismissResetRequest(id) {
    if (currentUser.role !== "admin") return;
    if (!await uiConfirm({
        title: "Dismiss this reset request?",
        message: "The user's password will not be changed.",
        confirmText: "Dismiss request", icon: "key"
    })) return;
    act(() => api("DELETE", "/reset-requests/" + id));
}

// --- Notifications -----------------------------------------------
function myNotifications() {
    return notificationsList;
}

function renderNotificationBadge() {
    setNavBadge("notifications", notificationsList.filter(n => !n.read).length);
}

function markAllNotificationsRead() {

    if (!notificationsList.some(n => !n.read)) {
        renderNotificationBadge();
        return;
    }

    // The unread highlights show once (the list was just drawn), then clear.
    notificationsList.forEach(n => { n.read = true; });
    renderNotificationBadge();
    api("POST", "/notifications/read").catch(function () {});
}

function clearNotifications() {
    notificationsList = [];
    renderNotifications();
    renderNotificationBadge();
    api("DELETE", "/notifications").catch(function () {});
}

// --- Reservations ------------------------------------------------
// Returns true when the server accepted the reservation.
// "2024-05-06" + 7 -> "2024-05-13" (local calendar days, no timezone surprises).
function shiftDateString(dateStr, days) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(y, m - 1, d + days);
    return dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
}

function previewSeries(roomId, date, start, end, weeks) {
    let rows = [];

    for (let i = 0; i < weeks; i++) {
        let day = shiftDateString(date, i * 7);
        let held = windowHolding(getFreeWindows(roomId, day), start, end);
        let reason = "";

        if (!held) {
            if (isClosedDate(day)) reason = "closed";
            else if (overlapsClass(roomId, day, start, end)) reason = "class scheduled";
            else {
                let hit = bookings.find(b =>
                    b.roomId == roomId &&
                    b.date == day &&
                    (b.status === "pending" || b.status === "approved") &&
                    start < b.end &&
                    end > b.start
                );

                if (!hit) {
                    reason = "not available";
                } else {
                    let who = hit.userId === currentUser.id
                        ? "you already booked"
                        : (currentUser.role === "admin" && hit.name ? "booked by " + hit.name : "booked by someone else");
                    reason = who + " " + formatTime(hit.start) + " - " + formatTime(hit.end);
                }
            }
        }

        rows.push({ date: day, ok: !!held, reason: reason });
    }

    return rows;
}

async function confirmSkippedWeeks(conflicts, weeks) {
    let free = weeks - conflicts.length;
    if (free < 1) return false;

    return uiConfirm({
        title: "Some weeks are not available",
        message: conflicts.map(c => formatDate(c.date)).join(", ") +
            " can't be booked. Book the other " + free + (free === 1 ? " week" : " weeks") + "?",
        confirmText: "Book the rest", cancelText: "Go back", icon: "calendar"
    });
}

function seriesMembers(b, statuses) {
    if (!b.seriesId) return [b];
    return bookings.filter(x => x.seriesId === b.seriesId && statuses.includes(x.status));
}

function seriesLabel(b) {
    let all = bookings.filter(x => x.seriesId === b.seriesId).sort((x, y) => x.date.localeCompare(y.date));
    let position = all.findIndex(x => x.id === b.id) + 1;
    return "Weekly series · week " + position + " of " + all.length;
}

async function bookRoom(repeatWeeks, skipConflicts) {

    const weeks = Math.min(4, Math.max(1, parseInt(repeatWeeks, 10) || 1));

    let roomId = document.getElementById("room").value;
    let date = document.getElementById("date").value;
    let purpose = document.getElementById("purpose").value.trim();
    let start = document.getElementById("startTime").value;
    let end = document.getElementById("endTime").value;

    if (!roomId || !date || !purpose) {
        alertMessage("Please fill in all fields.", "error");
        return false;
    }

    if (!start || !end) {
        alertMessage("Please choose a start and end time.", "error");
        return false;
    }

    let userId = null;

    if (currentUser.role === "admin") {
        let ownerEmail = document.getElementById("reserveFor").value;
        let owner = usersList.find(u => u.email === ownerEmail && u.role !== "admin" && u.status !== "blocked");

        if (!owner) {
            alertMessage("Please choose the user this reservation is for.", "error");
            return false;
        }

        userId = owner.id;
    }

    try {
        const data = await api("POST", "/reservations", {
            room_id: roomId, date: date, start: start, end: end, purpose: purpose, user_id: userId,
            repeat_weeks: weeks, skip_conflicts: !!skipConflicts
        });

        document.getElementById("bookingForm").reset();
        await refresh(true);
        alertMessage(data.message, "success");
        return true;

    } catch (e) {
        if (e.data && e.data.conflicts && !skipConflicts) {
            if (await confirmSkippedWeeks(e.data.conflicts, weeks)) {
                return bookRoom(weeks, true);
            }
            await refresh(true);
            return false;
        }

        alertMessage(escapeHtml(e.message), "error");
        await refresh(true);
        return false;
    }
}

function approveBooking(id, series) {
    if (currentUser.role !== "admin") return;
    act(() => api("POST", "/reservations/" + id + "/approve", series ? { series: true } : undefined));
}

async function rejectBooking(id, series) {
    if (currentUser.role !== "admin") return;

    // Cancel = null (nothing happens). Leaving it blank is fine, the reason is optional.
    let reason = await uiPrompt({
        title: series ? "Reject the whole series?" : "Reject this request?",
        message: series
            ? "All pending weekly dates in this series will be rejected. You can add a reason for the user (optional)."
            : "You can add a reason for the user (optional).",
        confirmText: "Reject request", danger: true, icon: "ban",
        field: { label: "Reason", multiline: true, placeholder: "Example: Room is reserved for an event." }
    });

    if (reason === null) return;

    act(() => api("POST", "/reservations/" + id + "/reject", series ? { reason: reason.trim(), series: true } : { reason: reason.trim() }));
}

async function cancelBooking(id, series) {

    let booking = bookings.find(b => b.id === id);

    if (!booking) return;

    // No cancelling once the reservation has started (the time is used up).
    if (hasBookingStarted(booking.date, booking.start)) {
        alertMessage("This reservation has already started, so it can't be cancelled.", "error");
        displayBookings();
        return;
    }

    let cancelRoom = rooms.find(r => r.id == booking.roomId);

    let upcoming = series
        ? seriesMembers(booking, ["pending", "approved"]).filter(x => !hasBookingStarted(x.date, x.start)).length
        : 1;

    if (!await uiConfirm({
        title: series ? "Cancel the whole series?" : "Cancel this reservation?",
        message: series
            ? (cancelRoom ? cancelRoom.name + " · " : "") + formatTime(booking.start) + " – " + formatTime(booking.end) +
                ". All " + upcoming + " upcoming weekly dates will be cancelled."
            : (cancelRoom ? cancelRoom.name + " · " : "") + formatDate(booking.date) + ", " +
                formatTime(booking.start) + " – " + formatTime(booking.end) + ".",
        confirmText: series ? "Cancel all " + upcoming : "Cancel reservation", cancelText: "Keep it", danger: true, icon: "calendar"
    })) return;
    act(() => api("POST", "/reservations/" + id + "/cancel", series ? { series: true } : undefined));
}

// --- Rooms (admin) -----------------------------------------------
async function saveRoom() {

    if (currentUser.role !== "admin") return;

    let name = document.getElementById("roomName").value.trim();
    let location = document.getElementById("roomLocation").value.trim();

    if (!name) {
        alertMessage("Please enter the room name.", "error");
        return;
    }

    const wasEditing = editingRoomId;
    const request = wasEditing
        ? () => api("PUT", "/rooms/" + wasEditing, { name: name, location: location })
        : () => api("POST", "/rooms", { name: name, location: location });

    if (await act(request)) {
        cancelRoomEdit();
    }
}

async function deleteRoom(id) {
    if (currentUser.role !== "admin") return;

    let room = rooms.find(r => r.id == id);
    let count = bookings.filter(b => b.roomId == id).length;

    if (!await uiConfirm({
        title: "Remove " + (room ? room.name : "this room") + "?",
        message: count > 0
            ? count + (count === 1 ? " reservation" : " reservations") + " for this room will be removed too. This can't be undone."
            : "This can't be undone.",
        confirmText: "Remove room", danger: true, icon: "trash"
    })) return;
    if (editingRoomId === id) cancelRoomEdit();
    act(() => api("DELETE", "/rooms/" + id));
}

// ---------------------------------------------------------------
// Start-up
// ---------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async function () {

    try {
        await loadState();
    } catch (e) {
        alertMessage(e.message, "error");
        return;
    }

    displayUser();
    checkForcePasswordChange();
    displayRooms();
    displayBookings();
    syncTodayDates();

    let unread = notificationsList.filter(n => !n.read).length;

    if (unread > 0) {
        alertMessage(
            "You have " + unread + " new notification" + (unread === 1 ? "" : "s") +
            ". Tap the bell to read them.",
            "success"
        );
    }

    // Pick up approvals/rejections and other people's new bookings (also triggers
    // the server-side auto-approval) every 15 seconds while the tab is visible,
    // and whenever the tab regains focus. A time someone else just took turns
    // from green to pending, and a selection that is no longer free is dropped.
    setInterval(function () { if (!document.hidden) refresh(true); }, 15000);
    window.addEventListener("focus", function () { refresh(true); });

    document.addEventListener("visibilitychange", function () {
        if (!document.hidden) syncTodayDates();
    });
    window.addEventListener("focus", syncTodayDates);
    setInterval(syncTodayDates, 60000);

    document.getElementById("availabilityDate").addEventListener("change", displayRooms);
    // After leaving the field, put a past or empty date back to today.
    document.getElementById("availabilityDate").addEventListener("blur", function () {
        setTimeout(syncTodayDates, 0);
    });
    document.getElementById("roomFilter").addEventListener("change", displayRooms);

    document.getElementById("statusFilter").addEventListener("change", function () {
        bookingPage = 1;
        displayBookings();
    });

    document.getElementById("sortOrder").addEventListener("change", function () {
        bookingPage = 1;
        displayBookings();
    });

    document.getElementById("room").addEventListener("change", resetChosenTime);
    document.getElementById("date").addEventListener("change", resetChosenTime);
    document.getElementById("startTime").addEventListener("change", checkTimeAvailability);
    document.getElementById("endTime").addEventListener("change", checkTimeAvailability);

    // form.reset() doesn't clear hidden inputs, so do it here.
    document.getElementById("bookingForm").addEventListener("reset", function () {
        setTimeout(function () {
            document.getElementById("startTime").value = "";
            document.getElementById("endTime").value = "";
            checkTimeAvailability();
        }, 0);
    });

    checkTimeAvailability();

    document.getElementById("bookingForm").addEventListener("submit", function (e) {
        e.preventDefault();
        bookRoom();
    });

    document.getElementById("roomForm").addEventListener("submit", function (e) {
        e.preventDefault();
        saveRoom();
    });

    document.getElementById("profileForm").addEventListener("submit", function (e) {
        e.preventDefault();
        saveProfile();
    });

    document.getElementById("createUserForm").addEventListener("submit", function (e) {
        e.preventDefault();
        createUserFromForm();
    });

    document.getElementById("profilePhotoInput").addEventListener("change", function (e) {

        let file = e.target.files[0];

        if (!file) return;

        resizeImageFile(file, 200, 200, 0.85).then(function (dataUrl) {
            return api("POST", "/profile/photo", { photo: dataUrl });
        }).then(function (data) {
            return refresh(true).then(function () {
                renderProfilePanel();
                alertMessage(data.message, "success");
            });
        }).catch(function (err) {
            alertMessage(err.message || "Could not process that image. Please try a different photo.", "error");
        });
    });
});