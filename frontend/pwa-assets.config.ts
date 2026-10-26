import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Generates the PWA / favicon PNGs from public/favicon.svg: `npm run generate-pwa-assets`.
// The output is committed (public/), so the regular build does not need the native image toolchain.
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, padding: 0.3, resizeOptions: { background: '#116CE3' } },
    apple: { ...minimal2023Preset.apple, padding: 0.3, resizeOptions: { background: '#116CE3' } },
  },
  images: ['public/favicon.svg'],
});
