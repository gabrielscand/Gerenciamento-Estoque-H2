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
  const { height, width } = useWindowDimensions();
  const isCompactVertical = height <= 860;
  const isWindowTight = height <= 820;
  const canUseTightTopRow = isWindowTight && width >= 980;
  const cardsPerRow = 2;

  return (
    <ScreenShell>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          isCompactVertical ? styles.contentCompact : undefined,
          isWindowTight ? styles.contentTight : undefined,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {canUseTightTopRow ? (
          <View style={styles.topRow}>
            <View style={[styles.topRowItem, styles.topRowMenu]}>
              <MotionEntrance delay={80}>
                <HeroHeader
                  title="Menu Principal"
                  subtitle="Escolha sua area"
                  description="Acesse rapidamente os modulos operacionais do sistema."
                />
              </MotionEntrance>
            </View>

            <View style={[styles.topRowItem, styles.topRowSync]}>
              <SyncStatusCard />
            </View>
          </View>
        ) : (
          <>
            <SyncStatusCard />

            <MotionEntrance delay={80}>
              <HeroHeader
                title="Menu Principal"
                subtitle="Escolha sua area"
                description="Acesse rapidamente os modulos operacionais do sistema."
              />
            </MotionEntrance>
          </>
        )}

        <MotionEntrance delay={130}>
          <SectionSurface>
            <Text style={styles.sectionTitle}>Atalhos</Text>
            <Text style={styles.sectionDescription}>Toque em um card para abrir o modulo.</Text>

            <View
              style={[
                styles.grid,
                isCompactVertical ? styles.gridCompact : undefined,
                isWindowTight ? styles.gridTight : undefined,
              ]}
            >
              {cards.map((card, index) => {
                const shouldCenterCard =
                  card.key === 'purchase-list' &&
                  cards.length % cardsPerRow === 1 &&
                  index === cards.length - 1;

                return (
                  <Pressable
                    key={card.key}
                    onPress={card.onPress}
                    style={({ pressed }) => [
                      styles.card,
                      styles.cardTwoColumns,
                      isCompactVertical ? styles.cardCompact : undefined,
                      isWindowTight ? styles.cardTight : undefined,
                      shouldCenterCard ? styles.cardCenteredLastRow : undefined,
                      styles.cardDefault,
                      pressed ? styles.cardPressed : undefined,
                    ]}
                  >
                    <View
                      style={[
                        styles.iconWrap,
                        isCompactVertical ? styles.iconWrapCompact : undefined,
                        isWindowTight ? styles.iconWrapTight : undefined,
                        styles.iconWrapDefault,
                      ]}
                    >
                      <Ionicons name={card.icon} size={24} color={tokens.colors.accent} />
                    </View>
                    <Text
                      style={[
                        styles.cardTitle,
                        isCompactVertical ? styles.cardTitleCompact : undefined,
                        isWindowTight ? styles.cardTitleTight : undefined,
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
  contentTight: {
    paddingTop: 8,
    paddingBottom: 12,
    gap: 8,
  },
  topRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'stretch',
  },
  topRowItem: {
    flex: 1,
    minWidth: 0,
  },
  topRowSync: {
    flex: 0.9,
  },
  topRowMenu: {
    flex: 1.3,
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
  gridTight: {
    rowGap: 6,
  },
  card: {
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
  cardTwoColumns: {
    width: '48.4%',
  },
  cardCompact: {
    minHeight: 108,
    paddingVertical: 10,
    gap: 8,
  },
  cardTight: {
    minHeight: 102,
    paddingVertical: 9,
    gap: 7,
  },
  cardCenteredLastRow: {
    marginLeft: 'auto',
    marginRight: 'auto',
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
  iconWrapTight: {
    height: 40,
    width: 40,
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
  cardTitleTight: {
    fontSize: 13,
  },
  cardTitleDefault: {
    color: tokens.colors.accentDeep,
  },
});
