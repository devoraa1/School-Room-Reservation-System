<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Reservation;
use App\Models\Room;
use App\Models\User;
use App\Services\ReservationService;
use Carbon\Carbon;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ReservationController extends Controller
{
    public const MAX_REPEAT_WEEKS = 4;

    public function __construct(private ReservationService $service)
    {
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'room_id' => ['required', 'exists:rooms,id'],
            'date' => ['required', 'date_format:Y-m-d'],
            'start' => ['required', 'date_format:H:i'],
            'end' => ['required', 'date_format:H:i'],
            'purpose' => ['required', 'string', 'max:255'],
            'user_id' => ['nullable', 'exists:users,id'],
            'repeat_weeks' => ['nullable', 'integer', 'min:1', 'max:' . self::MAX_REPEAT_WEEKS],
            'skip_conflicts' => ['nullable', 'boolean'],
        ]);

        $weeks = (int) ($data['repeat_weeks'] ?? 1);
        $skipConflicts = $request->boolean('skip_conflicts');

        $me = $request->user();
        $isAdminBooking = $me->isAdmin();
        $owner = $me;

        if ($isAdminBooking) {
            $owner = User::where('id', $data['user_id'] ?? 0)
                ->where('role', '!=', 'admin')
                ->where('status', '!=', 'blocked')
                ->first();

            abort_unless($owner, 422, 'Please choose the user this reservation is for.');
        }

        try {
            [$created, $conflicts] = Cache::lock('room-booking:' . $data['room_id'], 10)
                ->block(5, function () use ($data, $weeks, $skipConflicts, $me, $owner, $isAdminBooking) {
                    return DB::transaction(function () use ($data, $weeks, $skipConflicts, $me, $owner, $isAdminBooking) {
                        $room = Room::lockForUpdate()->findOrFail($data['room_id']);

                        $validDates = [];
                        $conflicts = [];

                        for ($i = 0; $i < $weeks; $i++) {
                            $date = Carbon::parse($data['date'])->addWeeks($i)->toDateString();

                            $error = $this->service->validateSlot($room, $date, $data['start'], $data['end']);

                            if (! $error && $this->service->hasConflict($room->id, $date, $data['start'], $data['end'])) {
                                $error = 'Someone else already booked this room at that time.';
                            }

                            if ($error) {
                                $conflicts[] = ['date' => $date, 'reason' => $error];
                            } else {
                                $validDates[] = $date;
                            }
                        }

                        if ($weeks === 1 && $conflicts) {
                            abort(422, $conflicts[0]['reason']);
                        }

                        if (! $validDates) {
                            abort(422, 'None of the ' . $weeks . ' weekly dates are available. ' . $conflicts[0]['reason']);
                        }

                        if ($conflicts && ! $skipConflicts) {
                            throw new HttpResponseException(response()->json([
                                'message' => count($conflicts) . ' of ' . $weeks . ' weekly dates are not available.',
                                'conflicts' => $conflicts,
                            ], 422));
                        }

                        $seriesId = $weeks > 1 ? (string) Str::uuid() : null;
                        $created = collect();

                        foreach ($validDates as $date) {
                            $autoApproved = ! $isAdminBooking && $this->service->startsSoon($date, $data['start']);
                            $approved = $isAdminBooking || $autoApproved;

                            $reservation = Reservation::create([
                                'user_id' => $owner->id,
                                'room_id' => $room->id,
                                'date' => $date,
                                'start_time' => $data['start'] . ':00',
                                'end_time' => $data['end'] . ':00',
                                'purpose' => trim($data['purpose']),
                                'series_id' => $seriesId,
                                'status' => $approved ? 'approved' : 'pending',
                                'auto_approved' => $autoApproved,
                                'reserved_by_admin_id' => $isAdminBooking ? $me->id : null,
                                'decided_at' => $approved ? now() : null,
                            ]);

                            if ($autoApproved) {
                                $this->service->notify($owner->id, 'approved',
                                    'Your reservation for ' . $this->service->summary($reservation) . ' was approved.', $reservation->id);
                            }

                            $created->push($reservation);
                        }

                        $pending = $created->where('status', 'pending')->values();

                        if ($pending->isNotEmpty()) {
                            $what = $pending->count() > 1
                                ? $this->seriesSummary($pending)
                                : $this->service->summary($pending->first());

                            User::where('role', 'admin')->pluck('id')->each(fn ($adminId) => $this->service->notify(
                                $adminId, 'pending',
                                ($owner->role === 'teacher' ? 'Priority (teacher): ' : '') .
                                $owner->name . ' requested ' . $what . '.',
                                $pending->first()->id
                            ));
                        }

                        if ($isAdminBooking) {
                            $this->service->notify($owner->id, 'approved',
                                'The admin reserved ' . ($created->count() > 1
                                    ? $this->seriesSummary($created)
                                    : $this->service->summary($created->first())) . ' for you. It is approved.',
                                $created->first()->id);
                        }

                        return [$created, $conflicts];
                    });
                });
        } catch (LockTimeoutException) {
            abort(503, 'This room is being booked by someone else right now. Please try again in a moment.');
        } catch (UniqueConstraintViolationException) {
            abort(422, 'Someone else already booked this room at that time.');
        }

        $count = $created->count();
        $label = $weeks > 1
            ? $count . ($count === 1 ? ' reservation' : ' weekly reservations')
            : 'Reservation';

        $skippedNote = $conflicts
            ? ' Skipped: ' . collect($conflicts)->map(fn ($c) => Carbon::parse($c['date'])->format('D, M j'))->implode(', ') . '.'
            : '';

        $message = $isAdminBooking
            ? '✅ ' . $label . ' made for ' . e($owner->name) . '.'
            : '✅ ' . $label . ' submitted.';

        return response()->json([
            'message' => $message . $skippedNote,
            'id' => $created->first()->id,
            'created' => $count,
            'skipped' => $conflicts,
        ], 201);
    }

    public function approve(Request $request, Reservation $reservation)
    {
        abort_unless($reservation->status === 'pending', 422, 'Only pending reservations can be approved.');

        if ($request->boolean('series') && $reservation->series_id) {
            return $this->approveSeries($reservation);
        }

        abort_if(
            $this->service->hasConflict(
                $reservation->room_id, $reservation->date->toDateString(),
                $reservation->startHm(), $reservation->endHm(), $reservation->id
            ),
            422, 'This time conflicts with another reservation.'
        );

        $reservation->update(['status' => 'approved', 'decided_at' => now()]);

        $this->service->notify($reservation->user_id, 'approved',
            'Your reservation for ' . $this->service->summary($reservation) . ' was approved.', $reservation->id);

        return response()->json(['message' => 'Reservation approved! ' . e($reservation->user->name) . ' has been notified.']);
    }

    public function reject(Request $request, Reservation $reservation)
    {
        abort_unless($reservation->status === 'pending', 422, 'Only pending reservations can be rejected.');

        $reason = trim((string) $request->input('reason', ''));

        if ($request->boolean('series') && $reservation->series_id) {
            return $this->rejectSeries($reservation, $reason);
        }

        $reservation->update([
            'status' => 'rejected',
            'decided_at' => now(),
            'reject_reason' => $reason !== '' ? mb_substr($reason, 0, 255) : null,
        ]);

        $this->service->notify($reservation->user_id, 'rejected',
            'Your reservation for ' . $this->service->summary($reservation) . ' was rejected' .
            ($reason !== '' ? ": $reason" : '.'), $reservation->id);

        return response()->json(['message' => 'Reservation rejected. ' . e($reservation->user->name) . ' has been notified.']);
    }

    public function cancel(Request $request, Reservation $reservation)
    {
        $me = $request->user();

        abort_unless($me->isAdmin() || $reservation->user_id === $me->id, 403, 'You can only cancel your own reservation.');
        abort_unless(in_array($reservation->status, ['pending', 'approved']), 422, 'This reservation can no longer be cancelled.');

        abort_if(
            $this->service->hasStarted($reservation->date->toDateString(), $reservation->startHm()),
            422, "This reservation has already started, so it can't be cancelled."
        );

        if ($request->boolean('series') && $reservation->series_id) {
            return $this->cancelSeries($me, $reservation);
        }

        $reservation->update(['status' => 'cancelled']);

        if ($me->isAdmin() && $reservation->user_id !== $me->id) {
            $this->service->notify($reservation->user_id, 'cancelled',
                'The admin cancelled your reservation for ' . $this->service->summary($reservation) . '.', $reservation->id);
        }

        return response()->json(['message' => 'Reservation cancelled. The room is available again.']);
    }

    private function approveSeries(Reservation $reservation)
    {
        $approved = collect();
        $blocked = 0;

        foreach ($this->pendingInSeries($reservation) as $item) {
            if ($this->service->hasConflict(
                $item->room_id, $item->date->toDateString(), $item->startHm(), $item->endHm(), $item->id
            )) {
                $blocked++;

                continue;
            }

            $item->update(['status' => 'approved', 'decided_at' => now()]);
            $approved->push($item);
        }

        abort_if($approved->isEmpty(), 422, 'None of the pending dates in this series could be approved.');

        $this->service->notify($reservation->user_id, 'approved',
            'Your reservation for ' . $this->seriesSummary($approved) . ' was approved.', $approved->first()->id);

        return response()->json([
            'message' => $approved->count() . ' weekly reservations approved! ' . e($reservation->user->name) . ' has been notified.' .
                ($blocked ? " $blocked could not be approved because of a conflict." : ''),
        ]);
    }

    private function rejectSeries(Reservation $reservation, string $reason)
    {
        $items = $this->pendingInSeries($reservation);

        foreach ($items as $item) {
            $item->update([
                'status' => 'rejected',
                'decided_at' => now(),
                'reject_reason' => $reason !== '' ? mb_substr($reason, 0, 255) : null,
            ]);
        }

        $this->service->notify($reservation->user_id, 'rejected',
            'Your reservation for ' . $this->seriesSummary($items) . ' was rejected' .
            ($reason !== '' ? ": $reason" : '.'), $items->first()->id);

        return response()->json([
            'message' => $items->count() . ' weekly reservations rejected. ' . e($reservation->user->name) . ' has been notified.',
        ]);
    }

    private function cancelSeries(User $me, Reservation $reservation)
    {
        $items = Reservation::with('room')
            ->where('series_id', $reservation->series_id)
            ->whereIn('status', ['pending', 'approved'])
            ->orderBy('date')->orderBy('start_time')
            ->get()
            ->reject(fn (Reservation $r) => $this->service->hasStarted($r->date->toDateString(), $r->startHm()))
            ->values();

        abort_if($items->isEmpty(), 422, 'There are no upcoming reservations left in this series.');

        foreach ($items as $item) {
            $item->update(['status' => 'cancelled']);
        }

        if ($me->isAdmin() && $reservation->user_id !== $me->id) {
            $this->service->notify($reservation->user_id, 'cancelled',
                'The admin cancelled your reservation for ' . $this->seriesSummary($items) . '.', $items->first()->id);
        }

        return response()->json([
            'message' => $items->count() . ' weekly reservations cancelled. The room is available again for those dates.',
        ]);
    }

    private function pendingInSeries(Reservation $reservation): Collection
    {
        return Reservation::with(['room', 'user'])
            ->where('series_id', $reservation->series_id)
            ->where('status', 'pending')
            ->orderBy('date')->orderBy('start_time')
            ->get();
    }

    private function seriesSummary(Collection $items): string
    {
        $first = $items->first();
        $last = $items->last();
        $first->loadMissing('room');

        $time = Carbon::parse($first->startHm())->format('g:i A') . ' - ' . Carbon::parse($first->endHm())->format('g:i A');

        return ($first->room?->name ?? 'the room') . ' every ' . $first->date->format('l') . ', ' . $time .
            ' (' . $items->count() . ' dates, ' . $first->date->format('M j') . ' to ' . $last->date->format('M j, Y') . ')';
    }
}