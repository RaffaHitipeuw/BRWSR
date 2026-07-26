import { Navigate } from "react-router-dom";
import { Avatar, Badge, Button, Card, CardTitle } from "@eduos/ui";
import { useAuthStore } from "../api/auth";

interface AppTile {
  name: string;
  permission: string;
  note: string;
}

// Stand-in for the future EduOS Browser launcher (Level 1 of the diagram).
// Tiles are gated by permission, demonstrating Login -> Identity -> Permission -> Application.
const APP_TILES: AppTile[] = [
  { name: "Classroom", permission: "classroom:read", note: "Materi & tugas" },
  { name: "CBT", permission: "cbt:read", note: "Ujian berbasis komputer" },
  { name: "Presensi", permission: "attendance:write", note: "Kehadiran siswa" },
  { name: "Nilai", permission: "cbt:grade", note: "Penilaian" },
];

export default function Home() {
  const { user, hasPermission, logout } = useAuthStore();

  if (!user) return <Navigate to="/login" replace />;

  const visibleTiles = APP_TILES.filter((t) => hasPermission(t.permission));

  return (
    <div className="min-h-screen bg-paper px-6 py-8">
      <header className="flex items-center justify-between max-w-3xl mx-auto mb-8">
        <div className="flex items-center gap-3">
          <Avatar name={user.full_name} />
          <div>
            <p className="font-medium text-ink leading-tight">{user.full_name}</p>
            <Badge role={user.role as "admin" | "teacher" | "student"}>{user.role}</Badge>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={logout}>
          Keluar
        </Button>
      </header>

      <main className="max-w-3xl mx-auto">
        <h1 className="font-display text-2xl mb-1">
          Selamat datang, {user.full_name.split(" ")[0]}.
        </h1>
        <p className="text-ink/60 mb-6">
          Ini placeholder launcher Phase 1 — nanti diganti EduOS Browser sungguhan (Level 7).
        </p>

        {visibleTiles.length === 0 ? (
          <Card>
            <p className="text-sm text-ink/60">
              Role <strong>{user.role}</strong> belum punya akses ke modul manapun. Tambahkan
              permission di tabel <code className="font-mono text-xs">roles</code>.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {visibleTiles.map((tile) => (
              <Card key={tile.name}>
                <CardTitle>{tile.name}</CardTitle>
                <p className="text-sm text-ink/60">{tile.note}</p>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
