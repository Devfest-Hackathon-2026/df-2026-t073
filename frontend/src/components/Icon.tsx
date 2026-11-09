import {
  Ban,
  BookOpen,
  CalendarDays,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleMinus,
  Clock,
  Code,
  Eye,
  Globe,
  Heart,
  History,
  House,
  Image,
  Languages,
  Layers,
  Lightbulb,
  ListPlus,
  LocateFixed,
  Lock,
  Map,
  MapPin,
  Mic,
  Pencil,
  Plus,
  RotateCcw,
  ScanText,
  Search,
  Shield,
  Sparkles,
  Trash2,
  Tag,
  Triangle,
  Trophy,
  Type,
  User,
  Users,
  Volume2,
  X,
} from 'lucide-react-native';
import React from 'react';
import { colors, fontSizes } from '../styles/tokens';

// Every icon in the app, by what it means here (Lucide underneath).
const ICONS = {
  play: Volume2,
  close: X,
  back: ChevronLeft,
  forward: ChevronRight,
  pin: MapPin,
  locate: LocateFixed,
  photo: Image,
  mic: Mic,
  hint: Lightbulb,
  search: Search,
  home: House,
  map: Map,
  camera: Camera,
  review: Layers,
  me: User,
  lock: Lock,
  people: Users,
  remove: CircleMinus,
  ai: Sparkles,
  heart: Heart,
  addToList: ListPlus,
  add: Plus,
  done: Check,
  language: Globe,
  privacy: Shield,
  developer: Code,
  edit: Pencil,
  delete: Trash2,
  learn: BookOpen,
  translate: Languages,
  display: Type,
  history: History,
  scan: ScanText,
  retry: RotateCcw,
  time: Clock,
  seen: Eye,
  award: Trophy,
  // △: a softer "not quite" mark than a cross, as on Japanese answer sheets.
  triangle: Triangle,
  /** A place's category, e.g. "Ramen". */
  category: Tag,
  /** A count of Tango. */
  tango: Layers,
  calendar: CalendarDays,
  forbidden: Ban,
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = fontSizes.lg,
  color = colors.text,
  filled = false,
  strokeWidth = 2,
}: {
  name: IconName;
  size?: number;
  color?: string;
  /** Solid shape (e.g. a favourited heart). */
  filled?: boolean;
  strokeWidth?: number;
}): React.JSX.Element {
  const Glyph = ICONS[name];
  return (
    <Glyph
      size={size}
      color={color}
      strokeWidth={strokeWidth}
      fill={filled ? color : 'none'}
    />
  );
}
