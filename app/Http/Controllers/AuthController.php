<?php

namespace App\Http\Controllers;

use App\Models\PasswordResetRequest;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;

class AuthController extends Controller
{
    public function showLogin()
    {
        return view('auth.login');
    }

    public function login(Request $request)
    {
        $data = $request->validate([
            'email' => ['required', 'email', 'max:255'],
            'password' => ['required', 'string'],
        ], [
            'email.email' => 'Please enter a valid email address.',
        ]);

        $key = 'login:' . Str::lower($data['email']) . '|' . $request->ip();

        if (RateLimiter::tooManyAttempts($key, 5)) {
            $wait = RateLimiter::availableIn($key);

            return back()->withInput($request->only('email'))->withErrors([
                'email' => "Too many attempts. Try again in {$wait} seconds.",
            ]);
        }

        // One generic message for "no such account" and "wrong password" (no account enumeration).
        if (! Auth::validate($data)) {
            RateLimiter::hit($key, 300);

            return back()->withInput($request->only('email'))->withErrors([
                'email' => 'The email or password is incorrect.',
            ]);
        }

        $user = User::where('email', $data['email'])->firstOrFail();

        if ($user->isBlocked()) {
            return back()->withInput($request->only('email'))->withErrors([
                'email' => 'Your account has been blocked by the admin. Please contact the admin office.',
            ]);
        }

        RateLimiter::clear($key);

        // "Remember me" uses Laravel's secure remember cookie (no password is ever stored in the browser).
        Auth::login($user, $request->boolean('remember'));
        $request->session()->regenerate(); // prevents session fixation

        return redirect()->intended(route('dashboard'));
    }

    public function logout(Request $request)
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect()->route('login');
    }

    public function showForgot()
    {
        return view('auth.forgot-password');
    }

    public function forgot(Request $request)
    {
        $data = $request->validate([
            'email' => ['required', 'email', 'max:255'],
        ], [
            'email.email' => 'Please enter a valid email address.',
        ]);

        // Same reply whether or not the email exists, so the form can't be used to discover accounts.
        $user = User::where('email', $data['email'])->first();

        if ($user) {
            PasswordResetRequest::firstOrCreate(['user_id' => $user->id]);
        }

        return back()->with('sent', 'If that email belongs to an account, a reset request has been sent to the admin.');
    }
}