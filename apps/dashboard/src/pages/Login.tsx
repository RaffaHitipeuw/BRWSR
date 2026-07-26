import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, CardTitle, Input } from "@eduos/ui";
import { useAuthStore } from "../api/auth";

export default function Login() {
  const navigate = useNavigate();
  const { login, register, loading, error } = useAuthStore();
  const [mode, setMode] = useState<"login" | "register">("login");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("teacher");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(fullName, email, password, role);
      }
      navigate("/");
    } catch {
      // error is already surfaced via the store
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper px-4">
      <Card className="w-full max-w-sm">
        <CardTitle>{mode === "login" ? "Masuk ke EduOS" : "Buat akun"}</CardTitle>
        <p className="text-sm text-ink/60 mb-4">
          {mode === "login"
            ? "Satu identitas untuk seluruh aplikasi sekolah."
            : "Akun baru otomatis mendapat permission sesuai role."}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {mode === "register" && (
            <Input
              label="Nama lengkap"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          )}
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
          {mode === "register" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="rounded-md border border-ink/15 px-3 py-2 text-sm bg-white"
              >
                <option value="admin">Admin</option>
                <option value="teacher">Teacher</option>
                <option value="student">Student</option>
              </select>
            </div>
          )}

          {error && <p className="text-sm text-brick">{error}</p>}

          <Button type="submit" disabled={loading} className="mt-1">
            {loading ? "Memproses..." : mode === "login" ? "Masuk" : "Daftar"}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
          className="text-sm text-slate mt-4 underline"
        >
          {mode === "login" ? "Belum punya akun? Daftar" : "Sudah punya akun? Masuk"}
        </button>
      </Card>
    </div>
  );
}
