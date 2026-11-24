<?php

namespace App\Services;

use App\Models\Reservation;
use App\Models\Room;
use App\Models\User;
use App\Models\UserNotification;
use Carbon\Carbon;
use Illuminate\Support\Collection;

/**
 * All room-booking rules live here (they used to live in the browser's script.js).
 * Times are handled as "HH:MM" strings, dates as "YYYY-MM-DD".
 */
class ReservationService
{
    public const OPEN = '07:00';
    public const CLOSE = '21:00';

    /**
     * A pending request nobody reviewed is approved automatically after this
     * many minutes. Teachers have priority, so theirs is decided sooner than
     * the requests of staff and student leaders (the admin has more time to
     * review those).
     */
    public const AUTO_APPROVE_MINUTES = 15;
    public const AUTO_APPROVE_MINUTES_OTHERS = 30;

    public static function autoApproveMinutes(?string $role): int
    {
        return $role === 'teacher'
            ? self::AUTO_APPROVE_MINUTES
            : self::AUTO_APPROVE_MINUTES_OTHERS;
    }

    /** Bookings starting within this many minutes are approved immediately. */
    public const INSTANT_APPROVE_WITHIN_MINUTES = 30;

    public static function hm(?string $time): string
    {
        return substr((string) $time, 0, 5);
    }

    public static function toMinutes(string $hm): int
    {
        [$h, $m] = array_map('intval', explode(':', $hm));

        return $h * 60 + $m;
    }

    public static function isSunday(string $date): bool
    {
        return Carbon::parse($date)->dayOfWeek === Carbon::SUNDAY;
    }

    /**
     * The CLASS blocks of a room on a date (the colored blocks of the CCIS
     * schedule PDF). Class time is never reservable. Rooms with no classes
     * return an empty collection, so they are free all day.
     */
    public function classBlocks(Room $room, string $date): Collection
    {
        return $room->schedules()
            ->where('day_of_week', Carbon::parse($date)->dayOfWeek)
            ->get()
            ->map(fn ($s) => [
                'start' => self::hm($s->start_time),
                'end' => self::hm($s->end_time),
            ]);
    }

    /** True when any part of start-end falls inside a class of that room. */
    public function overlapsClass(
        Room $room,
        string $date,
        string $start,
        string $end
    ): bool {
        return $this->classBlocks($room, $date)->contains(
            fn ($b) => $start < $b['end'] && $end > $b['start']
        );
    }

    public function hasConflict(
        int $roomId,
        string $date,
        string $start,
        string $end,
        ?int $ignoreId = null
    ): bool {
        return Reservation::where('room_id', $roomId)
            ->whereDate('date', $date)
            ->whereIn('status', ['pending', 'approved'])
            ->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))
            ->where('start_time', '<', $end . ':00')
            ->where('end_time', '>', $start . ':00')
            ->exists();
    }

    public function startsSoon(string $date, string $start): bool
    {
        $startsAt = Carbon::parse("$date $start");

        return now()->diffInMinutes($startsAt, false)
            <= self::INSTANT_APPROVE_WITHIN_MINUTES;
    }

    /** True once the reservation's start time has arrived (it can no longer be cancelled). */
    public function hasStarted(string $date, string $start): bool
    {
        return now()->gte(Carbon::parse("$date $start"));
    }

    public function isPastTimeToday(string $date, string $start): bool
    {
        return $date === now()->toDateString()
            && $start < now()->format('H:i');
    }

    /**
     * Validates a new reservation request against every rule.
     * Returns an error message, or null when the request is valid.
     */
    public function validateSlot(
        Room $room,
        string $date,
        string $start,
        string $end
    ): ?string {
        if ($start >= $end) {
            return 'End time must be after start time.';
        }

        if (
            self::toMinutes($start) % 30 !== 0
            || self::toMinutes($end) % 30 !== 0
        ) {
            return 'Please choose times on the 30-minute schedule.';
        }

        if ($start < self::OPEN || $end > self::CLOSE) {
            return 'Rooms can only be booked between 7:00 AM and 9:00 PM.';
        }

        if ($date < now()->toDateString()) {
            return 'You cannot select a past date.';
        }

        if ($this->isPastTimeToday($date, $start)) {
            return 'That start time has already passed today.';
        }

        if (self::isSunday($date)) {
            return 'Sunday is unavailable. Please pick a date from Monday to Saturday.';
        }

        if ($this->overlapsClass($room, $date, $start, $end)) {
            return 'That time overlaps a scheduled class in this room. Please pick a free time.';
        }

        return null;
    }

    public function summary(Reservation $r): string
    {
        $r->loadMissing('room');

        $date = Carbon::parse($r->date)->format('D, M j, Y');

        return ($r->room?->name ?? 'the room') . " on $date, " .
            Carbon::parse($r->startHm())->format('g:i A') . ' - ' .
            Carbon::parse($r->endHm())->format('g:i A');
    }

    public function notify(
        int $userId,
        string $type,
        string $message,
        ?int $reservationId = null
    ): void {
        UserNotification::create([
            'user_id' => $userId,
            'type' => $type,
            'message' => $message,
            'reservation_id' => $reservationId,
        ]);
    }

    /**
     * The "automatic" half of the hybrid approval flow.
     * Called on every dashboard load and every minute by the scheduler.
     * Returns how many reservations were decided.
     */
    public function runAutoApprovals(): int
    {
        $count = 0;

        Reservation::with(['room', 'user'])
            ->where('status', 'pending')
            ->where(
                'created_at',
                '<=',
                now()->subMinutes(self::AUTO_APPROVE_MINUTES)
            )
            // Teachers first: they are decided before staff and students.
            ->get()
            ->sortBy(fn (Reservation $r) => $r->user?->role === 'teacher' ? 0 : 1)
            ->each(function (Reservation $r) use (&$count) {

                // Staff and student requests wait longer than a teacher's.
                $wait = self::autoApproveMinutes($r->user?->role);

                if ($r->created_at->gt(now()->subMinutes($wait))) {
                    return;
                }

                $endsAt = Carbon::parse(
                    $r->date->toDateString() . ' ' . $r->endHm()
                );

                // 1. Reject reservations whose booking time has already ended.
                if (now()->gte($endsAt)) {
                    $r->update([
                        'status' => 'rejected',
                        'decided_at' => now(),
                        'reject_reason' => 'The reservation time has passed.',
                    ]);

                    $this->notify(
                        $r->user_id,
                        'rejected',
                        'Your reservation for ' . $this->summary($r) . ' has expired.',
                        $r->id
                    );

                // 2. Reject reservations if another pending or approved
                // reservation now conflicts with the same room and time.
                } elseif ($this->hasConflict(
                    $r->room_id,
                    $r->date->toDateString(),
                    $r->startHm(),
                    $r->endHm(),
                    $r->id
                )) {
                    $r->update([
                        'status' => 'rejected',
                        'decided_at' => now(),
                        'reject_reason' => 'The room is no longer available for this time slot.',
                    ]);

                    $this->notify(
                        $r->user_id,
                        'rejected',
                        'Your reservation for ' . $this->summary($r) .
                        ' could not be approved because the room is no longer available.',
                        $r->id
                    );

                // 3. Approve only if the reservation has not expired
                // and there are no conflicting reservations.
                } else {
                    $r->update([
                        'status' => 'approved',
                        'auto_approved' => true,
                        'decided_at' => now(),
                    ]);

                    $this->notify(
                        $r->user_id,
                        'approved',
                        'Your reservation for ' . $this->summary($r) . ' was approved.',
                        $r->id
                    );
                }

                $count++;
            });

        return $count;
    }
}
