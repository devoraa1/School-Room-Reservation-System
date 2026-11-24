@extends('layouts.app')

@section('title', 'Login - Room Reservation')
@section('body-class', 'auth-page')

@section('content')
    <div class="page-cover" aria-hidden="true"></div>

    <div class="container small-container">
        <div class="box auth-card">
            <div class="auth-card-hero" role="img" aria-label="CCIS crest">
                <a class="auth-card-hero-link" href="{{ route('home') }}" aria-label="Room Reservation home"></a>
            </div>

            <div class="auth-card-body">
                <div id="alertBox" role="alert" aria-live="assertive">
                    @if ($errors->any())
                        <div class="alert error">{{ $errors->first() }}</div>
                    @endif
                </div>

                <div class="auth-card-head tight">
                    <span class="auth-eyebrow">Welcome back</span>
                    <h2>Log in to your account</h2>
                </div>

                <p class="auth-sub auth-sub-center">
                    Reserve a school room in just a few clicks.
                </p>

                <form method="POST" action="{{ route('login.attempt') }}">
                    @csrf

                    <label for="email">Email</label>
                    <input id="email" name="email" type="email" value="{{ old('email') }}" placeholder="you@example.com" autocomplete="username" required autofocus>

                    <label for="password">Password</label>
                    <div class="password-field">
                        <input id="password" name="password" type="password" placeholder="Password" autocomplete="current-password" required>
                        <button class="password-toggle" type="button" aria-label="Show password" onclick="togglePasswordVisibility(this, 'password')"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg></button>
                    </div>

                    <div class="auth-row-between">
                        <label class="checkbox-field">
                            <input id="rememberMe" name="remember" type="checkbox" value="1">
                            <span class="checkbox-box"></span>
                            <span class="checkbox-label">Remember me</span>
                        </label>

                        <a class="auth-inline-link" href="{{ route('password.request') }}">Forgot password?</a>
                    </div>

                    <button class="btn success full-width" type="submit">Log In</button>
                </form>

                <div class="auth-divider"></div>

                <p class="auth-footer">
                    Accounts are created by the school admin.
                    Contact the admin office if you need access.
                </p>
            </div>
        </div>
    </div>
@endsection

@push('scripts')
    <script src="{{ asset('js/auth-ui.js') }}"></script>
    <script>
        // "Remember me": keeps you signed in (server side) and remembers your EMAIL on this
        // device, so it is prefilled after you log out. The password is never stored.
        (function () {
            var email = document.getElementById("email");
            var remember = document.getElementById("rememberMe");
            var password = document.getElementById("password");
            var KEY = "rr-remember-email";
            if (!email || !remember) return;

            try {
                var saved = localStorage.getItem(KEY);
                if (saved) {
                    if (!email.value) email.value = saved;
                    remember.checked = true;
                    if (password) password.focus();
                }
            } catch (e) {}

            email.form.addEventListener("submit", function () {
                try {
                    if (remember.checked && email.value) localStorage.setItem(KEY, email.value.trim());
                    else localStorage.removeItem(KEY);
                } catch (e) {}
            });
        })();
    </script>
@endpush