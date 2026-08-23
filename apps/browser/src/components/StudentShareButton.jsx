import { useAutoMonitoring } from "../hooks/useAutoMonitoring";

export function StudentShareButton() {
  const { status, sessionCode, startSharing, isSharing } = useAutoMonitoring();

  if (!sessionCode) return null;

  if (isSharing) {
    return (
      <div className="fixed bottom-4 right-4 z-40">
        <div className="bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
          <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
          <span className="text-sm font-medium">Screen Share Aktif</span>
        </div>
      </div>
    );
  }

  const isError = status.status === "error";

  return (
    <button
      onClick={startSharing}
      className={`fixed bottom-4 right-4 z-40 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 transition-all hover:scale-105 ${
        isError
          ? "bg-red-500 hover:bg-red-600 text-white"
          : "bg-blue-600 hover:bg-blue-700 text-white"
      }`}
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        />
      </svg>
      <div className="text-left">
        <div className="text-sm font-medium">Mulai Screen Share</div>
        <div className="text-xs opacity-80">Sesi: {sessionCode}</div>
      </div>
    </button>
  );
}
