@extends('layouts.app')

@section('title', 'Room Reservation System')

@push('styles')
    <link rel="stylesheet" href="{{ asset('css/blueprint.css') }}">
@endpush

@section('content')
<div class="page-cover" aria-hidden="true"></div>
    <form id="logoutForm" method="POST" action="{{ route('logout') }}" style="display:none;">@csrf</form>

    <a class="skip-link" href="#main">Skip to content</a>

    <div class="app-shell">

        <!-- SIDEBAR -->
        <aside class="sidebar" id="sidebar">
            <div class="sidebar-heading">
                <a class="sidebar-brand" href="{{ route('home') }}">
                    <span class="header-logo"><img src="{{ asset('images/ccis-logo.png') }}" alt="CCIS logo"></span>
                    <div>
                        <h1>Room Reservation</h1>
                        <small>School Management System</small>
                    </div>
                </a>
                <button class="menu-btn sidebar-menu-btn" type="button" onclick="toggleSidebar()" aria-label="Hide menu" aria-controls="sidebar" aria-expanded="true" title="Hide sidebar">
                    <span></span><span></span><span></span>
                </button>
            </div>

            <nav class="dash-nav" id="dashNav" aria-label="Main">
                <button class="dash-nav-btn active" data-panel="rooms" onclick="switchPanel('rooms')">
                    <span class="nav-icon"><svg class="ic" aria-hidden="true"><use href="#i-door"></use></svg></span><span class="nav-label">Rooms &amp; Booking</span>
                </button>
                <button class="dash-nav-btn" data-panel="reservations" onclick="switchPanel('reservations')">
                    <span class="nav-icon"><svg class="ic" aria-hidden="true"><use href="#i-calendar"></use></svg></span><span class="nav-label" id="reservationsNavLabel">My Reservations</span>
                </button>
                <div class="nav-divider admin-only" style="display:none;"></div>
                <div class="nav-section-label admin-only" style="display:none;">Administration</div>
                <button class="dash-nav-btn admin-only" data-panel="manage-rooms" onclick="switchPanel('manage-rooms')" style="display:none;">
                    <span class="nav-icon"><svg class="ic" aria-hidden="true"><use href="#i-grid"></use></svg></span><span class="nav-label">Manage Rooms</span>
                </button>
                <button class="dash-nav-btn admin-only" data-panel="manage-users" onclick="switchPanel('manage-users')" style="display:none;">
                    <span class="nav-icon"><svg class="ic" aria-hidden="true"><use href="#i-users"></use></svg></span><span class="nav-label">Manage Users</span>
                </button>
            </nav>

            <div class="sidebar-footer">
                <div class="settings-menu" id="settingsMenu">
                    <div class="settings-popover" id="settingsPopover" role="menu">
                        <button class="settings-item" type="button" role="menuitem" onclick="openProfileModal()">
                            <span class="settings-item-icon"><svg class="ic" aria-hidden="true"><use href="#i-user"></use></svg></span> Profile
                        </button>
                        <div class="settings-divider" role="separator"></div>
                        <button class="settings-item settings-item-danger" type="button" role="menuitem" onclick="logout()">
                            <span class="settings-item-icon"><svg class="ic" aria-hidden="true"><use href="#i-logout"></use></svg></span> Logout
                        </button>
                    </div>
                    <button class="settings-trigger" type="button" onclick="toggleSettingsMenu(event)" aria-haspopup="true" aria-expanded="false" aria-label="Open settings menu">
                        <span id="userBar"></span>
                        <svg class="settings-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m18 15-6-6-6 6"/></svg>
                    </button>
                </div>
            </div>
        </aside>

        <div class="sidebar-overlay" id="sidebarOverlay" onclick="closeSidebar()"></div>

        <!-- MAIN COLUMN -->
        <div class="main-col">

            <!-- TOPBAR: hamburger + brand on mobile; on desktop only the notification bell shows -->
            <div class="topbar">
                <a class="topbar-brand" href="{{ route('home') }}">
                    <span class="header-logo"><img src="{{ asset('images/ccis-logo.png') }}" alt="CCIS logo"></span> Room Reservation
                </a>
                <div class="topbar-actions">
                <button class="theme-btn" id="themeBtn" type="button" onclick="toggleTheme()" aria-label="Switch to light mode" title="Switch to light mode">
                    <span class="theme-icon" aria-hidden="true">
                        <svg class="icon-moon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                        <svg class="icon-sun" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.5"/><path fill="none" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
                    </span>
                </button>
                <div class="notif-wrap" id="notifWrap">
                    <button class="notif-bell" type="button" data-panel="notifications" onclick="toggleNotifications()" aria-haspopup="true" aria-expanded="false" aria-label="Notifications" title="Notifications"><svg class="ic" aria-hidden="true"><use href="#i-bell"></use></svg></button>
                    <div class="notif-pop" id="notifModal" role="dialog" aria-label="Notifications">
                        <div class="notif-head">
                            <h2>Notifications</h2>
                            <button class="modal-close" type="button" onclick="closeNotifications()" aria-label="Close notifications"><svg class="ic" aria-hidden="true"><use href="#i-x"></use></svg></button>
                        </div>
                        <div id="notificationList" class="notif-scroll"></div>
                        <div class="notif-actions">
                            <button class="btn" type="button" onclick="markAllNotificationsRead(); renderNotifications();">Mark all as read</button>
                            <button class="btn ghost" type="button" onclick="clearNotifications()">Clear all</button>
                        </div>
                    </div>
                </div>
                </div>
            </div>

            <div id="alertBox" role="status" aria-live="polite" aria-atomic="true"></div>

        <main id="main" tabindex="-1">

        <!-- ROOMS -->
        <section class="panel active" id="panel-rooms">
            <div class="box">
                <h2><svg class="ic" aria-hidden="true"><use href="#i-door"></use></svg>Rooms</h2>
                <p class="note" id="roomsIntro">
                    Click a room to see its weekly schedule and reserve a time.
                </p>

                <div id="roomsControls">
                    <label for="availabilityDate">Check Availability Date</label>
                    <input id="availabilityDate" type="date">

                    <div class="list-controls">
                        <select id="roomFilter" aria-label="Filter rooms">
                            <option value="all">All Rooms</option>
                            <option value="available">Available Only</option>
                        </select>
                    </div>
                </div>

                <div id="roomBlueprint"></div>

            </div>
        </section>

        <!-- RESERVE -->
        <section class="panel" id="panel-reserve">
            <div class="box">
                <h2><svg class="ic" aria-hidden="true"><use href="#i-calendar"></use></svg>Reserve a Room</h2>
                <form id="bookingForm">
                    <div id="reserveForWrap" style="display:none;">
                        <label for="reserveFor">Reserve For</label>
                        <select id="reserveFor"></select>
                        <p class="note">
                            Pick the person this room is being reserved for.
                            The reservation is approved right away and shows
                            up in their Reservations tab.
                        </p>
                    </div>

                    <label for="room">Room</label>
                    <select id="room" required></select>

                    <label for="date">Date</label>
                    <input id="date" type="date" required>

                    <label id="timeLabel">Time</label>
                    <div id="timeAvailability" class="time-avail" role="group" aria-labelledby="timeLabel"></div>
                    <input id="startTime" type="hidden">
                    <input id="endTime" type="hidden">
                    <p class="note">Blue class time can't be reserved. Pick a free time, then set the start and end you need.</p>
                    <div id="timeAvailabilityMsg" aria-live="polite"></div>

                    <label for="purpose">Purpose</label>
                    <input id="purpose" type="text" placeholder="Example: Math Class" required>

                    <button class="btn success" type="submit">
                        <svg class="ic" aria-hidden="true"><use href="#i-calendar"></use></svg>Request Reservation
                    </button>
                </form>
            </div>
        </section>

        <!-- MY / ALL RESERVATIONS -->
        <section class="panel" id="panel-reservations">
            <div class="box">
                <h2><svg class="ic" aria-hidden="true"><use href="#i-calendar"></use></svg>Reservations</h2>

                <div class="view-toggle" id="viewToggle" role="group" aria-label="Reservation view">
                    <button type="button" class="view-toggle-btn" data-view="list" aria-pressed="true"><svg class="ic" aria-hidden="true"><use href="#i-list"></use></svg>List</button>
                    <button type="button" class="view-toggle-btn" data-view="agenda" aria-pressed="false"><svg class="ic" aria-hidden="true"><use href="#i-agenda"></use></svg>Agenda</button>
                </div>

                <div class="list-controls">
                    <select id="statusFilter" aria-label="Filter by status">
                        <option value="all">All Statuses</option>
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                    <select id="sortOrder" aria-label="Sort order">
                        <option value="newest">Sort: Newest First</option>
                        <option value="oldest">Sort: Oldest First</option>
                    </select>
                </div>

                <div id="bookingList"></div>
                <div id="bookingPagination"></div>
            </div>
        </section>

        <!-- ADMIN: MANAGE ROOMS -->
        <section class="panel" id="panel-manage-rooms">
            <div class="box">
                <h2 id="roomFormTitle">Add Room</h2>
                <form id="roomForm">
                    <input id="roomName" type="text" placeholder="Room name" aria-label="Room name" required>
                    <input id="roomLocation" type="text" placeholder="Location (e.g. 2nd Floor, Main Building)" aria-label="Room location">

                    <button class="btn success" id="roomSubmitBtn" type="submit">
                        Add Room
                    </button>
                    <button class="btn" id="cancelEditBtn" type="button" onclick="cancelRoomEdit()" style="display:none;">
                        Cancel Edit
                    </button>
                </form>
            </div>
        </section>

        <!-- ADMIN: MANAGE USERS -->
        <section class="panel" id="panel-manage-users">
            <div class="box" id="resetRequestsBox" style="display:none;">
                <h2><svg class="ic" aria-hidden="true"><use href="#i-key"></use></svg>Password Reset Requests</h2>
                <div id="resetRequestList"></div>
                <div id="resetPagination"></div>
            </div>

            <div class="bento admin-stat-row">
                <div class="box tile-stats stat-cyan admin-stat-tile">
                    <div class="stat-icon"><svg class="ic" aria-hidden="true"><use href="#i-users"></use></svg></div>
                    <div class="stat-info">
                        <span class="stat-value" id="statUsers">0</span>
                        <span class="stat-label">Total Accounts</span>
                    </div>
                </div>
                <div class="box tile-stats stat-rose admin-stat-tile">
                    <div class="stat-icon"><svg class="ic" aria-hidden="true"><use href="#i-ban"></use></svg></div>
                    <div class="stat-info">
                        <span class="stat-value" id="statBlockedUsers">0</span>
                        <span class="stat-label">Blocked Accounts</span>
                    </div>
                </div>
            </div>

            <div class="box">
                <div class="panel-heading-row">
                    <h2><svg class="ic" aria-hidden="true"><use href="#i-users"></use></svg>User Accounts</h2>
                    <button class="btn success" type="button" onclick="openCreateUserModal()">
                        <svg class="ic" aria-hidden="true"><use href="#i-plus"></use></svg>Create Account
                    </button>
                </div>

                <div class="role-tabs" id="userRoleTabs"></div>

                <div class="list-controls">
                    <select id="userStatusFilter" onchange="filterUsersByStatus()" aria-label="Filter users by status">
                        <option value="all">All statuses</option>
                        <option value="approved">Active</option>
                        <option value="blocked">Blocked</option>
                    </select>
                </div>

                <div id="userList"></div>
                <div id="userPagination"></div>
            </div>
        </section>

        </main>

        </div><!-- /.main-col -->
    </div><!-- /.app-shell -->

    @include('partials.modals')
@endsection

@push('scripts')
    @include('partials.dashboard-config')
    <script src="{{ asset('js/auth-ui.js') }}"></script>
    <script src="{{ asset('js/dashboard.js') }}"></script>
    <script src="{{ asset('js/blueprint.js') }}"></script>
    <script src="{{ asset('js/bg-field.js') }}"></script>
    <script src="{{ asset('js/sidebar.js') }}"></script>
@endpush