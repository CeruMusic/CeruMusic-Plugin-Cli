#!/usr/bin/env node
import { runCli } from '@shiqianjiang/ceru-plugin-cli'
runCli(['init', ...process.argv.slice(2)]).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
