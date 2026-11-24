<?php

use Illuminate\Support\Facades\Schedule;

// Approves pending reservations the admin did not review within 15 minutes.
Schedule::command('reservations:auto-approve')->everyMinute();
