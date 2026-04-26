import Svg, { Circle, Path, Polyline } from 'react-native-svg';

export default function RouteMetricIcon({ color = '#173042', name, size = 18 }) {
  const commonProps = {
    fill: 'none',
    stroke: color,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: 2
  };

  if (name === 'package') {
    return (
      <Svg height={size} viewBox="0 0 24 24" width={size}>
        <Path d="M12 2.8 20 7.2v9.2l-8 4.8-8-4.8V7.2L12 2.8Z" {...commonProps} />
        <Path d="M4.5 7.5 12 12l7.5-4.5" {...commonProps} />
        <Path d="M12 12v8.5" {...commonProps} />
      </Svg>
    );
  }

  if (name === 'stopwatch') {
    return (
      <Svg height={size} viewBox="0 0 24 24" width={size}>
        <Circle cx="12" cy="13" r="7" {...commonProps} />
        <Path d="M9 2h6M12 5V2M12 13V9M16.5 6.5l1.5-1.5" {...commonProps} />
      </Svg>
    );
  }

  if (name === 'warning') {
    return (
      <Svg height={size} viewBox="0 0 24 24" width={size}>
        <Path d="M12 3 22 20H2L12 3Z" {...commonProps} />
        <Path d="M12 9v5" {...commonProps} />
        <Circle cx="12" cy="17" fill={color} r="1.1" />
      </Svg>
    );
  }

  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      <Path d="M12 21s7-6.1 7-12A7 7 0 0 0 5 9c0 5.9 7 12 7 12Z" {...commonProps} />
      <Circle cx="12" cy="9" r="2.4" {...commonProps} />
      <Polyline points="5 20 19 20" {...commonProps} />
    </Svg>
  );
}
