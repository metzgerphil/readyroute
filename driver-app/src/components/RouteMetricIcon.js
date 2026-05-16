import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

const METRIC_ICON_ALIASES = {
  activeRoutes: 'route',
  business: 'building',
  commit: 'commits',
  company: 'building',
  dashboard: 'home',
  exceptions: 'warning',
  file: 'records',
  files: 'records',
  homeDashboard: 'home',
  manifest: 'notes',
  pencil: 'edit',
  note: 'notes',
  packageCount: 'package',
  packages: 'package',
  pickupStops: 'pickup',
  pickups: 'pickup',
  pin: 'stop',
  records: 'records',
  routeMap: 'map',
  settings: 'settings',
  stops: 'stop',
  stopsPerHour: 'stopwatch',
  truck: 'vehicles',
  users: 'drivers'
};

const METRIC_ICON_NAMES = [
  'route',
  'stop',
  'package',
  'pickup',
  'warning',
  'stopwatch',
  'building',
  'commits',
  'edit',
  'eye',
  'home',
  'notes',
  'map',
  'drivers',
  'records',
  'settings',
  'vehicles',
  'sid'
];

function resolveMetricIconName(name) {
  return METRIC_ICON_ALIASES[name] || (METRIC_ICON_NAMES.includes(name) ? name : 'stop');
}

function getCommonProps(color) {
  return {
    fill: 'none',
    stroke: color,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: 2
  };
}

function RouteIcon({ color, size }) {
  const commonProps = getCommonProps(color);

  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      <Circle cx="5" cy="19" fill={color} r="2" />
      <Circle cx="19" cy="5" fill={color} r="2" />
      <Path d="M7 19h4.5a4 4 0 0 0 4-4V9" {...commonProps} />
      <Path d="M12.5 9h3V6" {...commonProps} />
    </Svg>
  );
}

function StopIcon({ color, size }) {
  const commonProps = getCommonProps(color);

  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      <Path d="M12 21s6-5.7 6-11A6 6 0 0 0 6 10c0 5.3 6 11 6 11Z" {...commonProps} />
      <Circle cx="12" cy="10" r="2.2" {...commonProps} />
      <Line x1="8" x2="16" y1="22" y2="22" {...commonProps} />
    </Svg>
  );
}

function PackageIcon({ color, size }) {
  const commonProps = getCommonProps(color);

  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      <Path d="M12 2.8 20 7.2v9.2l-8 4.8-8-4.8V7.2L12 2.8Z" {...commonProps} />
      <Path d="M4.5 7.5 12 12l7.5-4.5" {...commonProps} />
      <Path d="M12 12v8.5" {...commonProps} />
    </Svg>
  );
}

function PickupIcon({ color, size }) {
  const commonProps = getCommonProps(color);

  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      <Path d="M12 3 20 7.5v8.8l-8 4.7-8-4.7V7.5L12 3Z" {...commonProps} />
      <Path d="M4.5 7.8 12 12l7.5-4.2" {...commonProps} />
      <Path d="M12 12v8.3" {...commonProps} />
      <Path d="M12 5.8v6.1" {...commonProps} />
      <Path d="m8.8 8.9 3.2-3.2 3.2 3.2" {...commonProps} />
    </Svg>
  );
}

function WarningIcon({ color, size }) {
  const commonProps = getCommonProps(color);

  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      <Path d="M12 3 22 20H2L12 3Z" {...commonProps} />
      <Path d="M12 9v5" {...commonProps} />
      <Circle cx="12" cy="17" fill={color} r="1.1" />
    </Svg>
  );
}

function StopwatchIcon({ color, size }) {
  const commonProps = getCommonProps(color);

  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      <Circle cx="12" cy="13" r="7" {...commonProps} />
      <Path d="M9 2h6M12 5V2M12 13V9M16.5 6.5l1.5-1.5" {...commonProps} />
    </Svg>
  );
}

function BuildingIcon({ color, size }) {
  const commonProps = getCommonProps(color);

  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      <Path d="M5 20V5.5A1.5 1.5 0 0 1 6.5 4h8A1.5 1.5 0 0 1 16 5.5V20" {...commonProps} />
      <Path d="M16 9h2.5A1.5 1.5 0 0 1 20 10.5V20" {...commonProps} />
      <Path d="M8 8h1.5M12 8h1.5M8 12h1.5M12 12h1.5M8 16h1.5M12 16h1.5M4 20h17" {...commonProps} />
    </Svg>
  );
}

function CommitsIcon({ color, size }) {
  const commonProps = getCommonProps(color);

  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      <Rect height="16" rx="2.5" width="14" x="5" y="4" {...commonProps} />
      <Path d="M9 9h6M9 13h3" {...commonProps} />
      <Path d="m13.5 16 1.5 1.5 3-3" {...commonProps} />
    </Svg>
  );
}

function RecordsIcon({ color, size }) {
  const commonProps = getCommonProps(color);

  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      <Path d="M6 3.5h8l4 4V20.5H6V3.5Z" {...commonProps} />
      <Path d="M14 3.5V8h4M9 12h6M9 16h6" {...commonProps} />
    </Svg>
  );
}

function SettingsIcon({ color, size }) {
  const commonProps = getCommonProps(color);

  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      <Circle cx="12" cy="12" r="3" {...commonProps} />
      <Path d="M12 3.5v2M12 18.5v2M4.6 7.8l1.7 1M17.7 15.2l1.7 1M4.6 16.2l1.7-1M17.7 8.8l1.7-1" {...commonProps} />
      <Path d="M8.2 4.7 7.2 6.5M16.8 17.5l-1 1.8M3.8 12h2M18.2 12h2M8.2 19.3l-1-1.8M16.8 6.5l-1-1.8" {...commonProps} />
    </Svg>
  );
}

function NotesIcon({ color, size }) {
  const commonProps = getCommonProps(color);

  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      <Path d="M5 4h14v12l-4 4H5V4Z" {...commonProps} />
      <Path d="M15 16v4M15 16h4M8 9h8M8 13h5" {...commonProps} />
    </Svg>
  );
}

function EyeIcon({ color, size }) {
  const commonProps = getCommonProps(color);

  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      <Path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" {...commonProps} />
      <Circle cx="12" cy="12" r="3" {...commonProps} />
    </Svg>
  );
}

function EditIcon({ color, size }) {
  const commonProps = getCommonProps(color);

  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      <Path d="M4 20h4.5L19 9.5 14.5 5 4 15.5V20Z" {...commonProps} />
      <Path d="M13.5 6 18 10.5" {...commonProps} />
    </Svg>
  );
}

function HomeIcon({ color, size }) {
  const commonProps = getCommonProps(color);

  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      <Path d="M4 11.5 12 4l8 7.5" {...commonProps} />
      <Path d="M6.5 10.5V20h11V10.5" {...commonProps} />
      <Path d="M10 20v-5h4v5" {...commonProps} />
    </Svg>
  );
}

function MapIcon({ color, size }) {
  const commonProps = getCommonProps(color);

  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      <Path d="M3 6.5 8.5 4 15.5 6.5 21 4v13.5L15.5 20 8.5 17.5 3 20V6.5Z" {...commonProps} />
      <Path d="M8.5 4v13.5M15.5 6.5V20" {...commonProps} />
    </Svg>
  );
}

function DriversIcon({ color, size }) {
  const commonProps = getCommonProps(color);

  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      <Circle cx="9" cy="8" r="3" {...commonProps} />
      <Path d="M3.5 19a5.5 5.5 0 0 1 11 0" {...commonProps} />
      <Path d="M16 11a2.6 2.6 0 1 0 0-5M17 15.5a4.2 4.2 0 0 1 3.5 3.5" {...commonProps} />
    </Svg>
  );
}

function VehiclesIcon({ color, size }) {
  const commonProps = getCommonProps(color);

  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      <Path d="M3 7h11v9H3V7ZM14 10h3.5l3.5 3.5V16h-7v-6Z" {...commonProps} />
      <Circle cx="7" cy="18" r="2" {...commonProps} />
      <Circle cx="17" cy="18" r="2" {...commonProps} />
    </Svg>
  );
}

function SidIcon({ color, size }) {
  const commonProps = getCommonProps(color);

  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      <Path d="M7 4v16M17 4v16M4 8h16M4 16h16" {...commonProps} />
      <Path d="M9 8v8M15 8v8" {...commonProps} />
    </Svg>
  );
}

const ICON_RENDERERS = {
  building: BuildingIcon,
  commits: CommitsIcon,
  drivers: DriversIcon,
  edit: EditIcon,
  eye: EyeIcon,
  home: HomeIcon,
  map: MapIcon,
  notes: NotesIcon,
  package: PackageIcon,
  pickup: PickupIcon,
  records: RecordsIcon,
  route: RouteIcon,
  settings: SettingsIcon,
  sid: SidIcon,
  stop: StopIcon,
  stopwatch: StopwatchIcon,
  vehicles: VehiclesIcon,
  warning: WarningIcon
};

export default function RouteMetricIcon({ color = '#173042', name, size = 18 }) {
  const iconName = resolveMetricIconName(name);
  const Icon = ICON_RENDERERS[iconName] || StopIcon;

  return <Icon color={color} size={size} />;
}

export { METRIC_ICON_ALIASES, METRIC_ICON_NAMES, resolveMetricIconName };
