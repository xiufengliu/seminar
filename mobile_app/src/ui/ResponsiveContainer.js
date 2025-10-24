import React from 'react';
import { View } from 'react-native';
import useBreakpoints from './useBreakpoints';

export default function ResponsiveContainer({ children, style }){
  const { isWeb, width } = useBreakpoints();
  const maxWidth = 1200;
  const horizontalPadding = isWeb ? (width > 1400 ? 32 : 20) : 12;
  return (
    <View
      style={[
        {
          flex: 1,
          width: '100%',
          alignSelf: 'center',
          paddingHorizontal: horizontalPadding,
          paddingVertical: 12,
          maxWidth: isWeb ? maxWidth : undefined,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

