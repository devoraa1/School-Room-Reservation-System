<?php

namespace Database\Seeders;

use App\Models\Room;
use Illuminate\Database\Seeder;

class RoomSeeder extends Seeder
{
    public function run(): void
    {
        $rooms = [];

        foreach (range(301, 309) as $n) {
            $rooms[] = [(string) $n, '3rd Floor, Main Building'];
        }

        foreach (range(1, 5) as $n) {
            $rooms[] = ["LAB $n", '2nd Floor, Main Building'];
        }

        $rooms[] = ['Multimedia Room', '2nd Floor, Main Building'];

        foreach (range(401, 408) as $n) {
            $rooms[] = [(string) $n, '4th Floor, Main Building'];
        }

        $rooms[] = ['LAB 3 Next Room', '2nd Floor, Main Building'];
        $rooms[] = ['CCI7', '2nd Floor, Main Building'];

        foreach ($rooms as [$name, $location]) {
            Room::firstOrCreate(['name' => $name], ['location' => $location]);
        }
    }
}
