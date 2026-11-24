// UI kit: small shared helpers loaded before dashboard.js.
//   - icon(name)            SVG icon markup (sprite in partials/icons.blade.php)
//   - uiConfirm / uiPrompt  in-app dialogs that replace confirm() / prompt()
//   - focus handling        focus trap, Escape and focus-return for every modal
//   - loading states        top progress bar, pending submit buttons, skeletons
//   - agenda view           reservations grouped by day (toggle next to the list)
(function () {
    "use strict";

    function ready(fn) {
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
        else fn();
    }

    function esc(text) {
        return String(text == null ? "" : text)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    // ------------------------------------------------------------
    // Icons
    // ------------------------------------------------------------
    window.icon = function (name, extraClass) {
        return '<svg class="ic' + (extraClass ? " " + extraClass : "") +
            '" aria-hidden="true" focusable="false"><use href="#i-' + name + '"></use></svg>';
    };

    // ------------------------------------------------------------
    // Focus management for every modal (static ones and dialogs below)
    // ------------------------------------------------------------
    const FOCUSABLE =
        'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),' +
        'select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    const stack = [];

    function visibleFocusables(root) {
        return Array.prototype.filter.call(root.querySelectorAll(FOCUSABLE), function (el) {
            return el.offsetParent !== null || el === document.activeElement;
        });
    }

    function activate(overlay) {
        if (stack.some(function (s) { return s.overlay === overlay; })) return;
        stack.push({ overlay: overlay, prev: document.activeElement });
        setTimeout(function () {
            const first =
                overlay.querySelector("[data-autofocus]") ||
                overlay.querySelector('input:not([type="hidden"]):not([disabled]),select,textarea') ||
                overlay.querySelector(".btn") ||
                visibleFocusables(overlay)[0];
            if (first) first.focus();
        }, 30);
    }

    function deactivate(overlay) {
        const i = stack.findIndex(function (s) { return s.overlay === overlay; });
        if (i < 0) return;
        const entry = stack.splice(i, 1)[0];
        if (entry.prev && document.contains(entry.prev) && entry.prev.focus) entry.prev.focus();
    }

    document.addEventListener("keydown", function (e) {
        const top = stack[stack.length - 1];
        if (!top) return;

        if (e.key === "Escape") {
            // Modals without a close button (forced password change) can't be dismissed.
            const closer = top.overlay.querySelector(".modal-close, [data-dialog-cancel]");
            if (closer) {
                e.preventDefault();
                e.stopPropagation();
                closer.click();
            }
            return;
        }

        if (e.key === "Tab") {
            const items = visibleFocusables(top.overlay);
            if (!items.length) { e.preventDefault(); return; }
            const first = items[0], last = items[items.length - 1];
            if (e.shiftKey && (document.activeElement === first || !top.overlay.contains(document.activeElement))) {
                e.preventDefault(); last.focus();
            } else if (!e.shiftKey && (document.activeElement === last || !top.overlay.contains(document.activeElement))) {
                e.preventDefault(); first.focus();
            }
        }
    }, true);

    // The page opens/closes its modals by setting style.display, so watch for that.
    ready(function () {
        const observer = new MutationObserver(function (mutations) {
            mutations.forEach(function (m) {
                const el = m.target;
                if (!el.classList || !el.classList.contains("modal-overlay") ||
                    el.classList.contains("ui-dialog-overlay")) return;
                if (el.style.display === "flex") activate(el); else deactivate(el);
            });
        });
        document.querySelectorAll(".modal-overlay").forEach(function (el) {
            observer.observe(el, { attributes: true, attributeFilter: ["style"] });
        });
    });

    // ------------------------------------------------------------
    // Dialogs: uiConfirm() and uiPrompt() return Promises
    // ------------------------------------------------------------
    let seq = 0;

    function openDialog(o) {
        return new Promise(function (resolve) {
            const id = "uiDlg" + (++seq);
            const hasField = !!o.field;
            const overlay = document.createElement("div");
            overlay.className = "modal-overlay ui-dialog-overlay";
            overlay.style.display = "flex";

            let fieldHtml = "";
            if (hasField) {
                const f = o.field;
                const control = f.multiline
                    ? '<textarea id="' + id + 'f" autocomplete="off"></textarea>'
                    : '<input id="' + id + 'f" type="' + (f.type || "text") + '" autocomplete="' + (f.type === "password" ? "new-password" : "off") + '">';
                fieldHtml = '<label for="' + id + 'f"></label>' + control +
                    (f.type === "password"
                        ? '<label class="ui-show"><input type="checkbox"> Show password</label>'
                        : "");
            }

            overlay.innerHTML =
                '<div class="modal-card ui-dialog' + (o.danger ? " is-danger" : "") + '" role="' +
                (hasField ? "dialog" : "alertdialog") + '" aria-modal="true" aria-labelledby="' + id + 't" aria-describedby="' + id + 'd">' +
                '<button class="modal-close" type="button" data-dialog-cancel aria-label="Close dialog">' + icon("x") + "</button>" +
                '<form novalidate>' +
                '<h2 id="' + id + 't">' + icon(o.icon || (o.danger ? "alert" : "check-circle")) + "<span></span></h2>" +
                '<p id="' + id + 'd"></p>' + fieldHtml +
                '<div class="ui-dialog-error" role="alert"></div>' +
                '<div class="ui-dialog-actions">' +
                '<button class="btn" type="button" data-dialog-cancel></button>' +
                '<button class="btn ' + (o.danger ? "danger" : "success") + '" type="submit"></button>' +
                "</div></form></div>";

            overlay.querySelector("h2 span").textContent = o.title;
            overlay.querySelector("p").textContent = o.message || "";
            const cancelBtn = overlay.querySelector(".ui-dialog-actions [data-dialog-cancel]");
            const okBtn = overlay.querySelector('.ui-dialog-actions [type="submit"]');
            cancelBtn.textContent = o.cancelText || "Cancel";
            okBtn.textContent = o.confirmText || "Confirm";

            let input = null;
            if (hasField) {
                input = overlay.querySelector("#" + id + "f");
                overlay.querySelector('label[for="' + id + 'f"]').textContent = o.field.label || "";
                if (o.field.placeholder) input.placeholder = o.field.placeholder;
                const show = overlay.querySelector(".ui-show input");
                if (show) show.addEventListener("change", function () { input.type = show.checked ? "text" : "password"; });
                input.setAttribute("data-autofocus", "");
            } else {
                // Destructive confirmations start on "Cancel" so Enter can't delete by accident.
                (o.danger ? cancelBtn : okBtn).setAttribute("data-autofocus", "");
            }

            let done = false;
            const cancelValue = hasField ? null : false;

            function finish(value) {
                if (done) return;
                done = true;
                deactivate(overlay);
                overlay.remove();
                resolve(value);
            }

            overlay.addEventListener("mousedown", function (e) { if (e.target === overlay) finish(cancelValue); });
            overlay.querySelectorAll("[data-dialog-cancel]").forEach(function (b) {
                b.addEventListener("click", function () { finish(cancelValue); });
            });

            overlay.querySelector("form").addEventListener("submit", function (e) {
                e.preventDefault();
                if (!hasField) { finish(true); return; }

                const value = input.value;
                const f = o.field;
                let error = "";
                if (f.required && !value.trim()) error = f.requiredMessage || "This field is required.";
                else if (typeof f.validate === "function") error = f.validate(value) || "";

                if (error) {
                    overlay.querySelector(".ui-dialog-error").textContent = error;
                    input.setAttribute("aria-invalid", "true");
                    input.focus();
                    return;
                }
                finish(value);
            });

            document.body.appendChild(overlay);
            activate(overlay);
        });
    }

    // uiConfirm({ title, message, confirmText, cancelText, danger }) -> Promise<boolean>
    window.uiConfirm = function (o) { return openDialog(o); };

    // uiPrompt({ title, message, confirmText, danger, field: { label, type, placeholder,
    //            required, multiline, validate(value) -> error text } }) -> Promise<string|null>
    window.uiPrompt = function (o) { return openDialog(o); };

    // ------------------------------------------------------------
    // Loading states: progress bar + pending submit buttons
    // ------------------------------------------------------------
    let inflight = 0;
    let idleTimer = null;
    let busy = [];
    let progress = null;

    function setProgress() {
        if (!progress) {
            progress = document.createElement("div");
            progress.className = "ui-progress";
            progress.setAttribute("aria-hidden", "true");
            document.body.appendChild(progress);
        }
        progress.classList.toggle("on", inflight > 0);
    }

    function markBusy(form, btn) {
        form.setAttribute("data-ui-busy", "1");
        if (btn) { btn.classList.add("is-loading"); btn.setAttribute("aria-busy", "true"); }
        busy.push({ form: form, btn: btn });
    }

    function clearBusy() {
        busy.forEach(function (b) {
            b.form.removeAttribute("data-ui-busy");
            if (b.btn) { b.btn.classList.remove("is-loading"); b.btn.removeAttribute("aria-busy"); }
        });
        busy = [];
    }

    const nativeFetch = window.fetch.bind(window);
    window.fetch = function () {
        inflight++;
        clearTimeout(idleTimer);
        ready(setProgress);
        return nativeFetch.apply(null, arguments).finally(function () {
            inflight = Math.max(0, inflight - 1);
            setProgress();
            if (!inflight) {
                // act() makes two requests back to back, so wait a beat before un-busying.
                idleTimer = setTimeout(function () { if (!inflight) clearBusy(); }, 250);
            }
        });
    };

    // Block double submits while a form is pending.
    document.addEventListener("submit", function (e) {
        if (e.target.hasAttribute && e.target.hasAttribute("data-ui-busy")) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    }, true);

    document.addEventListener("submit", function (e) {
        const form = e.target;
        if (!(form instanceof HTMLFormElement) || form.closest(".ui-dialog") || form.id === "logoutForm") return;
        const btn = e.submitter || form.querySelector('button[type="submit"], button:not([type])');
        const native = !e.defaultPrevented; // login / forgot-password post normally
        setTimeout(function () { if (native || inflight > 0) markBusy(form, btn); }, 0);
    });

    // Coming back with the browser's back button must not show a stuck spinner.
    window.addEventListener("pageshow", function (e) { if (e.persisted) clearBusy(); });

    // ------------------------------------------------------------
    // Page-specific wiring (runs before dashboard.js's own DOMContentLoaded handler)
    // ------------------------------------------------------------
    ready(function () {

        // Skeletons until the first /api/state response paints the real content.
        const bp = document.getElementById("roomBlueprint");
        if (bp && !bp.innerHTML.trim()) {
            bp.innerHTML = '<div class="skeleton-stack" aria-hidden="true"><div class="skeleton tall"></div><div class="skeleton tall"></div></div>';
        }
        const list = document.getElementById("bookingList");
        if (list && !list.innerHTML.trim()) {
            list.innerHTML = '<div class="skeleton-stack" aria-hidden="true"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>';
        }

        // Announce the unread count on the bell.
        if (typeof window.setNavBadge === "function") {
            const original = window.setNavBadge;
            window.setNavBadge = function (panel, count) {
                original.apply(this, arguments);
                if (panel === "notifications") {
                    const bell = document.querySelector(".notif-bell");
                    if (bell) bell.setAttribute("aria-label", count > 0 ? "Notifications, " + count + " unread" : "Notifications");
                }
            };
        }

        installAgenda();
    });

    // ------------------------------------------------------------
    // Agenda view for reservations
    // ------------------------------------------------------------
    let agendaMode = false;

    function dayHeading(dateStr) {
        const label = typeof window.formatDate === "function" ? window.formatDate(dateStr) : dateStr;
        const today = typeof window.getTodayString === "function" ? window.getTodayString() : "";
        return { label: label, isToday: dateStr === today };
    }

    function renderAgenda() {
        const box = document.getElementById("bookingList");
        const pager = document.getElementById("bookingPagination");
        if (!box) return;

        // bookings / rooms / currentUser are `let` globals in dashboard.js (not window properties).
        let items = typeof bookings !== "undefined" ? bookings : [];
        if (typeof currentUser !== "undefined" && currentUser && currentUser.role !== "admin") {
            items = items.filter(function (b) { return b.mine; });
        }

        const status = document.getElementById("statusFilter").value;
        if (status !== "all") items = items.filter(function (b) { return b.status === status; });

        const oldestFirst = document.getElementById("sortOrder").value === "oldest";
        items = items.slice().sort(function (a, b) {
            const cmp = a.date === b.date ? a.start.localeCompare(b.start) : a.date.localeCompare(b.date);
            return oldestFirst ? cmp : -cmp;
        });

        if (pager) pager.innerHTML = "";

        if (!items.length) {
            box.innerHTML = '<div class="empty">No reservations match this filter.</div>';
        } else {
            const days = [];
            items.forEach(function (b) {
                let d = days[days.length - 1];
                if (!d || d.date !== b.date) { d = { date: b.date, rows: [] }; days.push(d); }
                d.rows.push(b);
            });

            box.innerHTML = '<div class="agenda">' + days.map(function (d) {
                const h = dayHeading(d.date);
                return '<section class="agenda-day" aria-label="' + esc(h.label) + '">' +
                    '<h3 class="agenda-day-head' + (h.isToday ? " is-today" : "") + '">' + esc(h.label) +
                    "<small>" + (h.isToday ? "Today · " : "") + d.rows.length + (d.rows.length === 1 ? " reservation" : " reservations") + "</small></h3>" +
                    '<div class="agenda-list">' + d.rows.map(agendaItem).join("") + "</div></section>";
            }).join("") + "</div>";
        }

        if (typeof window.renderStats === "function") window.renderStats();
    }

    function agendaItem(b) {
        const room = (typeof rooms !== "undefined" ? rooms : []).find(function (r) { return r.id == b.roomId; });
        const chip = typeof window.bookingStatusChip === "function" ? window.bookingStatusChip(b) : "";
        const actions = typeof window.bookingActionsHtml === "function" ? window.bookingActionsHtml(b) : "";
        const fmt = window.formatTime || function (t) { return t; };
        const dur = typeof window.formatDuration === "function" && typeof window.toMinutes === "function"
            ? window.formatDuration(window.toMinutes(b.end) - window.toMinutes(b.start)) : "";

        return '<article class="agenda-item st-' + esc(b.status) + '">' +
            '<div class="agenda-time">' + esc(fmt(b.start)) + " – " + esc(fmt(b.end)) + "<small>" + esc(dur) + "</small></div>" +
            '<div class="agenda-main"><h4>' + esc(room ? room.name : "Room Removed") + " · " + esc(b.purpose) + "</h4>" +
            "<p>" + icon("user") + esc(b.name) + (b.reservedByAdmin ? " (reserved by admin)" : "") + "</p>" +
            "<p>" + chip + "</p>" +
            (b.status === "rejected" && b.rejectReason ? '<p class="note">Reason: ' + esc(b.rejectReason) + "</p>" : "") +
            '</div><div class="agenda-actions">' + actions + "</div></article>";
    }

    function installAgenda() {
        const original = window.displayBookings;
        const toggle = document.getElementById("viewToggle");
        if (typeof original !== "function" || !toggle) return;

        window.displayBookings = function () {
            if (!agendaMode) return original.apply(this, arguments);
            if (typeof window.renderNavBadges === "function") window.renderNavBadges();
            renderAgenda();
        };

        toggle.addEventListener("click", function (e) {
            const btn = e.target.closest("[data-view]");
            if (!btn) return;
            agendaMode = btn.dataset.view === "agenda";
            toggle.querySelectorAll("[data-view]").forEach(function (b) {
                b.setAttribute("aria-pressed", b === btn ? "true" : "false");
            });
            window.displayBookings();
        });
    }
})();