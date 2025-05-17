/**
 * Minimal Fresh framework type definitions for Local use
 */
/**
 * Handler map for HTTP methods
 */
export type Handlers = Record<string, any>;

/**
 * Props passed to page components
 */
export interface PageProps<T = any> {
  data: T;
}