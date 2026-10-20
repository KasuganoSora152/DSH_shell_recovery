# DSH Shell Recovery

为 **Windows 官方 DeepSeek Harness（DSH）桌面端**提供一个本地 shell 修复插件，处理已确认的一种 `0xC0000142 / STATUS_DLL_INIT_FAILED` 问题。

插件包含完整修复逻辑，可以在**未预先打补丁的官方安装包**上独立工作。它只在沙箱 runner 加载模块时修改内存中的代码，不改写 `app.asar`。

> 这不是所有 DLL 初始化失败的通用修复，也不是官方插件。仅对下文列出的已验证源文件哈希生效。npm / Web / CLI 部署不在本项目支持范围内。

## 安装

需要 Windows、已启动过并生成用户 profile 的 DSH 桌面端，以及 Node.js 22.15 或更高版本用于运行安装脚本。插件运行时使用 DSH 自带的 Electron / Node。

下载或克隆本仓库，在仓库目录执行：

```powershell
node scripts/manage.mjs install
```

随后重启 DSH 桌面端。安装脚本默认选择当前用户的：

```text
~/.dsh/profiles/desktop
```

如果自定义了 DSH_HOME 或 profile 位置，请显式指定实际的**桌面端** profile：

```powershell
node scripts/manage.mjs install --profile "D:\YourDSHHome\profiles\desktop"
```

安装过程将三个源码文件复制到该 profile 的 `local-shell-fix` 子目录，在 `cordis.patch.yml` 注册插件，并保存配置和旧源码的本地备份。不会安装 npm 依赖、改动 npm 版 DSH、修改全局环境变量或创建定时任务。

目前采用本地配置加载方式，**不是侧边栏插件市场中的 bundle 卡片**。

## 查看、启用和停用

- 内部名称：`dsh-local-shell-fix`
- 配置 ID：`desktop-local-shell-fix`
- 可在 DSH 设置的插件清单中搜索该 ID；该清单用于查看状态。
- 运行状态记录在 desktop profile 下的 `local-shell-fix/status.json`。

```powershell
node scripts/manage.mjs disable
node scripts/manage.mjs enable
```

同样支持 `--profile`。配置热加载可用时会直接生效；更换插件源码后建议重启。

停用仅关闭本插件，不会撤销其他工具过去已经写入安装包的补丁。脚本只追加针对本插件的开关配置，保留其他配置。

| 状态 | 含义 |
| --- | --- |
| `active` + `official-original` | 已挂接，runner 加载已知原版模块时在内存中修复 |
| `active` + `already-patched` | 已挂接，但磁盘模块已经修复，跳过重复替换 |
| `inactive-needs-review` | 源代码、接口或已有 runner 覆盖不符合预期，保留官方实现 |
| `inactive-non-desktop` | 不在受支持的 Windows Electron 桌面环境 |
| `disposed` | 插件生命周期已结束，例如停用或重载 |

`active` 表示钩子已注册，不等同于某次 shell 调用已经成功。

## 原理与更新后的行为

已确认的缺陷位于 Windows ACL 沙箱的 `setTokenDefaultDaclGrant`：默认新对象 DACL 只补入 capability SID，某些用户令牌环境仍缺少普通用户访问检查所需的写权限，导致受限子进程或匿名管道初始化失败。

插件给沙箱 runner 加入专用 `--import` 预加载模块，通过 Node 模块加载钩子核对源文件 SHA256，再给受限令牌的新对象默认 DACL 增加当前 `TokenUser` SID 的 `GENERIC_ALL` ACE。

保留原 runner、限制 SID 列表、`WRITE_RESTRICTED` 等令牌 flags、Low 完整性和工作区写入限制。用户 SID 不会加入 restricting SID 列表；不会切换到 `danger-full-access`。

用户 profile 通常由官方更新保留。因此，更新后只要仍带入相同的已验证缺陷模块，插件就能继续自动修复，无需重新修改安装包。此机制不依赖 Codex 后台运行。

**兼容限制：**

- 源文件哈希必须完全匹配；即便只改变注释、仍有相似缺陷，也会跳过旧补丁。
- 使用当前实现的内部 `windowsAclRunnerArgs` 扩展点；未来接口或目录结构变化可能需要适配。
- 若官方已修复或改变实现，不强行应用旧代码。
- 删除 profile、停用插件，或使用官方恢复功能重置第三方插件配置后，需要重新启用。

## 已验证范围

验证平台为 Windows x64 官方桌面端 `0.2.1-rc.2`。此前 `0.2.0-rc.2` 的对应原始模块与其哈希一致，但本插件的完整启动链验证针对 `0.2.1-rc.2`。

| 模块 | SHA256 |
| --- | --- |
| 已知原始 `types-Cl_DXjhk.js` | `0bb3a34508785bdc34626542f9358d398fd9f60fdaf4b48201dfdff2122f25fc` |
| 已验证修复结果 | `93541b5477d1e8a83fe91d6de0c258a92d48498a2e0adc356d07a48bacbfa57b` |

在未修改的官方包副本上，以实际 Electron 和原 runner 验证：

- 前台、后台 PowerShell 和 Node 管道成功。
- 工作区、私有临时目录写入成功。
- 工作区外覆盖与新建文件被拒绝。
- read-only 写入被拒绝，受限子进程仍为 Low 完整性。
- 原安装包副本哈希保持不变。

测试直接覆盖实际 runner，没有通过模型聊天代发工具调用。结果仅代表已验证环境，不保证所有 Windows 环境。

## 开发与测试

没有第三方 npm 依赖：

```powershell
node --test
```

默认测试未知源码保持不变、安装幂等性以及开关时保留其他用户配置。已知源码变换测试需要你本地从合法安装包提取原始模块，通过环境变量传入；不提供该文件时该测试显示为跳过：

```powershell
$env:DSH_SANDBOX_SOURCE = "D:\test-input\types-Cl_DXjhk.js"
node --test
Remove-Item Env:DSH_SANDBOX_SOURCE
```

本仓库不分发 DSH 安装包、完整官方模块或用户运行日志。

## 隐私

插件不发送遥测或网络请求。运行时的 `status.json` 和配置备份可能包含个人目录、进程 ID 或其他用户配置，**不要上传这些文件**。仓库仅提供通用源码和文档，`.gitignore` 排除了常见运行产物。

## 开源协议

本项目采用 [GNU General Public License v3.0](LICENSE)（`GPL-3.0-only`）开源协议。

Copyright (C) 2026 KasuganoSora152。许可证适用于本项目代码；DSH 及其他第三方组件仍遵循各自的许可证。

## 参考

- [Microsoft：Restricted Tokens](https://learn.microsoft.com/en-us/windows/win32/secauthz/restricted-tokens)
- [Microsoft：TOKEN_DEFAULT_DACL](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-token_default_dacl)
- [Node.js：module.registerHooks](https://nodejs.org/api/module.html#moduleregisterhooksoptions)
- [DSH：sandbox-local 实现](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/sandbox/sandbox-local/src/index.ts)
