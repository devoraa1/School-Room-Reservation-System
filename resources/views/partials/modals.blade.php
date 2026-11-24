<!-- PROFILE MODAL -->
    <div class="modal-overlay" id="profileModal" onclick="if (event.target === this) closeProfileModal()">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="profileHeading">
            <button class="modal-close" type="button" onclick="closeProfileModal()" aria-label="Close profile"><svg class="ic" aria-hidden="true"><use href="#i-x"></use></svg></button>
            <div class="modal-alert" role="status" aria-live="polite"></div>

            <h2 id="profileHeading">Profile</h2>

            <div class="profile-photo-row">
                <div class="profile-avatar-frame">
                    <span id="profileAvatarInitials">?</span>
                    <img id="profileAvatarImg" alt="Profile photo" style="display:none;">
                </div>
                <div>
                    <label class="btn photo-upload-label" for="profilePhotoInput">
                        <svg class="ic" aria-hidden="true"><use href="#i-upload"></use></svg>Upload New Photo
                    </label>
                    <input id="profilePhotoInput" type="file" accept="image/*" style="display:none;">
                    <p class="note" style="margin:8px 0 0;">
                        Your photo is shown next to your name.
                    </p>
                </div>
            </div>

            <div class="profile-info">
                <div class="profile-info-row">
                    <span class="profile-info-label">Current Email</span>
                    <span id="profileCurrentEmail">—</span>
                </div>
            </div>

            <form id="profileForm" autocomplete="off">
                <label for="profileEmailInput">New Email</label>
                <input id="profileEmailInput" type="email" autocomplete="email" placeholder="Leave blank to keep your current email">

                <label for="profileNewPassword">New Password</label>
                <div class="password-field">
                    <input id="profileNewPassword" type="password" autocomplete="new-password" placeholder="Leave blank to keep your current password">
                    <button class="password-toggle" type="button" aria-label="Show password" onclick="togglePasswordVisibility(this, 'profileNewPassword')"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg></button>
                </div>

                <label for="profileConfirmPassword">Confirm New Password</label>
                <div class="password-field">
                    <input id="profileConfirmPassword" type="password" autocomplete="new-password" placeholder="Re-enter new password">
                    <button class="password-toggle" type="button" aria-label="Show password" onclick="togglePasswordVisibility(this, 'profileConfirmPassword')"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg></button>
                </div>

                <label for="profileCurrentPassword">Current Password</label>
                <div class="password-field">
                    <input id="profileCurrentPassword" type="password" autocomplete="current-password" placeholder="Needed to save email or password changes">
                    <button class="password-toggle" type="button" aria-label="Show password" onclick="togglePasswordVisibility(this, 'profileCurrentPassword')"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg></button>
                </div>

                <div class="form-actions">
                    <button class="btn success" type="submit"><svg class="ic" aria-hidden="true"><use href="#i-save"></use></svg>Save Changes</button>
                    <button class="btn" type="button" onclick="closeProfileModal()">Cancel</button>
                </div>
            </form>
        </div>
    </div>

    <!-- FORCE PASSWORD CHANGE MODAL — no close button, backdrop click
         does nothing. The only way past it is to submit a new
         password (see submitForcePasswordChange in dashboard.js). Shown
         whenever currentUser.mustChangePassword is true. -->
    <div class="modal-overlay" id="forcePasswordModal">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="forcePwTitle">
            <div class="modal-alert" role="status" aria-live="polite"></div>

            <h2 id="forcePwTitle"><svg class="ic" aria-hidden="true"><use href="#i-key"></use></svg>Set Your Own Password</h2>
            <p class="note">
                Your account is still using a temporary password set
                by an admin. For security, please choose your own
                password before continuing.
            </p>

            <form id="forcePasswordForm" autocomplete="off" onsubmit="submitForcePasswordChange(event)">
                <label for="forcePwNew">New Password</label>
                <div class="password-field">
                    <input id="forcePwNew" type="password" autocomplete="new-password" placeholder="At least 8 characters, letters + numbers" required>
                    <button class="password-toggle" type="button" aria-label="Show password" onclick="togglePasswordVisibility(this, 'forcePwNew')"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg></button>
                </div>

                <label for="forcePwConfirm">Confirm New Password</label>
                <div class="password-field">
                    <input id="forcePwConfirm" type="password" autocomplete="new-password" placeholder="Re-enter new password" required>
                    <button class="password-toggle" type="button" aria-label="Show password" onclick="togglePasswordVisibility(this, 'forcePwConfirm')"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg></button>
                </div>

                <div class="form-actions">
                    <button class="btn success" type="submit"><svg class="ic" aria-hidden="true"><use href="#i-save"></use></svg>Save and Continue</button>
                </div>
            </form>
        </div>
    </div>

    <!-- CREATE USER MODAL -->
    <div class="modal-overlay" id="createUserModal" onclick="if (event.target === this) closeCreateUserModal()">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="createUserTitle">
            <button class="modal-close" type="button" onclick="closeCreateUserModal()" aria-label="Close create account"><svg class="ic" aria-hidden="true"><use href="#i-x"></use></svg></button>
            <div class="modal-alert" role="status" aria-live="polite"></div>

            <h2 id="createUserTitle"><svg class="ic" aria-hidden="true"><use href="#i-plus"></use></svg>Create User Account</h2>
            <p class="note">
                Only accounts created here can sign in. Give the user
                their email and temporary password — they can change
                both from the Profile menu.
            </p>

            <form id="createUserForm" autocomplete="off">
                <label for="newUserName">Full Name</label>
                <input id="newUserName" type="text" placeholder="e.g. Maria Santos" required>

                <label for="newUserEmail">Email</label>
                <input id="newUserEmail" type="email" autocomplete="off" placeholder="name@example.com" required>

                <label for="newUserPassword">Temporary Password</label>
                <div class="password-field">
                    <input id="newUserPassword" type="password" autocomplete="new-password" placeholder="At least 8 characters, letters + numbers" required>
                    <button class="password-toggle" type="button" aria-label="Show password" onclick="togglePasswordVisibility(this, 'newUserPassword')"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg></button>
                </div>

                <label for="newUserRole">Role</label>
                <select id="newUserRole">
                    <option value="teacher">Teacher</option>
                    <option value="staff">School Staff</option>
                    <option value="student">Student Leader</option>
                </select>

                <div class="form-actions">
                    <button class="btn success" type="submit"><svg class="ic" aria-hidden="true"><use href="#i-plus"></use></svg>Create Account</button>
                    <button class="btn" type="button" onclick="closeCreateUserModal()">Cancel</button>
                </div>
            </form>
        </div>
    </div>