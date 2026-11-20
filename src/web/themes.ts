import type { NightNumber } from '../sim/types.ts';

export type CharacterId = 'may' | 'linh' | 'moc' | 'sao';
export type MapThemeId = 'dao_ben' | 'rung_truc' | 'dinh_tuyet' | 'den_do';
export type GhostKind = 'ink_shade' | 'wisp_phantom' | 'frost_wraith' | 'crimson_spirit';

export interface CharacterConfig {
  id: CharacterId;
  name: string;
  title: string;
  desc: string;
  badgeColor: string;
  cloakColor: number;
  scarfColor: number;
  hairColor: number;
  hatColor: number;
  lanternColor: number;
  lanternEmissive: number;
  lightColor: number;
  hatStyle: 'non_la' | 'scholar' | 'ranger' | 'captain';
}

export interface MapThemeConfig {
  id: MapThemeId;
  name: string;
  subtitle: string;
  desc: string;
  ghostKind: GhostKind;
  ghostName: string;
  ghostDesc: string;
  badgeColor: string;
  skyDark: number;
  skyLit: number;
  fogColor: number;
  fogDarkDensity: number;
  fogLitDensity: number;
  hemiDarkColor: number;
  hemiLitColor: number;
  hemiGroundColor: number;
  dirDarkColor: number;
  dirLitColor: number;
  groundColor: number;
  sandColor: number;
  woodColor: number;
  undersideColor: number;
  plazaColor: number;
  stepStoneColor: number;
  rimPostColor: number;
  cloudColor: number;
  cloudEmissive: number;
  starColor: number;
  moteColor: number;
  moteEmissive: number;
  lanternLitColor: number;
  lanternCoreColor: number;
  lanternUnlitColor: number;
  lanternLightColor: number;
  safeRingColor: number;
  propStyle: 'standard' | 'bamboo_grove' | 'snow_peaks' | 'crimson_shrine';
}

export interface NightStoryConfig {
  night: NightNumber;
  islandName: string;
  durationS: number;
  lanternCount: number;
  ongDangQuote: string;
  highlights: string[];
}

export const NIGHT_STORIES: Record<NightNumber, NightStoryConfig> = {
  1: {
    night: 1,
    islandName: 'Đêm 1 — Đảo Bến',
    durationS: 240,
    lanternCount: 5,
    ongDangQuote:
      '"Mây ơi, đèn thắp rồi sẽ cạn dầu dần! Hãy giữ ít nhất 3/5 Đèn Lồng Lớn sáng tới lúc bình minh và đừng để Bóng Mực hút cạn dầu đèn yếu!"',
    highlights: [
      'Mục tiêu: Giữ ≥ 3/5 Đèn Lồng Lớn sáng tới hết 240s (bình minh)',
      'Đèn sáng hao 1 dầu/giây; châm dầu bằng E (+10 dầu/đom đóm); thắp lại chỉ tốn 5 đom đóm',
      'Đèn < 30 dầu mất vùng an toàn và bị Bóng Mực hút dầu (5/giây)',
    ],
  },
  2: {
    night: 2,
    islandName: 'Đêm 2 — Đảo Cau',
    durationS: 270,
    lanternCount: 6,
    ongDangQuote:
      '"Đảo Cau cần giữ ít nhất 4/6 đèn sáng tới bình minh! Dùng Bục Nhảy và Bùa Gió qua lại hai đảo để châm dầu kịp lúc và tránh Gió Lạc!"',
    highlights: [
      'Mục tiêu: Giữ ≥ 4/6 Đèn Lồng Lớn sáng tới hết 270s (bình minh)',
      'Thắp đèn thành công tăng sức chứa đom đóm (+2/lần, tối đa 20)',
      '2 Bục Nhảy + Bùa Gió ở giữa cầu tre + Gió Lạc rình cướp đom đóm',
    ],
  },
  3: {
    night: 3,
    islandName: 'Đêm 3 — Đảo Chuông',
    durationS: 300,
    lanternCount: 7,
    ongDangQuote:
      '"Đêm cuối trên Đảo Chuông ba tầng! Giữ ít nhất 5/7 đèn sáng suốt 300 giây giữa gió bão để gọi Bình Minh trở về quần đảo!"',
    highlights: [
      'Mục tiêu: Giữ ≥ 5/7 Đèn Lồng Lớn sáng tới hết 300s (bình minh)',
      '3 tầng địa hình, 2 con dốc 30°/150°, Bục Nhảy lên Tháp Chuông & Gió mạnh mỗi 30s',
      'Tỏa Sáng trúng Bóng Mực đang hút dầu thưởng +15 điểm!',
    ],
  },
};

export const CHARACTERS: CharacterConfig[] = [
  {
    id: 'may',
    name: 'Mây',
    title: 'Áo Dài Việt Nam (Chuẩn)',
    desc: 'Áo dài trắng cổ tàu thướt tha (#E8E2D0), khăn đỏ (#C8102E) và nón lá truyền thống.',
    badgeColor: '#F2C14E',
    cloakColor: 0xf2ede2,
    scarfColor: 0xc8102e,
    hairColor: 0x1e1616,
    hatColor: 0xc9b48a,
    lanternColor: 0xffe9b0,
    lanternEmissive: 0xffb347,
    lightColor: 0xffb347,
    hatStyle: 'non_la',
  },
  {
    id: 'linh',
    name: 'Linh',
    title: 'Hanbok Hàn Quốc',
    desc: 'Áo Jeogori trắng ngà thắt nơ đỏ, váy Chima bồng bềnh viền vàng & trâm cài cổ truyền.',
    badgeColor: '#FF6B9A',
    cloakColor: 0xd93860,
    scarfColor: 0xfff0f3,
    hairColor: 0x1b1521,
    hatColor: 0x2b1d2e,
    lanternColor: 0xffe8b8,
    lanternEmissive: 0xff7b6b,
    lightColor: 0xff9b7a,
    hatStyle: 'scholar',
  },
  {
    id: 'moc',
    name: 'Mộc',
    title: 'Tinh Linh Rừng Đêm',
    desc: 'Váy lá tinh linh xanh lục, tai nhọn, vòng hoa lá & đôi cánh phát sáng trong suốt.',
    badgeColor: '#52E5A8',
    cloakColor: 0x277a55,
    scarfColor: 0x8ef5a8,
    hairColor: 0x5c3d24,
    hatColor: 0x3ad18c,
    lanternColor: 0xbaffdf,
    lanternEmissive: 0x2ee69d,
    lightColor: 0x5ff5b8,
    hatStyle: 'ranger',
  },
  {
    id: 'sao',
    name: 'Sao',
    title: 'Công Chúa Băng Giá',
    desc: 'Đầm pha lê băng xanh óng ánh, áo choàng tuyết mỏng, tóc bạch kim & vương miện băng.',
    badgeColor: '#69D8FF',
    cloakColor: 0x4ca8e8,
    scarfColor: 0xd9f5ff,
    hairColor: 0xe3eef7,
    hatColor: 0x9ce8ff,
    lanternColor: 0xd9f7ff,
    lanternEmissive: 0x4cc9ff,
    lightColor: 0x80dcff,
    hatStyle: 'captain',
  },
];

export const MAP_THEMES: MapThemeConfig[] = [
  {
    id: 'dao_ben',
    name: 'Cổ Tích Chuẩn',
    subtitle: 'Bảng Màu Chuẩn Phase 2 (Mặc định)',
    desc: 'Trời #0E1430, sương #1B2350, cỏ #2F5D50, biển mây #12384A đúng chuẩn.',
    ghostKind: 'ink_shade',
    ghostName: 'Bóng Mực',
    ghostDesc: 'Thân #120A1A, viền phát sáng #7A3CFF, bị choáng #3A3450.',
    badgeColor: '#7A3CFF',
    skyDark: 0x0e1430,
    skyLit: 0x1b2350,
    fogColor: 0x1b2350,
    fogDarkDensity: 0.013,
    fogLitDensity: 0.0065,
    hemiDarkColor: 0x5e70b8,
    hemiLitColor: 0xffe0a8,
    hemiGroundColor: 0x12384a,
    dirDarkColor: 0xa4b8ff,
    dirLitColor: 0xffe9b0,
    groundColor: 0x2f5d50,
    sandColor: 0xc9b48a,
    woodColor: 0x6b4a2f,
    undersideColor: 0x1a3330,
    plazaColor: 0xc9b48a,
    stepStoneColor: 0xb8a37a,
    rimPostColor: 0x6b4a2f,
    cloudColor: 0x12384a,
    cloudEmissive: 0x0a1f2b,
    starColor: 0xfff6c2,
    moteColor: 0xfff6c2,
    moteEmissive: 0xffe58a,
    lanternLitColor: 0xffb347,
    lanternCoreColor: 0xffe9b0,
    lanternUnlitColor: 0x5b5f6e,
    lanternLightColor: 0xffb347,
    safeRingColor: 0xf2c14e,
    propStyle: 'standard',
  },
  {
    id: 'rung_truc',
    name: 'Rừng Trúc Sương',
    subtitle: 'Chủ Đề Ngọc Lục Bảo',
    desc: 'Trúc xanh phát sáng quanh vành đảo trong sương đêm ngọc bích.',
    ghostKind: 'wisp_phantom',
    ghostName: 'Ma Trơi Rừng Trúc',
    ghostDesc: 'Linh hồn lửa ma trơi xanh ngọc xoay tròn với vòng linh khí cổ.',
    badgeColor: '#3DE8B0',
    skyDark: 0x081a18,
    skyLit: 0x163830,
    fogColor: 0x112b26,
    fogDarkDensity: 0.014,
    fogLitDensity: 0.007,
    hemiDarkColor: 0x388573,
    hemiLitColor: 0x9effc8,
    hemiGroundColor: 0x0f241d,
    dirDarkColor: 0x76e0c2,
    dirLitColor: 0xd9ffaa,
    groundColor: 0x1d4033,
    sandColor: 0x8ea896,
    woodColor: 0x45634a,
    undersideColor: 0x0f1f19,
    plazaColor: 0x3a5c4d,
    stepStoneColor: 0x2d4d3e,
    rimPostColor: 0x2f7a53,
    cloudColor: 0x143d33,
    cloudEmissive: 0x081c17,
    starColor: 0xc2ffe3,
    moteColor: 0xfff6c2,
    moteEmissive: 0x5effb8,
    lanternLitColor: 0xd9ffba,
    lanternCoreColor: 0xf2ffe3,
    lanternUnlitColor: 0x4c5e58,
    lanternLightColor: 0x8aff9e,
    safeRingColor: 0x7cf5b2,
    propStyle: 'bamboo_grove',
  },
  {
    id: 'dinh_tuyet',
    name: 'Đỉnh Tuyết Băng',
    subtitle: 'Chủ Đề Cực Quang',
    desc: 'Đảo băng tuyết trắng xanh, thông tuyết & tinh thể pha lê phát sáng.',
    ghostKind: 'frost_wraith',
    ghostName: 'Oan Hồn Tuyết',
    ghostDesc: 'Bóng ma pha lê băng giá với đôi cánh băng nhọn & mắt xanh lạnh.',
    badgeColor: '#66D9FF',
    skyDark: 0x0a162b,
    skyLit: 0x1f3654,
    fogColor: 0x152742,
    fogDarkDensity: 0.013,
    fogLitDensity: 0.0065,
    hemiDarkColor: 0x6aa0d9,
    hemiLitColor: 0xd6f2ff,
    hemiGroundColor: 0x21344d,
    dirDarkColor: 0xa8d8ff,
    dirLitColor: 0xffe4c4,
    groundColor: 0x7f9eb8,
    sandColor: 0xc8dcf0,
    woodColor: 0x5c4b42,
    undersideColor: 0x28405c,
    plazaColor: 0xb6cde3,
    stepStoneColor: 0x6f8ba8,
    rimPostColor: 0x5c7c9e,
    cloudColor: 0x38587a,
    cloudEmissive: 0x122338,
    starColor: 0xd9f4ff,
    moteColor: 0xfff6c2,
    moteEmissive: 0xffd07a,
    lanternLitColor: 0xffb347,
    lanternCoreColor: 0xffe9b0,
    lanternUnlitColor: 0x5b697a,
    lanternLightColor: 0xffbe66,
    safeRingColor: 0x7ce6ff,
    propStyle: 'snow_peaks',
  },
  {
    id: 'den_do',
    name: 'Đền Đỏ Chạng Vạng',
    subtitle: 'Chủ Đề Lễ Hội Đèn Trời',
    desc: 'Sân đền cổ gạch đỏ son & cổng gỗ truyền thống giữa mây hoàng hôn.',
    ghostKind: 'crimson_spirit',
    ghostName: 'Quỷ Mặt Nạ Đỏ',
    ghostDesc: 'Linh hồn lễ hội áo choàng đỏ thẫm đeo mặt nạ có sừng & mắt đỏ.',
    badgeColor: '#FF5A5F',
    skyDark: 0x1c0b16,
    skyLit: 0x3d1924,
    fogColor: 0x2c111d,
    fogDarkDensity: 0.0135,
    fogLitDensity: 0.007,
    hemiDarkColor: 0x994158,
    hemiLitColor: 0xffb38a,
    hemiGroundColor: 0x261017,
    dirDarkColor: 0xff8a7a,
    dirLitColor: 0xffcf82,
    groundColor: 0x3d2229,
    sandColor: 0xb88b76,
    woodColor: 0x8f242c,
    undersideColor: 0x211015,
    plazaColor: 0x592e36,
    stepStoneColor: 0x4a262d,
    rimPostColor: 0x9e252e,
    cloudColor: 0x4d2131,
    cloudEmissive: 0x210b13,
    starColor: 0xffd2b8,
    moteColor: 0xfff6c2,
    moteEmissive: 0xff9a3b,
    lanternLitColor: 0xffb347,
    lanternCoreColor: 0xffe9b0,
    lanternUnlitColor: 0x5e4a52,
    lanternLightColor: 0xff8c3b,
    safeRingColor: 0xf2c14e,
    propStyle: 'crimson_shrine',
  },
];

export function getCharacterConfig(id: CharacterId): CharacterConfig {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}

export function getMapThemeConfig(id: MapThemeId): MapThemeConfig {
  return MAP_THEMES.find((m) => m.id === id) ?? MAP_THEMES[0];
}
