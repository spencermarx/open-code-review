/**
 * Progress Tracking Module
 *
 * Provides strategy-based progress tracking for different OCR workflows.
 */

export * from "./types";
export * from "./strategy";
export * from "./detector";
export * from "./render-utils";
export { detectActiveWorkflows, hasBothWorkflowsActive } from "./detector";

import { registerStrategy } from "./strategy";
import { reviewStrategy } from "./review-strategy";
import { mapStrategy } from "./map-strategy";

// Register all strategies on module load
registerStrategy(reviewStrategy);
registerStrategy(mapStrategy);

// Re-export strategies for direct access
export { reviewStrategy } from "./review-strategy";
export { mapStrategy } from "./map-strategy";
