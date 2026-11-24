<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

/**
 * Enforces the "choose your own password" step on the SERVER. Without this the
 * popup could be bypassed by calling the API directly.
 */
class EnsurePasswordChanged
{
    public function handle(Request $request, Closure $next)
    {
        $user = $request->user();

        if ($user && $user->must_change_password
            && ! $request->routeIs('api.state', 'api.force-password', 'logout', 'dashboard')) {
            abort(403, 'Please set your own password first.');
        }

        return $next($request);
    }
}
