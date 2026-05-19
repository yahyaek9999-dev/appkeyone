"use client";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const r = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    r.push("/");
    r.refresh();
  }
  return (
    <button
      onClick={logout}
      className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-slate-400 transition hover:bg-red-500/10 hover:text-red-300"
    >
      <LogOut className="w-4 h-4" />
      تسجيل خروج
    </button>
  );
}
