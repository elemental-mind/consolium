/**
 * Provides terminal output formatting, responsive horizontal and vertical
 * layouts, flexible sizing, and table rendering.
 *
 * @module
 */

/** Terminal text-formatting factory and API. */
export { Formatting } from "./formatting/formatting.ts";

/** Types and class for responsive horizontal line layout. */
export { type LineDefinition, HorizontalLayout } from "./layouting/horizontalLayout.ts";
/** Class and types for viewport-aware vertical line layout. */
export { VerticalLayout, type ScrollMarkerOptions, type TerminalLine, type VerticalLayoutOptions, type VerticalLayoutScrollMode } from "./layouting/verticalLayout.ts";

/** Factory API for flexible growth and truncation boundaries. */
export { Flex } from "./layouting/flex.ts";
/** Configuration types for flexible growth and truncation boundaries. */
export type { FlexGrowConfiguration, FlexShrinkConfiguration } from "./layouting/flex.ts";

/** Table renderer and border definitions. */
export { Table, TableBorder } from "./layouting/tables.ts";
/** Types accepted when defining table cells, columns, and formatting. */
export type { CellContent, TableColumns, TableFormatting } from "./layouting/tables.ts";
