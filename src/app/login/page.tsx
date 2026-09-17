"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import toast, { Toaster } from "react-hot-toast";
import { Building2, Phone, Lock, User, ShieldCheck, ArrowRight } from "lucide-react";

type Hostel = { id: string; name: string };

export default function LoginPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hostels, setHostels] = useState<Hostel[]>([]);

  const [stuHostelId, setStuHostelId] = useState("");
  const [stuPhone, setStuPhone] = useState("");

  const [adminHostelId, setAdminHostelId] = useState("");
  const [adminPass, setAdminPass] = useState("");

  useEffect(() => {
    const fetchHostels = async () => {
      const { data } = await supabase.from("hostels").select("id, name");
      if (data) setHostels(data as Hostel[]);
    };
    fetchHostels();
  }, []);

  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stuHostelId) {
      toast.error("Please select a hostel");
      return;
    }
    if (!stuPhone.trim()) {
      toast.error("Please enter phone number");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("students")
        .select("*")
        .eq("hostel_id", stuHostelId)
        .eq("phone", stuPhone.trim())
        .maybeSingle();

      if (error || !data) throw new Error("Invalid credentials");

      localStorage.setItem("student_user", JSON.stringify(data));
      const displayName = (data as { name?: string }).name ?? "Student";
      toast.success(`Welcome, ${displayName}!`);
      router.push("/student-dashboard");
    } catch {
      toast.error("Login failed. Check hostel & phone.");
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminHostelId) {
      toast.error("Please select a hostel");
      return;
    }
    const expected = process.env.NEXT_PUBLIC_ADMIN_PASSWORD ?? "";
    const master = expected || "admin123";
    if (adminPass === master) {
      localStorage.setItem("admin_hostel_id", adminHostelId);
      toast.success("Admin access granted");
      router.push("/admin");
    } else {
      toast.error("Incorrect password");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Toaster position="top-center" />
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-gray-100">
        <div className="flex bg-gray-50/50 border-b border-gray-100 p-2">
          <button
            type="button"
            onClick={() => setIsAdmin(false)}
            className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 ${!isAdmin ? "bg-white text-indigo-600 shadow-md" : "text-gray-400 hover:bg-gray-100"}`}
          >
            <User size={16} /> Student
          </button>
          <button
            type="button"
            onClick={() => setIsAdmin(true)}
            className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 ${isAdmin ? "bg-white text-indigo-600 shadow-md" : "text-gray-400 hover:bg-gray-100"}`}
          >
            <ShieldCheck size={16} /> Admin
          </button>
        </div>

        <div className="p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900">{isAdmin ? "Hostel Admin" : "Student Portal"}</h1>
            <p className="text-gray-500 text-sm mt-1">Login to access your dashboard</p>
          </div>

          {!isAdmin ? (
            <form onSubmit={handleStudentLogin} className="space-y-4">
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Building2 className="h-5 w-5 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
                </div>
                <select
                  className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-100 font-medium transition-all appearance-none text-gray-700"
                  value={stuHostelId}
                  onChange={(e) => setStuHostelId(e.target.value)}
                  required
                >
                  <option value="">Select Your Hostel</option>
                  {hostels.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Phone className="h-5 w-5 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
                </div>
                <input
                  type="tel"
                  placeholder="Phone Number"
                  required
                  className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-100 font-medium transition-all"
                  value={stuPhone}
                  onChange={(e) => setStuPhone(e.target.value)}
                />
              </div>

              <button
                disabled={loading}
                className="w-full bg-gray-900 text-white py-4 rounded-xl font-bold shadow-lg hover:bg-black hover:shadow-xl transition-all flex justify-center items-center gap-2 disabled:opacity-60"
              >
                {loading ? "Logging in..." : <>Login <ArrowRight size={18} /></>}
              </button>
              <p className="text-xs text-gray-400 text-center">Use phone number registered with hostel</p>
            </form>
          ) : (
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Building2 className="h-5 w-5 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
                </div>
                <select
                  className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-100 font-medium transition-all appearance-none text-gray-700"
                  value={adminHostelId}
                  onChange={(e) => setAdminHostelId(e.target.value)}
                  required
                >
                  <option value="">Select Your Hostel</option>
                  {hostels.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
                </div>
                <input
                  type="password"
                  placeholder="Master Password"
                  required
                  className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-100 font-medium transition-all"
                  value={adminPass}
                  onChange={(e) => setAdminPass(e.target.value)}
                />
              </div>
              <button className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold shadow-lg hover:bg-indigo-700 hover:shadow-indigo-200 transition-all flex justify-center items-center gap-2">
                Access Dashboard <ArrowRight size={18} />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
