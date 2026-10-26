import type { ThemeConfig } from 'antd';
import { color, font, palette, radius, shadow } from './tokens';

// Component layer of the design system: maps the tokens onto Ant Design's theme API.
// Change values in tokens.ts, not here.
export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: color.brand,
    colorInfo: color.info,
    colorSuccess: color.success,
    colorWarning: color.warning,
    colorError: color.error,
    colorLink: color.brand,
    colorText: color.text,
    colorTextSecondary: color.textSecondary,
    colorTextTertiary: color.textMuted,
    colorTextPlaceholder: color.textMuted,
    colorTextDisabled: color.textDisabled,
    colorBorder: color.borderStrong,
    colorBorderSecondary: color.border,
    colorBgLayout: color.background,
    colorBgContainer: color.surface,
    fontFamily: font.family,
    fontSize: font.size.body,
    fontSizeHeading1: font.size.page,
    fontSizeHeading2: font.size.page,
    fontSizeHeading3: font.size.page,
    fontSizeHeading4: font.size.section,
    fontSizeHeading5: font.size.body,
    fontWeightStrong: font.weight.semibold,
    borderRadius: radius.md,
    borderRadiusSM: radius.sm,
    borderRadiusLG: radius.lg,
    boxShadowTertiary: shadow.card,
  },
  components: {
    Layout: {
      bodyBg: color.background,
      headerBg: color.surface,
      siderBg: color.sidebarTo,
    },
    Menu: {
      // Sidebar on the brand gradient: white text, active item as a white "pill" with brand text (Figma).
      darkItemBg: 'transparent',
      darkSubMenuItemBg: 'transparent',
      darkItemColor: palette.white,
      darkItemHoverColor: palette.white,
      darkItemHoverBg: 'rgba(255, 255, 255, 0.12)',
      darkItemSelectedBg: palette.white,
      darkItemSelectedColor: color.brand,
      itemBorderRadius: radius.sm,
      itemHeight: 40,
      itemMarginBlock: 3,
      iconSize: 18,
    },
    Button: {
      fontWeight: font.weight.bold,
      borderRadius: radius.sm,
      controlHeight: 34,
      primaryShadow: 'none',
    },
    Card: {
      borderRadiusLG: radius.lg,
    },
    Table: {
      headerBg: palette.blueBg,
      headerColor: color.text,
      headerSplitColor: 'transparent',
      rowHoverBg: palette.blueBg,
    },
    Tag: {
      borderRadiusSM: radius.pill,
    },
  },
};
