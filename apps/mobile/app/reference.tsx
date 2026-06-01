import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../src/services/api';
import { useApiResource } from '../src/hooks/useApiResource';
import { EmptyState, ErrorState, LoadingState } from '../src/ui/states';
import { OfflineBanner } from '../src/ui/OfflineBanner';
import { PatternCard, type PatternItem } from '../src/ui/PatternCard';
import { colors } from '../src/ui/theme';

const CATEGORIES = [
  { id: 'milton-model', label: 'Milton Model' },
  { id: 'meta-programs', label: 'Meta Programs' },
  { id: 'presuppositions', label: 'Presuppositions' },
  { id: 'prime-directives', label: 'Prime Directives' },
  { id: 'quantum-linguistics', label: 'Quantum Linguistics' },
  { id: 'personal-breakthrough', label: 'Personal Breakthrough' },
] as const;

function buildItems(category: string, data: any): PatternItem[] {
  switch (category) {
    case 'milton-model':
      return (data.miltonModel?.patterns || []).map((p: any) => ({
        name: p.name,
        definition: p.definition,
        tipOff: p.tipOff,
        examples: p.examples,
        number: p.number,
      }));
    case 'meta-programs':
      return (data.metaPrograms?.filters || []).map((f: any) => ({
        name: f.name,
        definition: f.elicitationQuestion,
        tipOff: f.options?.map((o: any) => o.label).join(', '),
        examples: Object.entries(f.linguisticMarkers || {}).map(([k, v]) => `${k}: ${v}`),
        number: f.number,
      }));
    case 'presuppositions':
      return [
        ...(data.presuppositions?.nlpPresuppositions?.presuppositions || []).map((p: any) => ({
          name: `${p.letter} \u2014 ${p.keyword}`,
          definition: p.text,
          number: p.number,
        })),
        ...(data.presuppositions?.linguisticPresuppositions?.types || []).map((p: any) => ({
          name: p.name,
          definition: `${p.solution || ''}`,
          tipOff: p.tipOff,
          examples: [p.example, p.response].filter(Boolean),
          number: p.number,
        })),
      ];
    case 'prime-directives':
      return (data.primeDirectives?.primeDirectives?.directives || data.primeDirectives?.directives || []).map(
        (d: any) => ({ name: d.title || d.text || '', definition: d.description || d.details || '', number: d.number }),
      );
    case 'quantum-linguistics': {
      const ql = data.quantumLinguistics || {};
      const items: PatternItem[] = [];
      if (ql.embeddedCommands)
        items.push({
          name: 'Embedded Commands',
          definition: ql.embeddedCommands.key || ql.embeddedCommands.subtitle || '',
          examples: ql.embeddedCommands.steps,
        });
      if (ql.cartesianCoordinates?.quadrants)
        items.push({
          name: 'Cartesian Coordinates',
          definition: 'Four perspectives for exploring decisions',
          examples: ql.cartesianCoordinates.quadrants.map((q: any) => `${q.name}: ${q.question}`),
        });
      if (ql.symbolicLogic?.operators)
        items.push({ name: 'Symbolic Logic', definition: 'Logical operators used in NLP', examples: ql.symbolicLogic.operators });
      if (ql.inductiveDeductive) {
        items.push({
          name: 'Deduction',
          definition: ql.inductiveDeductive.deduction.definition,
          examples: [ql.inductiveDeductive.deduction.example],
        });
        items.push({
          name: 'Induction',
          definition: ql.inductiveDeductive.induction.definition,
          examples: [ql.inductiveDeductive.induction.example],
        });
      }
      if (ql.hierarchyOfIdeas)
        items.push({
          name: 'Hierarchy of Ideas',
          definition: ql.hierarchyOfIdeas.subtitle || '',
          examples: [
            ...(ql.hierarchyOfIdeas.chunkUp?.questions || []),
            ...(ql.hierarchyOfIdeas.chunkDown?.questions || []),
          ],
        });
      if (ql.metaModel?.categories) {
        for (const patterns of Object.values(ql.metaModel.categories)) {
          (patterns as any[]).forEach((p: any) =>
            items.push({ name: p.name, definition: p.description, examples: [p.example, p.response].filter(Boolean) }),
          );
        }
      }
      return items;
    }
    case 'personal-breakthrough': {
      const pb = data.personalBreakthrough || {};
      const pbItems: PatternItem[] = [];
      if (pb.preSession?.screeningQuestions)
        pbItems.push({
          name: 'Pre-Session Screening',
          definition: 'Questions to ask before the session begins',
          examples: pb.preSession.screeningQuestions,
        });
      if (pb.detailedPersonalHistory?.questions)
        pbItems.push(
          ...pb.detailedPersonalHistory.questions.map((q: any) => ({
            name: `Question ${q.number}`,
            definition: q.question,
            examples: q.purpose ? [q.purpose] : [],
            number: q.number,
          })),
        );
      if (pb.interventionSteps) {
        const allSteps = [
          ...(pb.interventionSteps.preIntervention || []),
          ...(pb.interventionSteps.intervention || []),
          ...(pb.interventionSteps.postIntervention || []),
        ];
        pbItems.push(...allSteps.map((s: any) => ({ name: s.title, definition: s.description || '', number: s.step })));
      }
      if (pb.completingSession?.steps)
        pbItems.push(
          ...pb.completingSession.steps.map((s: any) => ({ name: s.title, definition: s.description || '', number: s.step })),
        );
      return pbItems;
    }
    default:
      return [];
  }
}

export default function ReferenceScreen() {
  const [category, setCategory] = useState<string>('milton-model');
  const [search, setSearch] = useState('');

  const { data, loading, refreshing, error, refresh, retry } = useApiResource<any>(
    () => api.getReference(),
    [],
  );

  const items = useMemo(() => {
    if (!data) return [];
    let result = buildItems(category, data);
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (item) =>
          item.name?.toLowerCase().includes(q) ||
          item.definition?.toLowerCase().includes(q) ||
          item.examples?.some((e) => String(e ?? '').toLowerCase().includes(q)),
      );
    }
    return result;
  }, [data, category, search]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <OfflineBanner />
        <LoadingState label="Loading reference data..." />
      </SafeAreaView>
    );
  }

  if (error && !data) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <OfflineBanner />
        <ErrorState message={error} onRetry={retry} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <OfflineBanner />
      <FlatList
        data={items}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => <PatternCard {...item} />}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Reference</Text>
            <TextInput
              style={styles.search}
              value={search}
              onChangeText={setSearch}
              placeholder="Search patterns, definitions, examples..."
              placeholderTextColor={colors.textFaint}
              autoCorrect={false}
            />
            <View style={styles.chipRow}>
              {CATEGORIES.map((cat) => {
                const active = category === cat.id;
                return (
                  <Pressable
                    key={cat.id}
                    onPress={() => setCategory(cat.id)}
                    style={[styles.chip, active && styles.chipActive]}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{cat.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        }
        ListEmptyComponent={<EmptyState title="No results found" message="Try a different category or search term." />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: 16, paddingBottom: 40, flexGrow: 1 },
  header: { gap: 14, marginBottom: 14 },
  title: { color: colors.text, fontSize: 26, fontWeight: '700' },
  search: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 14,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  chipActive: { backgroundColor: colors.info },
  chipText: { color: colors.textMuted, fontSize: 13 },
  chipTextActive: { color: '#FFFFFF', fontWeight: '600' },
  separator: { height: 12 },
});
