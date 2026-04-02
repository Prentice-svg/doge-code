# Windows便携发布

这个项目当前更适合发布成“便携目录”，而不是直接生成 `msi` 或 `setup.exe`。

## 生成方式

在仓库根目录运行：

```powershell
bun run package:portable
```

默认输出目录：

```text
dist\portable\doge-code-windows-portable-<version>
```

## 结果结构

```text
doge-code-windows-portable-<version>\
  app\
  data\
  doge.cmd
  doge-version.cmd
  README-Portable.md
```

## 使用说明

- 目标机器需要预先安装 Bun
- 运行 `doge.cmd` 会自动把 `CLAUDE_CONFIG_DIR` 指向当前目录下的 `data\`
- 这样登录态、配置、历史都会跟随便携目录一起走

## 说明

当前仓库还不能稳定编译成独立 `exe`。主要原因是恢复树里仍有缺失模块和未补齐的可选依赖，因此先采用便携发布方案。
