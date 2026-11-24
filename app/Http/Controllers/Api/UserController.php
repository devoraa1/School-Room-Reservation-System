<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\Rule;

/** Admin only (see routes/web.php). */
class UserController extends Controller
{
    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255', 'regex:/^[^<>]*$/'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', Password::min(8)->letters()->numbers()],
            'role' => ['required', Rule::in(User::CREATABLE_ROLES)],
        ], [
            'email.email' => 'Please enter a valid email address.',
            'email.unique' => 'An account with that email already exists.',
            'password' => 'Password must be at least 8 characters with letters and numbers.',
        ]);

        $user = new User(['name' => $data['name'], 'email' => $data['email'], 'password' => $data['password']]);
        $user->forceFill(['role' => $data['role'], 'status' => 'approved', 'must_change_password' => true])->save();

        return response()->json([
            'message' => 'Account created for ' . e($data['name']) . '. Give them the email and temporary password.',
        ], 201);
    }

    /** Change a user's role and/or block / reactivate them. */
    public function update(Request $request, User $user)
    {
        abort_if($user->isAdmin(), 403, 'The administrator account cannot be changed here.');

        $data = $request->validate([
            'role' => ['sometimes', Rule::in(User::CREATABLE_ROLES)],
            'status' => ['sometimes', Rule::in(['approved', 'blocked'])],
        ]);

        $user->forceFill($data)->save();

        if (($data['status'] ?? null) === 'blocked') {
            DB::table('sessions')->where('user_id', $user->id)->delete(); // kick them out now
        }

        $message = match (true) {
            ($data['status'] ?? null) === 'blocked' => e($user->name) . ' has been blocked.',
            ($data['status'] ?? null) === 'approved' => e($user->name) . ' has been reactivated.',
            default => e($user->name) . "'s role was updated.",
        };

        return response()->json(['message' => $message]);
    }

    public function destroy(User $user)
    {
        abort_if($user->isAdmin(), 403, 'The administrator account cannot be removed.');

        $user->delete(); // reservations, notifications and reset requests cascade

        return response()->json(['message' => 'User account removed.']);
    }
}