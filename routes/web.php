<?php

use App\Http\Controllers\Api;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\PageController;
use Illuminate\Support\Facades\Route;

// ---------- Public ----------
Route::get('/', [PageController::class, 'home'])->name('home');

Route::middleware('guest')->group(function () {
    Route::get('/login', [AuthController::class, 'showLogin'])->name('login');
    Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:10,1')->name('login.attempt');
    Route::get('/forgot-password', [AuthController::class, 'showForgot'])->name('password.request');
    Route::post('/forgot-password', [AuthController::class, 'forgot'])->middleware('throttle:5,1')->name('password.email');
});

// ---------- Signed-in ----------
Route::middleware(['auth', 'not.blocked', 'password.changed'])->group(function () {
    Route::post('/logout', [AuthController::class, 'logout'])->name('logout');
    Route::get('/dashboard', [DashboardController::class, 'index'])->name('dashboard');

    // JSON endpoints used by public/js/dashboard.js
    Route::prefix('api')->name('api.')->group(function () {
        Route::get('/state', Api\StateController::class)->name('state');

        Route::post('/reservations', [Api\ReservationController::class, 'store']);
        Route::post('/reservations/{reservation}/cancel', [Api\ReservationController::class, 'cancel']);

        Route::post('/notifications/read', [Api\NotificationController::class, 'markAllRead']);
        Route::delete('/notifications', [Api\NotificationController::class, 'clear']);

        Route::put('/profile', [Api\ProfileController::class, 'update']);
        Route::post('/profile/photo', [Api\ProfileController::class, 'photo']);
        Route::post('/profile/force-password', [Api\ProfileController::class, 'forcePassword'])->name('force-password');

        // Administrator only
        Route::middleware('admin')->group(function () {
            Route::post('/reservations/{reservation}/approve', [Api\ReservationController::class, 'approve']);
            Route::post('/reservations/{reservation}/reject', [Api\ReservationController::class, 'reject']);

            Route::post('/rooms', [Api\RoomController::class, 'store']);
            Route::put('/rooms/{room}', [Api\RoomController::class, 'update']);
            Route::delete('/rooms/{room}', [Api\RoomController::class, 'destroy']);

            Route::post('/users', [Api\UserController::class, 'store']);
            Route::patch('/users/{user}', [Api\UserController::class, 'update']);
            Route::delete('/users/{user}', [Api\UserController::class, 'destroy']);

            Route::post('/reset-requests/{resetRequest}/resolve', [Api\ResetRequestController::class, 'resolve']);
            Route::delete('/reset-requests/{resetRequest}', [Api\ResetRequestController::class, 'dismiss']);
        });
    });
});
