<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\DB;

class Reservation extends Model
{
    protected $fillable = [
        'user_id', 'room_id', 'date', 'start_time', 'end_time', 'purpose', 'series_id', 'status',
        'auto_approved', 'reserved_by_admin_id', 'reject_reason', 'decided_at',
    ];

    /**
     * Keeps the reservation_slots table (the database-level double-booking
     * guard) in step with this reservation: active (pending/approved)
     * reservations hold their 30-minute slots, anything else frees them.
     * Approving a pending reservation changes nothing here, so the slots are
     * never released and re-taken (which could let someone slip in between).
     */
    protected static function booted(): void
    {
        static::saved(function (Reservation $r) {
            $active = in_array($r->status, ['pending', 'approved'], true);

            if (! $active) {
                DB::table('reservation_slots')->where('reservation_id', $r->id)->delete();

                return;
            }

            $moved = $r->wasRecentlyCreated
                || $r->wasChanged(['room_id', 'date', 'start_time', 'end_time']);

            if (! $moved) {
                return;
            }

            DB::table('reservation_slots')->where('reservation_id', $r->id)->delete();

            $date = $r->date->toDateString();
            $start = self::minutesOf($r->startHm());
            $end = self::minutesOf($r->endHm());
            $rows = [];

            for ($m = $start; $m < $end; $m += 30) {
                $rows[] = [
                    'reservation_id' => $r->id,
                    'room_id' => $r->room_id,
                    'date' => $date,
                    'slot_start' => sprintf('%02d:%02d:00', intdiv($m, 60), $m % 60),
                ];
            }

            // A UNIQUE violation here means another booking already holds one
            // of these slots: the exception rolls the whole request back.
            DB::table('reservation_slots')->insert($rows);
        });
    }

    private static function minutesOf(string $hm): int
    {
        return (int) substr($hm, 0, 2) * 60 + (int) substr($hm, 3, 2);
    }

    protected function casts(): array
    {
        return [
            'date' => 'date:Y-m-d',
            'auto_approved' => 'boolean',
            'decided_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function room(): BelongsTo
    {
        return $this->belongsTo(Room::class);
    }

    public function reservedByAdmin(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reserved_by_admin_id');
    }

    /** "HH:MM" for the start time (DB stores HH:MM:SS). */
    public function startHm(): string
    {
        return substr($this->start_time, 0, 5);
    }

    public function endHm(): string
    {
        return substr($this->end_time, 0, 5);
    }
}