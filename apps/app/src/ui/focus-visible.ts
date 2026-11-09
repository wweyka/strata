import { Platform } from 'react-native';

// Show focus rings for keyboard navigation only, like :focus-visible. Pressable reports
// `focused` for mouse clicks too, so track the last input modality on web.
let keyboard = false;

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' || e.key.startsWith('Arrow')) keyboard = true;
  }, true);
  window.addEventListener('pointerdown', () => {
    keyboard = false;
  }, true);
}

export function focusRingVisible(focused: boolean | undefined): boolean {
  return !!focused && keyboard;
}
