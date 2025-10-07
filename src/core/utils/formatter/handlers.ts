import { Handlers, Info, State } from "mdast-util-to-markdown";
import {
  Blockquote,
  Code,
  Delete,
  Emphasis,
  Heading,
  Html,
  Image,
  ImageReference,
  InlineCode,
  Link,
  LinkReference,
  List,
  ListItem,
  Parents,
  Strong,
  Table,
  Text,
} from "mdast";
import { defaultHandlers } from "mdast-util-to-markdown";
import {
  escapeCode,
  escapeLink,
  escapeText,
  isUrl,
  processUnsupportedTags,
  renderChildren,
  wrap,
} from "./utils";

export interface LinkReferenceEntry {
  title: string | null;
  url: string;
}

export type LinkReferences = Record<string, LinkReferenceEntry>;
export type UnsupportedTagsStrategy = "escape" | "remove" | "keep";

/**
 * This is mostly https://github.com/AndyRightNow/telegram-markdown-v2/
 * But I wasn't happy with it vibe coded quality
 */
export const getHandlers = (
  references: LinkReferences = {},
  unsupportedTagsStrategy: UnsupportedTagsStrategy = "escape"
): Partial<Handlers> => ({
  text: handleText,
  heading: handleHeading,
  strong: handleStrong,
  delete: handleDelete,
  emphasis: handleEmphasis,
  list: handleList,
  listItem: handleListItem,
  inlineCode: handleInlineCode,
  code: handleCode,
  link: handleLink,
  linkReference: getHandleLinkReference(references),
  image: handleImage,
  imageReference: getHandleImageReference(references),
  blockquote: getHandleBlockquote(unsupportedTagsStrategy),
  html: getHandleHtml(unsupportedTagsStrategy),
  table: getHandleTable(unsupportedTagsStrategy),
});

const handleText: Handlers["text"] = (
  node: Text,
  _parent: Parents | undefined,
  state: State
): string => {
  const exit = state.enter("phrasing");
  const text = node.value;
  exit();
  return escapeText(text);
};

const handleHeading = (
  node: Heading,
  _parent: Parents | undefined,
  state: State,
  info: Info
): string => {
  const marker = "*";
  const exit = state.enter("headingAtx");
  const value = renderChildren(node, state, {
    ...info,
    before: marker,
    after: marker,
  });
  exit();
  return wrap(value, marker);
};

const handleStrong = (
  node: Strong,
  _parent: Parents | undefined,
  state: State,
  info: Info
): string => {
  const marker = "*";
  const exit = state.enter("strong");
  const value = renderChildren(node, state, {
    ...info,
    before: marker,
    after: marker,
  });
  exit();
  return wrap(value, marker);
};

const handleDelete = (
  node: Delete,
  _parent: Parents | undefined,
  state: State,
  info: Info
): string => {
  const marker = "~";
  const exit = state.enter("strong"); // Use 'strong' as fallback
  const value = renderChildren(node, state, {
    ...info,
    before: marker,
    after: marker,
  });
  exit();
  return wrap(value, marker);
};

const handleEmphasis = (
  node: Emphasis,
  _parent: Parents | undefined,
  state: State,
  info: Info
): string => {
  const marker = "_";
  const exit = state.enter("emphasis");
  const value = renderChildren(node, state, {
    ...info,
    before: marker,
    after: marker,
  });
  exit();
  return wrap(value, marker);
};

const handleList = (
  node: List,
  parent: Parents | undefined,
  state: State,
  info: Info
): string => {
  const result = defaultHandlers.list(node, parent, state, info);

  let processed = result.replace(/^(\d+)\./gm, "$1\\.");

  // Check if this list is followed by a code block and add extra newline
  const nextSibling =
    parent &&
    typeof parent === "object" &&
    "children" in parent &&
    Array.isArray(parent.children)
      ? parent.children[
          parent.children.findIndex((child: unknown) => child === node) + 1
        ]
      : null;
  if (
    nextSibling &&
    typeof nextSibling === "object" &&
    nextSibling &&
    "type" in nextSibling &&
    nextSibling.type === "code"
  ) {
    processed += "\n";
  }

  return processed;
};

const handleListItem = (
  node: ListItem,
  parent: Parents | undefined,
  state: State,
  info: Info
): string => {
  const result = defaultHandlers.listItem(node, parent, state, info);

  // Post-process to fix spacing issues
  let processed = result;

  // Replace * with • for unordered lists and ensure exactly 3 spaces
  processed = processed.replace(/^(\s*)\*\s*/gm, "$1•   ");

  // Fix ordered list spacing: add extra space after dots
  processed = processed.replace(/^(\s*)(\d+\.) /gm, "$1$2  "); // Double space for non-escaped
  processed = processed.replace(/^(\s*)(\d+\\\.) /gm, "$1$2  "); // Double space for escaped

  return processed;
};

const getHandleBlockquote = (
  unsupportedTagsStrategy: UnsupportedTagsStrategy
) => {
  return (
    node: Blockquote,
    _parent: Parents | undefined,
    state: State,
    info: Info
  ): string => {
    const exit = state.enter("blockquote");
    const content = renderChildren(node, state, info);
    exit();

    // Convert to V2 block quote format: each line starts with > followed by space
    const lines = content.split("\n").filter((line) => line.trim());
    const quotedLines = lines.map((line) => `> ${line}`);

    return processUnsupportedTags(
      quotedLines.join("\n"),
      unsupportedTagsStrategy
    );
  };
};

const getHandleHtml =
  (unsupportedTagsStrategy: UnsupportedTagsStrategy) =>
  (node: Html): string => {
    return processUnsupportedTags(node.value, unsupportedTagsStrategy);
  };

const getHandleTable =
  (unsupportedTagsStrategy: UnsupportedTagsStrategy) =>
  (node: Table): string => {
    const rows: string[][] = [];

    if (node.children) {
      for (const row of node.children) {
        if (row.type === "tableRow" && row.children) {
          const cells: string[] = [];
          for (const cell of row.children) {
            if (cell.type === "tableCell") {
              cells.push(cell.toString().trim());
            }
          }
          rows.push(cells);
        }
      }
    }

    let tableMarkdown = "";
    const maxCols = Math.max(...rows.map((row) => row.length));

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const cells: string[] = [];

      for (let j = 0; j < maxCols; j++) {
        cells.push(row[j] || "");
      }

      if (i === 1 && cells.some((cell) => cell.includes(":") || cell === "-")) {
        // Separator row - keep alignment markers
        tableMarkdown += `| ${cells.join(" | ")} |\n`;
      } else {
        // Regular row
        tableMarkdown += `| ${cells.join(" | ")} |\n`;
      }
    }

    return processUnsupportedTags(tableMarkdown, unsupportedTagsStrategy);
  };

const handleInlineCode = (
  node: InlineCode,
  _parent: Parents | undefined,
  state: State
): string => {
  const exit = state.enter("paragraph");
  const value = escapeCode(node.value);
  exit();
  return `\`${value}\``;
};

const handleCode = (
  node: Code,
  _parent: Parents | undefined,
  state: State
): string => {
  const exit = state.enter("codeFenced");

  // Remove language prefix for deprecated markdown formatters
  const content = node.value.replace(/^#![a-z]+\n/, "");
  const escapedContent = escapeCode(content);
  exit();

  return ["\n", `\`\`\`${node.lang}`, escapedContent, "```", "\n"].join("");
};

const handleLink = (
  node: Link,
  _parent: Parents | undefined,
  state: State,
  _info: Info
): string => {
  const exit = state.enter("link");
  const text =
    renderChildren(node, state, { ..._info, before: "[", after: "]" }) ||
    (node.title ? escapeText(node.title) : "");
  const isUrlEncoded = decodeURI(node.url) !== node.url;
  const url = isUrlEncoded ? node.url : encodeURI(node.url);
  exit();

  if (!isUrl(url)) return text || escapeText(url);

  return text
    ? `[${text}](${escapeLink(url)})`
    : `[${escapeText(url)}](${escapeLink(url)})`;
};

const getHandleLinkReference =
  (definitions: LinkReferences) =>
  (
    node: LinkReference,
    _parent: Parents | undefined,
    state: State,
    _info: Info
  ): string => {
    const exit = state.enter("linkReference");
    const definition = definitions[node.identifier];
    const text =
      renderChildren(node, state, { ..._info, before: "[", after: "]" }) ||
      (definition ? definition.title : null);
    exit();

    if (!definition || !isUrl(definition.url)) {
      return escapeText(text);
    }

    return text
      ? `[${text}](${escapeLink(definition.url)})`
      : `[${escapeText(definition.url)}](${escapeLink(definition.url)})`;
  };

const handleImage = (
  node: Image,
  _parent: Parents | undefined,
  state: State
): string => {
  const exit = state.enter("image");
  const text = node.alt || node.title;
  const url = node.url;
  exit();

  if (!isUrl(url)) {
    return escapeText(text) || escapeText(url);
  }

  return text
    ? `[${escapeText(text)}](${escapeLink(url)})`
    : `[${escapeText(url)}](${escapeLink(url)})`;
};

const getHandleImageReference =
  (references: LinkReferences) =>
  (
    node: ImageReference,
    _parent: Parents | undefined,
    state: State
  ): string => {
    const exit = state.enter("imageReference");
    const definition = references[node.identifier];
    const text = node.alt || (definition ? definition.title : null);
    exit();

    if (!definition || !isUrl(definition.url)) return escapeText(text);

    return text
      ? `[${escapeText(text)}](${escapeLink(definition.url)})`
      : `[${escapeText(definition.url)}](${escapeLink(definition.url)})`;
  };
