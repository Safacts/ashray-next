import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const hostel_id = searchParams.get("hostel_id");
    if (!hostel_id) return NextResponse.json({ error: "hostel_id required" }, { status: 400 });

    const supabase = createServerSupabaseClient();
    const { data: rooms, error: roomErr } = await supabase
      .from("rooms")
      .select("*")
      .eq("hostel_id", hostel_id)
      .order("room_no", { ascending: true });
    if (roomErr) throw roomErr;

    const roomIds = (rooms ?? []).map((r: { id: string }) => r.id);
    let beds: unknown[] = [];
    if (roomIds.length > 0) {
      const { data: bedsData, error: bedsErr } = await supabase.from("beds").select("*").in("room_id", roomIds);
      if (bedsErr) throw bedsErr;
      beds = bedsData ?? [];
    }

    // Attach beds to rooms for convenience
    const bedsByRoom = new Map<string, unknown[]>();
    for (const b of beds as { room_id: string }[]) {
      const arr = bedsByRoom.get(b.room_id) ?? [];
      arr.push(b);
      bedsByRoom.set(b.room_id, arr);
    }

    const roomsWithBeds = (rooms ?? []).map((r: { id: string }) => ({
      ...r,
      beds: bedsByRoom.get(r.id) ?? [],
    }));

    return NextResponse.json({ rooms: roomsWithBeds, beds });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const hostel_id = body.hostel_id as string | undefined;
    const floor = (body.floor as string | undefined) ?? "Ground";
    const room_no = body.room_no as string | undefined;
    const sharing_type = Number(body.sharing_type);
    const rent = Number(body.rent);

    if (!hostel_id || !room_no || !sharing_type || isNaN(sharing_type) || sharing_type < 1 || sharing_type > 6) {
      return NextResponse.json({ error: "hostel_id, room_no, sharing_type (1-6) required" }, { status: 400 });
    }
    if (isNaN(rent) || rent < 0) return NextResponse.json({ error: "rent must be >=0" }, { status: 400 });

    const supabase = createServerSupabaseClient();

    const { data: room, error: roomErr } = await supabase
      .from("rooms")
      .insert([{ hostel_id, floor, room_no: String(room_no).trim(), sharing_type, rent, status: "vacant" }])
      .select()
      .single();
    if (roomErr) throw roomErr;

    const roomId = (room as { id: string }).id;
    // Auto-create N beds: A,B,C...
    const letters = ["A", "B", "C", "D", "E", "F"];
    const bedsToInsert = letters.slice(0, sharing_type).map((bed_no) => ({
      room_id: roomId,
      bed_no,
      status: "vacant",
      student_id: null,
    }));

    const { data: beds, error: bedsErr } = await supabase.from("beds").insert(bedsToInsert).select();
    if (bedsErr) {
      // rollback room if beds failed?
      await supabase.from("rooms").delete().eq("id", roomId);
      throw bedsErr;
    }

    return NextResponse.json({ room, beds }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
