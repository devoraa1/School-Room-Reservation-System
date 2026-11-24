<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PasswordResetRequest;
use App\Models\Reservation;
use App\Models\Room;
use App\Models\RoomSchedule;
use App\Models\User;
use App\Models\UserNotification;
use App\Services\ReservationService;
use Illuminate\Http\Request;

/**
 * One call that gives the dashboard everything it needs to draw itself.
 * Ordinary users only receive full details of their OWN reservations; other
 * people's active reservations are sent as anonymous "busy" blocks so the
 * availability grid still works without leaking names or purposes.
 */
class StateController extends Controller
{
    public function __invoke(Request $request, ReservationService $service)
    {
        $user = $request->user();
        $service->runAutoApprovals();

        $schedule = RoomSchedule::orderBy('start_time')->get()
            ->groupBy('room_id')
            ->map(fn ($rows) => $rows->map(fn ($s) => [
                'day' => (int) $s->day_of_week,
                'start' => ReservationService::hm($s->start_time),
                'end' => ReservationService::hm($s->end_time),
                'section' => $s->course_section,
                'instructor' => $s->instructor,
            ])->values());

        $reservations = Reservation::with(['user', 'reservedByAdmin'])
            ->when(! $user->isAdmin(), function ($q) use ($user) {
                $q->where(fn ($w) => $w->where('user_id', $user->id)
                    ->orWhere(fn ($o) => $o->whereIn('status', ['pending', 'approved'])
                        ->whereDate('date', '>=', now()->toDateString())));
            })
            ->orderByDesc('date')->orderByDesc('start_time')
            ->get()
            ->map(function (Reservation $r) use ($user) {
                $mine = $user->isAdmin() || $r->user_id === $user->id;

                $row = [
                    'id' => $r->id,
                    'roomId' => $r->room_id,
                    'date' => $r->date->toDateString(),
                    'start' => $r->startHm(),
                    'end' => $r->endHm(),
                    'status' => $r->status,
                    'mine' => $mine,
                    // When the request was made (ms), so "Newest First" really means newest.
                    'createdAt' => $r->created_at?->getTimestampMs(),
                ];

                if ($mine) {
                    $row += [
                        'userId' => $r->user_id,
                        'name' => $r->user?->name,
                        'email' => $r->user?->email,
                        'role' => $r->user?->role,
                        'purpose' => $r->purpose,
                        'rejectReason' => $r->reject_reason,
                        'reservedByAdmin' => $r->reservedByAdmin?->name,
                        'autoApproved' => $r->auto_approved,
                        'seriesId' => $r->series_id,
                    ];
                }

                return $row;
            });

        $payload = [
            'me' => $this->presentUser($user) + ['mustChangePassword' => $user->must_change_password],
            'rooms' => Room::orderBy('id')->get(['id', 'name', 'location']),
            'schedule' => $schedule,
            'bookings' => $reservations,
            'notifications' => UserNotification::where('user_id', $user->id)
                ->latest()->limit(200)->get()
                ->map(fn ($n) => [
                    'id' => $n->id,
                    'type' => $n->type,
                    'message' => $n->message,
                    'createdAt' => $n->created_at->getTimestampMs(),
                    'read' => $n->read_at !== null,
                ]),
            'serverNow' => now()->toIso8601String(),
        ];

        if ($user->isAdmin()) {
            $payload['users'] = User::where('role', '!=', 'admin')->orderBy('name')->get()
                ->map(fn ($u) => $this->presentUser($u) + ['status' => $u->status]);

            $payload['resetRequests'] = PasswordResetRequest::with('user')->oldest()->get()
                ->map(fn ($r) => [
                    'id' => $r->id,
                    'userId' => $r->user_id,
                    'name' => $r->user->name,
                    'email' => $r->user->email,
                ]);
        }

        return response()->json($payload);
    }

    private function presentUser(User $u): array
    {
        return [
            'id' => $u->id,
            'name' => $u->name,
            'email' => $u->email,
            'role' => $u->role,
            'photo' => $u->photoUrl(),
        ];
    }
}