<?php

namespace App\Console\Commands;

use App\Services\ReservationService;
use Illuminate\Console\Command;

class AutoApproveReservations extends Command
{
    protected $signature = 'reservations:auto-approve';

    protected $description = 'Approve pending reservations that the admin did not review in time.';

    public function handle(ReservationService $service): int
    {
        $this->info($service->runAutoApprovals() . ' reservation(s) decided.');

        return self::SUCCESS;
    }
}
