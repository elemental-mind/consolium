/**
 * Provides terminal output formatting, responsive horizontal and vertical
 * layouts, flexible sizing, and table rendering.
 *
 * @module
 */

export { Formatting } from "./formatting/formatting.ts";

export { type LineDefinition, HorizontalLayout } from "./layouting/horizontalLayout.ts";
export { VerticalLayout } from "./layouting/verticalLayout.ts";

export { Flex } from "./layouting/flex.ts";
export type { FlexGrowConfiguration, FlexShrinkConfiguration } from "./layouting/flex.ts";

export { Table, TableBorder } from "./layouting/tables.ts";
export type { CellContent, TableColumns, TableFormatting } from "./layouting/tables.ts";
