import { PropsWithChildren } from 'react';
import { useLaunch } from '@tarojs/taro';
import '@/i18n';
import { useAppStore } from '@/stores/app';
import './app.scss';

/**
 * H5 端 rem 校准：与 uniapp 的 rpx 体系对齐（750 设计稿，1 设计 px = 屏宽/750 CSS px）。
 * Taro pxtransform 将设计 px 按 baseFontSize=20 转为 rem，故 html font-size = 屏宽/750*20。
 */
function setupH5Rem() {
  if (process.env.TARO_ENV !== 'h5' || typeof document === 'undefined') return;
  const setRem = () => {
    const w = Math.min(document.documentElement.clientWidth, 480);
    document.documentElement.style.fontSize = `${(w / 750) * 20}px`;
  };
  setRem();
  window.addEventListener('resize', setRem);
}

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    setupH5Rem();
    useAppStore.getState().applyToRuntime();
  });

  return children;
}

export default App;
