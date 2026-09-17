"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { duesSummary, formatINR, occupancySummary } from "@/lib/pg-engine";
import toast, { Toaster } from "react-hot-toast";
import { jsPDF } from "jspdf";
import {
  Users,
  Wallet,
  TrendingUp,
  QrCode,
  Upload,
  Edit2,
  LogOut,
  BarChart3,
  ArrowLeft,
  Receipt,
  Search,
  Filter,
  Building2,
  Phone,
  MessageCircle,
  FileDown,
  Trash2,
  CheckCircle,
  XCircle,
  Loader2,
  Eye,
  IndianRupee,
  Calculator,
  AlertTriangle,
  FileText,
  Calendar,
  BedDouble,
  Plus,
  UserCheck,
  MessageSquare,
  ClipboardList,
  Star,
  StarOff,
} from "lucide-react";

type HostelRow = { name: string; default_fee: number | null; qr_code_url: string | null; upi_id: string | null };
type StudentRow = {
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
  photo_url?: string | null;
  created_at?: string;
  address?: string | null;
  adhar_number?: string | null;
};
type PaymentRow = {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  proof_url?: string | null;
  transaction_id?: string | null;
  due_id?: string | null;
  student_id: string;
  students?: { id: string; name?: string; full_name?: string; room?: string; room_number?: string; hostel_id?: string } | null;
};
type ExpenseRow = { id: string; amount: number; description: string; date?: string; expense_date?: string };
type DueRow = { id: string; amount: number; status: string; month: string; hostel_id: string; student_id: string; due_date?: string };
type BedRow = { id: string; room_id: string; bed_no?: string; student_id?: string | null; status?: string | null };
type RoomRow = { id: string; hostel_id: string; room_no: string; floor?: string | number; sharing_type?: string | number | null; rent?: number | null; status?: string };
type ComplaintRow = { id: number; hostel_id: string | null; student_id: string | null; category: string | null; description: string | null; status: string; assigned_to: string | null; created_at: string; students?: { name?: string; phone?: string } | null };
type EnquiryRow = { id: number; name: string | null; phone: string | null; occupation: string | null; move_in: string | null; message: string | null; contacted: boolean; created_at: string };
type ReviewRow = { id: number; name: string; rating: number; text: string; approved: boolean; source?: string | null; created_at: string };

const getStudentName = (s: StudentRow) => s.name ?? s.full_name ?? "Student";
const getStudentPhone = (s: StudentRow) => s.phone ?? s.mobile_number ?? "";
const getStudentRoom = (s: StudentRow) => s.room ?? s.room_number ?? "-";

const getBase64ImageFromURL = (url: string) =>
  new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("canvas"));
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/jpeg"));
    };
    img.onerror = (e) => reject(e);
    img.src = url;
  });

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [hostelName, setHostelName] = useState("");
  const [currentFee, setCurrentFee] = useState(3000);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [upiId, setUpiId] = useState("");

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [pendingPayments, setPendingPayments] = useState<PaymentRow[]>([]);
  const [successfulPayments, setSuccessfulPayments] = useState<PaymentRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [dues, setDues] = useState<DueRow[]>([]);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [beds, setBeds] = useState<BedRow[]>([]);

  const [complaints, setComplaints] = useState<ComplaintRow[]>([]);
  const [enquiries, setEnquiries] = useState<EnquiryRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);

  const [activeTab, setActiveTab] = useState<"analytics" | "detailed-analytics" | "students" | "payments" | "expenses" | "dues" | "rooms" | "complaints" | "enquiries" | "reviews">("analytics");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRoom, setFilterRoom] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [excludedTxns, setExcludedTxns] = useState<Set<string>>(new Set());
  const [excludedExpenses, setExcludedExpenses] = useState<Set<string>>(new Set());

  const [stats, setStats] = useState({ totalRevenue: 0, collectedThisMonth: 0 });
  const [detailedStats, setDetailedStats] = useState({
    currentIncome: 0,
    lastIncome: 0,
    currentExpense: 0,
    lastExpense: 0,
    expectedRev: 0,
    pendingDues: 0,
    profitMargin: 0,
  });

  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [expenseData, setExpenseData] = useState({ amount: "", description: "", date: new Date().toISOString().split("T")[0] });

  // Rooms CRUD state
  const [newRoom, setNewRoom] = useState({ floor: "Ground", room_no: "", sharing_type: "2", rent: "" });
  const [roomCreating, setRoomCreating] = useState(false);
  const [complaintFilter, setComplaintFilter] = useState("all");
  const [enquiryFilter, setEnquiryFilter] = useState("all");
  const [reviewFilter, setReviewFilter] = useState("all");

  const fetchDashboardData = async () => {
    setLoading(true);
    const hostelId = localStorage.getItem("admin_hostel_id");
    if (!hostelId) {
      router.push("/login");
      return;
    }
    try {
      const { data: hostelData } = await supabase.from("hostels").select("name, default_fee, qr_code_url, upi_id").eq("id", hostelId).single();
      let stdFee = 3000;
      if (hostelData) {
        const h = hostelData as HostelRow;
        setHostelName(h.name ?? "");
        stdFee = h.default_fee ?? 3000;
        setCurrentFee(stdFee);
        setQrCodeUrl(h.qr_code_url);
        setUpiId(h.upi_id ?? "");
      }

      const { data: studentsData } = await supabase.from("students").select("*").eq("hostel_id", hostelId).order("created_at", { ascending: false });
      const activeStudents = (studentsData ?? []) as StudentRow[];
      setStudents(activeStudents);

      const { data: payPending } = await supabase
        .from("payments")
        .select(`*, students!inner ( id, name, full_name, room, room_number, hostel_id )`)
        .eq("status", "pending")
        .eq("students.hostel_id", hostelId)
        .order("created_at", { ascending: false });
      setPendingPayments((payPending ?? []) as PaymentRow[]);

      const { data: expData } = await supabase.from("expenses").select("*").eq("hostel_id", hostelId).order("date", { ascending: false });
      const expensesList = ((expData ?? []) as unknown as ExpenseRow[]).map((e) => ({
        ...e,
        date: (e as ExpenseRow).date ?? (e as ExpenseRow).expense_date ?? new Date().toISOString().split("T")[0],
      }));
      setExpenses(expensesList);

      const { data: revData } = await supabase
        .from("payments")
        .select("id, amount, status, student_id, created_at, students!inner(hostel_id, name, full_name, room, room_number)")
        .eq("status", "success")
        .eq("students.hostel_id", hostelId)
        .order("created_at", { ascending: false });
      setSuccessfulPayments((revData ?? []) as unknown as PaymentRow[]);

      const { data: duesData } = await supabase.from("dues").select("*").eq("hostel_id", hostelId).order("month", { ascending: false });
      setDues((duesData ?? []) as DueRow[]);

      const { data: roomsData } = await supabase.from("rooms").select("*").eq("hostel_id", hostelId).order("room_no", { ascending: true });
      setRooms((roomsData ?? []) as RoomRow[]);
      const { data: bedsData } = await supabase.from("beds").select("*");
      const roomIds = new Set(((roomsData ?? []) as RoomRow[]).map((r) => r.id));
      const filteredBeds = ((bedsData ?? []) as BedRow[]).filter((b) => roomIds.has(b.room_id));
      setBeds(filteredBeds);

      // complaints
      const { data: complaintsData } = await supabase.from("complaints").select("*, students(name, phone)").eq("hostel_id", hostelId).order("created_at", { ascending: false });
      setComplaints((complaintsData ?? []) as ComplaintRow[]);

      // enquiries (global, no hostel_id)
      const { data: enqData } = await supabase.from("enquiries").select("*").order("created_at", { ascending: false }).limit(50);
      setEnquiries((enqData ?? []) as EnquiryRow[]);

      // reviews
      const { data: revwData } = await supabase.from("reviews").select("*").order("created_at", { ascending: false }).limit(50);
      setReviews((revwData ?? []) as ReviewRow[]);

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      supabase
        .from("payments")
        .select("id, proof_url, created_at")
        .not("proof_url", "is", null)
        .lt("created_at", thirtyDaysAgo.toISOString())
        .then(({ data: oldProofs }) => {
          if (oldProofs && oldProofs.length > 0) {
            oldProofs.forEach(async (p: { id: string; proof_url: string }) => {
              try {
                const parts = p.proof_url.split("/payment-proofs/");
                if (parts.length > 1) {
                  const fileName = parts[1];
                  await supabase.storage.from("payment-proofs").remove([fileName]);
                  await supabase.from("payments").update({ proof_url: null }).eq("id", p.id);
                }
              } catch {
                // silent
              }
            });
          }
        });
    } catch {
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!successfulPayments || !expenses || !students) return;
    const activeTxns = successfulPayments.filter((t) => !excludedTxns.has(t.id));
    const activeExps = expenses.filter((e) => !excludedExpenses.has(e.id));
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    const totalRev = activeTxns.reduce((sum, t) => sum + Number(t.amount), 0);
    const currInc = activeTxns
      .filter((t) => new Date(t.created_at).getMonth() === currentMonth && new Date(t.created_at).getFullYear() === currentYear)
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const lastInc = activeTxns
      .filter((t) => new Date(t.created_at).getMonth() === lastMonth && new Date(t.created_at).getFullYear() === lastMonthYear)
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const getExpenseDate = (e: ExpenseRow) => e.date ?? e.expense_date ?? "";
    const currExp = activeExps
      .filter((e) => {
        const d = new Date(getExpenseDate(e));
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      })
      .reduce((sum, e) => sum + Number(e.amount), 0);
    const lastExp = activeExps
      .filter((e) => {
        const d = new Date(getExpenseDate(e));
        return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
      })
      .reduce((sum, e) => sum + Number(e.amount), 0);

    const expectedRev = students.reduce((sum, s) => sum + (s.monthly_fee ?? currentFee), 0);
    const pendingDues = Math.max(0, expectedRev - currInc);
    const profitMargin = currInc > 0 ? Math.round(((currInc - currExp) / currInc) * 100) : 0;

    setStats({ totalRevenue: totalRev, collectedThisMonth: currInc });
    setDetailedStats({ currentIncome: currInc, lastIncome: lastInc, currentExpense: currExp, lastExpense: lastExp, expectedRev, pendingDues, profitMargin });
  }, [successfulPayments, expenses, students, excludedTxns, excludedExpenses, currentFee]);

  const toggleExcludeTxn = (id: string) => {
    setExcludedTxns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleExcludeExp = (id: string) => {
    setExcludedExpenses((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getBillingDetails = (lastPaidDateString?: string | null) => {
    if (!lastPaidDateString) return { nextBillDate: "N/A", daysLeft: 0, statusColor: "text-gray-400", riskLevel: "low" as const };
    const lastPaid = new Date(lastPaidDateString);
    const nextBill = new Date(lastPaid);
    nextBill.setDate(lastPaid.getDate() + 30);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    nextBill.setHours(0, 0, 0, 0);
    const daysLeft = Math.ceil((nextBill.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const statusColor = daysLeft <= 3 ? "text-red-600 bg-red-50" : daysLeft <= 7 ? "text-amber-600 bg-amber-50" : "text-emerald-600 bg-emerald-50";
    const riskLevel: "critical" | "warning" | "safe" = daysLeft <= 3 ? "critical" : daysLeft <= 7 ? "warning" : "safe";
    return { nextBillDate: nextBill.toLocaleDateString("en-GB", { day: "numeric", month: "short" }), daysLeft, statusColor, riskLevel };
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const hostelId = localStorage.getItem("admin_hostel_id");
      const { error } = await supabase.from("expenses").insert([
        {
          hostel_id: hostelId,
          amount: parseInt(expenseData.amount),
          description: expenseData.description,
          date: expenseData.date,
        },
      ]);
      if (error) throw error;
      toast.success("Expense added");
      setExpenseModalOpen(false);
      setExpenseData({ amount: "", description: "", date: new Date().toISOString().split("T")[0] });
      fetchDashboardData();
    } catch {
      toast.error("Failed to add expense");
      setLoading(false);
    }
  };

  const handleDeleteExpense = async (expId: string) => {
    if (!confirm("Remove this expense record permanently?")) return;
    const { error } = await supabase.from("expenses").delete().eq("id", expId);
    if (!error) {
      toast.success("Expense deleted");
      fetchDashboardData();
    } else toast.error("Failed to delete expense");
  };

  const handleUpdateFee = async () => {
    const val = prompt("Enter new default monthly fee (₹):", String(currentFee));
    if (!val) return;
    const parsedFee = parseInt(val);
    if (!parsedFee || isNaN(parsedFee)) return;
    const hostelId = localStorage.getItem("admin_hostel_id");
    const { error } = await supabase.from("hostels").update({ default_fee: parsedFee }).eq("id", hostelId);
    if (!error) {
      setCurrentFee(parsedFee);
      toast.success("Default fee updated!");
      fetchDashboardData();
    } else toast.error("Failed to update fee");
  };

  const handleUpdateStudentFee = async (studentId: string, currentVal: number) => {
    const val = prompt("Enter CUSTOM fee for this student (₹):", String(currentVal));
    if (!val) return;
    const parsedFee = parseInt(val);
    if (!parsedFee || isNaN(parsedFee)) return;
    const { error } = await supabase.from("students").update({ monthly_fee: parsedFee }).eq("id", studentId);
    if (!error) {
      toast.success("Student fee updated");
      fetchDashboardData();
    } else toast.error("Failed to update");
  };

  const handleUpdateUPI = async () => {
    const val = prompt("Enter your hostel UPI ID (e.g., phone@upi):", upiId);
    if (val === null) return;
    if (!val) return;
    const hostelId = localStorage.getItem("admin_hostel_id");
    const { error } = await supabase.from("hostels").update({ upi_id: val }).eq("id", hostelId);
    if (!error) {
      setUpiId(val);
      toast.success("UPI ID updated!");
    } else toast.error("Failed to update UPI ID");
  };

  const handleUploadQR = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const toastId = toast.loading("Uploading QR Code...");
    try {
      const fileName = `qr-${Date.now()}`;
      const { error: uploadError } = await supabase.storage.from("hostel-assets").upload(fileName, file);
      if (uploadError) throw uploadError;
      const {
        data: { publicUrl },
      } = supabase.storage.from("hostel-assets").getPublicUrl(fileName);
      const hostelId = localStorage.getItem("admin_hostel_id");
      await supabase.from("hostels").update({ qr_code_url: publicUrl }).eq("id", hostelId);
      setQrCodeUrl(publicUrl);
      toast.success("QR Code Updated!", { id: toastId });
    } catch {
      toast.error("Upload failed", { id: toastId });
    }
  };

  const handleApprovePayment = async (payment: PaymentRow) => {
    const toastId = toast.loading("Approving payment...");
    try {
      const { error: payError } = await supabase.from("payments").update({ status: "success" }).eq("id", payment.id);
      if (payError) throw payError;
      const studentId = payment.students?.id ?? payment.student_id;
      const today = new Date().toISOString().split("T")[0];
      if (studentId) {
        const { error: stuError } = await supabase.from("students").update({ last_paid_date: today }).eq("id", studentId);
        if (stuError) throw stuError;
      }
      toast.success("Payment approved!", { id: toastId });
      fetchDashboardData();
    } catch {
      toast.error("Failed to approve payment", { id: toastId });
    }
  };

  const handleRejectPayment = async (paymentId: string) => {
    if (!confirm("Reject this payment?")) return;
    const toastId = toast.loading("Rejecting payment...");
    try {
      const { error } = await supabase.from("payments").update({ status: "rejected" }).eq("id", paymentId);
      if (error) throw error;
      toast.success("Payment rejected", { id: toastId });
      fetchDashboardData();
    } catch {
      toast.error("Failed to reject payment", { id: toastId });
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("admin_hostel_id");
    router.push("/login");
  };

  const handleDeleteStudent = async (id: string) => {
    if (!confirm("Permanently delete student? This cannot be undone.")) return;
    const { error } = await supabase.from("students").delete().eq("id", id);
    if (!error) {
      setStudents((prev) => prev.filter((s) => s.id !== id));
      toast.success("Student removed");
      fetchDashboardData();
    } else toast.error("Failed to delete student");
  };

  const createWhatsAppLink = (student: StudentRow, bill: ReturnType<typeof getBillingDetails>) => {
    const phone = getStudentPhone(student);
    if (!phone) return "#";
    const message = `Hello ${getStudentName(student)},\nReminder from Ashray Hostel:\nNext Bill Date: ${bill.nextBillDate}\nDays Remaining: ${bill.daysLeft}\nPlease clear your dues on time.`;
    const digits = phone.replace(/\D/g, "");
    return `https://wa.me/${digits.length === 10 ? "91" + digits : digits}?text=${encodeURIComponent(message)}`;
  };

  const handleDownloadPDF = async (student: StudentRow, bill: ReturnType<typeof getBillingDetails>) => {
    const toastId = toast.loading("Generating PDF...");
    try {
      const doc = new jsPDF();
      const indigo: [number, number, number] = [79, 70, 229];
      const textGray: [number, number, number] = [55, 65, 81];
      doc.setFillColor(...indigo);
      doc.rect(0, 0, 210, 40, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(24);
      doc.setFont("helvetica", "bold");
      doc.text((hostelName.toUpperCase() || "ASHRAY HOSTEL"), 105, 20, { align: "center" });
      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      doc.text("Official Student Profile", 105, 30, { align: "center" });
      if (student.photo_url) {
        try {
          const imgData = await getBase64ImageFromURL(student.photo_url);
          doc.addImage(imgData, "JPEG", 150, 50, 40, 40);
          doc.setDrawColor(200, 200, 200);
          doc.rect(150, 50, 40, 40);
        } catch {
          // ignore image error
        }
      }
      doc.setTextColor(...textGray);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("Personal Details", 20, 60);
      doc.setDrawColor(229, 231, 235);
      doc.line(20, 63, 140, 63);
      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      const startY = 75;
      const gap = 12;
      doc.text(`Name: ${getStudentName(student)}`, 20, startY);
      doc.text(`Room: ${getStudentRoom(student)}`, 20, startY + gap);
      doc.text(`Mobile: ${getStudentPhone(student) || "--"}`, 20, startY + gap * 2);
      doc.text(`Aadhar: ${student.adhar_number || "Not Provided"}`, 20, startY + gap * 3);
      const addressLines = doc.splitTextToSize(`Address: ${student.address || "Not Provided"}`, 170);
      doc.text(addressLines, 20, startY + gap * 4);
      const billingY = Math.max(startY + gap * 5 + addressLines.length * 7 + 15, 110);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("Billing Status", 20, billingY);
      doc.line(20, billingY + 3, 190, billingY + 3);
      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      doc.text(`Last Payment: ${student.last_paid_date || "N/A"}`, 20, billingY + 15);
      doc.text(`Next Due: ${bill.nextBillDate}`, 20, billingY + 15 + gap);
      doc.setFont("helvetica", "bold");
      const isOverdue = bill.daysLeft <= 3;
      doc.setTextColor(isOverdue ? 220 : 55, isOverdue ? 38 : 65, isOverdue ? 38 : 81);
      doc.text(`Status: ${bill.daysLeft} Days Remaining`, 20, billingY + 15 + gap * 2);
      doc.setTextColor(156, 163, 175);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text("Generated by Ashray Admin System.", 105, 280, { align: "center" });
      const fileName = `${getStudentName(student).replace(/\s+/g, "_")}_Profile.pdf`;
      doc.save(fileName);
      toast.success("PDF downloaded!", { id: toastId });
    } catch {
      toast.error("Failed to generate PDF", { id: toastId });
    }
  };

  const handleDownloadFinancialReport = () => {
    const doc = new jsPDF();
    doc.setFillColor(79, 70, 229);
    doc.rect(0, 0, 210, 30, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(`${hostelName.toUpperCase()} - FINANCIAL REPORT`, 105, 18, { align: "center" });
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(`Report: ${new Date().toLocaleDateString()}`, 20, 40);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Monthly Summary", 20, 55);
    doc.line(20, 58, 190, 58);
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(`Expected Revenue: Rs. ${detailedStats.expectedRev.toLocaleString()}`, 20, 70);
    doc.text(`Collected Income: Rs. ${detailedStats.currentIncome.toLocaleString()}`, 20, 80);
    doc.text(`Pending Dues: Rs. ${detailedStats.pendingDues.toLocaleString()}`, 20, 90);
    doc.text(`Total Expenses: Rs. ${detailedStats.currentExpense.toLocaleString()}`, 20, 100);
    doc.setFont("helvetica", "bold");
    const netProfit = detailedStats.currentIncome - detailedStats.currentExpense;
    doc.setTextColor(netProfit >= 0 ? 34 : 220, netProfit >= 0 ? 197 : 38, netProfit >= 0 ? 94 : 38);
    doc.text(`Net Profit: Rs. ${netProfit.toLocaleString()}`, 20, 115);
    doc.text(`Profit Margin: ${detailedStats.profitMargin}%`, 20, 125);
    doc.save(`${hostelName.replace(/\s+/g, "_")}_Financial_Report.pdf`);
    toast.success("Report downloaded!");
  };

  // Rooms CRUD handlers
  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const hostelId = localStorage.getItem("admin_hostel_id");
    if (!hostelId) return;
    if (!newRoom.room_no.trim()) return toast.error("Room number required");
    const sharing = parseInt(newRoom.sharing_type);
    const rentVal = parseInt(newRoom.rent || "0");
    if (!sharing || sharing < 1 || sharing > 6) return toast.error("Sharing must be 1-6");
    setRoomCreating(true);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostel_id: hostelId, floor: newRoom.floor, room_no: newRoom.room_no.trim(), sharing_type: sharing, rent: rentVal }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error((j as { error?: string }).error ?? "Failed to create room");
      toast.success(`Room ${newRoom.room_no} created with ${sharing} bed(s)`);
      setNewRoom({ floor: "Ground", room_no: "", sharing_type: "2", rent: "" });
      fetchDashboardData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create room");
    } finally {
      setRoomCreating(false);
    }
  };

  const handleAssignBed = async (bedId: string, studentId: string) => {
    if (!studentId) return toast.error("Select a student");
    const hostelId = localStorage.getItem("admin_hostel_id");
    void hostelId;
    const toastId = toast.loading("Assigning bed…");
    try {
      // check if student already has a bed — vacate old first
      const stu = students.find((s) => s.id === studentId);
      const oldBedId = stu?.bed_id ?? null;
      if (oldBedId && oldBedId !== bedId) {
        await supabase.from("beds").update({ student_id: null, status: "vacant" }).eq("id", oldBedId);
      }
      // check if bed already occupied — vacate previous occupant
      const bed = beds.find((b) => b.id === bedId);
      if (bed?.student_id && bed.student_id !== studentId) {
        await supabase.from("students").update({ bed_id: null }).eq("id", bed.student_id);
      }
      const { error: bedErr } = await supabase.from("beds").update({ student_id: studentId, status: "occupied" }).eq("id", bedId);
      if (bedErr) throw bedErr;
      const roomForBed = rooms.find((r) => r.id === (beds.find((b) => b.id === bedId)?.room_id ?? ""));
      const roomNo = roomForBed?.room_no ?? "";
      const { error: stuErr } = await supabase.from("students").update({ bed_id: bedId, room: roomNo }).eq("id", studentId);
      if (stuErr) throw stuErr;
      toast.success("Bed assigned", { id: toastId });
      fetchDashboardData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Assign failed", { id: toastId });
    }
  };

  const handleVacateBed = async (bedId: string) => {
    if (!confirm("Vacate this bed?")) return;
    const toastId = toast.loading("Vacating bed…");
    try {
      const bed = beds.find((b) => b.id === bedId);
      const studentId = bed?.student_id;
      const { error: bedErr } = await supabase.from("beds").update({ student_id: null, status: "vacant" }).eq("id", bedId);
      if (bedErr) throw bedErr;
      if (studentId) {
        await supabase.from("students").update({ bed_id: null }).eq("id", studentId);
      }
      toast.success("Bed vacated", { id: toastId });
      fetchDashboardData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Vacate failed", { id: toastId });
    }
  };

  const handleDeleteRoom = async (roomId: string) => {
    if (!confirm("Delete room and all its beds? Students in beds will be unassigned.")) return;
    const toastId = toast.loading("Deleting room…");
    try {
      // vacate beds first (FK cascade will handle but we want to clear student.bed_id)
      const roomBeds = beds.filter((b) => b.room_id === roomId);
      for (const b of roomBeds) {
        if (b.student_id) await supabase.from("students").update({ bed_id: null }).eq("id", b.student_id);
      }
      const { error } = await supabase.from("rooms").delete().eq("id", roomId);
      if (error) throw error;
      toast.success("Room deleted", { id: toastId });
      fetchDashboardData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed", { id: toastId });
    }
  };

  const handleComplaintPatch = async (id: number, patch: { status?: string; assigned_to?: string }) => {
    const toastId = toast.loading("Updating complaint…");
    try {
      const res = await fetch("/api/complaints", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error((j as { error?: string }).error ?? "Update failed");
      toast.success("Complaint updated", { id: toastId });
      fetchDashboardData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed", { id: toastId });
    }
  };

  const handleEnquiryContacted = async (id: number, contacted: boolean) => {
    const { error } = await supabase.from("enquiries").update({ contacted }).eq("id", id);
    if (!error) {
      toast.success(contacted ? "Marked contacted" : "Marked pending");
      fetchDashboardData();
    } else toast.error("Update failed");
  };

  const handleReviewApprove = async (id: number, approved: boolean) => {
    const { error } = await supabase.from("reviews").update({ approved }).eq("id", id);
    if (!error) {
      toast.success(approved ? "Review approved" : "Review unapproved");
      fetchDashboardData();
    } else toast.error("Update failed");
  };

  const handleReviewDelete = async (id: number) => {
    if (!confirm("Delete this review permanently?")) return;
    const { error } = await supabase.from("reviews").delete().eq("id", id);
    if (!error) {
      toast.success("Review deleted");
      fetchDashboardData();
    } else toast.error("Delete failed");
  };

  const uniqueRooms = ["all", ...Array.from(new Set(students.map((s) => getStudentRoom(s))))].sort();
  const filteredStudents = students.filter((s) => {
    const name = getStudentName(s).toLowerCase();
    const room = getStudentRoom(s);
    const matchSearch = name.includes(searchTerm.toLowerCase()) || room.includes(searchTerm);
    const bill = getBillingDetails(s.last_paid_date);
    const matchStatus = filterStatus === "all" || bill.riskLevel === filterStatus;
    const matchRoom = filterRoom === "all" || room === filterRoom;
    return matchSearch && matchStatus && matchRoom;
  });

  const occ = occupancySummary(rooms as unknown as import("@/lib/pg-engine").Room[], beds as unknown as import("@/lib/pg-engine").Bed[]);
  const dSummary = duesSummary(dues.map((d) => ({ ...d })));

  const filteredComplaints = complaints.filter((c) => complaintFilter === "all" || c.status === complaintFilter);
  const filteredEnquiries = enquiries.filter((e) => (enquiryFilter === "all" ? true : enquiryFilter === "contacted" ? e.contacted : !e.contacted));
  const filteredReviews = reviews.filter((r) => (reviewFilter === "all" ? true : reviewFilter === "approved" ? r.approved : !r.approved));

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-indigo-600 w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50 pb-20">
      <Toaster position="top-center" />
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30 px-4 py-4 shadow-sm">
        <div className="max-w-5xl mx-auto flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{hostelName || "Admin Dashboard"}</h1>
              <div className="flex items-center gap-2 text-xs mt-1">
                <span className="text-gray-500">Ashray Management</span>
                <span className="text-gray-300">•</span>
                <button onClick={handleUpdateFee} className="text-indigo-600 font-bold hover:underline flex items-center gap-1">
                  Std Fee: {formatINR(currentFee)} <Edit2 size={10} />
                </button>
              </div>
            </div>
            <button onClick={handleLogout} className="bg-red-50 text-red-600 p-2.5 rounded-full hover:bg-red-100 transition shadow-sm" title="Logout">
              <LogOut size={18} />
            </button>
          </div>

          <div className="flex bg-gray-100 p-1 rounded-xl overflow-x-auto gap-1 scrollbar-thin">
            <button onClick={() => setActiveTab("analytics")} className={`px-4 py-2 text-sm font-bold rounded-lg whitespace-nowrap ${activeTab === "analytics" || activeTab === "detailed-analytics" ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500"}`}>Analytics</button>
            <button onClick={() => setActiveTab("students")} className={`px-4 py-2 text-sm font-bold rounded-lg whitespace-nowrap ${activeTab === "students" ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500"}`}>Students ({students.length})</button>
            <button onClick={() => setActiveTab("payments")} className={`px-4 py-2 text-sm font-bold rounded-lg whitespace-nowrap relative ${activeTab === "payments" ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500"}`}>Approvals {pendingPayments.length > 0 && <span className="ml-1 bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full">{pendingPayments.length}</span>}</button>
            <button onClick={() => setActiveTab("expenses")} className={`px-4 py-2 text-sm font-bold rounded-lg whitespace-nowrap ${activeTab === "expenses" ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500"}`}>Expenses</button>
            <button onClick={() => setActiveTab("dues")} className={`px-4 py-2 text-sm font-bold rounded-lg whitespace-nowrap ${activeTab === "dues" ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500"}`}>Dues</button>
            <button onClick={() => setActiveTab("rooms")} className={`px-4 py-2 text-sm font-bold rounded-lg whitespace-nowrap ${activeTab === "rooms" ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500"}`}>Rooms/Beds</button>
            <button onClick={() => setActiveTab("complaints")} className={`px-4 py-2 text-sm font-bold rounded-lg whitespace-nowrap ${activeTab === "complaints" ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500"}`}>Complaints {complaints.filter((c) => c.status==="open").length>0 && <span className="ml-1 bg-amber-500 text-white text-[10px] px-2 py-0.5 rounded-full">{complaints.filter((c)=>c.status==="open").length}</span>}</button>
            <button onClick={() => setActiveTab("enquiries")} className={`px-4 py-2 text-sm font-bold rounded-lg whitespace-nowrap ${activeTab === "enquiries" ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500"}`}>Enquiries {enquiries.filter((e)=>!e.contacted).length>0 && <span className="ml-1 bg-blue-500 text-white text-[10px] px-2 py-0.5 rounded-full">{enquiries.filter((e)=>!e.contacted).length}</span>}</button>
            <button onClick={() => setActiveTab("reviews")} className={`px-4 py-2 text-sm font-bold rounded-lg whitespace-nowrap ${activeTab === "reviews" ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500"}`}>Reviews</button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4 space-y-3 mt-2">
        {activeTab === "analytics" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-2xl p-5 text-white shadow-lg">
                <div className="flex items-center justify-between mb-2"><span className="text-indigo-100 text-sm font-medium">Total Revenue</span><Wallet size={20} className="opacity-80" /></div>
                <div className="text-2xl font-bold">{formatINR(stats.totalRevenue)}</div>
                <div className="text-xs text-indigo-200 mt-1">Lifetime collection</div>
              </div>
              <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-2"><span className="text-gray-500 text-sm font-medium">Active Students</span><Users className="text-indigo-500" size={20} /></div>
                <div className="text-2xl font-bold text-gray-900">{students.length}</div>
                <div className="text-xs text-green-600 mt-1 font-medium">Occupancy {occ.occupancyPct}% • {occ.occupied}/{occ.totalBeds} beds</div>
              </div>
              <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-2"><span className="text-gray-500 text-sm font-medium">This Month</span><TrendingUp className="text-emerald-500" size={20} /></div>
                <div className="text-2xl font-bold text-gray-900">{formatINR(stats.collectedThisMonth)}</div>
                <div className="text-xs text-gray-400 mt-1">Revenue · Billed {formatINR(dSummary.billed)}</div>
              </div>
            </div>

            <button onClick={() => setActiveTab("detailed-analytics")} className="w-full bg-white border border-indigo-100 hover:bg-indigo-50 text-indigo-700 rounded-2xl p-4 shadow-sm flex items-center justify-center gap-2 font-bold">
              <BarChart3 className="text-indigo-500" /> View Detailed Financial Analytics
            </button>

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col sm:flex-row items-center gap-6">
              <div className="shrink-0 p-3 bg-gray-50 rounded-xl border border-gray-200">
                {qrCodeUrl ? <img src={qrCodeUrl} alt="QR" className="w-32 h-32 object-contain" /> : <div className="w-32 h-32 flex flex-col items-center justify-center text-gray-400"><QrCode size={32} /><span className="text-xs mt-2">No QR</span></div>}
              </div>
              <div className="flex-1 text-center sm:text-left w-full">
                <h3 className="text-lg font-bold text-gray-900">Payment Configuration</h3>
                <p className="text-sm text-gray-500 mb-4">Upload UPI QR or set UPI ID for student payments.</p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <label className="flex-1 inline-flex items-center justify-center gap-2 bg-indigo-600 text-white px-5 py-3 rounded-xl font-bold text-sm cursor-pointer hover:bg-indigo-700">
                    <Upload size={16} /> Upload QR
                    <input type="file" accept="image/*" className="hidden" onChange={handleUploadQR} />
                  </label>
                  <button onClick={handleUpdateUPI} className="flex-1 inline-flex items-center justify-center gap-2 bg-white text-gray-700 border border-gray-200 px-5 py-3 rounded-xl font-bold text-sm hover:bg-gray-50">
                    <Edit2 size={16} /> Edit UPI ID
                  </button>
                </div>
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-sm font-bold text-gray-900">Current UPI ID</p>
                  <p className="text-xs text-gray-500 mt-0.5 font-mono bg-gray-50 px-2 py-1 rounded border inline-block">{upiId || "Not configured"}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "detailed-analytics" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button onClick={() => setActiveTab("analytics")} className="p-2 bg-white rounded-full shadow-sm"><ArrowLeft size={20} /></button>
                <h2 className="text-xl font-bold text-gray-900">Financial Overview</h2>
              </div>
              <button onClick={handleDownloadFinancialReport} className="bg-indigo-50 text-indigo-700 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2">
                <FileDown size={16} /> Export Report
              </button>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <div className="flex justify-between items-end mb-3">
                <div>
                  <h3 className="font-bold text-gray-900 flex items-center gap-2">Cash Flow Sandbox <Calculator size={16} className="text-indigo-500" /></h3>
                  <p className="text-xs text-gray-500 mt-1">Toggle include/exclude below.</p>
                </div>
                <div className="text-right"><span className="text-lg font-bold text-gray-900">{detailedStats.profitMargin}%</span><p className="text-xs text-gray-500 font-medium">Profit Margin</p></div>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-5 flex overflow-hidden border border-gray-200">
                {detailedStats.currentIncome === 0 && detailedStats.currentExpense === 0 ? (
                  <div className="w-full bg-gray-200 h-full" />
                ) : (
                  <>
                    <div className="bg-emerald-500 h-full transition-all" style={{ width: `${(detailedStats.currentIncome / (detailedStats.currentIncome + detailedStats.currentExpense)) * 100}%` }} />
                    <div className="bg-red-500 h-full transition-all" style={{ width: `${(detailedStats.currentExpense / (detailedStats.currentIncome + detailedStats.currentExpense)) * 100}%` }} />
                  </>
                )}
              </div>
              <div className="flex justify-between mt-2 text-xs font-bold">
                <span className="text-emerald-600">IN: {formatINR(detailedStats.currentIncome)}</span>
                <span className="text-red-500">OUT: {formatINR(detailedStats.currentExpense)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm border-b-4 border-b-emerald-500">
                <p className="text-xs text-gray-500">Net Income</p>
                <h3 className="text-xl font-bold text-gray-900">{formatINR(detailedStats.currentIncome)}</h3>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm border-b-4 border-b-red-500">
                <p className="text-xs text-gray-500">Expenses</p>
                <h3 className="text-xl font-bold text-gray-900">{formatINR(detailedStats.currentExpense)}</h3>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm border-b-4 border-b-amber-500">
                <p className="text-xs text-gray-500">Pending Dues</p>
                <h3 className="text-xl font-bold text-gray-900">{formatINR(detailedStats.pendingDues)}</h3>
              </div>
              <div className="bg-gray-900 text-white p-4 rounded-2xl shadow-lg border-b-4 border-b-indigo-500">
                <p className="text-xs text-gray-400">Net Profit</p>
                <h3 className="text-xl font-bold">{formatINR(detailedStats.currentIncome - detailedStats.currentExpense)}</h3>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <h3 className="font-bold mb-4 flex items-center gap-2"><AlertTriangle size={18} className="text-amber-500" /> Recent Expenses</h3>
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                  {expenses.length === 0 ? <p className="text-sm text-gray-400">No expenses.</p> : expenses.map((exp) => {
                    const isExcluded = excludedExpenses.has(exp.id);
                    return (
                      <div key={exp.id} className={`flex justify-between items-center p-3 rounded-xl border-l-4 ${isExcluded ? "bg-gray-50 border-l-gray-300 opacity-60" : "bg-red-50/50 border-l-red-400"}`}>
                        <div className="flex items-center gap-3">
                          <button onClick={() => toggleExcludeExp(exp.id)} className="text-gray-400 hover:text-indigo-600">{isExcluded ? <XCircle size={18} /> : <CheckCircle size={18} />}</button>
                          <div>
                            <p className={`font-bold text-sm capitalize ${isExcluded ? "text-gray-500 line-through" : "text-gray-900"}`}>{exp.description}</p>
                            <p className="text-xs text-gray-500">{exp.date ? new Date(exp.date).toLocaleDateString() : ""}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`font-bold ${isExcluded ? "text-gray-400 line-through" : "text-red-600"}`}>-{formatINR(exp.amount)}</span>
                          <button onClick={() => handleDeleteExpense(exp.id)} className="text-red-300 hover:text-red-600"><Trash2 size={16} /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <h3 className="font-bold mb-4 flex items-center gap-2"><Wallet size={18} className="text-emerald-500" /> Income Sandbox</h3>
                <div className="grid grid-cols-1 gap-3 max-h-[300px] overflow-y-auto pr-2">
                  {successfulPayments.length === 0 ? <p className="text-sm text-gray-400">No payments.</p> : successfulPayments.map((txn) => {
                    const isExcluded = excludedTxns.has(txn.id);
                    const name = txn.students?.name ?? txn.students?.full_name ?? "Unknown";
                    const room = txn.students?.room ?? txn.students?.room_number ?? "";
                    return (
                      <div key={txn.id} className={`flex justify-between items-center p-3 rounded-xl border ${isExcluded ? "bg-gray-50 opacity-60" : "bg-emerald-50/30 border-emerald-100"}`}>
                        <div className="flex items-center gap-3">
                          <button onClick={() => toggleExcludeTxn(txn.id)} className="text-gray-400 hover:text-indigo-600">{isExcluded ? <XCircle size={18} /> : <CheckCircle size={18} />}</button>
                          <div><p className={`font-bold text-sm ${isExcluded ? "text-gray-500 line-through" : "text-gray-900"}`}>{name}</p><p className="text-xs text-gray-500">Room {room}</p></div>
                        </div>
                        <span className={`font-bold ${isExcluded ? "text-gray-400 line-through" : "text-emerald-600"}`}>+{formatINR(txn.amount)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "students" && (
          <div className="space-y-4">
            <div className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input type="text" placeholder="Search name..." className="w-full pl-9 pr-4 py-2 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm" onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <div className="relative">
                  <Filter className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400 pointer-events-none" />
                  <select className="pl-8 pr-3 py-2 bg-gray-50 border-none rounded-xl text-sm font-medium outline-none appearance-none" value={filterRoom} onChange={(e) => setFilterRoom(e.target.value)}>
                    {uniqueRooms.map((r) => <option key={r} value={r}>{r === "all" ? "All Rooms" : `Rm ${r}`}</option>)}
                  </select>
                </div>
                <select className="px-3 py-2 bg-gray-50 border-none rounded-xl text-sm font-medium outline-none" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                  <option value="all">All Status</option>
                  <option value="safe">Paid</option>
                  <option value="warning">Due Soon</option>
                  <option value="critical">Overdue</option>
                </select>
              </div>
            </div>

            {filteredStudents.map((student) => {
              const bill = getBillingDetails(student.last_paid_date);
              const isExpanded = expandedId === student.id;
              const borderColor = bill.riskLevel === "critical" ? "border-l-red-500" : bill.riskLevel === "warning" ? "border-l-amber-500" : "border-l-indigo-500";
              const studentFee = student.monthly_fee ?? currentFee;
              return (
                <div key={student.id} className={`bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden ${borderColor} border-l-4`}>
                  <div className="p-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50/50" onClick={() => setExpandedId(isExpanded ? null : student.id)}>
                    <img src={student.photo_url || "https://via.placeholder.com/150"} className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-sm" alt="student" />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold truncate text-gray-900">{getStudentName(student)}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="bg-gray-100 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded-md border">Room {getStudentRoom(student)}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${bill.statusColor}`}>{bill.daysLeft} Days Left</span>
                      </div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); handleUpdateStudentFee(student.id, studentFee); }} className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1.5 rounded-lg font-bold border flex items-center gap-1">
                      {formatINR(studentFee)} <Edit2 size={12} />
                    </button>
                    <span className="text-gray-400 text-sm">{isExpanded ? "▲" : "▼"}</span>
                  </div>
                  {isExpanded && (
                    <div className="bg-gray-50/50 border-t border-gray-100 p-4 space-y-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div><span className="text-xs text-gray-400 uppercase font-semibold">Next Bill</span><div className="flex items-center gap-1 font-medium text-gray-700"><Calendar size={14} className="text-indigo-500" />{bill.nextBillDate}</div></div>
                        <div><span className="text-xs text-gray-400 uppercase font-semibold">Mobile</span><div className="flex items-center gap-1 font-medium text-gray-700"><Phone size={14} className="text-indigo-500" />{getStudentPhone(student) || "--"}</div></div>
                        <div className="col-span-2"><span className="text-xs text-gray-400 uppercase font-semibold">Aadhar</span><div className="font-mono text-gray-600 bg-white px-2 py-1 rounded border w-fit flex items-center gap-1"><FileText size={14} />{student.adhar_number || "Not submitted"}</div></div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-gray-200">
                        <a href={`tel:${getStudentPhone(student)}`} className="bg-blue-50 text-blue-700 border border-blue-100 py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"><Phone size={16} /> Call</a>
                        <a href={createWhatsAppLink(student, bill)} target="_blank" rel="noreferrer" className="bg-green-50 text-green-700 border border-green-100 py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"><MessageCircle size={16} /> WhatsApp</a>
                        <button onClick={() => handleDownloadPDF(student, bill)} className="bg-indigo-50 text-indigo-700 border border-indigo-100 py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"><FileDown size={16} /> PDF</button>
                        <button onClick={() => handleDeleteStudent(student.id)} className="bg-red-50 text-red-600 border border-red-100 py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"><Trash2 size={16} /> Remove</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {filteredStudents.length === 0 && <div className="text-center py-16 text-gray-400"><Building2 className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>No students match filters</p></div>}
          </div>
        )}

        {activeTab === "payments" && (
          <div className="space-y-4">
            {pendingPayments.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-2xl border border-dashed"><CheckCircle className="w-12 h-12 mx-auto mb-3 text-emerald-300" /><p className="font-bold text-gray-600">All caught up!</p><p className="text-sm text-gray-400">No pending payments.</p></div>
            ) : pendingPayments.map((payment) => {
              const sName = payment.students?.name ?? payment.students?.full_name ?? "Unknown";
              const sRoom = payment.students?.room ?? payment.students?.room_number ?? "-";
              return (
                <div key={payment.id} className="bg-white p-5 rounded-2xl shadow-sm border border-amber-200/60 border-l-4 border-l-amber-400">
                  <div className="flex flex-col sm:flex-row justify-between gap-4">
                    <div className="flex gap-4">
                      <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center text-amber-600 shrink-0"><IndianRupee size={24} /></div>
                      <div>
                        <h3 className="font-bold text-gray-900">{sName}</h3>
                        <p className="text-sm text-gray-500">Room {sRoom} • {payment.transaction_id ?? payment.id.slice(0, 8)}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="bg-gray-100 text-gray-800 text-xs font-bold px-2 py-1 rounded-md">Amount: {formatINR(payment.amount)}</span>
                          <span className="text-xs text-gray-400">{new Date(payment.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col sm:items-end gap-2 border-t sm:border-t-0 sm:border-l border-gray-100 pt-4 sm:pt-0 sm:pl-4">
                      {payment.proof_url && <a href={payment.proof_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-indigo-50 text-indigo-700 py-2 px-4 rounded-xl font-bold text-sm"><Eye size={16} /> View Proof</a>}
                      <div className="flex gap-2 w-full">
                        <button onClick={() => handleRejectPayment(payment.id)} className="flex-1 flex items-center justify-center gap-1 bg-white text-red-600 border border-red-200 py-2 px-3 rounded-xl font-bold text-sm"><XCircle size={16} /> Reject</button>
                        <button onClick={() => handleApprovePayment(payment)} className="flex-1 flex items-center justify-center gap-1 bg-emerald-600 text-white py-2 px-4 rounded-xl font-bold text-sm"><CheckCircle size={16} /> Approve</button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === "expenses" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="font-bold text-gray-900 flex items-center gap-2"><Receipt size={18} className="text-red-500" /> Expenses</h2>
              <button onClick={() => setExpenseModalOpen(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold">+ Add Expense</button>
            </div>
            {expenses.length === 0 ? <p className="text-sm text-gray-400 bg-white p-6 rounded-2xl text-center">No expenses recorded.</p> : expenses.map((exp) => (
              <div key={exp.id} className="bg-white p-4 rounded-2xl border border-gray-100 flex justify-between items-center">
                <div><p className="font-bold text-sm">{exp.description}</p><p className="text-xs text-gray-500">{exp.date ? new Date(exp.date).toLocaleDateString() : ""}</p></div>
                <div className="flex items-center gap-3"><span className="font-bold text-red-600">-{formatINR(exp.amount)}</span><button onClick={() => handleDeleteExpense(exp.id)} className="text-red-300 hover:text-red-600"><Trash2 size={16} /></button></div>
              </div>
            ))}
            {expenseModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
                <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl">
                  <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Receipt size={20} className="text-red-500" /> Log Expense</h2>
                  <form onSubmit={handleAddExpense} className="space-y-4">
                    <div><label className="text-xs font-bold text-gray-500">Amount (₹)</label><input type="number" required value={expenseData.amount} onChange={(e) => setExpenseData({ ...expenseData, amount: e.target.value })} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-bold text-lg outline-none" placeholder="1500" /></div>
                    <div><label className="text-xs font-bold text-gray-500">Description</label><input type="text" required value={expenseData.description} onChange={(e) => setExpenseData({ ...expenseData, description: e.target.value })} className="w-full bg-gray-50 border rounded-xl px-4 py-3 text-sm outline-none" placeholder="Electricity Bill" /></div>
                    <div><label className="text-xs font-bold text-gray-500">Date</label><input type="date" required value={expenseData.date} onChange={(e) => setExpenseData({ ...expenseData, date: e.target.value })} className="w-full bg-gray-50 border rounded-xl px-4 py-3 text-sm outline-none" /></div>
                    <div className="flex gap-3 pt-2"><button type="button" onClick={() => setExpenseModalOpen(false)} className="flex-1 bg-gray-100 py-3 rounded-xl font-bold">Cancel</button><button type="submit" disabled={loading} className="flex-1 bg-gray-900 text-white py-3 rounded-xl font-bold flex justify-center">{loading ? <Loader2 className="animate-spin" /> : "Add"}</button></div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "dues" && (
          <div className="space-y-4">
            <div className="bg-white p-5 rounded-2xl border border-gray-100 flex justify-between items-center">
              <div><h3 className="font-bold text-gray-900">Dues Summary</h3><p className="text-xs text-gray-500">Using pg-engine duesSummary</p></div>
              <div className="text-right text-sm">
                <p>Billed: <span className="font-bold">{formatINR(dSummary.billed)}</span></p>
                <p>Collected: <span className="font-bold text-emerald-600">{formatINR(dSummary.collected)}</span></p>
                <p>Pending: <span className="font-bold text-amber-600">{formatINR(dSummary.pending)}</span></p>
                <p>Overdue: <span className="font-bold text-red-600">{formatINR(dSummary.overdue)}</span></p>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="p-4 border-b font-bold text-sm">Recent Dues · {dues.length} total</div>
              {dues.length === 0 ? <p className="p-6 text-sm text-gray-400 text-center">No dues yet. Generate via API: POST /api/dues/generate</p> : <div className="divide-y">
                {dues.slice(0, 30).map((d) => (
                  <div key={d.id} className="p-4 flex justify-between items-center text-sm">
                    <div>
                      <p className="font-bold">{d.month} • {formatINR(d.amount)}</p>
                      <p className="text-xs text-gray-500">Student {d.student_id.slice(0, 6)} · due {d.due_date ?? "-"}</p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${d.status === "paid" ? "bg-emerald-100 text-emerald-700" : d.status === "overdue" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{d.status}</span>
                  </div>
                ))}
              </div>}
            </div>
          </div>
        )}

        {activeTab === "rooms" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white p-4 rounded-2xl border text-center"><p className="text-xs text-gray-500">Total Beds</p><p className="text-xl font-bold">{occ.totalBeds}</p></div>
              <div className="bg-white p-4 rounded-2xl border text-center"><p className="text-xs text-gray-500">Occupied</p><p className="text-xl font-bold text-emerald-600">{occ.occupied}</p></div>
              <div className="bg-white p-4 rounded-2xl border text-center"><p className="text-xs text-gray-500">Vacant</p><p className="text-xl font-bold text-gray-700">{occ.vacant}</p></div>
              <div className="bg-white p-4 rounded-2xl border text-center"><p className="text-xs text-gray-500">Booked</p><p className="text-xl font-bold text-amber-600">{occ.booked}</p></div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-3"><Plus size={18} className="text-indigo-500" /> Add Room</h3>
              <form onSubmit={handleCreateRoom} className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <select value={newRoom.floor} onChange={(e) => setNewRoom({ ...newRoom, floor: e.target.value })} className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-medium">
                  <option value="Ground">Ground</option>
                  <option value="First">First</option>
                  <option value="Second">Second</option>
                  <option value="Third">Third</option>
                </select>
                <input placeholder="Room No (e.g. 104)" value={newRoom.room_no} onChange={(e) => setNewRoom({ ...newRoom, room_no: e.target.value })} className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold" required />
                <select value={newRoom.sharing_type} onChange={(e) => setNewRoom({ ...newRoom, sharing_type: e.target.value })} className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm">
                  <option value="1">Single (1)</option>
                  <option value="2">Double (2)</option>
                  <option value="3">Triple (3)</option>
                  <option value="4">4-share</option>
                  <option value="6">6-share</option>
                </select>
                <input type="number" placeholder="Rent ₹" value={newRoom.rent} onChange={(e) => setNewRoom({ ...newRoom, rent: e.target.value })} className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold" required />
                <button disabled={roomCreating} className="bg-indigo-600 text-white rounded-xl font-bold text-sm py-2.5 flex items-center justify-center gap-2 disabled:opacity-60">
                  {roomCreating ? <Loader2 className="animate-spin w-4 h-4" /> : <Plus size={16} />} Create
                </button>
              </form>
              <p className="text-xs text-gray-400 mt-2">Auto-creates N beds (A,B,C…) per sharing. API: POST /api/rooms</p>
            </div>

            <div className="bg-white rounded-2xl border overflow-hidden">
              <div className="p-4 border-b font-bold text-sm flex justify-between items-center"><span>Rooms · {rooms.length} total</span><span className="text-xs text-gray-500 font-normal">via /api/rooms?hostel_id=</span></div>
              {rooms.length === 0 ? <p className="p-6 text-sm text-gray-400 text-center">No rooms configured. Add one above.</p> : <div className="divide-y">
                {rooms.map((r) => {
                  const roomBeds = beds.filter((b) => b.room_id === r.id);
                  return (
                    <div key={r.id} className="p-4 space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-bold text-gray-900">Room {r.room_no} <span className="text-xs text-gray-500">· Floor {r.floor ?? "-"} · {String(r.sharing_type ?? "-")}-share · {r.rent ? formatINR(Number(r.rent)) : "-"}</span></p>
                          <p className="text-xs text-gray-400">{r.id.slice(0, 8)} · {r.status ?? "vacant"} · {roomBeds.length} bed(s)</p>
                        </div>
                        <button onClick={() => handleDeleteRoom(r.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={16} /></button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {roomBeds.map((b) => {
                          const occupant = students.find((s) => s.id === b.student_id);
                          return (
                            <div key={b.id} className={`p-3 rounded-xl border flex flex-col gap-2 ${b.status === "occupied" ? "bg-emerald-50/50 border-emerald-200" : "bg-gray-50 border-gray-200"}`}>
                              <div className="flex justify-between items-center">
                                <span className="font-bold text-sm flex items-center gap-1"><BedDouble size={14} /> Bed {b.bed_no ?? b.id.slice(0, 4)}</span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${b.status === "occupied" ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-600"}`}>{b.status ?? (b.student_id ? "occupied" : "vacant")}</span>
                              </div>
                              {b.student_id && occupant ? (
                                <div className="text-xs">
                                  <p className="font-bold text-gray-900">{getStudentName(occupant)} · {getStudentPhone(occupant)}</p>
                                  <button onClick={() => handleVacateBed(b.id)} className="mt-2 w-full bg-white border border-red-200 text-red-600 py-1.5 rounded-lg font-bold text-xs flex items-center justify-center gap-1"><XCircle size={12} /> Vacate</button>
                                </div>
                              ) : (
                                <div className="flex gap-1.5">
                                  <select id={`assign-${b.id}`} defaultValue="" className="flex-1 bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-medium">
                                    <option value="">Select student</option>
                                    {students.filter((s) => !s.bed_id).map((s) => <option key={s.id} value={s.id}>{getStudentName(s)} · {getStudentPhone(s) || s.id.slice(0,4)}</option>)}
                                    {(students.length===0||students.filter((s)=>!s.bed_id).length===0) && <option disabled>No unassigned students</option>}
                                  </select>
                                  <button onClick={() => {
                                    const sel = document.getElementById(`assign-${b.id}`) as HTMLSelectElement | null;
                                    if (sel?.value) handleAssignBed(b.id, sel.value);
                                  }} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1"><UserCheck size={12} /> Assign</button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>}
            </div>
          </div>
        )}

        {activeTab === "complaints" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col sm:flex-row justify-between gap-3 items-start sm:items-center">
              <h3 className="font-bold text-gray-900 flex items-center gap-2"><MessageSquare size={18} className="text-amber-500" /> Complaints · {filteredComplaints.length}</h3>
              <div className="flex gap-2">
                <select value={complaintFilter} onChange={(e) => setComplaintFilter(e.target.value)} className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm font-medium">
                  <option value="all">All</option>
                  <option value="open">Open</option>
                  <option value="working">Working</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>
            </div>
            {filteredComplaints.length === 0 ? <p className="bg-white p-8 rounded-2xl text-center text-sm text-gray-400 border">No complaints in this filter.</p> : <div className="space-y-3">
              {filteredComplaints.map((c) => (
                <div key={c.id} className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-gray-900">{c.category ?? "General"}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold capitalize ${c.status==="open"?"bg-amber-100 text-amber-700":c.status==="working"?"bg-blue-100 text-blue-700":"bg-emerald-100 text-emerald-700"}`}>{c.status}</span>
                      </div>
                      <p className="text-sm text-gray-700 mt-1">{c.description ?? "-"}</p>
                      <p className="text-xs text-gray-400 mt-1">Student: {c.students?.name ?? c.student_id?.slice(0,6) ?? "-"} · {c.students?.phone ?? ""} · {new Date(c.created_at).toLocaleString()}</p>
                      {c.assigned_to && <p className="text-xs text-indigo-600 mt-1">Assigned to: {c.assigned_to}</p>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {c.status === "open" && <button onClick={() => handleComplaintPatch(c.id, { status: "working" })} className="bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-xl text-xs font-bold">Mark Working</button>}
                    {c.status !== "resolved" && <button onClick={() => handleComplaintPatch(c.id, { status: "resolved" })} className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-xl text-xs font-bold">Mark Resolved</button>}
                    {c.status === "resolved" && <button onClick={() => handleComplaintPatch(c.id, { status: "open" })} className="bg-amber-50 text-amber-700 border px-3 py-1.5 rounded-xl text-xs font-bold">Reopen</button>}
                    <div className="flex items-center gap-1 ml-auto">
                      <input id={`assign-c-${c.id}`} placeholder="Assign to" defaultValue={c.assigned_to ?? ""} className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-xs w-28" />
                      <button onClick={() => {
                        const el = document.getElementById(`assign-c-${c.id}`) as HTMLInputElement | null;
                        handleComplaintPatch(c.id, { assigned_to: el?.value?.trim() || "" });
                      }} className="bg-gray-900 text-white px-3 py-1.5 rounded-lg text-xs font-bold">Assign</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>}
          </div>
        )}

        {activeTab === "enquiries" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 p-4 flex justify-between items-center">
              <h3 className="font-bold text-gray-900 flex items-center gap-2"><ClipboardList size={18} className="text-blue-500" /> Enquiries · {filteredEnquiries.length}</h3>
              <select value={enquiryFilter} onChange={(e) => setEnquiryFilter(e.target.value)} className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm font-medium">
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="contacted">Contacted</option>
              </select>
            </div>
            {filteredEnquiries.length === 0 ? <p className="bg-white p-8 rounded-2xl text-center text-sm text-gray-400 border">No enquiries.</p> : <div className="space-y-3">
              {filteredEnquiries.map((e) => (
                <div key={e.id} className={`bg-white rounded-2xl border p-4 ${e.contacted ? "border-emerald-200 bg-emerald-50/20" : "border-gray-100"}`}>
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <p className="font-bold text-sm text-gray-900">{e.name ?? "Anonymous"} <span className="text-xs font-normal text-gray-500">· {e.phone ?? "-"}</span></p>
                      <p className="text-xs text-gray-500">{e.occupation ?? ""} {e.move_in ? `· Move-in ${new Date(e.move_in).toLocaleDateString()}` : ""} · {new Date(e.created_at).toLocaleDateString()}</p>
                      <p className="text-sm text-gray-700 mt-2 bg-gray-50 border rounded-xl p-2">{e.message ?? "-"}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-bold ${e.contacted ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{e.contacted ? "Contacted" : "Pending"}</span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    {!e.contacted ? <button onClick={() => handleEnquiryContacted(e.id, true)} className="bg-indigo-600 text-white px-4 py-1.5 rounded-xl text-xs font-bold">Mark Contacted</button> : <button onClick={() => handleEnquiryContacted(e.id, false)} className="bg-white border px-4 py-1.5 rounded-xl text-xs font-bold">Mark Pending</button>}
                    {e.phone && <a href={`tel:${e.phone}`} className="bg-blue-50 text-blue-700 border border-blue-100 px-4 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1"><Phone size={12} /> Call</a>}
                  </div>
                </div>
              ))}
            </div>}
          </div>
        )}

        {activeTab === "reviews" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 p-4 flex justify-between items-center">
              <h3 className="font-bold text-gray-900 flex items-center gap-2"><Star size={18} className="text-amber-500" /> Reviews · {filteredReviews.length}</h3>
              <select value={reviewFilter} onChange={(e) => setReviewFilter(e.target.value)} className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm font-medium">
                <option value="all">All</option>
                <option value="approved">Approved</option>
                <option value="pending">Pending</option>
              </select>
            </div>
            {filteredReviews.length === 0 ? <p className="bg-white p-8 rounded-2xl text-center text-sm text-gray-400 border">No reviews.</p> : <div className="space-y-3">
              {filteredReviews.map((r) => (
                <div key={r.id} className={`bg-white rounded-2xl border p-4 ${r.approved ? "border-emerald-200" : "border-amber-200"}`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-bold text-sm text-gray-900">{r.name} <span className="text-amber-500">{"★".repeat(r.rating)}{"☆".repeat(5-r.rating)}</span> <span className="text-xs text-gray-500">({r.rating}/5)</span></p>
                      <p className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString()} · {r.source ?? "site"} · <span className={r.approved ? "text-emerald-600 font-bold" : "text-amber-600 font-bold"}>{r.approved ? "Approved" : "Pending"}</span></p>
                    </div>
                    <div className="flex gap-1.5">
                      {!r.approved ? <button onClick={() => handleReviewApprove(r.id, true)} className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1"><Star size={12} /> Approve</button> : <button onClick={() => handleReviewApprove(r.id, false)} className="bg-amber-50 text-amber-700 border px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1"><StarOff size={12} /> Unapprove</button>}
                      <button onClick={() => handleReviewDelete(r.id)} className="bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-xl text-xs font-bold"><Trash2 size={12} /></button>
                    </div>
                  </div>
                  <p className="text-sm text-gray-700 mt-2 bg-gray-50 border rounded-xl p-3">{r.text}</p>
                </div>
              ))}
            </div>}
          </div>
        )}
      </div>
    </div>
  );
}
