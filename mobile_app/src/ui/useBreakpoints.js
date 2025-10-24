import { useWindowDimensions, Platform } from 'react-native';

export default function useBreakpoints() {
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  // Simple breakpoints (px) for web/desktop
  const sm = 600;
  const md = 900;
  const lg = 1200;
  const isSm = width >= sm;
  const isMd = width >= md;
  const isLg = width >= lg;
  const columns = isLg ? 3 : isMd ? 2 : 1;
  return { width, isWeb, isSm, isMd, isLg, columns };
}

