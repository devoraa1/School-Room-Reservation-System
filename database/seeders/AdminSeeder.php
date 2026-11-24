<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

class AdminSeeder extends Seeder
{
    /**
     * The one real account the system needs: the administrator.
     * Every other account is created by this admin from "Manage Users".
     * CHANGE THE PASSWORD after first login (Profile -> New Password).
     */
    public function run(): void
    {
        if (User::where('email', 'admin@gmail.com')->exists()) {
            return;
        }

        $admin = new User([
            'name' => 'System Administrator',
            'password' => 'admin123', // hashed automatically by the model cast
            'email' => 'admin@gmail.com',
        ]);

        $admin->forceFill(['role' => 'admin', 'status' => 'approved', 'must_change_password' => false])->save();
    }
}
