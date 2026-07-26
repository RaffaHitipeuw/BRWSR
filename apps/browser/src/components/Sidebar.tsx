import { useState, useEffect } from "react";
import { clsx } from "clsx";
import { useTabStore } from "../stores/tabs";

export interface SidebarItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  href?: string;
  badge?: string | number;
  onClick?: () => void;
}

interface SidebarProps {
  items: SidebarItem[];
  activeItem?: string;
  onItemClick?: (item: SidebarItem) => void;
  defaultCollapsed?: boolean;
  width?: number;
  collapsedWidth?: number;
}

export function Sidebar({
  items,
  activeItem,
  onItemClick,
  defaultCollapsed = false,
  width = 240,
  collapsedWidth = 64,
}: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [isHovered, setIsHovered] = useState(false);

  // Auto-expand on hover when collapsed
  useEffect(() => {
    if (isCollapsed && isHovered) {
      // Keep expanded while hovering
    } else {
      // Collapse after hover ends
    }
  }, [isCollapsed, isHovered]);

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  const currentWidth = isCollapsed && !isHovered ? collapsedWidth : width;

  return (
    <aside
      className={clsx(
        "h-full bg-[#1a1a1a] border-r border-[#2d2d2d] flex flex-col transition-all duration-200 ease-out",
        isCollapsed && !isHovered ? "" : "",
      )}
      style={{ width: currentWidth, minWidth: currentWidth }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Header */}
      <div className="flex items-center h-14 px-4 border-b border-[#2d2d2d]">
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gold rounded-lg flex items-center justify-center">
              <span className="text-[#1a1a1a] font-bold text-sm">E</span>
            </div>
            <span className="font-display text-white font-semibold">EduOS</span>
          </div>
        )}
        {isCollapsed && !isHovered && (
          <div className="w-8 h-8 mx-auto bg-gold rounded-lg flex items-center justify-center">
            <span className="text-[#1a1a1a] font-bold text-sm">E</span>
          </div>
        )}
        {isCollapsed && isHovered && (
          <div className="w-full flex justify-end">
            <button
              onClick={toggleCollapse}
              className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#2d2d2d] rounded transition-colors"
              title="Expand sidebar"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 5l7 7-7 7M5 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {items.map((item) => (
          <SidebarItemComponent
            key={item.id}
            item={item}
            isActive={activeItem === item.id}
            isCollapsed={isCollapsed && !isHovered}
            onClick={() => onItemClick?.(item)}
          />
        ))}
      </nav>

      {/* Collapse Toggle (when expanded) */}
      {!isCollapsed && (
        <div className="p-2 border-t border-[#2d2d2d]">
          <button
            onClick={toggleCollapse}
            className="w-full flex items-center gap-3 px-3 py-2 text-gray-400 hover:text-white hover:bg-[#2d2d2d] rounded-lg transition-colors"
          >
            <svg
              className="w-5 h-5 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
              />
            </svg>
            {!isCollapsed && <span className="text-sm">Collapse</span>}
          </button>
        </div>
      )}
    </aside>
  );
}

interface SidebarItemComponentProps {
  item: SidebarItem;
  isActive: boolean;
  isCollapsed: boolean;
  onClick: () => void;
}

function SidebarItemComponent({ item, isActive, isCollapsed, onClick }: SidebarItemComponentProps) {
  return (
    <button
      className={clsx(
        "w-full flex items-center gap-3 px-4 py-3 transition-colors relative",
        isActive
          ? "text-white bg-[#2d2d2d]"
          : "text-gray-400 hover:text-white hover:bg-[#2d2d2d]/50",
      )}
      onClick={onClick}
      title={isCollapsed ? item.label : undefined}
    >
      {/* Active indicator */}
      {isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-gold rounded-r" />
      )}

      {/* Icon */}
      <span className="flex-shrink-0 w-5 h-5">{item.icon}</span>

      {/* Label */}
      {!isCollapsed && (
        <>
          <span className="flex-1 text-left text-sm truncate">{item.label}</span>

          {/* Badge */}
          {item.badge !== undefined && (
            <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 flex items-center justify-center bg-gold text-[#1a1a1a] text-xs font-medium rounded-full">
              {item.badge}
            </span>
          )}
        </>
      )}
    </button>
  );
}

// Collapsible Section within Sidebar
interface SidebarSectionProps {
  title: string;
  items: SidebarItem[];
  activeItem?: string;
  onItemClick?: (item: SidebarItem) => void;
  defaultCollapsed?: boolean;
  isCollapsed?: boolean;
}

export function SidebarSection({
  title,
  items,
  activeItem,
  onItemClick,
  defaultCollapsed = false,
  isCollapsed = false,
}: SidebarSectionProps) {
  const [isCollapsedSection, setIsCollapsedSection] = useState(defaultCollapsed);

  if (isCollapsed) {
    // When sidebar is collapsed, show items directly
    return (
      <div className="py-1">
        {items.map((item) => (
          <SidebarItemComponent
            key={item.id}
            item={item}
            isActive={activeItem === item.id}
            isCollapsed={true}
            onClick={() => onItemClick?.(item)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="py-1">
      <button
        className="w-full flex items-center gap-2 px-4 py-2 text-gray-500 hover:text-gray-300 transition-colors"
        onClick={() => setIsCollapsedSection(!isCollapsedSection)}
      >
        <svg
          className={clsx("w-3 h-3 transition-transform", isCollapsedSection ? "-rotate-90" : "")}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
        <span className="text-xs uppercase tracking-wider font-medium">{title}</span>
      </button>

      {!isCollapsedSection &&
        items.map((item) => (
          <SidebarItemComponent
            key={item.id}
            item={item}
            isActive={activeItem === item.id}
            isCollapsed={false}
            onClick={() => onItemClick?.(item)}
          />
        ))}
    </div>
  );
}

// Built-in sidebar items for EduOS
export const DEFAULT_SIDEBAR_ITEMS: SidebarItem[] = [
  {
    id: "home",
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
    label: "Home",
  },
  {
    id: "dashboard",
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
    label: "Dashboard",
  },
  {
    id: "classroom",
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
    label: "Classroom",
  },
  {
    id: "cbt",
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
    label: "CBT",
  },
  {
    id: "attendance",
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
    label: "Presensi",
  },
  {
    id: "grades",
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
    label: "Nilai",
  },
  {
    id: "schedule",
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
    label: "Jadwal",
  },
  {
    id: "messages",
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
    label: "Pesan",
    badge: 3,
  },
];

// Settings section items
export const SETTINGS_SIDEBAR_ITEMS: SidebarItem[] = [
  {
    id: "settings",
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
    label: "Settings",
  },
  {
    id: "help",
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
    label: "Help",
  },
];
