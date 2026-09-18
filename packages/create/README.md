# create-ceru-plugin

类似 create-vue 的 Ceru Music 插件脚手架。

~~~bash
npm create ceru-plugin@latest
~~~

也可以直接选择模板：

~~~bash
npm create ceru-plugin@latest my-plugin -- --template react --lang ts
cd my-plugin
npm install
npm run dev
npm run build
~~~

提供 9 种模板、TS/JS 变体、VS Code 配置、小 demo 与离线模板快照。最终只分发 dist/plugin.js。

模板：source、connected-library、importer、guest-adapter、web-surface、vue、vue-tsx、react、web-dist。

[工具链指南](https://github.com/CeruMusic/CeruMusic-Plugin-Cli#readme) · [模板和社区插件](https://github.com/CeruMusic/CeruMusic-Plugin-Template)
