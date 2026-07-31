export type Framework = 'react' | 'vue' | 'angular' | 'html';
export type PropertySource = 'prop' | 'attribute' | 'slot' | 'css-attribute' | 'css-class' | 'css-media';
export type PropertyType = 'string' | 'number' | 'boolean' | 'enum';

export interface ComponentProperty {
  name: string;
  defaultValue: string;
  type: PropertyType;
  source: PropertySource;
  values?: string[];
}

export interface ComponentRecord {
  id: string;
  pageUrl: string;
  slug: string;
  displayName: string;
  sourceType: 'framework' | 'html';
  frameworkName: string | null;
  properties: ComponentProperty[];
  instanceCount: number;
  previewSnapshotId: string;
}

export interface PageRecord {
  url: string;
  title: string;
  framework: Framework;
  analyzedAt: number;
  componentSlugs: string[];
}

export interface ComponentSnapshot {
  id: string;
  componentId: string;
  html: string;
  css: string;
  cleanHtml: string;
  matchedCss: string;
  designTokens: string;
  fonts: string[];
  capturedAt: number;
  cssRuleCoverage?: number;
  stylesheetUrls?: string[];
}

export interface ExportableComponent {
  slug: string;
  displayName: string;
  frameworkName: string | null;
  sourceType: 'framework' | 'html';
  sourceUrl: string;
  properties: ComponentProperty[];
  cleanHtml: string;
  matchedCss: string;
  designTokens: string;
  fonts: string[];
  capturedAt: number;
}

// SDK result types
export interface HierarchyNode {
  tag: string;
  id?: string;
  classes?: string[];
  role?: string;
  display?: string;
  position?: string;
  backgroundColor?: string;
  fontSize?: string;
  fontWeight?: string;
  width: number;
  height: number;
  textContent?: string;
  imageSrc?: string;
  componentSlug?: string;
  children: HierarchyNode[];
}

export interface PageHierarchy {
  rootNode: HierarchyNode;
  capturedAt: number;
  nodeCount: number;
}

export interface AnalysisResult {
  pageUrl: string;
  pageTitle: string;
  framework: Framework;
  components: AnalysedComponent[];
  hierarchy?: PageHierarchy;
}

export interface AnalysedComponent {
  slug: string;
  displayName: string;
  sourceType: 'framework' | 'html';
  frameworkName: string | null;
  instanceCount: number;
  properties: ComponentProperty[];
  snapshot: { html: string; css: string };
  cleanHtml: string;
  matchedCss: string;
  designTokens: string;
  fonts: string[];
  keyframes: string;
  selectorPath: string;
  cssRuleCoverage?: number;
  stylesheetUrls?: string[];
}

// Message types (extension-specific but shared for type compatibility)
export type MessageType =
  | 'ANALYSE_PAGE'
  | 'GET_COMPONENTS'
  | 'GET_SNAPSHOT'
  | 'FIND_COMPONENT_BY_SLUG'
  | 'EXPORT_COMPONENT'
  | 'GET_HIERARCHY'
  | 'ANALYSIS_COMPLETE';

export interface AnalysePagePayload {
  pageUrl: string;
  pageTitle: string;
  framework: Framework;
  components: AnalysedComponent[];
  hierarchy?: PageHierarchy;
}

export interface GetComponentsPayload {
  pageUrl: string;
}

export interface GetSnapshotPayload {
  componentId: string;
}

export interface ExportComponentPayload {
  componentId: string;
  pageUrl: string;
}

export interface GetComponentsResponse {
  pageRecord: PageRecord | null;
  components: ComponentRecord[];
}

export interface GetSnapshotResponse {
  html: string;
  css: string;
  cleanHtml: string;
  matchedCss: string;
  designTokens: string;
  fonts: string[];
  cssRuleCoverage?: number;
  stylesheetUrls?: string[];
}

export interface FindComponentBySlugPayload {
  slug: string;
}

export interface FindComponentBySlugResponse {
  pageUrl: string;
  component: ComponentRecord;
}

export interface AnalysisCompleteResponse {
  indexUrl: string;
  componentCount: number;
}

export interface Message<T = unknown> {
  type: MessageType;
  payload: T;
}
