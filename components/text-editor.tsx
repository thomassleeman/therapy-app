"use client";

import { exampleSetup } from "prosemirror-example-setup";
import { inputRules } from "prosemirror-inputrules";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { memo, useEffect, useRef } from "react";

import type { Suggestion } from "@/lib/db/types";
import {
  documentSchema,
  handleTransaction,
  headingRule,
} from "@/lib/editor/config";
import {
  buildContentFromDocument,
  buildDocumentFromContent,
  createDecorations,
} from "@/lib/editor/functions";
import {
  projectWithPositions,
  suggestionsPlugin,
  suggestionsPluginKey,
} from "@/lib/editor/suggestions";

type EditorProps = {
  content: string;
  onSaveContent: (updatedContent: string, debounce: boolean) => void;
  status: "streaming" | "idle";
  isCurrentVersion: boolean;
  currentVersionIndex: number;
  suggestions: Suggestion[];
};

function PureEditor({
  content,
  onSaveContent,
  suggestions,
  status,
}: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);

  // Initialize editor once on mount - content updates are handled by the separate useEffect below
  useEffect(() => {
    if (containerRef.current && !editorRef.current) {
      const state = EditorState.create({
        // Start with empty doc - content will be populated by the content sync effect
        doc: buildDocumentFromContent(""),
        plugins: [
          ...exampleSetup({ schema: documentSchema, menuBar: false }),
          inputRules({
            rules: [
              headingRule(1),
              headingRule(2),
              headingRule(3),
              headingRule(4),
              headingRule(5),
              headingRule(6),
            ],
          }),
          suggestionsPlugin,
        ],
      });

      editorRef.current = new EditorView(containerRef.current, {
        state,
      });
    }

    return () => {
      if (editorRef.current) {
        editorRef.current.destroy();
        editorRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.setProps({
        dispatchTransaction: (transaction) => {
          handleTransaction({
            transaction,
            editorRef,
            onSaveContent,
          });
        },
      });
    }
  }, [onSaveContent]);

  // Sync content to editor - handles both initial load and updates
  useEffect(() => {
    console.log("[Editor Sync Effect]", {
      hasEditorRef: !!editorRef.current,
      contentLength: content?.length,
      contentPreview: content?.substring(0, 100),
      status,
    });

    if (!editorRef.current) {
      console.log("[Editor Sync] No editor ref, skipping");
      return;
    }

    // Skip if content is not yet available
    if (content === undefined || content === null) {
      console.log("[Editor Sync] Content is null/undefined, skipping");
      return;
    }

    const currentContent = buildContentFromDocument(
      editorRef.current.state.doc
    );

    console.log("[Editor Sync] Comparing content", {
      currentContentLength: currentContent.length,
      newContentLength: content.length,
      areEqual: currentContent === content,
    });

    // During streaming, always update to show progressive content
    if (status === "streaming") {
      const newDocument = buildDocumentFromContent(content);

      const transaction = editorRef.current.state.tr.replaceWith(
        0,
        editorRef.current.state.doc.content.size,
        newDocument.content
      );

      transaction.setMeta("no-save", true);
      editorRef.current.dispatch(transaction);
      console.log("[Editor Sync] Updated during streaming");
      return;
    }

    // When not streaming, update if content differs (or on initial load)
    if (currentContent !== content) {
      console.log("[Editor Sync] Content differs, updating editor");
      const newDocument = buildDocumentFromContent(content);

      console.log("[Editor Sync] newDocument details", {
        newDocContentSize: newDocument.content.size,
        newDocChildCount: newDocument.content.childCount,
        newDocFirstChild: newDocument.content.firstChild?.type.name,
        currentDocSize: editorRef.current.state.doc.content.size,
      });

      const transaction = editorRef.current.state.tr.replaceWith(
        0,
        editorRef.current.state.doc.content.size,
        newDocument.content
      );

      console.log("[Editor Sync] Transaction details", {
        docChanged: transaction.docChanged,
        stepsCount: transaction.steps.length,
      });

      transaction.setMeta("no-save", true);
      editorRef.current.dispatch(transaction);

      // Verify after dispatch
      const afterContent = buildContentFromDocument(editorRef.current.state.doc);
      console.log("[Editor Sync] After dispatch", {
        docContentSize: editorRef.current.state.doc.content.size,
        contentLength: afterContent.length,
        contentPreview: afterContent.substring(0, 100),
      });

      console.log("[Editor Sync] Editor updated");
    } else {
      console.log("[Editor Sync] Content unchanged, no update needed");
    }
  }, [content, status]);

  useEffect(() => {
    if (editorRef.current?.state.doc && content) {
      const projectedSuggestions = projectWithPositions(
        editorRef.current.state.doc,
        suggestions
      ).filter(
        (suggestion) => suggestion.selectionStart && suggestion.selectionEnd
      );

      const decorations = createDecorations(
        projectedSuggestions,
        editorRef.current
      );

      const transaction = editorRef.current.state.tr;
      transaction.setMeta(suggestionsPluginKey, { decorations });
      editorRef.current.dispatch(transaction);
    }
  }, [suggestions, content]);

  return (
    <div className="prose dark:prose-invert relative" ref={containerRef} />
  );
}

function areEqual(prevProps: EditorProps, nextProps: EditorProps) {
  return (
    prevProps.suggestions === nextProps.suggestions &&
    prevProps.currentVersionIndex === nextProps.currentVersionIndex &&
    prevProps.isCurrentVersion === nextProps.isCurrentVersion &&
    !(prevProps.status === "streaming" && nextProps.status === "streaming") &&
    prevProps.content === nextProps.content &&
    prevProps.onSaveContent === nextProps.onSaveContent
  );
}

export const Editor = memo(PureEditor, areEqual);
