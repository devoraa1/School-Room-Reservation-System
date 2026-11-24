// Rooms panel: a building plan where each room is a cell. The plan is colored
// for the chosen "Check Availability Date" (green = has open times, red = fully
// booked), using the CCIS room schedule (from the server) plus existing
// reservations. Clicking a room opens its read-only weekly schedule with a booking
// form on the right: pick a date and only that date's open times are listed.
// dashboard.js calls window.renderRoomBlueprint().
(function () {
    const FLOORS = [4, 3, 2, 1];
    const host = document.getElementById("roomBlueprint");
    const controls = document.getElementById("roomsControls");
    const intro = document.getElementById("roomsIntro");
    if (!host) return;

    const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const ordinal = n => ["", "1ST", "2ND", "3RD", "4TH"][n] + " FLOOR";

    // Floor comes from the room's location text ("2nd Floor, ..."); default = 1st.
    function floorOf(r) {
        const m = /(\d+)\s*(?:st|nd|rd|th)/i.exec(r.location || "");
        return m ? Math.min(4, Math.max(1, +m[1])) : 1;
    }

    function planHtml() {
        const date = document.getElementById("availabilityDate").value;
        const onlyOpen = document.getElementById("roomFilter").value === "available" && date;
        const isAdmin = currentUser.role === "admin";
        const closed = isClosedDate(date);
        const byFloor = { 1: [], 2: [], 3: [], 4: [] };
        rooms.forEach(r => byFloor[floorOf(r)].push(r));

        const roomHtml = r => {
            let cls = "";
            if (closed) {
                cls = "is-off";   // Sunday: greyed out, not clickable
            } else if (date) {
                // Open = at least one free 30-minute slot (no class, not already
                // reserved, not already past).
                const free = getFreeWindows(r.id, date).length > 0;
                // Red ("fully booked") only when a reservation still holds time that
                // hasn't finished yet (8:00-8:30 PM is still red at 8:28 PM).
                // A room whose free time is all classes, or has all passed without
                // being reserved, is grey instead.
                const left = getRoomSegments(r.id, date).some(seg =>
                    (seg.type === "pending" || seg.type === "approved") && !hasSlotEnded(date, seg.end));
                cls = free ? "is-open" : left ? "is-full" : "is-none";
                if (onlyOpen && !free) cls += " is-dim";
            }
            const admin = isAdmin
                ? `<span class="bp-admin"><button type="button" title="Edit room" aria-label="Edit ${esc(r.name)}" onclick="editRoom(${r.id})">${icon("pencil")}</button>` +
                  `<button type="button" title="Remove room" aria-label="Remove ${esc(r.name)}" onclick="deleteRoom(${r.id})">${icon("x")}</button></span>`
                : "";
            return `<div class="bp-room ${cls}">${admin}` +
                `<button type="button" class="bp-room-btn" data-room-id="${r.id}" ${closed ? "disabled" : ""} aria-label="${closed ? "Unavailable on Sunday: " : "View schedule and reserve "}${esc(r.name)}">` +
                `<span class="bp-name">${esc(r.name)}</span><i class="bp-door"></i></button></div>`;
        };

        const floors = FLOORS.map(f => {
            const list = byFloor[f];
            const middle = list.length ? list.map(roomHtml).join("") : `<div class="bp-empty">EMPTY FLOOR</div>`;
            const inner = `<div class="bp-stairs">STAIRS</div>${middle}<div class="bp-stairs">STAIRS</div>`;
            return `<div class="bp-floor"><div class="bp-label">${ordinal(f)}</div><div class="bp-space">${inner}</div></div>`;
        }).join("");

        return `
            <div class="bp">
                <div class="bp-scroll">${floors}</div>
                <div class="bp-legend">
                    <span><i class="sw-open"></i>Has open times</span>
                    <span><i class="sw-full"></i>Fully booked (striped)</span>
                    <span><i class="sw-none"></i>No free time left</span>
                    <span><i class="sw-off"></i>Unavailable (Sunday)</span>
                </div>
                ${closed ? `<p class="bp-hint">Sunday is unavailable. Pick a date from Monday to Saturday.</p>` : ""}
            </div>`;
    }

    // ---------------------------------------------------------------
    // ROOM VIEW: weekly schedule (read-only) + booking form on the right
    // ---------------------------------------------------------------
    // current = null (building plan) or { roomId, date: "YYYY-MM-DD", start, end }
    let current = null;
    const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const ordinalLower = n => ["", "1st", "2nd", "3rd", "4th"][n] + " Floor";

    const ymd = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    const parseYmd = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
    const shortDate = s => parseYmd(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const roomById = id => rooms.find(r => r.id == id);

    const isClosed = s => parseYmd(s).getDay() === 0;

    // The Monday-Saturday dates of the week that holds the chosen date
    // (a Sunday shows the coming week).
    function weekDates() {
        const b = parseYmd(current.date);
        const dow = b.getDay();
        const back = dow === 0 ? -1 : dow - 1;
        const start = new Date(b.getFullYear(), b.getMonth(), b.getDate() - back);
        return [0, 1, 2, 3, 4, 5].map(i =>
            ymd(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)));
    }

    // Type of one 30-minute slot, like the PDF grid: the colored PDF blocks are
    // CLASSES (blue, never reservable). Everything else (blank cells and the old
    // lunch hour) is free time ("available"). Also past, pending / approved
    // (reserved). Only the time is shown.
    function slotInfo(roomId, date, slot, dayBookings) {
        if (date < getTodayString()) return { key: "past", type: "past" };
        if (overlapsClass(roomId, date, slot.start, slot.end)) {
            // Keyed by class so back-to-back classes (7-10 AM, 10 AM-1 PM) stay separate blocks.
            return { key: "class:" + classBlockKey(roomId, date, slot.start, slot.end), type: "class" };
        }
        const hits = dayBookings.filter(x => slot.start < x.end && slot.end > x.start);
        const hit = hits.find(x => x.status === "approved") || hits[0];
        if (hit) return { key: hit.status + ":" + hit.id, type: hit.status };
        if (isPastTimeToday(date, slot.start)) return { key: "past", type: "past" };
        // Free time next to each other is one block; a reservation splits it in two.
        return { key: "available", type: "available" };
    }

    function buildRoomView() {
        const r = roomById(current.roomId);
        const isAdmin = currentUser.role === "admin";
        let reserveFor = "";
        if (isAdmin) {
            populateReserveForUsers();
            reserveFor = `
                <label for="schReserveFor">Reserve For</label>
                <select id="schReserveFor" required>${document.getElementById("reserveFor").innerHTML}</select>`;
        }

        host.innerHTML = `
            <div class="sch">
                <div class="sch-head">
                    <button type="button" class="btn ghost" id="schBack">← Back</button>
                    <h3><span class="sch-room">${esc(r.name)}</span> · ${ordinalLower(floorOf(r))} · Weekly schedule</h3>
                </div>

                <div class="sch-layout">
                    <div class="sch-main">
                        <div class="sch-weeknav">
                            <button type="button" class="btn" id="schPrev">‹ Prev week</button>
                            <span class="sch-weeklabel" id="schWeekLabel"></span>
                            <button type="button" class="btn" id="schNext">Next week ›</button>
                        </div>
                        <p class="note">Mon–Sat · 7:00 AM – 9:00 PM · Tap a green block to reserve.</p>

                        <div class="sch-wrap">
                            <div class="sch-grid sch-heads" id="schHead"></div>
                            <div class="sch-grid sch-days" id="schBody"></div>
                        </div>

                        <div class="bp-legend">
                            <span><i class="sw-class"></i>Class (not reservable)</span>
                            <span><i class="sw-avail"></i>Free to reserve</span>
                            <span><i class="sw-pend"></i>Pending (striped)</span>
                            <span><i class="sw-resv"></i>Reserved</span>
                        </div>
                    </div>

                    <aside class="sch-side">
                        <h4>Reserve this room</h4>
                        <form id="schForm" autocomplete="off">
                            ${reserveFor}
                            <label for="schDate">Date</label>
                            <input id="schDate" type="date" min="${getTodayString()}" value="${current.date}" required>

                            <div id="schTimes" class="time-avail"></div>
                            <div class="sch-summary" id="schSummary"></div>

                            <label for="schPurpose">Purpose</label>
                            <input id="schPurpose" type="text" placeholder="Example: Math Class" required>

                            <label for="schRepeat">Repeat</label>
                            <select id="schRepeat">
                                <option value="1">Does not repeat</option>
                                ${[2, 3, 4].map(n => `<option value="${n}">Weekly for ${n} weeks</option>`).join("")}
                            </select>

                            <button class="btn success" id="schReserve" type="submit" disabled>${icon("calendar")}Request Reservation</button>
                        </form>
                    </aside>
                </div>
            </div>`;

        document.getElementById("schBack").addEventListener("click", closeRoom);
        document.getElementById("schPrev").addEventListener("click", () => shiftWeek(-7));
        document.getElementById("schNext").addEventListener("click", () => shiftWeek(7));
        const schDate = document.getElementById("schDate");
        schDate.addEventListener("change", e => {
            const v = e.target.value;
            if (!v) return;                                   // cleared / half-typed: wait
            if (v < getTodayString()) { showPastDateHint(); return; } // typing "14" passes through "1": don't snap back yet
            setDate(v);
        });
        // Only when the person leaves the field is a past or empty date put back to a valid one.
        schDate.addEventListener("blur", () => {
            if (!schDate.value || schDate.value < getTodayString()) setDate(schDate.value);
        });
        const schTimes = document.getElementById("schTimes");
        schTimes.addEventListener("click", e => {
            const b = e.target.closest("button[data-start]");
            if (b) pickTime(b.dataset.start, b.dataset.end);
        });
        schTimes.addEventListener("change", e => {
            const sel = e.target.closest("select[data-role]");
            if (sel) changeRange(sel.dataset.role, sel.value);
        });
        // A green (free) block in the weekly grid: jump to that day and choose that stretch.
        const schBody = document.getElementById("schBody");
        schBody.addEventListener("click", e => {
            const b = e.target.closest(".sch-block.is-pick");
            if (b) pickFromGrid(b.dataset.date, b.dataset.start, b.dataset.end);
        });
        schBody.addEventListener("keydown", e => {
            if (e.key !== "Enter" && e.key !== " ") return;
            const b = e.target.closest(".sch-block.is-pick");
            if (b) { e.preventDefault(); pickFromGrid(b.dataset.date, b.dataset.start, b.dataset.end); }
        });
        document.getElementById("schForm").addEventListener("submit", submitReservation);
        document.getElementById("schRepeat").addEventListener("change", refreshSummary);

        refreshAll();
    }

    function refreshAll() {
        refreshGrid();
        refreshTimes();
        refreshSummary();
    }

    function setDate(value) {
        const today = getTodayString();
        if (!value || value < today) value = value ? today : current.date;
        current.date = value;
        current.start = "";
        current.end = "";
        const input = document.getElementById("schDate");
        if (input) input.value = value;
        refreshAll();
    }

    // A date typed by hand can briefly be in the past (e.g. "1" on the way to "14").
    // Leave the field alone, just say so and hold off on booking.
    function showPastDateHint() {
        current.start = "";
        current.end = "";
        const box = document.getElementById("schTimes");
        if (box) box.innerHTML = `<p class="ta-empty">Pick today or a later date.</p>`;
        const el = document.getElementById("schSummary");
        if (el) el.textContent = "That date has already passed.";
        const btn = document.getElementById("schReserve");
        if (btn) btn.disabled = true;
    }

    function shiftWeek(days) {
        const d = parseYmd(current.date);
        setDate(ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days)));
    }

    // "10:00 AM" + "12:00 PM" -> "10:00 – 12:00 PM" (one label per block)
    function rangeLabel(a, z) {
        const [ta, pa] = formatTime(a).split(" "), [tz, pz] = formatTime(z).split(" ");
        return (pa === pz ? ta : ta + " " + pa) + " – " + tz + " " + pz;
    }

    // Weekly schedule (read-only), based on the PDF: Monday-Saturday columns, each
    // block is one stretch of time (10 AM - 12 PM = one block). White
    // parts of the PDF (no time) stay blank.
    function refreshGrid() {
        const r = roomById(current.roomId);
        const dates = weekDates();
        const today = getTodayString();
        const N = TIME_SLOTS.length;

        document.getElementById("schWeekLabel").textContent =
            shortDate(dates[0]) + " – " + shortDate(dates[5]) + ", " + parseYmd(dates[5]).getFullYear();
        document.getElementById("schPrev").disabled = dates[0] <= today;

        document.getElementById("schHead").innerHTML = `<div class="sch-h sch-tc">TIME</div>` + dates.map(d =>
            `<div class="sch-h${d === today ? " is-today" : ""}${d === current.date ? " is-selected" : ""}">${DAY_SHORT[parseYmd(d).getDay()]}<small>${shortDate(d)}</small></div>`).join("");

        const axis = `<div class="sch-axis">` + TIME_SLOTS.map((s, i) =>
            `<div class="sch-tl" style="top:${(i / N) * 100}%;height:${(1 / N) * 100}%">` +
            `<span class="t-full">${formatTime(s.start).replace(/ (AM|PM)/, "")} – ${formatTime(s.end)}</span>` +
            `<span class="t-short">${formatTime(s.start).replace(/ (AM|PM)/, "")}</span></div>`).join("") + `</div>`;

        document.getElementById("schBody").innerHTML = axis + dates.map(d => {
            const db = bookings.filter(x => x.roomId == r.id && x.date === d && (x.status === "pending" || x.status === "approved"));
            const info = TIME_SLOTS.map(s => slotInfo(r.id, d, s, db));
            let blocks = "";
            for (let i = 0; i < N;) {
                let n = 1;
                while (i + n < N && info[i + n].key === info[i].key) n++;
                const t = info[i].type;
                if (t !== "past") {
                    const a = TIME_SLOTS[i].start, z = TIME_SLOTS[i + n - 1].end;
                    const pos = `top:${(i / N) * 100}%;height:${(n / N) * 100}%`;
                    if (t === "class") {
                        // Show the block's course & section and its instructor (from the PDF).
                        const cb = classBlockAt(r.id, d, a, z) || {};
                        const sec = cb.section || "Class";
                        const who = cb.instructor ? ` · ${cb.instructor}` : "";
                        blocks += `<div class="sch-block class" style="${pos}" title="${esc(sec + who)} · ${rangeLabel(a, z)} (not reservable)">` +
                            `<span><b class="cls-sec">${esc(sec)}</b>` +
                            (cb.instructor ? `<em class="cls-ins">${esc(cb.instructor)}</em>` : "") +
                            `<small>${rangeLabel(a, z)}</small></span></div>`;
                    } else if (t === "available") {
                        blocks += `<div class="sch-block available is-pick" style="${pos}" role="button" tabindex="0" data-date="${d}" data-start="${a}" data-end="${z}" ` +
                            `title="Free · ${rangeLabel(a, z)} · tap to reserve" aria-label="Free ${rangeLabel(a, z)} on ${esc(formatDate(d))}. Tap to reserve."><span>${rangeLabel(a, z)}</span></div>`;
                    } else {
                        const status = t === "pending" ? "Pending" : "Reserved";
                        blocks += `<div class="sch-block ${t}" style="${pos}" title="${status} · ${rangeLabel(a, z)}"><span>${rangeLabel(a, z)}</span></div>`;
                    }
                }
                i += n;
            }
            return `<div class="sch-col${d < today ? " is-past" : ""}${d === current.date ? " is-selected" : ""}">${blocks}</div>`;
        }).join("");
    }

    // Right side: the free times of the chosen date, then your own start / end.
    function refreshTimes() {
        const box = document.getElementById("schTimes");
        if (isClosed(current.date)) {
            setBoxHtml(box, `<div class="ta-title">Free times · ${esc(formatDate(current.date))}</div>` +
                `<p class="ta-empty">Sunday is unavailable. Please pick a date from Monday to Saturday.</p>`);
            return;
        }
        const windows = getFreeWindows(current.roomId, current.date);

        // The chosen time may have just passed or been taken: drop it.
        if (current.start && !windowHolding(windows, current.start, current.end)) {
            current.start = "";
            current.end = "";
        }

        const title = `<div class="ta-title">Free times · ${esc(formatDate(current.date))}</div>`;

        if (!windows.length) {
            setBoxHtml(box, title + `<p class="ta-empty">No free time on this date (classes or reservations fill it). Try another date.</p>`);
            return;
        }

        setBoxHtml(box, title + timePickerHtml(windows, current.start, current.end, "sch"));
    }

    function repeatWeeks() {
        const sel = document.getElementById("schRepeat");
        return sel ? Math.max(1, parseInt(sel.value, 10) || 1) : 1;
    }

    function refreshRepeatLabels() {
        const sel = document.getElementById("schRepeat");
        if (!sel) return;
        Array.from(sel.options).forEach(o => {
            const n = parseInt(o.value, 10);
            if (n < 2) return;
            o.textContent = `Weekly for ${n} weeks (until ${formatDate(shiftDateString(current.date, (n - 1) * 7))})`;
        });
    }

    function repeatNote() {
        const weeks = repeatWeeks();
        if (weeks < 2) return "";
        const rows = previewSeries(current.roomId, current.date, current.start, current.end, weeks);
        const bad = rows.filter(r => !r.ok).length;
        const items = rows.map(r =>
            `<li class="${r.ok ? "is-ok" : "is-bad"}">${icon(r.ok ? "check" : "x")}${esc(formatDate(r.date))}${r.ok ? "" : " · " + esc(r.reason)}</li>`
        ).join("");
        const warning = bad
            ? `${bad} of ${weeks} dates can't be booked and will be skipped if you continue.`
            : "All dates are free.";
        return `<div class="sch-repeat-note">${icon("repeat")}Repeats weekly for ${weeks} weeks. ${warning}</div>` +
            `<ul class="sch-repeat-list">${items}</ul>`;
    }

    function refreshSummary() {
        refreshRepeatLabels();
        const el = document.getElementById("schSummary");
        const btn = document.getElementById("schReserve");
        if (!current.start) {
            el.textContent = "No time selected yet.";
            btn.disabled = true;
            return;
        }
        el.innerHTML = `<b>${esc(roomById(current.roomId).name)}</b> · ${esc(formatDate(current.date))}<br>` +
            `${formatTime(current.start)} – ${formatTime(current.end)} (${formatDuration(toMinutes(current.end) - toMinutes(current.start))})` +
            repeatNote();
        btn.disabled = false;
    }

    // Choose a free stretch (all of it); tap it again to clear. The From / To
    // lists then let the person trim it to the time they need.
    function pickTime(start, end) {
        const windows = getFreeWindows(current.roomId, current.date);
        const held = windowHolding(windows, current.start, current.end);
        const same = held && held.start === start && held.end === end;
        current.start = same ? "" : start;
        current.end = same ? "" : end;
        refreshTimes();
        refreshSummary();
    }

    function changeRange(role, value) {
        const windows = getFreeWindows(current.roomId, current.date);
        const next = adjustTimeSelection(windows, { start: current.start, end: current.end }, role, value);
        current.start = next.start;
        current.end = next.end;
        refreshTimes();
        refreshSummary();
    }

    function pickFromGrid(date, start, end) {
        if (date !== current.date) setDate(date);
        current.start = start;
        current.end = end;
        refreshAll();
        const side = document.querySelector(".sch-side");
        if (side && window.matchMedia("(max-width: 850px)").matches) side.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    async function submitReservation(e) {
        e.preventDefault();
        if (!current.start) return;

        const roomId = current.roomId, date = current.date, start = current.start, end = current.end;
        const weeks = repeatWeeks();
        let skipConflicts = false;

        if (weeks > 1) {
            const blocked = previewSeries(roomId, date, start, end, weeks).filter(w => !w.ok);
            if (blocked.length === weeks) {
                alertMessage("None of the " + weeks + " weekly dates are available.", "error");
                return;
            }
            if (blocked.length) {
                if (!await confirmSkippedWeeks(blocked, weeks)) return;
                skipConflicts = true;
            }
        }

        document.getElementById("room").value = roomId;
        document.getElementById("date").value = date;
        document.getElementById("startTime").value = start;
        document.getElementById("endTime").value = end;
        document.getElementById("purpose").value = document.getElementById("schPurpose").value.trim();
        const forSel = document.getElementById("schReserveFor");
        if (forSel) document.getElementById("reserveFor").value = forSel.value;

        const ok = await bookRoom(weeks, skipConflicts);

        if (ok && current) {
            current.start = "";
            current.end = "";
            const p = document.getElementById("schPurpose");
            if (p) p.value = "";
            const repeatSel = document.getElementById("schRepeat");
            if (repeatSel) repeatSel.value = "1";
            refreshAll();
        }
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function openRoom(id) {
        current = { roomId: id, date: document.getElementById("availabilityDate").value || getTodayString(), start: "", end: "" };
        render();
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function closeRoom() {
        current = null;
        render();
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    host.addEventListener("click", e => {
        const b = e.target.closest(".bp-room-btn");
        if (b && !b.disabled) openRoom(b.dataset.roomId);
    });

    function render() {
        if (current && !roomById(current.roomId)) current = null;

        if (intro) intro.style.display = current ? "none" : "";

        if (current) {
            if (controls) controls.style.display = "none";
            if (!host.querySelector(".sch")) buildRoomView();
            else refreshAll();          // keeps the Purpose text while bookings refresh
        } else {
            if (controls) controls.style.display = "";
            host.innerHTML = planHtml();
        }
    }

    // Keep everything in step with the clock: when a time passes, the plan colors,
    // the weekly schedule and the open-time lists update by themselves (no reload).
    setInterval(function () {
        if (document.hidden) return;
        try {
            render();
            if (typeof checkTimeAvailability === "function") checkTimeAvailability();
            // Reservations tab: the Cancel button disappears once a reservation starts.
            const resPanel = document.getElementById("panel-reservations");
            if (resPanel && resPanel.offsetParent !== null && typeof displayBookings === "function") displayBookings();
        } catch (e) { /* page not ready, try again next tick */ }
    }, 10000);

    // dashboard.js calls renderRoomBlueprint() once the data has loaded from the server.
    window.renderRoomBlueprint = render;
})();