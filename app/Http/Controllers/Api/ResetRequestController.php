<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PasswordResetRequest;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rules\Password;

/** Admin only (see routes/web.php). */
class ResetRequestController extends Controller
{
    public function resolve(Request $request, PasswordResetRequest $resetRequest)
    {
        $data = $request->validate(['password' => ['required', 'string', Password::min(8)->letters()->numbers()]], [
            'password' => 'Password must be at least 8 characters with letters and numbers.',
        ]);

        // Like a fresh admin-created account: the user must pick their own password at next login.
        $user = $resetRequest->user;
        $user->password = $data['password'];
        $user->forceFill(['must_change_password' => true])->save();
        DB::table('sessions')->where('user_id', $user->id)->delete(); // end any old sessions
        $resetRequest->delete();

        return response()->json(['message' => 'Password reset. Let the user know their new temporary password.']);
    }

    public function dismiss(PasswordResetRequest $resetRequest)
    {
        $resetRequest->delete();

        return response()->json(['message' => 'Reset request dismissed.']);
    }
}
