/**
 * Shared CLI version constant.
 *
 * At build time esbuild replaces `__CLI_VERSION__` with the literal
 * version string from package.json.  During development (tsx) the
 * define is not applied, so we fall back to reading the package at
 * runtime.
 */

import { createRequire } from "node:module";

declare const __CLI_VERSION__: string;

export const CLI_VERSION: string =
  typeof __CLI_VERSION__ !== "undefined"
    ? __CLI_VERSION__
    : (createRequire(import.meta.url)("../../package.json") as { version: string }).version;
