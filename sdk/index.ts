// Component Preview SDK
// Standalone: ComponentPreview.analyse().then(result => ...)
// Extension: auto-runs on injection, posts results immediately via postMessage

import { analyse, analyseSync } from './analyzer';
import { buildExportHtml } from './export-builder';
import type { AnalysisResult, AnalysedComponent, ExportableComponent, PageHierarchy, Message, AnalysePagePayload } from './types';

export type { AnalysisResult, AnalysedComponent };

if ((window as Record<string, unknown>)['__COMPONENT_PREVIEW_SDK_LOADED__']) {
  // Already loaded — skip
} else {
  (window as Record<string, unknown>)['__COMPONENT_PREVIEW_SDK_LOADED__'] = true;

  const isExtensionInjected = !!(window as Record<string, unknown>)['__COMPONENT_PREVIEW_EXTENSION__'];

  const ComponentPreview = {
    analyse,
    analyseSync,

    exportComponent(component: AnalysedComponent, sourceUrl: string, hierarchy?: PageHierarchy): string {
      const exportable: ExportableComponent = {
        slug: component.slug,
        displayName: component.displayName,
        frameworkName: component.frameworkName,
        sourceType: component.sourceType,
        sourceUrl,
        properties: component.properties,
        cleanHtml: component.cleanHtml,
        matchedCss: component.matchedCss,
        designTokens: component.designTokens,
        fonts: component.fonts,
        capturedAt: Date.now(),
      };
      return buildExportHtml(exportable, hierarchy);
    },
  };

  (window as Record<string, unknown>)['ComponentPreview'] = ComponentPreview;

  if (isExtensionInjected) {
    try {
      const result = analyseSync();
      const payload: AnalysePagePayload = {
        pageUrl: result.pageUrl,
        pageTitle: result.pageTitle,
        framework: result.framework,
        components: result.components,
        hierarchy: result.hierarchy,
      };
      window.postMessage({
        source: 'component-preview-analyzer',
        message: { type: 'ANALYSE_PAGE', payload } as Message<AnalysePagePayload>,
      }, '*');

      analyse()
        .then((enriched) => {
          window.postMessage({
            source: 'component-preview-analyzer',
            message: {
              type: 'ANALYSE_PAGE',
              payload: {
                pageUrl: enriched.pageUrl,
                pageTitle: enriched.pageTitle,
                framework: enriched.framework,
                components: enriched.components,
                hierarchy: enriched.hierarchy,
              },
            } as Message<AnalysePagePayload>,
          }, '*');
        })
        .catch((err) => {
          console.warn('[ComponentPreview] CSS enrichment failed:', err);
        });
    } catch (err) {
      window.postMessage({
        source: 'component-preview-analyzer',
        message: { type: 'ANALYSE_PAGE_ERROR', payload: { error: String(err) } },
      }, '*');
    }
  }
}
