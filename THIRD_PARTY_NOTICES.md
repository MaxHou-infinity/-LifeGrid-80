# 依赖与致谢

应用延续原仓库的 MIT 声明，见 [LICENSE](LICENSE)。

| 组件 | 版本 / 来源 | 用途 | 许可证 |
| --- | --- | --- | --- |
| qrcode-generator | 2.0.4，本地 `vendor/` | 浏览器生成固定官网二维码；保留原版权头 | [原 MIT 许可证](vendor/qrcode-generator-LICENSE.txt)，Copyright (c) 2009 Kazuhiko Arase |
| Noto Serif SC | Google Fonts 在线 CSS | 页面与 PNG 的衬线字体；加载失败回退本机 serif | [SIL Open Font License 1.1](https://github.com/notofonts/noto-cjk/blob/main/Serif/LICENSE)；字体文件不随仓库分发 |
| @playwright/test / playwright / playwright-core | 1.65.0，项目本地开发依赖 | 临时 Chrome context 的浏览器验收 | Apache-2.0（安装包随附许可证） |
| jsQR (`jsqr`) | 1.4.0，仅开发依赖 | 对实际完整 PNG 独立解码 | Apache-2.0（安装包随附许可证） |
| pngjs | 7.0.0，仅开发依赖 | PNG 像素与 CRC 解析 | MIT（安装包随附许可证） |
| qrcode-generator npm 包 | 2.0.4，仅开发依赖 | 保留来源测试的固定依赖；产品直接用本地 vendor 文件 | MIT（安装包随附许可证） |

二维码运行时不调用外部二维码服务。PNG 使用 Canvas 原生导出；当前实现不依赖 html2canvas，也不提供 PDF/JPG 导出。Google Fonts 并非固定字体二进制版本，在线响应和本机回退字体可能影响字形；不能承诺完全离线时与联网时的 PNG 字体像素相同。

## 来源

v2.0 的运行时代码来自已验收的官网候选，作为独立仓库根目录的静态应用集成；官网生产发布包装与运维脚本不在这里执行。原始 PRD 留存为历史设计材料，不代表当前功能或验收承诺。
