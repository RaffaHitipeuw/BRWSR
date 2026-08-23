import { useState, useEffect, useRef } from "react";
import { teacherMonitoringService, StudentStream } from "../services/teacherMonitoring";

interface MonitoringPopupProps {
  onClose: () => void;
}

export function MonitoringPopup({ onClose }: MonitoringPopupProps) {
  const [sessionCode, setSessionCode] = useState(() => teacherMonitoringService.getSessionCode() || "");
  const [students, setStudents] = useState<StudentStream[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());

  useEffect(() => {
    const unsubscribe = teacherMonitoringService.subscribe((state) => {
      setStudents(state.students);
      setIsListening(state.isListening);
      if (state.sessionCode) {
        setSessionCode(state.sessionCode);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    students.forEach((student) => {
      const video = videoRefs.current.get(student.peerId);
      if (video && student.stream) {
        video.srcObject = student.stream;
      }
    });
  }, [students]);

  const handleStartListening = async () => {
    if (!sessionCode || sessionCode.length < 4) {
      alert("Masukkan kode sesi yang valid (minimal 4 karakter)");
      return;
    }
    await teacherMonitoringService.startListening(sessionCode);
  };

  const handleStopListening = () => {
    teacherMonitoringService.stopListening();
  };

  const handleGenerateCode = () => {
    const code = teacherMonitoringService.generateSessionCode();
    setSessionCode(code);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[900px] h-[600px] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
            Monitoring Siswa
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          >
            <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={sessionCode}
              onChange={(e) => setSessionCode(e.target.value.toUpperCase())}
              placeholder="Kode Sesi"
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none uppercase"
              maxLength={6}
              disabled={isListening}
            />
            <button
              onClick={handleGenerateCode}
              disabled={isListening}
              className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              Generate
            </button>
            {!isListening ? (
              <button
                onClick={handleStartListening}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Mulai Monitor
              </button>
            ) : (
              <button
                onClick={handleStopListening}
                className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Stop
              </button>
            )}
          </div>
          {isListening && (
            <p className="mt-2 text-sm text-green-600 dark:text-green-400">
              Sedang memonitor sesi: <strong>{sessionCode}</strong>
            </p>
          )}
        </div>

        <div className="flex-1 overflow-auto p-4">
          {students.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
              <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <p className="text-lg">Belum ada siswa yang terhubung</p>
              <p className="text-sm mt-1">Bagikan kode sesi ke siswa untuk mulai monitoring</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {students.map((student) => (
                <div
                  key={student.peerId}
                  onClick={() => setSelectedStudent(selectedStudent === student.peerId ? null : student.peerId)}
                  className={`border-2 rounded-lg overflow-hidden cursor-pointer transition-all ${
                    selectedStudent === student.peerId
                      ? "border-blue-500 ring-2 ring-blue-200"
                      : "border-gray-200 dark:border-gray-600 hover:border-blue-300"
                  }`}
                >
                  <div className="aspect-video bg-gray-900 relative">
                    <video
                      ref={(el) => {
                        if (el) videoRefs.current.set(student.peerId, el);
                      }}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-contain"
                    />
                    {!student.stream && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="animate-pulse flex space-x-2">
                          <div className="w-3 h-3 bg-blue-400 rounded-full"></div>
                          <div className="w-3 h-3 bg-blue-400 rounded-full animation-delay-200"></div>
                          <div className="w-3 h-3 bg-blue-400 rounded-full animation-delay-400"></div>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="p-2 bg-gray-50 dark:bg-gray-700">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
                      Siswa {student.peerId.slice(0, 8)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {student.info.screenInfo.width} x {student.info.screenInfo.height}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400">
          {students.length} siswa terhubung
        </div>
      </div>
    </div>
  );
}
