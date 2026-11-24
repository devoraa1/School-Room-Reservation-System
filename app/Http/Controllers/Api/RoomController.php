<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Room;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Admin only (see routes/web.php). */
class RoomController extends Controller
{
    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100', 'unique:rooms,name'],
            'location' => ['nullable', 'string', 'max:255'],
        ], ['name.unique' => 'A room with that name already exists.']);

        Room::create($data);

        return response()->json(['message' => 'Room added successfully.'], 201);
    }

    public function update(Request $request, Room $room)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100', Rule::unique('rooms', 'name')->ignore($room->id)],
            'location' => ['nullable', 'string', 'max:255'],
        ], ['name.unique' => 'A room with that name already exists.']);

        $room->update($data);

        return response()->json(['message' => 'Room updated successfully.']);
    }

    public function destroy(Room $room)
    {
        // Its schedule blocks and reservations are removed with it (cascade).
        $room->delete();

        return response()->json(['message' => 'Room removed.']);
    }
}
