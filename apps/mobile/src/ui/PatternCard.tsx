import { StyleSheet, Text, View } from 'react-native';
import { colors } from './theme';

export type PatternItem = {
  name: string;
  definition?: string;
  tipOff?: string;
  examples?: unknown[];
  number?: number;
};

export function PatternCard({ name, definition, tipOff, examples, number }: PatternItem) {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        {number != null ? (
          <View style={styles.numberBadge}>
            <Text style={styles.numberText}>{number}</Text>
          </View>
        ) : null}
        <View style={styles.body}>
          <Text style={styles.name}>{name}</Text>
          {definition ? <Text style={styles.definition}>{definition}</Text> : null}
          {tipOff ? <Text style={styles.tipOff}>Tip-off: {tipOff}</Text> : null}
          {examples && examples.length > 0 ? (
            <View style={styles.examples}>
              {examples.slice(0, 5).map((ex, i) => (
                <Text key={i} style={styles.example}>
                  &ldquo;{typeof ex === 'object' && ex !== null ? JSON.stringify(ex) : String(ex)}&rdquo;
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: { flexDirection: 'row', gap: 12 },
  numberBadge: {
    backgroundColor: colors.info,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  numberText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  body: { flex: 1, gap: 6 },
  name: { color: colors.text, fontSize: 15, fontWeight: '600' },
  definition: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  tipOff: { color: '#818CF8', fontSize: 12 },
  examples: { gap: 4, marginTop: 4 },
  example: { color: colors.textMuted, fontSize: 14, fontStyle: 'italic', lineHeight: 19 },
});
