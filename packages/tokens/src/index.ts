// Generated from design/tokens.json.
export const tokens = {
  schemaVersion: 1,
  primitive: {
    colors: {
      paper: "#F5F1E8",
      ink: "#242522",
      secondary: "#5B5E57",
      accent: "#8B3F2F",
      darkSurface: "#171C20",
      darkText: "#F4F0E8",
      darkMuted: "#BDC5C8",
      focusLight: "#8B3F2F",
      focusDark: "#E3B58C",
    },
    space: [0, 4, 8, 12, 16, 24, 32, 48, 64, 96],
    radii: {
      control: 8,
      card: 16,
      portrait: 12,
    },
    breakpoints: {
      compact: 640,
      stackedReader: 1024,
      wide: 1280,
    },
  },
  semantic: {
    light: {
      background: "#F5F1E8",
      surface: "#FFFFFF",
      text: "#242522",
      muted: "#5B5E57",
      action: "#8B3F2F",
      onAction: "#FFFFFF",
      focus: "#8B3F2F",
    },
    dark: {
      background: "#101519",
      surface: "#171C20",
      text: "#F4F0E8",
      muted: "#BDC5C8",
      action: "#E3B58C",
      onAction: "#242522",
      focus: "#E3B58C",
    },
    moods: {
      calm: "#16262B",
      memory: "#3C3029",
      tension: "#1C2037",
      climax: "#34212E",
      relief: "#24372D",
    },
  },
  typography: {
    display: {
      family: '"Noto Serif KR", "Nanum Myeongjo", serif',
      sizeMinPx: 36,
      sizeMaxPx: 64,
      weight: 600,
      lineHeight: 1.2,
    },
    reading: {
      family: '"Noto Serif KR", "Nanum Myeongjo", serif',
      defaultSizePx: 20,
      allowedSizesPx: [18, 20, 22, 24],
      weight: 400,
      lineHeight: 1.9,
      maxWidthRem: 34,
    },
    ui: {
      family:
        '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
      sizePx: 15,
      weight: 500,
      lineHeight: 1.45,
    },
    caption: {
      sizePx: 14,
      lineHeight: 1.6,
    },
  },
  motion: {
    uiMs: 160,
    dialogMs: 180,
    sceneMs: 480,
    moodMs: 600,
    revealMaxMs: 700,
    typewriterMaxMs: 1000,
    maxTextTranslatePx: 6,
    reducedDurationMs: 0,
  },
  contrastPairs: [
    {
      name: "light body",
      fg: "#242522",
      bg: "#F5F1E8",
      minimum: 4.5,
    },
    {
      name: "light muted",
      fg: "#5B5E57",
      bg: "#F5F1E8",
      minimum: 4.5,
    },
    {
      name: "light CTA",
      fg: "#FFFFFF",
      bg: "#8B3F2F",
      minimum: 4.5,
    },
    {
      name: "dark body",
      fg: "#F4F0E8",
      bg: "#171C20",
      minimum: 4.5,
    },
    {
      name: "dark muted",
      fg: "#BDC5C8",
      bg: "#171C20",
      minimum: 4.5,
    },
    {
      name: "dark CTA",
      fg: "#242522",
      bg: "#E3B58C",
      minimum: 4.5,
    },
  ],
} as const;
export const sourceHash =
  "48d6482b87e88a426c77a933f941c9a85661af1c1a99cbd919fb1d7e4164edc1";
