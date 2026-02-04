"use client";

import MarkdownIt from "markdown-it";
import {
  defaultMarkdownSerializer,
  MarkdownParser,
} from "prosemirror-markdown";
import type { Node } from "prosemirror-model";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";

import { documentSchema } from "./config";
import { createSuggestionWidget, type UISuggestion } from "./suggestions";

// Create a markdown parser using prosemirror-markdown
// This properly converts markdown to ProseMirror documents using the schema
// @ts-expect-error markdown-it default export handling varies between TS configs
const markdownParser = new MarkdownParser(
  documentSchema,
  new MarkdownIt("commonmark", { html: false }),
  {
    blockquote: { block: "blockquote" },
    paragraph: { block: "paragraph" },
    list_item: { block: "list_item" },
    bullet_list: { block: "bullet_list" },
    ordered_list: {
      block: "ordered_list",
      getAttrs: (tok) => ({ order: +(tok.attrGet("start") ?? 1) }),
    },
    heading: {
      block: "heading",
      getAttrs: (tok) => ({ level: +tok.tag.slice(1) }),
    },
    code_block: { block: "code_block", noCloseToken: true },
    fence: {
      block: "code_block",
      getAttrs: (tok) => ({ params: tok.info || "" }),
      noCloseToken: true,
    },
    hr: { node: "horizontal_rule" },
    image: {
      node: "image",
      getAttrs: (tok) => ({
        src: tok.attrGet("src"),
        title: tok.attrGet("title") || null,
        alt: tok.children?.[0]?.content || null,
      }),
    },
    hardbreak: { node: "hard_break" },
    em: { mark: "em" },
    strong: { mark: "strong" },
    link: {
      mark: "link",
      getAttrs: (tok) => ({
        href: tok.attrGet("href"),
        title: tok.attrGet("title") || null,
      }),
    },
    code_inline: { mark: "code" },
  }
);

export const buildDocumentFromContent = (content: string) => {
  if (!content) {
    // Return an empty document with a single empty paragraph
    return documentSchema.node("doc", null, [
      documentSchema.node("paragraph"),
    ]);
  }

  const doc = markdownParser.parse(content);
  if (!doc) {
    // Fallback: return empty document if parsing fails
    return documentSchema.node("doc", null, [
      documentSchema.node("paragraph"),
    ]);
  }

  return doc;
};

export const buildContentFromDocument = (document: Node) => {
  return defaultMarkdownSerializer.serialize(document);
};

export const createDecorations = (
  suggestions: UISuggestion[],
  view: EditorView
) => {
  const decorations: Decoration[] = [];

  for (const suggestion of suggestions) {
    decorations.push(
      Decoration.inline(
        suggestion.selectionStart,
        suggestion.selectionEnd,
        {
          class: "suggestion-highlight",
        },
        {
          suggestionId: suggestion.id,
          type: "highlight",
        }
      )
    );

    decorations.push(
      Decoration.widget(
        suggestion.selectionStart,
        (currentView) => {
          const { dom } = createSuggestionWidget(suggestion, currentView);
          return dom;
        },
        {
          suggestionId: suggestion.id,
          type: "widget",
        }
      )
    );
  }

  return DecorationSet.create(view.state.doc, decorations);
};
