import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const hostel_id = searchParams.get("hostel_id");
    const status = searchParams.get("status");

    const supabase = createServerSupabaseClient();
    let q = supabase.from("complaints").select("*, students(id, name, phone)").order("created_at", { ascending: false });
    if (hostel_id) q = q.eq("hostel_id", hostel_id);
    if (status && status !== "all") q = q.eq("status", status);

    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const hostel_id = body.hostel_id as string | undefined;
    const student_id = body.student_id as string | undefined;
    const category = (body.category as string | undefined)?.trim() ?? "General";
    const description = (body.description as string | undefined)?.trim();

    if (!description) return NextResponse.json({ error: "description required" }, { status: 400 });

    const supabase = createServerSupabaseClient();
    const payload: Record<string, unknown> = {
      category,
      description,
      status: "open",
    };
    if (hostel_id) payload.hostel_id = hostel_id;
    if (student_id) payload.student_id = student_id;

    const { data, error } = await supabase.from("complaints").insert([payload]).select().single();
    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const id = body.id as string | number | undefined;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const updates: Record<string, unknown> = {};
    if (body.status) updates.status = body.status;
    if (body.assigned_to !== undefined) updates.assigned_to = body.assigned_to;
    if (Object.keys(updates).length === 0) return NextResponse.json({ error: "no updates" }, { status: 400 });

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.from("complaints").update(updates).eq("id", id).select().single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
