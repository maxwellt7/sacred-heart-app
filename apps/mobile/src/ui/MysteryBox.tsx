import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../services/api';
import { colors } from './theme';

type RawBox = {
  id: string;
  rarity: string;
  reward_type?: string;
  reward_title?: string;
  reward_content?: string | null;
  rewardType?: string;
  rewardTitle?: string;
  rewardContent?: string | null;
  opened?: number;
};

type NormalizedBox = {
  id: string;
  rarity: string;
  reward_type: string;
  reward_title: string;
  reward_content: string | null;
  opened?: number;
};

function normalizeBox(box: RawBox): NormalizedBox {
  return {
    id: box.id,
    rarity: box.rarity,
    reward_type: box.reward_type ?? box.rewardType ?? '',
    reward_title: box.reward_title ?? box.rewardTitle ?? '',
    reward_content: box.reward_content ?? box.rewardContent ?? null,
    opened: box.opened,
  };
}

const RARITY: Record<string, { label: string; color: string; bg: string; border: string }> = {
  common: { label: 'Common', color: '#94A3B8', bg: 'rgba(100,116,139,0.10)', border: 'rgba(100,116,139,0.30)' },
  uncommon: { label: 'Uncommon', color: '#60A5FA', bg: 'rgba(59,130,246,0.10)', border: 'rgba(59,130,246,0.30)' },
  rare: { label: 'Rare', color: '#A78BFA', bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.35)' },
  legendary: { label: 'Legendary', color: colors.accent, bg: 'rgba(212,168,83,0.12)', border: 'rgba(212,168,83,0.40)' },
};

function parseRewardContent(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}

function RewardContent({ content }: { content: any }) {
  if (!content) return <Text style={styles.muted}>Content unavailable</Text>;
  if (typeof content === 'string') return <Text style={styles.italic}>{content}</Text>;

  if (content.text && content.author) {
    return (
      <View>
        <Text style={styles.italic}>&ldquo;{content.text}&rdquo;</Text>
        <Text style={styles.author}>— {content.author}</Text>
      </View>
    );
  }
  if (content.name && content.content) {
    return (
      <View style={styles.gap4}>
        <Text style={styles.rewardName}>{content.name}</Text>
        <Text style={styles.body}>{content.content}</Text>
        {content.duration ? <Text style={styles.muted}>{content.duration}</Text> : null}
      </View>
    );
  }
  if (content.type === 'value_constellation') {
    return (
      <View style={styles.gap4}>
        <Text style={styles.body}>{content.description}</Text>
        <View style={styles.chipWrap}>
          {(content.values || []).map((v: string, i: number) => (
            <Text key={i} style={styles.valueChip}>
              {v}
            </Text>
          ))}
        </View>
      </View>
    );
  }
  if (content.type === 'masterclass') {
    return (
      <View style={styles.gap4}>
        <Text style={styles.rewardName}>{content.title}</Text>
        <Text style={styles.body}>{content.content}</Text>
        {content.duration ? <Text style={styles.muted}>{content.duration}</Text> : null}
      </View>
    );
  }
  const fallback =
    (typeof content.content === 'string' && content.content) ||
    (typeof content.text === 'string' && content.text) ||
    (typeof content.description === 'string' && content.description) ||
    (typeof content.message === 'string' && content.message) ||
    '';
  return fallback ? <Text style={styles.body}>{fallback}</Text> : <Text style={styles.muted}>Content unavailable</Text>;
}

export function MysteryBox({ box, onOpened }: { box: RawBox; onOpened?: (opened: NormalizedBox) => void }) {
  const normalized = normalizeBox(box);
  const config = RARITY[normalized.rarity] || RARITY.common;
  const [opening, setOpening] = useState(false);
  const [revealed, setRevealed] = useState(!!normalized.opened);
  const [rewardContent, setRewardContent] = useState<unknown>(
    normalized.reward_content ? parseRewardContent(normalized.reward_content) : null,
  );
  const [rewardTitle, setRewardTitle] = useState(normalized.reward_title);
  const [openError, setOpenError] = useState(false);

  const handleOpen = async () => {
    if (opening || revealed) return;
    setOpening(true);
    setOpenError(false);
    try {
      const result = normalizeBox(await api.openMysteryBox(normalized.id));
      setRevealed(true);
      setRewardTitle(result.reward_title || normalized.reward_title);
      setRewardContent(result.reward_content ? parseRewardContent(result.reward_content) : null);
      onOpened?.(result);
    } catch {
      setOpenError(true);
      setOpening(false);
    }
  };

  if (!revealed) {
    return (
      <Pressable
        onPress={handleOpen}
        disabled={opening}
        style={[styles.card, { backgroundColor: config.bg, borderColor: config.border }]}
        accessibilityRole="button"
      >
        <View style={styles.sealedRow}>
          <View style={styles.headerRow}>
            <Text style={[styles.sealedTitle, { color: config.color }]}>Sealed Intel</Text>
            <View style={[styles.rarityTag, { borderColor: config.border }]}>
              <Text style={[styles.rarityText, { color: config.color }]}>{config.label}</Text>
            </View>
          </View>
          {opening ? (
            <ActivityIndicator color={config.color} size="small" />
          ) : (
            <Text style={styles.tapHint}>{openError ? 'Failed — tap to retry' : 'Tap to decrypt'}</Text>
          )}
        </View>
      </Pressable>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: config.bg, borderColor: config.border }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.sealedTitle, { color: config.color }]}>{rewardTitle || 'Sealed Intel'}</Text>
        <View style={[styles.rarityTag, { borderColor: config.border }]}>
          <Text style={[styles.rarityText, { color: config.color }]}>{config.label}</Text>
        </View>
      </View>
      <RewardContent content={rewardContent} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  sealedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  sealedTitle: { fontSize: 14, fontWeight: '600' },
  rarityTag: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  rarityText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  tapHint: { color: colors.textFaint, fontSize: 12 },
  gap4: { gap: 4 },
  muted: { color: colors.textMuted, fontSize: 12 },
  italic: { color: colors.textSecondary, fontSize: 14, fontStyle: 'italic', lineHeight: 20 },
  author: { color: colors.textFaint, fontSize: 12, textAlign: 'right', marginTop: 4 },
  rewardName: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  body: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  valueChip: {
    backgroundColor: 'rgba(212,168,83,0.15)',
    color: colors.accent,
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: 'hidden',
  },
});
