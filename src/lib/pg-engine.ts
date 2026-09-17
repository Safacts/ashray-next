// pure TS helpers — no JSX
export type PgStudent = {
  id: string;
  hostel_id: string;
  name?: string;
  phone?: string;
  monthly_fee?: number | null;
  status?: string | null;
  bed_id?: string | null;
};

export type DueRow = {
  hostel_id: string;
  student_id: string;
  month: string;
  amount: number;
  breakup?: unknown;
  due_date: string;
  status: string;
  late_fee?: number;
};

export type Due = {
  id?: string;
  amount: number;
  status: string;
  due_date?: string;
  late_fee?: number;
  [k: string]: unknown;
};

export type Room = {
  id: string;
  hostel_id?: string;
  floor?: string | number;
  room_no?: string;
  sharing_type?: string;
  status?: string;
};

export type Bed = {
  id: string;
  room_id: string;
  bed_no?: string;
  student_id?: string | null;
  status?: string | null;
};

/**
 * Generate monthly dues for students.
 * Skips logic is handled server-side; this purely maps students → due rows.
 */
export function generateMonthlyDues(
  students: PgStudent[],
  monthISO: string,
  hostelFee: number
): DueRow[] {
  const month = monthISO.slice(0, 7);
  const dueDate = `${month}-05`;
  return students
    .filter((s) => (s.status ?? "active") === "active")
    .map((s) => ({
      hostel_id: s.hostel_id,
      student_id: s.id,
      month,
      amount: s.monthly_fee ?? hostelFee,
      breakup: null,
      due_date: dueDate,
      status: "pending",
      late_fee: 0,
    }));
}

/**
 * Apply late fee if overdue past graceDays.
 */
export function applyLateFee(
  due: Due,
  graceDays: number,
  feePerDay: number,
  todayISO: string
): Due {
  if (!due.due_date) return due;
  const dueDate = new Date(due.due_date);
  const today = new Date(todayISO);
  dueDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
  const overdueDays = diffDays - graceDays;
  if (overdueDays <= 0) return { ...due };
  if (due.status === "paid" || due.status === "success" || due.status === "collected") return { ...due };
  const lateFee = overdueDays * feePerDay;
  return {
    ...due,
    late_fee: (Number(due.late_fee) || 0) + lateFee,
    status: "overdue",
  };
}

export function occupancySummary(
  rooms: Room[],
  beds: Bed[]
): { totalBeds: number; occupied: number; vacant: number; booked: number; occupancyPct: number } {
  void rooms;
  const totalBeds = beds.length;
  let occupied = 0;
  let booked = 0;
  let vacant = 0;
  for (const b of beds) {
    const st = (b.status ?? (b.student_id ? "occupied" : "vacant"))?.toLowerCase();
    if (st === "occupied") occupied++;
    else if (st === "booked") booked++;
    else vacant++;
  }
  const occupancyPct = totalBeds === 0 ? 0 : Math.round((occupied / totalBeds) * 100);
  return { totalBeds, occupied, vacant, booked, occupancyPct };
}

export function duesSummary(
  dues: Due[]
): { billed: number; collected: number; pending: number; overdue: number } {
  let billed = 0;
  let collected = 0;
  let pending = 0;
  let overdue = 0;
  for (const d of dues) {
    const amt = Number(d.amount) || 0;
    billed += amt;
    const s = (d.status ?? "").toLowerCase();
    if (s === "paid" || s === "success" || s === "collected") collected += amt;
    else if (s === "overdue") overdue += amt;
    else if (s === "pending") pending += amt;
    else pending += 0;
  }
  return { billed, collected, pending, overdue };
}

export function waReminderLink(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, "");
  const normalized = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export function buildReminderMessage(
  studentName: string,
  hostelName: string,
  amount: number,
  upiId: string
): string {
  const amt = formatINR(amount);
  const upiPart = upiId ? ` UPI: ${upiId}.` : "";
  return `Hello ${studentName}, reminder from ${hostelName}: your hostel fee ${amt} is due. Please pay at the earliest.${upiPart} Thank you!`;
}

export function formatINR(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}
