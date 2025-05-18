/**
 * Minimal Fresh framework type definitions for Local use
 */
/**
 * Handler map for HTTP methods
 */
export type Handlers = Record<string, unknown>;

/**
 * Props passed to page components
 */
export interface PageProps<T = unknown> {
  data: T;
}
