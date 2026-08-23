import { useState, useEffect, useRef, useMemo } from "react";
import { clsx } from "clsx";

/**
 * @typedef {Object} App
 * @property {string} id
 * @property {string} name
 * @property {string} [description]
 * @property {React.ReactNode} [icon]
 * @property {string} [iconUrl]
 * @property {string} [url]
 * @property {string} [shortcut]
 * @property {string} [category]
 * @property {string[]} [permissions]
 */

/**
 * @typedef {Object} AppLauncherProps
 * @property {boolean} isOpen
 * @property {() => void} onClose
 * @property {App[]} apps
 * @property {(app: App) => void} onSelectApp
 * @property {string[]} [userPermissions]
 */

export function AppLauncher({
  isOpen,
  onClose,
  apps,
  onSelectApp,
  userPermissions = [],
}) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const filteredApps = useMemo(() => {
    const lowerQuery = query.toLowerCase();

    return apps
      .filter((app) => {
        if (app.permissions && app.permissions.length > 0) {
          const hasPermission = app.permissions.some((p) => userPermissions.includes(p));
          if (!hasPermission) return false;
        }

        if (!query) return true;

        const nameMatch = app.name.toLowerCase().includes(lowerQuery);
        const descMatch = app.description?.toLowerCase().includes(lowerQuery);
        const categoryMatch = app.category?.toLowerCase().includes(lowerQuery);

        return nameMatch || descMatch || categoryMatch;
      })
      .sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        const queryLower = query.toLowerCase();

        if (aName.startsWith(queryLower) && !bName.startsWith(queryLower)) return -1;
        if (!aName.startsWith(queryLower) && bName.startsWith(queryLower)) return 1;

        return a.name.localeCompare(b.name);
      });
  }, [apps, query, userPermissions]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredApps.length]);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (listRef.current) {
      const selectedElement = listRef.current.children[selectedIndex];
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => (prev < filteredApps.length - 1 ? prev + 1 : prev));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
          break;
        case "Enter":
          e.preventDefault();
          if (filteredApps[selectedIndex]) {
            onSelectApp(filteredApps[selectedIndex]);
            onClose();
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, filteredApps, selectedIndex, onSelectApp, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {}
      <div className="relative w-full max-w-xl bg-[#1a1a1a] rounded-xl shadow-2xl border border-[#2d2d2d] overflow-hidden">
        {}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#2d2d2d]">
          <svg
            className="w-5 h-5 text-gray-400 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search apps..."
            className="flex-1 bg-transparent outline-none text-white placeholder-gray-500"
          />
          <kbd className="hidden sm:flex items-center gap-1 px-2 py-1 text-xs text-gray-500 bg-[#2d2d2d] rounded">
            <span>esc</span>
          </kbd>
        </div>

        {}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-2">
          {filteredApps.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500">
              <svg
                className="w-12 h-12 mx-auto mb-3 opacity-50"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p>No apps found</p>
              <p className="text-sm mt-1">Try a different search term</p>
            </div>
          ) : (
            filteredApps.map((app, index) => (
              <button
                key={app.id}
                className={clsx(
                  "w-full flex items-center gap-3 px-4 py-3 transition-colors",
                  index === selectedIndex ? "bg-[#2d2d2d]" : "hover:bg-[#2d2d2d]/50",
                )}
                onClick={() => {
                  onSelectApp(app);
                  onClose();
                }}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                {}
                <div className="flex-shrink-0 w-10 h-10 bg-[#2d2d2d] rounded-lg flex items-center justify-center">
                  {app.iconUrl ? (
                    <img src={app.iconUrl} alt="" className="w-6 h-6" />
                  ) : app.icon ? (
                    <span className="w-6 h-6">{app.icon}</span>
                  ) : (
                    <span className="text-lg font-bold text-gold">
                      {app.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>

                {}
                <div className="flex-1 min-w-0 text-left">
                  <p className="font-medium text-white truncate">{app.name}</p>
                  {app.description && (
                    <p className="text-sm text-gray-400 truncate">{app.description}</p>
                  )}
                </div>

                {}
                {app.shortcut && (
                  <kbd className="flex-shrink-0 hidden sm:flex items-center gap-1 px-2 py-1 text-xs text-gray-500 bg-[#3d3d3d] rounded">
                    {app.shortcut}
                  </kbd>
                )}
              </button>
            ))
          )}
        </div>

        {}
        <div className="flex items-center justify-between px-4 py-2 border-t border-[#2d2d2d] text-xs text-gray-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-[#2d2d2d] rounded">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-[#2d2d2d] rounded">↓</kbd>
              <span className="ml-1">Navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-[#2d2d2d] rounded">↵</kbd>
              <span className="ml-1">Open</span>
            </span>
          </div>
          <span>{filteredApps.length} apps</span>
        </div>
      </div>
    </div>
  );
}

export const EDUOS_APPS = [
  {
    id: "home",
    name: "Home",
    description: "Return to dashboard",
    category: "Navigation",
    shortcut: "gh",
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
        />
      </svg>
    ),
  },
  {
    id: "dashboard",
    name: "Dashboard",
    description: "View overview and statistics",
    category: "Navigation",
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
        />
      </svg>
    ),
  },
  {
    id: "classroom",
    name: "Classroom",
    description: "Learning materials and assignments",
    category: "Academic",
    permissions: ["classroom:read"],
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
        />
      </svg>
    ),
  },
  {
    id: "cbt",
    name: "CBT",
    description: "Computer-based testing",
    category: "Academic",
    permissions: ["cbt:read"],
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
        />
      </svg>
    ),
  },
  {
    id: "attendance",
    name: "Presensi",
    description: "Student attendance tracking",
    category: "Academic",
    permissions: ["attendance:write"],
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
        />
      </svg>
    ),
  },
  {
    id: "grades",
    name: "Nilai",
    description: "Grades and assessments",
    category: "Academic",
    permissions: ["cbt:grade"],
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      </svg>
    ),
  },
  {
    id: "schedule",
    name: "Jadwal",
    description: "Class schedule and timetable",
    category: "Academic",
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
    ),
  },
  {
    id: "messages",
    name: "Pesan",
    description: "Messages and announcements",
    category: "Communication",
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
        />
      </svg>
    ),
  },
  {
    id: "settings",
    name: "Settings",
    description: "Application settings",
    category: "System",
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    ),
  },
  {
    id: "help",
    name: "Help",
    description: "Help and support",
    category: "System",
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  },
];
