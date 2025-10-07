import { Parents } from "mdast";
import { Info, State } from "mdast-util-to-markdown";
import { UnsupportedTagsStrategy } from "./handlers";

export const renderChildren = (
  node: Parents,
  state: State,
  info: Info
): string => {
  if (!node.children) return "";

  let result = "";
  for (const child of node.children) {
    result += state.handle(child, node, state, info);
  }
  return result;
};

export const wrap = (string: string, ...wrappers: string[]): string => {
  return [...wrappers, string, ...wrappers.reverse()].join("");
};

export const escapeText = (text: string) =>
  text.replace(/([\\_*\[\]()~`>#+-=|{}.!])/g, "\\$1");

export const escapeCode = (text: string) =>
  text.replace(/\\/g, "\\\\").replace(/`/g, "\\`");

export const escapeLink = (text: string) => {
  let result = text.replace(/([\\)(])/g, "\\$1");
  if (text.startsWith("tg://")) {
    result = result.replace(/([?=])/g, "\\$1");
  }

  return result;
};

export const processUnsupportedTags = (
  content: string,
  strategy: UnsupportedTagsStrategy
): string => {
  switch (strategy) {
    case "escape":
      return escapeText(content);
    case "remove":
      return "";
    case "keep":
    default:
      return content;
  }
};

export const isUrl = (text: string): boolean => {
  try {
    return Boolean(new URL(text));
  } catch {
    return false;
  }
};
