<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class EnsureNotBlocked
{
    /** A blocked user is signed out on their very next request. */
    public function handle(Request $request, Closure $next)
    {
        $user = $request->user();

        if ($user && $user->isBlocked()) {
            Auth::logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            if ($request->expectsJson()) {
                abort(403, 'Your account has been blocked by the admin.');
            }

            return redirect()->route('login')->withErrors([
                'email' => 'Your account has been blocked by the admin. Please contact the admin office.',
            ]);
        }

        return $next($request);
    }
}
