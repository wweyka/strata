// Design tokens. Monochrome ink with a single ochre accent; status colours carry meaning only.

export const palette = {
  light: {
    background: '#FAFAF7',
    surface: '#FFFFFF',
    surfaceMuted: '#F2F1EC',
    surfaceSunken: '#ECEAE3',
    border: '#E6E4DD',
    borderStrong: '#D4D1C7',
    text: '#16150F',
    textMuted: '#5F5C52',
    textFaint: '#8D897D',
    ink: '#16150F',
    onInk: '#FAFAF7',
    accent: '#B8862F',
    accentSoft: '#F5ECD9',
    onAccent: '#16150F',
    danger: '#B93A26',
    dangerSoft: '#FBE9E5',
    success: '#2F8F46',
    successSoft: '#E5F3E8',
    warning: '#A66A00',
    warningSoft: '#FBF0DA',
    focus: '#B8862F',
    overlay: 'rgba(22, 21, 15, 0.42)',
  },
  dark: {
    background: '#0F0F0D',
    surface: '#171714',
    surfaceMuted: '#1F1E1A',
    surfaceSunken: '#0B0B09',
    border: '#2A2924',
    borderStrong: '#3A3830',
    text: '#F2F0E8',
    textMuted: '#A9A597',
    textFaint: '#77736A',
    ink: '#F2F0E8',
    onInk: '#0F0F0D',
    accent: '#D9A847',
    accentSoft: '#2E2615',
    onAccent: '#0F0F0D',
    danger: '#E8735E',
    dangerSoft: '#3A1D17',
    success: '#5CBF73',
    successSoft: '#17301D',
    warning: '#E0A63A',
    warningSoft: '#33270F',
    focus: '#D9A847',
    overlay: 'rgba(0, 0, 0, 0.6)',
  },
} as const;

export type Colors = { [K in keyof (typeof palette)['light']]: string };

/** Knowledge-map statuses (spec §9). Same hues in both themes, tuned for contrast. */
export const mastery = {
  not_explored: { light: '#9A968A', dark: '#6F6B61' },
  in_progress: { light: '#3B6FD8', dark: '#6D97EA' },
  practiced: { light: '#2A9D8F', dark: '#4DBFB0' },
  mastered: { light: '#2F8F46', dark: '#5CBF73' },
  needs_revision: { light: '#D2552C', dark: '#EB7B55' },
} as const;

export const space = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 } as const;
export const radius = { sm: 6, md: 10, lg: 14, xl: 20, pill: 999 } as const;

export const fonts = {
  regular: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semibold: 'Geist_600SemiBold',
  display: 'InstrumentSerif_400Regular',
  displayItalic: 'InstrumentSerif_400Regular_Italic',
} as const;

export const type = {
  display: { fontFamily: fonts.display, fontSize: 44, lineHeight: 48, letterSpacing: -0.6 },
  title: { fontFamily: fonts.display, fontSize: 32, lineHeight: 38, letterSpacing: -0.3 },
  heading: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 26, letterSpacing: -0.2 },
  subheading: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, letterSpacing: -0.1 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24 },
  bodyMedium: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 24 },
  small: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  smallMedium: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, letterSpacing: 0.2 },
  overline: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 1.1, textTransform: 'uppercase' },
} as const;

export type TypeVariant = keyof typeof type;

/** Layout breakpoints in dp. */
export const breakpoints = { wide: 900, max: 1200 } as const;
export const contentMaxWidth = 720;
