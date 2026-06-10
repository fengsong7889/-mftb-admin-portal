# 登录页视频背景使用指南

## 功能说明

登录页已成功接入视频背景功能！现在左侧区域将显示动态视频，而不是之前的SVG插画。

## 如何使用

### 1. 准备视频文件

你需要准备一个MP4格式的视频文件，建议规格：
- **格式**: MP4 (H.264编码)
- **分辨率**: 1920x1080 或 1280x720
- **时长**: 10-30秒（会自动循环播放）
- **文件大小**: 建议小于5MB，以保证加载速度
- **内容建议**: 
  - 城市夜景/赛博朋克风格
  - 科技感动效
  - 抽象几何动画
  - 自然风光（星空、极光等）

### 2. 添加视频到项目

将你的视频文件重命名为 `login-bg-video.mp4`，然后放到以下目录：

```
admin-portal/public/login-bg-video.mp4
```

### 3. 启动项目

```bash
cd admin-portal
npm run dev
```

访问登录页面即可看到视频背景效果！

## 视频推荐资源

以下是一些可以获取免费视频的网站：

1. **Pexels Videos** - https://www.pexels.com/videos/
   - 搜索关键词：cyberpunk city, neon city, tech background, night city

2. **Pixabay Videos** - https://pixabay.com/videos/
   - 搜索关键词：abstract technology, city night, digital background

3. **Coverr** - https://coverr.co/
   - 专门提供网页背景视频

## 备用方案

如果视频加载失败，系统会自动显示渐变色背景（已配置在CSS中）。

你也可以在代码中添加备用图片：

```tsx
<video 
  className="login-video" 
  autoPlay 
  loop 
  muted 
  playsInline
  poster="/login-bg-poster.jpg"  // 添加这一行作为视频加载前的占位图
>
  <source src="/login-bg-video.mp4" type="video/mp4" />
</video>
```

## 样式调整

如果需要调整视频显示效果，可以编辑 `src/styles/components.css` 中的以下类：

- `.video-bg-container` - 视频容器样式（圆角、阴影等）
- `.video-overlay` - 视频上方的渐变遮罩层
- `.login-video` - 视频元素本身

## 性能优化建议

1. **压缩视频**: 使用工具如 HandBrake 或 FFmpeg 压缩视频
   ```bash
   ffmpeg -i input.mp4 -vcodec libx264 -crf 28 output.mp4
   ```

2. **使用WebM格式**: 可以同时提供WebM格式以获得更好的压缩率
   ```tsx
   <source src="/login-bg-video.webm" type="video/webm" />
   <source src="/login-bg-video.mp4" type="video/mp4" />
   ```

3. **懒加载**: 如果首屏加载速度很重要，可以考虑延迟加载视频

## 当前效果

- ✅ 视频自动播放
- ✅ 无限循环
- ✅ 静音播放（浏览器要求）
- ✅ 渐变遮罩层增强文字可读性
- ✅ 底部品牌标识带霓虹光效果
- ✅ 响应式布局适配

## 回退到SVG插画

如果你想保留原来的SVG插画作为备选，可以在 `public` 目录中不放置视频文件，系统会显示默认的渐变背景。

需要帮助选择合适的视频或调整样式吗？随时告诉我！
