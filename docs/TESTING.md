# 测试与证据边界

## 在正常 Mac Shell 验收

在仓库根目录执行（Node 20+、Python 3、Google Chrome 已安装）：

```bash
npm ci --no-audit --no-fund
npm test
npm run test:native
```

`test:native` 依次执行 Node、完整 Playwright E2E、完整 PNG 独立 QR 解码。测试使用独立临时 Chrome context、`chromiumSandbox: true`、loopback HTTP；不接触用户 profile 或真实 localStorage，不复用已有 HTTP 服务。运行结束自动关闭测试浏览器与 HTTP 服务。

每次写到独立的 `artifacts/local-v2/native/<时间与进程号>/`，含日志、截图、真实下载 PNG、逐图检查、JSON 统计与 `native-result.json`。`artifacts/local-v2/native-latest.json` 指向最近结果；全部 artifacts 已 gitignore。失败或跳过不能算 PASS，运行器保留真实退出码；不要删除断言、增加 skip 或关闭 Chrome sandbox。

分步诊断：

```bash
npm run test:e2e
node scripts/decode_png_qr.cjs artifacts/local-v2/browser/png
```

完整原生运行后，`npm run test:qr` 会再次解码最近一次原生运行目录里的 PNG。解码器用 `pngjs@7.0.0` 检查 CRC 并读取完整像素，再用独立的 `jsqr@1.4.0` 解析整个图像；不拿编码库矩阵、截图裁片或二维码 URL 字符串冒充解码结果。

## 覆盖范围

原最新源包含 70 项 Node 测试与 28 项浏览器 E2E：模型、旧口径、存储故障、生产事件处理器、三步流程、360/390/1440 视口、稳定 ID / 配色、manual 与旧源兼容、PNG 年数、21 次导出文案轮换、未生成报告保全等。根目录适配保留这些断言；仅修改相对路径与产物位置。

本次另外增加独立仓库验例：本地资源与子路径、README 图/文档/命令和固定依赖、原字节 hero，以及完整 26—80 岁 + 睡眠 7h/天 + 阅读 2h/天的 54 年 / 33.75 年余量，改 30—80 岁的 50 年 / 31.25 年余量。浏览器验例下载两张连续文案 PNG，并检查草稿未生成时旧 PNG 快照保持不变。

Node VM 契约不代表浏览器布局或触控、键盘全覆盖；PNG 像素对比验证实际下载与已确认 Canvas 一致，独立 QR 解码另行验证能否被读取。

## 历史夹具

来源测试另外依赖两个只读、脱敏的历史证据夹具：

- `tests/fixtures/duration-provenance-proof.json`
- `tests/fixtures/compat-final/assets1-source-fixture.json`

它们须来自原历史合成事件重放，不能以当前模型现编对象替代，再声称验证了历史序列化。源 runtime 和最新 tests/scripts 交接包最初未附这两个文件，首轮相关测试真实失败并报告 ENOENT，未 skip；之后已补齐原始合成重放文件，保留原串与数据类型，仅相对化来源归档路径元信息。来源与 SHA256 见 [夹具说明](../tests/fixtures/README.md)。独立仓库不搬入内部发布脚本、运维档案或用户存储。只有经核验且不含用户数据、绝对路径或秘密的最小夹具可纳入测试。

## 当前验收记录

首轮实际运行：70 项 Node 中 65 通过、5 因历史夹具缺失失败，exit 1，skip 0。新增验例并补齐原始夹具后，**73 项 Node 全部通过，exit 0，skip/todo/cancelled 均为 0**；项目本地 `npm ci` 成功，exit 0。随后由正常 Mac Shell 执行本仓库原生完整验收：**73/73 Node、29/29 Chrome E2E、45/45 实际完整 PNG 独立 QR 解码通过，三阶段 exit 均为 0，skip/flaky 均为 0**。运行配置启用 Chrome sandbox 与隔离 context；实际测试文件和 runtime hash 与本次工作树一致。浏览器回归约 132 秒，仅作为该次运行记录。

产物位于 `artifacts/local-v2/native/2026-11-07T13-59-43-643Z-75820/`，以 `native-result.json`、`logs/e2e-results.json`、`png-qr-decoded.json` 和日志末尾退出码交叉核对。精简人工预览在 `artifacts/local-v2/review/`（全部 gitignored）。这里只报告本次 Chrome 验收，不推断其他浏览器、实体触控或键盘全覆盖。

官网来源的 70 Node / 28 E2E / 41 PNG QR，以及另外 2 张线上 PNG QR，是迁移前证据。README 自带示例也来自迁移前；均不能替代本仓库运行结果。受限 Codex 沙箱中的 HTTP/Chrome 约束通过正常 Mac Shell 验收解决，不能降低断言或安全设置。
