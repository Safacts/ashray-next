import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { buildReminderMessage, waReminderLink } from "@/lib/pg-engine";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const hostel_id = searchParams.get("hostel_id");
    const status = searchParams.get("status") ?? "overdue";

    if (!hostel_id) {
      return NextResponse.json({ error: "hostel_id required" }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    const { data: hostelData } = await supabase.from("hostels").select("name, upi_id").eq("id", hostel_id).single();
    const hostelName = (hostelData as { name?: string } | null)?.name ?? "Ashray Hostel";
    const upiId = (hostelData as { upi_id?: string | null } | null)?.upi_id ?? "";

    // fetch dues with joined student
    const { data: duesData, error: duesErr } = await supabase
      .from("dues")
      .select(`id, amount, status, month, student_id, students!inner ( id, name, full_name, phone, mobile_number )`)
      .eq("hostel_id", hostel_id)
      .eq("status", status);

    if (duesErr) throw duesErr;

    type Row = {
      id: string;
      amount: number;
      status: string;
      month: string;
      students: { id: string; name?: string; full_name?: string; phone?: string; mobile_number?: string } | null;
    };

    const rows = (duesData ?? []) as unknown as Row[];

    const result = rows.map((r) => {
      const stu = r.students;
      const studentName = stu?.name ?? stu?.full_name ?? "Student";
      const phone = stu?.phone ?? stu?.mobile_number ?? "";
      const message = buildReminderMessage(studentName, hostelName, Number(r.amount), upiId);
      const waLink = phone ? waReminderLink(phone, message) : "";
      return {
        student: studentName,
        phone,
        amount: Number(r.amount),
        waLink,
      };
    });

    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
