<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

class ProfileController extends Controller
{
    /** Change own email and/or password (needs the current password). */
    public function update(Request $request)
    {
        $user = $request->user();

        $data = $request->validate([
            'email' => ['nullable', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'new_password' => ['nullable', 'string', Password::min(8)->letters()->numbers(), 'confirmed'],
            'current_password' => ['required', 'string'],
        ], [
            'email.email' => 'Please enter a valid email address.',
            'email.unique' => 'That email is already used by another account.',
            'new_password' => 'New password must be at least 8 characters with letters and numbers.',
            'new_password.confirmed' => 'New passwords do not match.',
            'current_password.required' => 'Enter your current password to save these changes.',
        ]);

        $emailChanged = ! empty($data['email']) && $data['email'] !== $user->email;
        $passwordChanged = ! empty($data['new_password']);

        abort_unless($emailChanged || $passwordChanged, 422, 'No changes to save.');
        abort_unless(Hash::check($data['current_password'], $user->password), 422, 'Current password is incorrect.');

        if ($emailChanged) {
            $user->email = $data['email'];
        }

        if ($passwordChanged) {
            $user->password = $data['new_password'];
            $user->forceFill(['must_change_password' => false]);
        }

        $user->save();

        return response()->json([
            'message' => match (true) {
                $emailChanged && $passwordChanged => 'Email and password updated.',
                $emailChanged => 'Email updated. Use it the next time you log in.',
                default => 'Password updated.',
            },
        ]);
    }

    /** Blocking "choose your own password" step for admin-set passwords. */
    public function forcePassword(Request $request)
    {
        $data = $request->validate(['new_password' => ['required', 'string', Password::min(8)->letters()->numbers(), 'confirmed']], [
            'new_password' => 'New password must be at least 8 characters with letters and numbers.',
            'new_password.confirmed' => 'New passwords do not match.',
        ]);

        $user = $request->user();
        $user->password = $data['new_password'];
        $user->forceFill(['must_change_password' => false])->save();

        return response()->json(['message' => "Password updated. You're all set."]);
    }

    /** The browser sends a small, already-resized JPEG data URL. */
    public function photo(Request $request)
    {
        $request->validate(['photo' => ['required', 'string', 'max:400000']]);

        abort_unless(
            preg_match('#^data:image/(jpeg|png|webp);base64,(.+)$#', $request->photo, $m) === 1,
            422, 'Could not process that image. Please try a different photo.'
        );

        $binary = base64_decode($m[2], true);
        $info = $binary === false || strlen($binary) > 300000 ? false : @getimagesizefromstring($binary);

        // Check the bytes really are a small image (not just a data-URL header that says so).
        abort_unless(
            $info && in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP], true)
                && $info[0] <= 1000 && $info[1] <= 1000,
            422, 'Could not process that image. Please try a different photo.'
        );

        $user = $request->user();

        if ($user->photo) {
            Storage::disk('public')->delete($user->photo);
        }

        $path = 'avatars/' . Str::uuid() . '.' . ($m[1] === 'jpeg' ? 'jpg' : $m[1]);
        Storage::disk('public')->put($path, $binary);

        $user->update(['photo' => $path]);

        return response()->json(['message' => 'Profile photo updated.', 'photo' => $user->photoUrl()]);
    }
}