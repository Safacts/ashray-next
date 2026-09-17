import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { generateMonthlyDues } from "@/lib/pg-engine";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const hostel_id = body.hostel_id as string | undefined;
    const month = body.month as string | undefined;

    if (!hostel_id || !month) {
      return NextResponse.json({ error: "hostel_id and month required" }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    const { data: hostelData, error: hostelErr } = await supabase.from("hostels").select("default_fee").eq("id", hostel_id).single();
    if (hostelErr || !hostelData) {
      return NextResponse.json({ error: "Hostel not found" }, { status: 404 });
    }
    const hostelFee = (hostelData as { default_fee: number | null }).default_fee ?? 3000;

    const { data: studentsData, error: stuErr } = await supabase.from("students").select("id, hostel_id, monthly_fee, status").eq("hostel_id", hostel_id);
    if (stuErr) throw stuErr;
    const allStudents = (studentsData ?? []) as { id: string; hostel_id: string; monthly_fee: number | null; status: string | null }[];
    const activeStudents = allStudents.filter((s) => (s.status ?? "active") === "active");

    const monthNorm = month.slice(0, 7);

    const { data: existingDues } = await supabase.from("dues").select("student_id, month").eq("hostel_id", hostel_id).eq("month", monthNorm);
    const existingSet = new Set(((existingDues ?? []) as { student_id: string; month: string }[]).map((d) => d.student_id));

    const candidates = activeStudents.filter((s) => !existingSet.has(s.id));

    const dueRows = generateMonthlyDues(
      candidates.map((c) => ({ id: c.id, hostel_id: c.hostel_id, monthly_fee: c.monthly_fee, status: c.status })),
      monthNorm,
      hostelFee
    );

    let created = 0;
    if (dueRows.length > 0) {
      const { error: insertErr } = await supabase.from("dues").insert(dueRows);
      if (insertErr) throw insertErr;
      created = dueRows.length;
    }

    const skipped = existingSet.size;
    return NextResponse.json({ created, skipped });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
