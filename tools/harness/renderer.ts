// -- Default renderer: a pointer/passthrough fallback for surfaces a harness
//    can't render natively.  Emits a valid, reported projection instead of a
//    silent omission or broken file.

import type { HarnessProjector, NativeArtifact } from "./adapter";

/**
 * The catch-all projector.  Every unknown surface degrades to a .README
 * companion that names the canonical source and says "not supported".
 */
export const defaultRenderer: HarnessProjector = {
  id: "__default__",
  reserved: [], // never writes anything; just answers "project" gracefully

  project(_src): NativeArtifact[] {
    return []; // no artifacts emitted — the caller wraps with a .README
  },
};

/** Wrap content in the standard README companion. */
export function defaultRendererBanner(surface: string, hint?: string): string {
  return [
    `<!-- auto-generated: this harness does not support ${surface} -->`,
    ...(hint ? [`Hint: ${hint}`] : []),
    `<!-- see AGENTS.md for cross-harness sync details -->`,
  ].join("\n");
}
