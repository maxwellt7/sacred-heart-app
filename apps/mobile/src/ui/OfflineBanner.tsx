import { StyleSheet, Text, View } from 'react-native';
import { useNetwork } from '../hooks/useNetwork';
import { colors } from './theme';

export function OfflineBanner() {
  const { isOffline } = useNetwork();
  if (!isOffline) return null;

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text style={styles.text}>You are offline. Showing the latest available data.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.dangerSurface,
    borderBottomWidth: 1,
    borderBottomColor: colors.dangerBorder,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  text: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});
