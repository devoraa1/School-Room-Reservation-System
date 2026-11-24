@extends('layouts.app')

@section('title', 'Forgot Password - Room Reservation')
@section('body-class', 'auth-page')

@section('content')
    <div class="page-cover" aria-hidden="true"></div>

    <div class="container small-container">
        <div class="auth-toolbar">
            <button class="theme-toggle" type="button" onclick="toggleTheme()" aria-label="Toggle light and dark mode">
                <span class="theme-toggle-thumb">🌙</span>
            </button>
        </div>

        <div id="alertBox" role="alert" aria-live="assertive">
            @if ($errors->any())
                <div class="alert error">{{ $errors->first() }}</div>
            @elseif (session('sent'))
                <div class="alert success">{{ session('sent') }}</div>
            @endif
        </div>

        <div class="box auth-card">
            <div class="auth-card-hero" role="img" aria-label="CCIS crest">
                <a class="auth-card-hero-link" href="{{ route('home') }}" aria-label="Room Reservation home"></a>
            </div>

            <div class="auth-card-body">
                <div class="auth-card-head tight">
                    <span class="auth-eyebrow">Account recovery</span>
                    <h2>Forgot your password?</h2>
                </div>

                <p class="auth-sub auth-sub-center">
                    Enter the email your admin used to create your account.
                    We'll send a reset request to the admin, who will set
                    a new password for you.
                </p>

                @if (session('sent'))
                    <p class="auth-sub">
                        Your request has been sent to the admin. Once they reset
                        it, you'll be able to log in with your new password.
                        You can change it again anytime from the Profile menu.
                    </p>
                @else
                    <form method="POST" action="{{ route('password.email') }}">
                        @csrf

                        <label for="recoveryEmail">Email</label>
                        <input id="recoveryEmail" name="email" type="email" value="{{ old('email') }}" placeholder="you@example.com" autocomplete="email" required>

                        <button class="btn success full-width" type="submit">Send Reset Request</button>
                    </form>
                @endif

                <div class="auth-divider"></div>

                <p class="auth-footer">
                    Remembered it?
                    <a href="{{ route('login') }}">Back to login</a>
                </p>
            </div>
        </div>
    </div>
@endsection