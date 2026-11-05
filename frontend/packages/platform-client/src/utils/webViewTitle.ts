/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 移动端 WebView（钉钉／微信内置浏览器）顶栏标题设置。
 *
 * <p>为什么不能只写 document.title：iOS 的 WKWebView 不监听 document.title 变化，
 * 钉钉侧边栏顶栏会一直停在 index.html 的初始标题（MFTB集團門戶），
 * 用户看到的就是错的页面归属——会议邀约页被显示成集团门户。
 *
 * <p>兜底做法：设置 document.title 后插入一个加载即销毁的隐藏 iframe，
 * 借 WebView 对子文档加载的标题刷新把新标题推上去；这是不引入钉钉 JSAPI
 * （需要 corpId 鉴权与新增依赖）的通用方案。桌面浏览器自身会跟随
 * document.title，不做多余动作。
 */
export function applyWebViewTitle(title: string): void {
  document.title = title
  if (typeof navigator === 'undefined' || typeof document === 'undefined' || !document.body) return
  if (!/Mobile|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return
  const iframe = document.createElement('iframe')
  iframe.style.display = 'none'
  iframe.setAttribute('aria-hidden', 'true')
  iframe.src = '/favicon.ico'
  const dispose = () => {
    iframe.removeEventListener('load', dispose)
    if (iframe.parentElement) iframe.parentElement.removeChild(iframe)
  }
  iframe.addEventListener('load', dispose)
  document.body.appendChild(iframe)
  // 个别 WebView 不触发 load：超时也要清掉，不能把隐藏 iframe 留在 DOM 里
  window.setTimeout(dispose, 300)
}
