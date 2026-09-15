/**
 * Shared environment resolution for the browser QA harnesses.
 *
 * Every harness reads the same variables so one invocation shape works across lanes:
 *   PLAYWRIGHT_MODULE  path to an installed Playwright `index.mjs` (default: the npx cache used by QA)
 *   CHROME_PATH        Chrome executable (default: the system Chrome on macOS)
 *   UI_ORIGIN          Vite dev origin for UI harnesses (localhost only where the harness mutates local state)
 *   QA_ORIGIN/QA_API   frontend origin and worker API for the multiplayer harness
 *   UI_OUTPUT/QA_OUTPUT artifact directory (each harness documents its own default)
 */
import assert from 'node:assert/strict'
import os from 'node:os'
import { mkdir } from 'node:fs/promises'

export const DEFAULT_PLAYWRIGHT_MODULE = '/Users/ahmaadidrees/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'
export const DEFAULT_CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
export const LOCAL_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]']

export async function loadChromium() {
  const module = await import(process.env.PLAYWRIGHT_MODULE || DEFAULT_PLAYWRIGHT_MODULE)
  return module.chromium
}

export function chromeExecutablePath() {
  return process.env.CHROME_PATH || DEFAULT_CHROME_PATH
}

/** Launch options every harness shares; pass overrides for headed runs or extra flags. */
export function launchOptions(extra = {}) {
  return { headless: true, executablePath: chromeExecutablePath(), ...extra }
}

export function isLocalOrigin(origin) {
  return LOCAL_HOSTNAMES.includes(new URL(origin).hostname)
}

/** Origin for harnesses that create or replace guest data: refuses anything that is not local. */
export function localOrigin(variable, fallback, reason) {
  const origin = (process.env[variable] || fallback).replace(/\/+$/, '')
  assert(isLocalOrigin(origin), `${variable} must be a localhost origin: ${reason}`)
  return origin
}

export async function outputDir(variable, fallback) {
  const directory = process.env[variable] || fallback
  await mkdir(directory, { recursive: true })
  return directory
}

/** Host conditions recorded next to every timing so a noisy run can be recognised later. */
export function hostSnapshot() {
  return {
    hostname: os.hostname(),
    platform: `${os.platform()} ${os.release()}`,
    cpus: os.cpus().length,
    cpuModel: os.cpus()[0]?.model ?? 'unknown',
    loadAverage: os.loadavg().map((value) => Math.round(value * 100) / 100),
    freeMemoryMB: Math.round(os.freemem() / 1048576),
    totalMemoryMB: Math.round(os.totalmem() / 1048576),
    node: process.version,
  }
}
