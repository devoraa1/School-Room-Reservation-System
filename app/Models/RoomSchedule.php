<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RoomSchedule extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'room_id', 'day_of_week', 'start_time', 'end_time', 'course_section', 'instructor',
    ];

    public function room(): BelongsTo
    {
        return $this->belongsTo(Room::class);
    }
}
