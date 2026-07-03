import Svg, { Circle, G, Line, Path, Polyline, Rect } from 'react-native-svg';

// Icones do menu principal recriados em vetor (uma cor so), para herdar a mesma
// cor/tamanho/posicionamento dos icones Ionicons que substituem
// (renderizados com size=24 e color=tokens.colors.accent no HomeMenuScreen).

export type MenuIconProps = {
  size: number;
  color: string;
};

const STROKE = 1.2;

// Item -> prancheta com checklist + lapis.
export function ItemsMenuIcon({ size, color }: MenuIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="2.6" y="3.4" width="13" height="17.4" rx="2.2" stroke={color} strokeWidth={STROKE} />
      <Rect x="6.5" y="1.7" width="5.2" height="3" rx="1" stroke={color} strokeWidth={STROKE} />
      <Polyline
        points="4.2,9 5.1,9.9 6.5,8.1"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line x1="8" y1="9" x2="14" y2="9" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      <Polyline
        points="4.2,13 5.1,13.9 6.5,12.1"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line x1="8" y1="13" x2="14" y2="13" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      <Polyline
        points="4.2,17 5.1,17.9 6.5,16.1"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line x1="8" y1="17" x2="14" y2="17" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      <Path
        d="M17.7 5.8 Q17.7 4.8 18.9 4.8 Q20.1 4.8 20.1 5.8 L20.1 16.2 L18.9 18.6 L17.7 16.2 Z"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      <Line x1="17.7" y1="7.1" x2="20.1" y2="7.1" stroke={color} strokeWidth={STROKE} />
      <Line x1="17.7" y1="16.2" x2="20.1" y2="16.2" stroke={color} strokeWidth={STROKE} />
    </Svg>
  );
}

// Estoque -> três caixas empilhadas sobre um palete.
export function StockMenuIcon({ size, color }: MenuIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="2.4" y="18.4" width="19.2" height="2.2" rx="0.6" stroke={color} strokeWidth={STROKE} />
      <Line x1="4.6" y1="20.6" x2="4.6" y2="22" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      <Line x1="12" y1="20.6" x2="12" y2="22" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      <Line x1="19.4" y1="20.6" x2="19.4" y2="22" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      <Rect x="3.4" y="11" width="8" height="7.4" rx="0.6" stroke={color} strokeWidth={STROKE} />
      <Rect x="12.6" y="11" width="8" height="7.4" rx="0.6" stroke={color} strokeWidth={STROKE} />
      <Rect x="8" y="3.4" width="8" height="7.4" rx="0.6" stroke={color} strokeWidth={STROKE} />
      <Polyline
        points="6.4,11 7.4,12.3 8.4,11"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Polyline
        points="15.6,11 16.6,12.3 17.6,11"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Polyline
        points="11,3.4 12,4.7 13,3.4"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// Dashboards -> painel com gráfico de pizza, barras e linha.
export function DashboardMenuIcon({ size, color }: MenuIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="2.2" y="4" width="19.6" height="16" rx="2.2" stroke={color} strokeWidth={STROKE} />
      <Circle cx="7.6" cy="10" r="3.4" stroke={color} strokeWidth={STROKE} />
      <Line x1="7.6" y1="10" x2="7.6" y2="6.6" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      <Line x1="7.6" y1="10" x2="10.5" y2="11.7" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      <Line x1="12.6" y1="7" x2="18.8" y2="7" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      <Line x1="12.6" y1="9.2" x2="18.8" y2="9.2" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      <Rect x="12.8" y="14" width="1.5" height="3" rx="0.3" fill={color} />
      <Rect x="15.1" y="12.4" width="1.5" height="4.6" rx="0.3" fill={color} />
      <Rect x="17.4" y="13.4" width="1.5" height="3.6" rx="0.3" fill={color} />
      <Rect x="19.7" y="11.2" width="1.5" height="5.8" rx="0.3" fill={color} />
      <Polyline
        points="12.9,14.4 15.85,11.8 18.15,12.8 20.45,10.6"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line x1="4.2" y1="16.6" x2="9.8" y2="16.6" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      <Line x1="4.2" y1="18.4" x2="8.4" y2="18.4" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
    </Svg>
  );
}

// Painel ADM -> monitor com pessoa e controles (sliders).
export function AdminMenuIcon({ size, color }: MenuIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="2.4" y="3" width="19.2" height="13.6" rx="2" stroke={color} strokeWidth={STROKE} />
      <Line x1="12" y1="16.6" x2="12" y2="19" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      <Line x1="8.4" y1="19.6" x2="15.6" y2="19.6" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      <Circle cx="7.4" cy="8" r="1.9" fill={color} />
      <Path d="M4.4 13.4 a3 3 0 0 1 6 0 Z" fill={color} />
      <Line x1="12.4" y1="7" x2="18.9" y2="7" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      <Circle cx="14.6" cy="7" r="1.05" fill={color} />
      <Line x1="12.4" y1="10" x2="18.9" y2="10" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      <Circle cx="16.7" cy="10" r="1.05" fill={color} />
      <Line x1="12.4" y1="13" x2="18.9" y2="13" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      <Circle cx="15.2" cy="13" r="1.05" fill={color} />
    </Svg>
  );
}

// Lista de compras -> bloco com checklist + cesta de compras.
// Desenhado um pouco maior (scale 1.1 sobre o centro) que os demais; a espessura
// do traco e compensada (STROKE / 1.1) para manter as linhas na mesma finura.
const LIST_SCALE = 1.1;
const LIST_STROKE = STROKE / LIST_SCALE;

export function ShoppingListMenuIcon({ size, color }: MenuIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G scale={LIST_SCALE} originX={12} originY={11.5}>
        <Rect x="2" y="2.4" width="10.6" height="12" rx="1.4" stroke={color} strokeWidth={LIST_STROKE} />
        <Line x1="3.7" y1="1.2" x2="3.7" y2="3.7" stroke={color} strokeWidth={LIST_STROKE} strokeLinecap="round" />
        <Line x1="5.9" y1="1.2" x2="5.9" y2="3.7" stroke={color} strokeWidth={LIST_STROKE} strokeLinecap="round" />
        <Line x1="8.1" y1="1.2" x2="8.1" y2="3.7" stroke={color} strokeWidth={LIST_STROKE} strokeLinecap="round" />
        <Line x1="10.3" y1="1.2" x2="10.3" y2="3.7" stroke={color} strokeWidth={LIST_STROKE} strokeLinecap="round" />
        <Line x1="2" y1="5.6" x2="12.6" y2="5.6" stroke={color} strokeWidth={LIST_STROKE} />
        <Polyline
          points="3.1,7.9 3.9,8.7 5.3,7.1"
          stroke={color}
          strokeWidth={LIST_STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Line x1="6.5" y1="7.9" x2="10.8" y2="7.9" stroke={color} strokeWidth={LIST_STROKE} strokeLinecap="round" />
        <Polyline
          points="3.1,10.4 3.9,11.2 5.3,9.6"
          stroke={color}
          strokeWidth={LIST_STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Line x1="6.5" y1="10.4" x2="10.8" y2="10.4" stroke={color} strokeWidth={LIST_STROKE} strokeLinecap="round" />
        <Polyline
          points="3.1,12.9 3.9,13.7 5.3,12.1"
          stroke={color}
          strokeWidth={LIST_STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Line x1="6.5" y1="12.9" x2="10.8" y2="12.9" stroke={color} strokeWidth={LIST_STROKE} strokeLinecap="round" />
        <Path
          d="M14 13.9 Q16.8 10.2 19.6 13.9"
          stroke={color}
          strokeWidth={LIST_STROKE}
          strokeLinecap="round"
        />
        <Rect x="11.4" y="13.9" width="10.8" height="1.9" rx="0.9" stroke={color} strokeWidth={LIST_STROKE} />
        <Path
          d="M12.4 15.8 L21.2 15.8 L19.4 21.3 L14.2 21.3 Z"
          stroke={color}
          strokeWidth={LIST_STROKE}
          strokeLinejoin="round"
        />
        <Line x1="15.6" y1="16.4" x2="15.2" y2="20.7" stroke={color} strokeWidth={LIST_STROKE} strokeLinecap="round" />
        <Line x1="18" y1="16.4" x2="18.4" y2="20.7" stroke={color} strokeWidth={LIST_STROKE} strokeLinecap="round" />
      </G>
    </Svg>
  );
}
