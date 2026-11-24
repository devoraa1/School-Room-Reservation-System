<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // One row per 30-minute slot held by a pending/approved reservation.
        // The UNIQUE key lets the DATABASE refuse a double booking, no matter
        // which code path (or race) tried to create it.
        Schema::create('reservation_slots', function (Blueprint $table) {
            $table->id();
            $table->foreignId('reservation_id')->constrained()->cascadeOnDelete();
            $table->foreignId('room_id')->constrained()->cascadeOnDelete();
            $table->date('date');
            $table->time('slot_start');
            $table->unique(['room_id', 'date', 'slot_start']);
        });

        // Backfill existing active reservations. insertOrIgnore: if old data
        // already contains an overlap, keep the migration from failing.
        DB::table('reservations')
            ->whereIn('status', ['pending', 'approved'])
            ->orderBy('id')
            ->each(function ($r) {
                $date = substr((string) $r->date, 0, 10);
                $start = $this->minutes($r->start_time);
                $end = $this->minutes($r->end_time);

                for ($m = $start; $m < $end; $m += 30) {
                    DB::table('reservation_slots')->insertOrIgnore([
                        'reservation_id' => $r->id,
                        'room_id' => $r->room_id,
                        'date' => $date,
                        'slot_start' => sprintf('%02d:%02d:00', intdiv($m, 60), $m % 60),
                    ]);
                }
            });
    }

    public function down(): void
    {
        Schema::dropIfExists('reservation_slots');
    }

    private function minutes(string $time): int
    {
        return (int) substr($time, 0, 2) * 60 + (int) substr($time, 3, 2);
    }
};
