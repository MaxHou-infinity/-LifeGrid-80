# 历史合成重放夹具

两个文件来自迁移交接提供的实际 assets1 合成事件重放产物，`noUserData: true`；不是用户真实 localStorage，也不是用当前模型重造的历史对象。

- `duration-provenance-proof.json`：默认 54 年与明确手填 54 年能序列化为同一对象，旧格式未记录 durationMode。原字节保留，SHA256 `0dd3940fffde8e4fa69dfd06878f12d8572613e934f01a210cb46f3f329dced2`。
- `compat-final/assets1-source-fixture.json`：7h/天 × 54 年睡眠与旧手填 4h/周 × 10 年阅读。原输入 SHA256 `0a7c2198dd931df9013336eb746eff0676213eecbb7ac8010f196b12128e5398`；仓库版 SHA256 `957c81fd13682438baba95f1de9006702df95bc70fd63306a2af3244d834e642`。唯一语义改动是 `sourceManifest.source_archive` 由本机绝对路径缩为归档文件名；JSON 格式重排不改变对象含义。storage 原字符串、draft、confirmed 以及六个历史源文件 hash 均保留。

这些文件支持本仓库重新运行兼容回归；不意味着本仓库重新执行了旧 assets1 归档生成过程。当前运行时代码来自另一个较新候选，详见 [开发说明](../../docs/DEVELOPMENT.md)。
