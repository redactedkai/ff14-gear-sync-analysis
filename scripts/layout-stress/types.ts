/* The shapes the layout stress tool passes around: what the page-side probe measures (probe.ts), what the rules say about it
   (rules.ts, math-rules.ts), the views and screens it visits (targets.ts) and the findings it reports. Types only: Node strips
   them. */
import type { Page } from 'playwright';
import type { SavedSheet } from '../../src/ui/sheets/saved-types.ts';

/* A box in the window's coordinates, in px: left, top, right, bottom. */
export type Box = { l: number; t: number; r: number; b: number };

/* A measured control: its box and id, `c` (the index of its container, -1 for none), `up` (the index of the nearest control
   around it, -1 for none) and `overlay` (it is positioned over another control on purpose). A rule works without the last
   three. */
export type Control = Box & { id: string; c?: number; up?: number; overlay?: boolean };

/* A box around controls; `scrolls`: it scrolls on its own, so what is beyond its edge is reachable. */
export type Container = Box & { id: string; scrolls: boolean };

/* A measured box that shares rows with others (a field, a menu button). */
export type NamedBox = Box & { id: string };

/* What the rules read of one scope: its controls, its height and its rectangle. */
export type ScopeShape = { controls: Control[]; height?: number; rect?: { t: number } };

/* A scope as the probe measures it: the root's rectangle and height, its controls, their containers and its boxes. */
export type Scope = { rect: Box; height: number; controls: Control[]; containers: Container[]; boxes: NamedBox[] };

/* One section of the math bar (a divided part, or the Job box). */
export type BarSection = {
  id: string;
  kind: 'divided' | 'job';
  wideGap: boolean;
  left: number;
  top: number;
  height: number;
  startsLine: boolean;
  hasRule: boolean;
  ruleLeft: number;
  ruleHeight: number;
  ruleClear: boolean;
  ruleShown: boolean;
};

/* The tops (px) of the parts of Stat Allocation's bar; null for a part that is not shown. */
export type BarTops = {
  job?: number | null;
  piecesec?: number | null;
  piece?: number | null;
  sync?: number | null;
  il?: number | null;
};

/* The math bar's own measures. */
export type MathBar = {
  rem: number;
  rowWidth: number;
  columnGap: number;
  extraGap: number;
  overflowX: string;
  sections: BarSection[];
  tops: BarTops;
  jobBoxHeight: number;
  boxHeights: { id: string; h: number }[];
  track: number | null;
};

/* What the probe returns for the open view (measureView in probe.ts). */
export type Probe = {
  width: number;
  height: number;
  hscroll: boolean;
  past: string[];
  clipped: string[];
  wrapped: { id: string; lines: number }[];
  nameLines: { over: number; max: number } | null;
  pinned: { head: number; stack: number } | null;
  rows: { total: number; visible: number } | null;
  scopes: Record<string, Scope>;
  mathBar?: MathBar;
};

/* What a layout key reads of a probe (layoutKey in rules.ts). */
export type KeyedProbe = {
  scopes: Record<string, ScopeShape>;
  hscroll?: boolean;
  wrapped?: unknown[];
  clipped?: unknown[];
  nameLines?: { over: number; max: number } | null;
  mathBar?: MathBar | null;
};

/* The page-side settings of a view (plain data, probeConfig in targets.ts). */
export type ProbeConfig = {
  scopes: Record<string, string>;
  controls: string;
  boxes: string[];
  clipped: string;
  labels: string[];
  names: string | null;
  pinned: { header: string; columns?: string } | null;
  rows: { rows: string; marker: string } | null;
  mathBar: boolean;
};

/* A rule's severity: `fail` fails the run, `warn` is only reported. */
export type Severity = 'fail' | 'warn';

/* A finding of a rule on one view. */
export type Finding = { rule: string; severity: Severity; detail: string; where: string; view?: string };

/* A finding with the run's own columns (the runner adds them), and the range of widths of a sweep finding. */
export type RunFinding = Finding & {
  screen: string;
  setup: string;
  browser: string;
  window?: string;
  widths?: [number, number];
  count?: number;
};

/* The ids of the saved sheets a fixture opens (what the views open). */
export type FixtureOpen = {
  sheetId?: string;
  setId?: string;
  fillSetId?: string;
  emptySheetId?: string;
  emptySetSheetId?: string;
};

/* Saved sheets and what the views open. */
export type Fixture = { sheets: SavedSheet[]; open: FixtureOpen };

/* A fixture and whether every write to storage fails. */
export type FixtureSetup = { fixture: Fixture; failWrites: boolean };

/* A font and text setup (matrix.ts FONT_SETUPS), or the stress build's. */
export type Setup = { id: string; label: string; blockFonts: boolean; css: string; build?: string };

/* An open menu or popover of a view. */
export type Menu = {
  id: string;
  open: (page: Page) => Promise<void>;
  selector: string;
  inPinnedHeader?: boolean;
  popup?: boolean;
};

/* The settings a view gives the probe, over the common ones. */
export type ViewMeasure = Partial<Omit<ProbeConfig, 'mathBar'>> & { scopes: Record<string, string>; mathBar?: boolean };

/* A place on the page the tool reaches and measures. */
export type View = {
  id: string;
  label: string;
  fixture: string;
  reach: (page: Page, open: FixtureOpen) => Promise<void>;
  measure: ViewMeasure;
  menus?: Menu[];
  twin?: string;
  stable?: string[];
  dialog?: string;
  pinned?: boolean;
  focusWalk?: boolean;
  sweep?: boolean;
  jobs?: {
    scope: string;
    open: (page: Page) => Promise<void>;
    pick: (page: Page, jobId: string) => Promise<void>;
  };
  states?: { id: string; apply: (page: Page) => Promise<void> }[];
  pinnedBar?: string;
  widest?: (page: Page) => Promise<void>;
};

/* A screen: a list of views, and the checks that span them. */
export type Screen = {
  id: string;
  label: string;
  views: View[];
  crossCheck?: (page: Page) => Promise<Pick<Finding, 'rule' | 'detail' | 'where'>[]>;
  crossFixture?: string;
  waiting?: string;
};
