import { StyleSheet, Text, View } from 'react-native';
import { colors } from './theme';

type XpBarProps = {
  level: number;
  title: string;
  totalXp: number;
  progressToNext: number;
  maxLevel?: boolean;
};

const TITLE_COLORS: Record<string, string> = {
  Seeker: '#94A3B8',
  Initiate: '#60A5FA',
  Architect: colors.accent,
  Sovereign: '#FBBF24',
  Transcendent: '#FBBF24',
};

export function XpBar({ level, title, totalXp, progressToNext, maxLevel }: XpBarProps) {
  const titleColor = TITLE_COLORS[title] || colors.accent;
  const pct = maxLevel ? 100 : Math.round((Number(progressToNext) || 0) * 100);
  const fillWidth = maxLevel ? 100 : Math.max(pct, totalXp > 0 ? 3 : 0);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.left}>
          <View style={styles.levelBadge}>
            <Text style={styles.levelText}>{level}</Text>
          </View>
          <View>
            <Text style={[styles.title, { color: titleColor }]}>{title}</Text>
            <Text style={styles.xpText}>
              {totalXp} XP{maxLevel ? ' · MAX LEVEL' : ''}
            </Text>
          </View>
        </View>
        <Text style={styles.pct}>{maxLevel ? 'MAX' : `${pct}%`}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${fillWidth}%` }]} />
      </View>
      <Text style={styles.footnote}>
        {maxLevel
          ? 'Maximum level reached'
          : totalXp === 0
            ? 'Complete a session to earn XP'
            : `${pct}% to next level`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  left: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  levelBadge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(212,168,83,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(212,168,83,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelText: { color: colors.accent, fontSize: 16, fontWeight: '700' },
  title: { fontSize: 14, fontWeight: '700' },
  xpText: { color: colors.textMuted, fontSize: 11 },
  pct: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  track: { height: 8, borderRadius: 999, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999, backgroundColor: colors.accent },
  footnote: { color: colors.textFaint, fontSize: 11 },
});
