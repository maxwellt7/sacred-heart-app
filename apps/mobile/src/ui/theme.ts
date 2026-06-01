export const colors = {
  background: '#0B0F19',
  surface: '#111827',
  surfaceAlt: '#16132A',
  surfaceMuted: '#1E293B',
  border: '#1F2937',
  borderStrong: '#334155',
  accent: '#D4A853',
  accentMuted: '#1F2937',
  text: '#F8FAFC',
  textSecondary: '#CBD5E1',
  textMuted: '#94A3B8',
  textFaint: '#64748B',
  danger: '#FB7185',
  dangerSurface: 'rgba(127, 29, 29, 0.3)',
  dangerBorder: '#7F1D1D',
  success: '#22C55E',
  warning: '#EAB308',
  info: '#6366F1',
  purple: '#A78BFA',
} as const;

export function scoreColor(value: number): string {
  if (value >= 7) return colors.success;
  if (value >= 4) return colors.warning;
  return '#EF4444';
}
