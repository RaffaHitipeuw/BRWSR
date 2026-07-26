import { Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/Login";
import Home from "./pages/Home";
import { useAuthStore } from "./api/auth";

export default function App() {
  const user = useAuthStore((s) => s.user);

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<Home />} />
    </Routes>
  );
}
