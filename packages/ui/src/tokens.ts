/**
 * EduOS design tokens.
 *
 * Palette is deliberately not "SaaS indigo-600 on white" — it leans on the
 * physical materials of a classroom (chalk, ink, paper, brick) since this
 * system lives inside schools, not a startup dashboard.
 *
 *   ink      - near-black slate, primary text & chrome     #1B2430
 *   paper    - warm off-white background                   #F6F3EC
 *   gold     - chalk/brass accent, used sparingly           #C8932B
 *   forest   - success / positive states                    #3F7D58
 *   brick    - danger / destructive states                  #B3492F
 *   slate    - secondary accent, links, info                #4A6FA5
 */
export const colors = {
  ink: { DEFAULT: "#1B2430", 50: "#F1F3F5", 100: "#DDE2E8", 600: "#3A4456", 900: "#1B2430" },
  paper: { DEFAULT: "#F6F3EC", 100: "#FFFFFF", 200: "#EFEAE0" },
  gold: { DEFAULT: "#C8932B", 100: "#F3E3C2", 600: "#A6761E" },
  forest: { DEFAULT: "#3F7D58", 100: "#DCEEE2" },
  brick: { DEFAULT: "#B3492F", 100: "#F4DCD4" },
  slate: { DEFAULT: "#4A6FA5", 100: "#DDE6F2" },
} as const;

export const typography = {
  display: '"Fraunces", "Georgia", serif',
  body: '"Inter", "Segoe UI", sans-serif',
  mono: '"JetBrains Mono", "Consolas", monospace',
} as const;

export const radius = {
  sm: "6px",
  md: "10px",
  lg: "16px",
} as const;

export const roleBadgeColor: Record<string, keyof typeof colors> = {
  admin: "brick",
  teacher: "gold",
  student: "slate",
};
