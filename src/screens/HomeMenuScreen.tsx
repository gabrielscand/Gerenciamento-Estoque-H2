import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SyncStatusCard } from '../components/SyncStatusCard';
import { HeroHeader, MotionEntrance, ScreenShell, SectionSurface } from '../components/ui-kit';
import { tokens } from '../theme/tokens';

export type HomeMenuCard = {
  key: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

type HomeMenuScreenProps = {
  cards: HomeMenuCard[];
};

export function HomeMenuScreen({ cards }: HomeMenuScreenProps) {
  const { height } = useWindowDimensions();
  const isCompactVertical = height <= 860;

  return (
    <ScreenShell>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, isCompactVertical ? styles.contentCompact : undefined]}
        showsVerticalScrollIndicator={false}
      >
        <SyncStatusCard />

        <MotionEntrance delay={80}>
          <HeroHeader
            title="Menu Principal"
            subtitle="Escolha sua area"
            description="Acesse rapidamente os modulos operacionais do sistema."
          />
        </MotionEntrance>

        <MotionEntrance delay={130}>
          <SectionSurface>
            <Text style={styles.sectionTitle}>Atalhos</Text>
            <Text style={styles.sectionDescription}>Toque em um card para abrir o modulo.</Text>

            <View style={[styles.grid, isCompactVertical ? styles.gridCompact : undefined]}>
              {cards.map((card) => {
                return (
                  <Pressable
                    key={card.key}
                    onPress={card.onPress}
                    style={({ pressed }) => [
                      styles.card,
                      isCompactVertical ? styles.cardCompact : undefined,
                      styles.cardDefault,
                      pressed ? styles.cardPressed : undefined,
                    ]}
                  >
                    <View
                      style={[
                        styles.iconWrap,
                        isCompactVertical ? styles.iconWrapCompact : undefined,
                        styles.iconWrapDefault,
                      ]}
                    >
                      <Ionicons name={card.icon} size={24} color={tokens.colors.accent} />
                    </View>
                    <Text
                      style={[
                        styles.cardTitle,
                        isCompactVertical ? styles.cardTitleCompact : undefined,
                        styles.cardTitleDefault,
                      ]}
                    >
                      {card.title}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </SectionSurface>
        </MotionEntrance>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 24,
    gap: 12,
  },
  contentCompact: {
    paddingTop: 10,
    paddingBottom: 16,
    gap: 10,
  },
  sectionTitle: {
    color: tokens.colors.accentDeep,
    fontSize: 19,
    fontWeight: '800',
  },
  sectionDescription: {
    color: tokens.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
    marginBottom: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },
  gridCompact: {
    rowGap: 8,
  },
  card: {
    width: '48.4%',
    minHeight: 132,
    borderRadius: tokens.radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderWidth: 1,
    ...tokens.shadow.card,
  },
  cardCompact: {
    minHeight: 108,
    paddingVertical: 10,
    gap: 8,
  },
  cardDefault: {
    backgroundColor: tokens.colors.surface,
    borderColor: tokens.colors.borderSoft,
  },
  cardPressed: {
    opacity: 0.9,
  },
  iconWrap: {
    height: 48,
    width: 48,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  iconWrapCompact: {
    height: 42,
    width: 42,
  },
  iconWrapDefault: {
    backgroundColor: tokens.colors.accentSoft,
    borderColor: tokens.colors.borderSoft,
  },
  cardTitle: {
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '800',
  },
  cardTitleCompact: {
    fontSize: 14,
  },
  cardTitleDefault: {
    color: tokens.colors.accentDeep,
  },
});
