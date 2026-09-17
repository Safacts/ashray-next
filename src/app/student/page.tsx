"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { formatINR } from "@/lib/pg-engine";
import toast, { Toaster } from "react-hot-toast";
import {
  LogOut,
  Loader2,
  CheckCircle,
  AlertCircle,
  Upload,
  QrCode,
  CreditCard,
  BedDouble,
  Building2,
  Clock,
  BadgeAlert,
  MessageSquarePlus,
  Receipt,
  Calendar,
  IndianRupee,
  Eye,
} from "lucide-react";

type StudentLocal = {
  id: string;
  hostel_id: string;
  name?: string;
  full_name?: string;
  phone?: string;
  mobile_number?: string;
  room?: string;
  room_number?: string;
  monthly_fee?: number | null;
  last_paid_date?: string | null;
  bed_id?: string | null;
  status?: string | null;
};

type PaymentRow = {
  id: string;
  amount: number;
  status: string;
  proof_url?: string | null;
  transaction_id?: string | null;
  created_at: string;
  due_id?: string | null;
};

type DueRow = {
  id: string;
  amount: number;
  status: string;
  month: string;
  due_date?: string | null;
  late_fee?: number | null;
};

type BedWithRoom = {
  bed: { id: string; bed_no: string; status: string | null; student_id: string | null };
  room: { id: string; room_no: string; floor: string; sharing_type: number | string; rent: number | null } | null;
};

const getStudentName = (s: StudentLocal) => s.name ?? s.full_name ?? "Student";
const getStudentPhone = (s: StudentLocal) => s.phone ?? s.mobile_number ?? "";
const getStudentRoom = (s: StudentLocal) => s.room ?? s.room_number ?? "-";

export default function StudentPage() {
  const router = useRouter();
  const [student, setStudent] = useState<StudentLocal | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [dues, setDues] = useState<DueRow[]>([]);
  const [bedInfo, setBedInfo] = useState<BedWithRoom | null>(null);
  const [hostelQr, setHostelQr] = useState<string | null>(null);
  const [hostelUpi, setHostelUpi] = useState("");
  const [hostelName, setHostelName] = useState("Ashray Hostel");
  const [payAmount, setPayAmount] = useState<number>(3000);
  const [loading, setLoading] = useState(true);

  // pay flow
  const [showPayModal, setShowPayModal] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // complaint
  const [complaintCat, setComplaintCat] = useState("Maintenance");
  const [complaintDesc, setComplaintDesc] = useState("");
  const [complaintSending, setComplaintSending] = useState(false);
  const [myComplaints, setMyComplaints] = useState<{ id: number; category: string | null; description: string | null; status: string; created_at: string }[]>([]);

  useEffect(() => {
    const raw = localStorage.getItem("student_user");
    if (!raw) {
      router.push("/login");
      return;
    }
    try {
      const parsed = JSON.parse(raw) as StudentLocal;
      setStudent(parsed);
      setPayAmount(parsed.monthly_fee ?? 3000);
      void fetchAll(parsed);
    } catch {
      router.push("/login");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAll = async (stu: StudentLocal) => {
    setLoading(true);
    try {
      // hostel details
      if (stu.hostel_id) {
        const { data: hostel } = await supabase
          .from("hostels")
          .select("name, default_fee, qr_code_url, upi_id")
          .eq("id", stu.hostel_id)
          .single();
        if (hostel) {
          const h = hostel as { name?: string; default_fee?: number | null; qr_code_url?: string | null; upi_id?: string | null };
          if (h.name) setHostelName(h.name);
          if (!stu.monthly_fee && h.default_fee) setPayAmount(h.default_fee);
          else if (stu.monthly_fee) setPayAmount(stu.monthly_fee);
          setHostelQr(h.qr_code_url ?? null);
          setHostelUpi(h.upi_id ?? "");
        }
      }

      // payments
      const { data: payData } = await supabase.from("payments").select("*").eq("student_id", stu.id).order("created_at", { ascending: false });
      setPayments(((payData ?? []) as PaymentRow[]));

      // dues
      const { data: duesData } = await supabase.from("dues").select("id, amount, status, month, due_date, late_fee").eq("student_id", stu.id).order("month", { ascending: false });
      setDues(((duesData ?? []) as DueRow[]));

      // bed + room via beds->rooms join
      let bedRow: { id: string; bed_no: string; status: string | null; student_id: string | null; room_id: string } | null = null;
      if (stu.bed_id) {
        const { data } = await supabase.from("beds").select("id, bed_no, status, student_id, room_id").eq("id", stu.bed_id).maybeSingle();
        if (data) bedRow = data as unknown as typeof bedRow;
      }
      if (!bedRow) {
        const { data } = await supabase.from("beds").select("id, bed_no, status, student_id, room_id").eq("student_id", stu.id).maybeSingle();
        if (data) bedRow = data as unknown as typeof bedRow;
      }
      const resolved = bedRow as unknown as { id: string; bed_no: string; status: string | null; student_id: string | null; room_id: string } | null;
      if (resolved) {
        const { data: roomData } = await supabase.from("rooms").select("id, room_no, floor, sharing_type, rent").eq("id", resolved.room_id).maybeSingle();
        setBedInfo({
          bed: { id: resolved.id, bed_no: resolved.bed_no, status: resolved.status, student_id: resolved.student_id },
          room: roomData ? (roomData as BedWithRoom["room"]) : null,
        });
        // sync local room display if mismatch
        if (roomData && getStudentRoom(stu) === "-") {
          // keep in memory only
        }
      } else {
        setBedInfo(null);
      }

      // my complaints
      const { data: compData } = await supabase
        .from("complaints")
        .select("id, category, description, status, created_at")
        .eq("student_id", stu.id)
        .order("created_at", { ascending: false })
        .limit(10);
      setMyComplaints((compData ?? []) as typeof myComplaints);
    } finally {
      setLoading(false);
    }
  };

  const upiLink = hostelUpi ? `upi://pay?pa=${hostelUpi}&pn=${encodeURIComponent(hostelName)}&am=${payAmount}&cu=INR` : "#";

  const handleSubmitProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!student) return;
    if (!proofFile) return toast.error("Please select payment screenshot");
    setUploading(true);
    const toastId = toast.loading("Submitting payment proof…");
    try {
      const fileName = `${Date.now()}-${student.id}.jpg`;
      const { error: uploadError } = await supabase.storage.from("payment-proofs").upload(fileName, proofFile, { upsert: true });
      if (uploadError) throw uploadError;
      const {
        data: { publicUrl },
      } = supabase.storage.from("payment-proofs").getPublicUrl(fileName);

      const { error: dbError } = await supabase.from("payments").insert([
        {
          hostel_id: student.hostel_id,
          student_id: student.id,
          amount: payAmount,
          status: "pending",
          proof_url: publicUrl,
        },
      ]);
      if (dbError) throw dbError;

      toast.success("Proof submitted! Waiting for admin approval.", { id: toastId });
      setShowPayModal(false);
      setProofFile(null);
      // refresh
      const { data: payData } = await supabase.from("payments").select("*").eq("student_id", student.id).order("created_at", { ascending: false });
      setPayments(((payData ?? []) as PaymentRow[]));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      toast.error(msg, { id: toastId });
    } finally {
      setUploading(false);
    }
  };

  const handleRaiseComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!student) return;
    if (!complaintDesc.trim()) return toast.error("Describe your issue");
    setComplaintSending(true);
    const toastId = toast.loading("Raising complaint…");
    try {
      // try direct supabase then fallback to API
      const payload = {
        hostel_id: student.hostel_id,
        student_id: student.id,
        category: complaintCat,
        description: complaintDesc.trim(),
      };
      let inserted = false;
      const { error } = await supabase.from("complaints").insert([payload]);
      if (error) {
        // fallback to API (public-ish)
        const res = await fetch("/api/complaints", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error((j as { error?: string }).error ?? "Failed to raise complaint");
        }
        inserted = true;
      } else inserted = true;

      if (inserted) {
        toast.success("Complaint raised! Admin will review.", { id: toastId });
        setComplaintDesc("");
        const { data: compData } = await supabase
          .from("complaints")
          .select("id, category, description, status, created_at")
          .eq("student_id", student.id)
          .order("created_at", { ascending: false })
          .limit(10);
        setMyComplaints((compData ?? []) as typeof myComplaints);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed";
      toast.error(msg, { id: toastId });
    } finally {
      setComplaintSending(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("student_user");
    router.push("/login");
  };

  if (loading || !student) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-indigo-600 w-8 h-8" />
      </div>
    );
  }

  const nextDueStr = student.last_paid_date
    ? new Date(new Date(student.last_paid_date).setDate(new Date(student.last_paid_date).getDate() + 30)).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "N/A";

  const pendingDues = dues.filter((d) => d.status === "pending" || d.status === "overdue");
  const pendingTotal = pendingDues.reduce((s, d) => s + Number(d.amount) + Number(d.late_fee ?? 0), 0);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Toaster position="top-center" />
      {/* Header */}
      <div className="bg-indigo-600 p-6 text-white rounded-b-3xl shadow-lg">
        <div className="max-w-3xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold">Hi, {getStudentName(student).split(" ")[0]}</h1>
              <p className="text-indigo-200 text-sm flex items-center gap-1.5 mt-1">
                <Building2 size={14} /> Room {getStudentRoom(student)} {bedInfo?.bed ? `· Bed ${bedInfo.bed.bed_no}` : ""} {bedInfo?.room ? `· ${bedInfo.room.floor}` : ""}
              </p>
            </div>
            <button onClick={handleLogout} className="bg-white/20 p-2.5 rounded-full hover:bg-white/30 transition" title="Logout">
              <LogOut size={20} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/20">
              <p className="text-xs text-indigo-100 uppercase font-semibold flex items-center gap-1">
                <Calendar size={12} /> Next Due Date
              </p>
              <p className="text-lg font-bold mt-1">{nextDueStr}</p>
              <p className="text-xs text-indigo-200 mt-1">{getStudentPhone(student) || "No phone"}</p>
            </div>
            <div className="bg-white text-gray-900 p-4 rounded-2xl shadow-sm flex flex-col justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase font-semibold">Amount Due</p>
                <p className="text-2xl font-bold">{formatINR(pendingTotal || payAmount)}</p>
                <p className="text-xs text-gray-400">
                  {pendingDues.length > 0 ? `${pendingDues.length} due(s) · incl. late fee` : "Standard monthly fee"}
                </p>
              </div>
              <button onClick={() => setShowPayModal(true)} className="mt-3 bg-gray-900 text-white py-2.5 rounded-xl font-bold text-sm hover:bg-black transition flex items-center justify-center gap-2">
                <IndianRupee size={16} /> Pay Fees
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 space-y-6 -mt-2">
        {/* My Bed / Room */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-3">
            <BedDouble size={18} className="text-indigo-500" /> My Bed & Room
          </h3>
          {bedInfo?.room ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div className="bg-gray-50 rounded-xl p-3 border">
                <p className="text-xs text-gray-500 uppercase font-semibold">Room</p>
                <p className="font-bold text-gray-900">{bedInfo.room.room_no}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 border">
                <p className="text-xs text-gray-500 uppercase font-semibold">Bed</p>
                <p className="font-bold text-gray-900">{bedInfo.bed.bed_no}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 border">
                <p className="text-xs text-gray-500 uppercase font-semibold">Floor</p>
                <p className="font-bold text-gray-900">{bedInfo.room.floor ?? "-"}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 border">
                <p className="text-xs text-gray-500 uppercase font-semibold">Sharing</p>
                <p className="font-bold text-gray-900">{String(bedInfo.room.sharing_type)}-share</p>
              </div>
              <div className="col-span-2 sm:col-span-4 text-xs text-gray-500 mt-1">
                Status:{" "}
                <span className={`px-2 py-0.5 rounded-full font-bold ${bedInfo.bed.status === "occupied" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100"}`}>{bedInfo.bed.status ?? "-"}</span>
                {bedInfo.room.rent ? ` · Rent ${formatINR(Number(bedInfo.room.rent))}` : ""}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 bg-gray-50 border border-dashed rounded-xl p-4 text-center">
              No bed assigned yet. Contact admin to assign a bed.
            </p>
          )}
        </div>

        {/* Current Dues */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-3">
            <BadgeAlert size={18} className="text-amber-500" /> Current Dues
            {pendingDues.length > 0 && <span className="ml-2 bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full font-bold">{pendingDues.length} pending</span>}
          </h3>
          {dues.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No dues found.</p>
          ) : (
            <div className="divide-y">
              {dues.slice(0, 8).map((d) => (
                <div key={d.id} className="py-3 flex justify-between items-center text-sm">
                  <div>
                    <p className="font-bold text-gray-900">
                      {d.month.slice(0, 7)} · {formatINR(Number(d.amount))}
                      {Number(d.late_fee ?? 0) > 0 && <span className="text-red-600"> +{formatINR(Number(d.late_fee))} late</span>}
                    </p>
                    <p className="text-xs text-gray-500">Due {d.due_date ? new Date(d.due_date).toLocaleDateString() : "-"}</p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-bold capitalize ${
                      d.status === "paid" || d.status === "success" ? "bg-emerald-100 text-emerald-700" : d.status === "overdue" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {d.status}
                  </span>
                </div>
              ))}
            </div>
          )}
          {pendingTotal > 0 && (
            <div className="mt-3 bg-amber-50 border border-amber-100 rounded-xl p-3 flex justify-between items-center">
              <span className="text-sm font-bold text-amber-800">Total Payable</span>
              <span className="font-bold text-amber-900">{formatINR(pendingTotal)}</span>
            </div>
          )}
        </div>

        {/* Payment History */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-3">
            <Clock size={18} className="text-gray-400" /> Payment History
          </h3>
          <div className="space-y-3">
            {payments.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No transactions yet.</p>
            ) : (
              payments.map((pay) => (
                <div key={pay.id} className="bg-gray-50/50 p-4 rounded-xl border border-gray-100 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${pay.status === "success" ? "bg-green-50 text-green-600" : pay.status === "pending" ? "bg-amber-50 text-amber-600" : "bg-gray-100 text-gray-500"}`}>
                      {pay.status === "success" ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">{formatINR(Number(pay.amount))}</p>
                      <p className="text-xs text-gray-400">{pay.transaction_id ?? pay.id.slice(0, 8)}</p>
                      {pay.proof_url && (
                        <a href={pay.proof_url} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 flex items-center gap-1 mt-0.5">
                          <Eye size={12} /> proof
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-gray-500 mb-1">{new Date(pay.created_at).toLocaleDateString()}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${pay.status === "success" ? "bg-green-100 text-green-700" : pay.status === "rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{pay.status}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Raise Complaint */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-3">
            <MessageSquarePlus size={18} className="text-indigo-500" /> Raise a Complaint
          </h3>
          <form onSubmit={handleRaiseComplaint} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <select value={complaintCat} onChange={(e) => setComplaintCat(e.target.value)} className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-medium outline-none">
                <option>Maintenance</option>
                <option>Food</option>
                <option>Cleanliness</option>
                <option>Electricity</option>
                <option>Water</option>
                <option>WiFi</option>
                <option>General</option>
              </select>
              <div className="sm:col-span-2 flex gap-2">
                <input value={complaintDesc} onChange={(e) => setComplaintDesc(e.target.value)} placeholder="Describe the issue…" className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none" required />
                <button disabled={complaintSending} className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm disabled:opacity-60 flex items-center gap-2">
                  {complaintSending ? <Loader2 className="animate-spin w-4 h-4" /> : <MessageSquarePlus size={16} />} Submit
                </button>
              </div>
            </div>
          </form>
          {myComplaints.length > 0 && (
            <div className="mt-4 divide-y border rounded-xl overflow-hidden">
              {myComplaints.map((c) => (
                <div key={c.id} className="p-3 flex justify-between items-start gap-3 text-sm bg-gray-50/30">
                  <div>
                    <p className="font-bold text-gray-900">
                      {c.category ?? "General"} <span className="text-xs font-normal text-gray-500">· {new Date(c.created_at).toLocaleDateString()}</span>
                    </p>
                    <p className="text-xs text-gray-600 mt-1 line-clamp-2">{c.description ?? "-"}</p>
                  </div>
                  <span className={`shrink-0 px-2 py-1 rounded-full text-xs font-bold capitalize ${c.status === "resolved" ? "bg-emerald-100 text-emerald-700" : c.status === "working" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>{c.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* UPI quick info */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="shrink-0 p-2 bg-gray-50 rounded-xl border">
            {hostelQr ? <img src={hostelQr} alt="QR" className="w-20 h-20 object-contain" /> : <QrCode className="w-20 h-20 text-gray-300" />}
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-gray-900">Pay via UPI</p>
            <p className="text-xs font-mono bg-gray-50 inline-block px-2 py-1 rounded border mt-1">{hostelUpi || "Not configured — ask admin"}</p>
            <p className="text-xs text-gray-500 mt-1">Hostel: {hostelName}</p>
          </div>
          {hostelUpi && (
            <a href={upiLink} className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-1">
              <CreditCard size={16} /> Open UPI
            </a>
          )}
        </div>

        <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
          <Receipt size={14} /> Need help? Contact hostel admin at {hostelUpi || "reception"}
        </div>
      </div>

      {/* Pay Modal */}
      {showPayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Pay Hostel Fees</h2>
            <p className="text-xs text-gray-500 mb-3">Scan QR or tap UPI, then upload proof for admin approval.</p>

            <label className="block text-sm font-semibold text-gray-700 mb-1">Paying Amount</label>
            <div className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-4 font-bold text-lg text-gray-900">{formatINR(payAmount)}</div>

            {hostelQr ? (
              <div className="mb-4 flex flex-col items-center">
                <p className="text-xs text-gray-500 mb-2 font-medium">Scan to Pay (GPay / PhonePe)</p>
                <div className="p-2 border-2 border-indigo-100 rounded-xl bg-white shadow-sm">
                  <img src={hostelQr} alt="Hostel QR" className="w-40 h-40 object-contain" />
                </div>
              </div>
            ) : (
              <div className="mb-4 bg-amber-50 p-3 rounded-xl text-amber-700 text-xs text-center border border-amber-100">Admin hasn&apos;t uploaded a QR yet. Use UPI ID below.</div>
            )}

            {hostelUpi ? (
              <div className="mb-3 bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-center">
                <p className="text-xs font-bold text-indigo-700">UPI ID</p>
                <p className="font-mono text-sm font-bold text-gray-900 mt-1">{hostelUpi}</p>
              </div>
            ) : null}

            <a href={upiLink} className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold mb-4 transition ${hostelUpi ? "bg-indigo-600 text-white hover:bg-indigo-700" : "bg-gray-100 text-gray-400 pointer-events-none"}`}>
              <CreditCard size={18} /> Pay via UPI App
            </a>

            <hr className="mb-4 border-gray-100" />

            <form onSubmit={handleSubmitProof}>
              <p className="text-sm font-semibold text-gray-700 mb-2">Upload Payment Screenshot:</p>
              <input
                type="file"
                accept="image/*"
                required
                onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 mb-6"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowPayModal(false)} className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-bold hover:bg-gray-200 transition">
                  Cancel
                </button>
                <button type="submit" disabled={uploading} className="flex-1 bg-gray-900 text-white py-3 rounded-xl font-bold hover:bg-black transition flex justify-center items-center gap-2 disabled:opacity-60">
                  {uploading ? <Loader2 className="animate-spin w-5 h-5" /> : "Submit Proof"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
