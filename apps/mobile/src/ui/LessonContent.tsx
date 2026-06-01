import { Fragment, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PatternCard } from './PatternCard';
import { colors } from './theme';

function humanize(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').trim();
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isInlineArray(v: unknown): v is unknown[] {
  return Array.isArray(v) && v.every((x) => typeof x !== 'object' || x === null);
}

function primitiveToString(v: unknown): string {
  if (Array.isArray(v)) return v.map((x) => String(x)).join(', ');
  return String(v);
}

function renderInline(value: unknown, keyPrefix: string): ReactNode {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    if (!isInlineArray(value)) {
      return (
        <View style={styles.indent}>
          {value.map((item, i) => (
            <View key={`${keyPrefix}-${i}`}>{renderInline(item, `${keyPrefix}-${i}`)}</View>
          ))}
        </View>
      );
    }
    return <Text style={styles.inlineValue}>{value.map((x) => String(x)).join(', ')}</Text>;
  }
  if (isPlainObject(value)) {
    return (
      <View style={styles.indent}>
        {Object.entries(value).map(([k, sub]) => (
          <InlineRow key={`${keyPrefix}-${k}`} label={k} value={sub} />
        ))}
      </View>
    );
  }
  return <Text style={styles.inlineValue}>{String(value)}</Text>;
}

function InlineRow({ label, value }: { label: string; value: unknown }) {
  const inline = value === null || value === undefined || typeof value !== 'object' || isInlineArray(value);
  if (inline) {
    return (
      <Text style={styles.rowText}>
        <Text style={styles.label}>{humanize(label)}: </Text>
        {primitiveToString(value)}
      </Text>
    );
  }
  return (
    <View>
      <Text style={styles.label}>{humanize(label)}:</Text>
      {renderInline(value, label)}
    </View>
  );
}

function renderContent(data: unknown, keyPrefix: string): ReactNode {
  if (Array.isArray(data)) {
    return data.map((item: any, i: number) => {
      const key = `${keyPrefix}-${i}`;
      if (item && (item.name || item.text)) {
        return (
          <PatternCard
            key={key}
            name={item.name || `#${item.number}`}
            definition={item.definition || item.text || item.details || ''}
            tipOff={item.tipOff}
            examples={item.examples}
            number={item.number}
          />
        );
      }
      if (typeof item === 'string') {
        return (
          <Text key={key} style={styles.paragraph}>
            {item}
          </Text>
        );
      }
      return (
        <View key={key} style={styles.rawCard}>
          <Text style={styles.rawText}>{JSON.stringify(item, null, 2)}</Text>
        </View>
      );
    });
  }
  if (isPlainObject(data)) {
    return Object.entries(data).map(([key, value]) => {
      const k = `${keyPrefix}-${key}`;
      if (Array.isArray(value)) {
        return (
          <View key={k} style={styles.section}>
            <Text style={styles.sectionHeading}>{humanize(key)}</Text>
            <View style={styles.sectionBody}>{renderContent(value, k)}</View>
          </View>
        );
      }
      if (isPlainObject(value)) {
        return (
          <View key={k} style={styles.objectCard}>
            <Text style={styles.objectHeading}>{humanize(key)}</Text>
            <View style={styles.objectBody}>
              {Object.entries(value).map(([subKey, subValue]) => (
                <InlineRow key={`${k}-${subKey}`} label={subKey} value={subValue} />
              ))}
            </View>
          </View>
        );
      }
      return (
        <Text key={k} style={styles.paragraph}>
          <Text style={styles.label}>{key}: </Text>
          {String(value)}
        </Text>
      );
    });
  }
  return <Text style={styles.paragraph}>{String(data)}</Text>;
}

export function LessonContent({ data }: { data: unknown }) {
  return <Fragment>{renderContent(data, 'lc')}</Fragment>;
}

const styles = StyleSheet.create({
  indent: { marginTop: 4, marginLeft: 12, gap: 4 },
  inlineValue: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  rowText: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  label: { color: colors.textFaint, textTransform: 'capitalize' },
  paragraph: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  rawCard: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border },
  rawText: { color: colors.textSecondary, fontSize: 13, fontFamily: 'Courier' },
  section: { gap: 12, marginBottom: 8 },
  sectionHeading: { color: colors.text, fontSize: 17, fontWeight: '600', textTransform: 'capitalize' },
  sectionBody: { gap: 12 },
  objectCard: { backgroundColor: colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border, gap: 8 },
  objectHeading: { color: colors.text, fontSize: 15, fontWeight: '600', textTransform: 'capitalize' },
  objectBody: { gap: 4 },
});
