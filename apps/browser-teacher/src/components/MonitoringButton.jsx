import { useState, useCallback, useEffect } from "react";
import { teacherMonitoringService, StudentStream } from "../services/teacherMonitoring";

function MonitoringPanel({ onClose }: { onClose: () => void }) {
  const [students, setStudents] = useState<StudentStream[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [sessionCode, setSessionCode] = useState(teacherMonitoringService.getSessionCode() || "");
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const videoRefs = new Map<string, HTMLVideoElement>();

  useEffect(() => {
    const unsubscribe = teacherMonitoringService.subscribe((state) => {
      setStudents(state.students);
      setIsListening(state.isListening);
      if (state.sessionCode) setSessionCode(state.sessionCode);
    });
    return unsubscribe;
  }, []);

  const handleStartListening = useCallback(async () => {
    if (!sessionCode || sessionCode.length < 4) {
      alert("Masukkan kode sesi minimal 4 karakter");
      return;
    }
    await teacherMonitoringService.startListening(sessionCode);
  }, [sessionCode]);

  const handleStopListening = useCallback(() => {
    teacherMonitoringService.stopListening();
  }, []);

  const handleGenerateCode = useCallback(() => {
    const code = teacherMonitoringService.generateSessionCode();
    setSessionCode(code);
  }, []);

  const selectedData = selectedStudent ? students.find(s => s.peerId === selectedStudent) : null;

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-xl shadow-2xl w-[900px] h-[600px] max-w-[95vw] max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gray-900 px-4 py-3 flex items-center justify-between border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">Monitoring Siswa</h2>
          <span className="text-sm text-gray-400">{students.length} siswa terhubung</span>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-3 border-b border-gray-700 bg-gray-850">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={sessionCode}
              onChange={(e) => setSessionCode(e.target.value.toUpperCase())}
              placeholder="Kode Sesi"
              className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:border-blue-500 outline-none uppercase font-mono text-lg tracking-wider"
              maxLength={6}
              disabled={isListening}
            />
            <button
              onClick={handleGenerateCode}
              disabled={isListening}
              className="px-3 py-2 bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600 disabled:opacity-50 text-sm"
            >
              Generate
            </button>
            {!isListening ? (
              <button
                onClick={handleStartListening}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                Mulai Monitor
              </button>
            ) : (
              <button
                onClick={handleStopListening}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
              >
                Stop
              </button>
            )}
          </div>
          {isListening && (
            <p className="mt-2 text-sm text-green-400">
              Sedang memonitor sesi: <strong className="font-mono">{sessionCode}</strong>
            </p>
          )}
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="w-48 bg-gray-900 p-2 overflow-y-auto border-r border-gray-700">
            {students.length === 0 ? (
              <div className="text-center text-gray-500 py-8 text-xs">
                <svg className="w-10 h-10 mx-auto mb-2 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <p>Belum ada siswa</p>
                <p className="mt-1 text-[10px]">Hubungkan browser siswa</p>
              </div>
            ) : (
              <div className="space-y-1">
                {students.map((student) => (
                  <div
                    key={student.peerId}
                    onClick={() => setSelectedStudent(student.peerId)}
                    className={`p-2 rounded-lg cursor-pointer transition-all ${
                      selectedStudent === student.peerId
                        ? "bg-blue-600"
                        : "bg-gray-800 hover:bg-gray-700"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
                      <span className="text-sm text-white truncate">
                        Siswa {student.peerId.slice(0, 6)}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">
                      {student.info.screenInfo.width}x{student.info.screenInfo.height}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1 bg-gray-950 flex items-center justify-center p-4">
            {selectedData ? (
              <div className="w-full h-full flex flex-col">
                <div className="flex-1 bg-black rounded-lg overflow-hidden flex items-center justify-center">
                  <video
                    ref={(el) => {
                      if (el) {
                        videoRefs.set(selectedData.peerId, el);
                        if (selectedData.stream) el.srcObject = selectedData.stream;
                      }
                    }}
                    autoPlay
                    playsInline
                    muted
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
                <div className="text-center text-sm text-gray-400 mt-2">
                  {selectedData.peerId.slice(0, 8)} - {selectedData.info.screenInfo.width}x{selectedData.info.screenInfo.height}
                </div>
              </div>
            ) : (
              <div className="text-gray-500 text-center">
                <svg className="w-16 h-16 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <p className="text-sm">Pilih siswa untuk melihat layar</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MonitoringButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [studentCount, setStudentCount] = useState(0);

  useEffect(() => {
    const unsubscribe = teacherMonitoringService.subscribe((state) => {
      setStudentCount(state.students.length);
    });
    return unsubscribe;
  }, []);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 w-14 h-14 bg-blue-600 hover:bg-blue-700 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 z-40"
        title="Monitor Siswa"
      >
        <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        {studentCount > 0 && (
          <span className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center shadow">
            {studentCount}
          </span>
        )}
      </button>

      {isOpen && <MonitoringPanel onClose={() => setIsOpen(false)} />}
    </>
  );
}
