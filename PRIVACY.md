# InkSight Privacy Notice / InkSight 隐私说明

## English

InkSight is local-first. Documents, annotations, canvas content, projects, preferences, and recovery data are stored on the device where the application runs. The browser build uses browser storage such as IndexedDB and LocalStorage. The Electron build can additionally use its local runtime data directory and project folders selected by the user.

AI features are optional. When you configure and invoke an AI provider, InkSight sends requests directly to the configured endpoint. A request can include the selected model, system and user prompts, selected text, and relevant graph context. The API credential is also sent to that provider for authentication. The provider processes this data under its own terms and privacy policy.

In Electron, AI configuration is protected with the operating system's secure storage when encryption is available. If operating-system encryption is unavailable, the configuration is stored without that protection. In the browser build, **Remember API Key on this device** stores the credential in LocalStorage for the current browser profile; turning it off keeps the credential only in memory for the current page session. Browser storage is scoped to the whole origin, not an individual URL path, so deployments that share a host name with other applications should use a dedicated origin where possible. Do not remember a sensitive API key on a shared or untrusted browser profile.

EPUB files are rendered with scripted content disabled. This reduces the risk from untrusted books, but users should still open documents only from sources they trust and keep the application and browser up to date.

InkSight does not require AI configuration for local reading, annotation, canvas, project, or export workflows. Removing local application/browser data or deleting an exported project removes those copies from that device, but does not delete data that a third-party AI provider may already have processed or retained.

## 简体中文

InkSight 采用本地优先设计。文档、标注、画布内容、项目、偏好设置和恢复数据保存在应用运行的设备上。浏览器版使用 IndexedDB、LocalStorage 等浏览器存储；Electron 桌面版还可能使用本机运行时数据目录以及用户选择的项目目录。

AI 功能是可选的。当你配置并主动调用 AI 服务时，InkSight 会直接向所配置的接口地址发送请求。请求可能包含所选模型、系统提示词、用户问题、选中文本和相关图谱上下文；API 凭据也会发送给该服务商用于鉴权。服务商将按照其自身条款和隐私政策处理这些数据。

在 Electron 中，系统支持加密时，AI 配置会通过操作系统安全存储进行保护。如果操作系统加密不可用，配置将在没有该保护的情况下保存。浏览器版启用“在此设备上记住 API Key”时，会将凭据保存在当前浏览器配置文件的 LocalStorage 中；关闭后，凭据只在当前页面会话的内存中保留。浏览器存储按完整来源隔离，而不是按网址路径隔离，因此同一主机名下部署多个应用时，建议尽可能为 InkSight 使用独立来源。请勿在共享或不可信的浏览器配置文件中记住敏感密钥。

EPUB 文档以禁用脚本内容的方式渲染。这可以降低不可信电子书带来的风险，但仍建议只打开来源可信的文档，并及时更新应用与浏览器。

本地阅读、标注、画布、项目和导出流程不要求配置 AI。清除本地应用或浏览器数据、删除导出的项目，只会删除当前设备上的对应副本，不会删除第三方 AI 服务商可能已经处理或保留的数据。
