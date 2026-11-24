<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Each class block of the CCIS schedule PDF shows its course & section
        // (e.g. "BSIT 2-E") and its instructor. The subject name is not stored.
        Schema::table('room_schedules', function (Blueprint $table) {
            $table->string('course_section')->nullable()->after('end_time');
            $table->string('instructor')->nullable()->after('course_section');
        });
    }

    public function down(): void
    {
        Schema::table('room_schedules', function (Blueprint $table) {
            $table->dropColumn(['course_section', 'instructor']);
        });
    }
};
