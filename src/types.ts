import type { MatchContext, ParsedSelector } from "./selector";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ElementHandler {
  element?(el: MDElement): void | Promise<void>;
  text?(text: MDText): void | Promise<void>;
  comments?(comment: MDComment): void | Promise<void>;
}

export interface MDEndTag {
  readonly name: string;
}

export interface MDElement {
  readonly tagName: string;
  readonly attributes: Record<string, string>;
  readonly namespaceURI: string;
  removed: boolean;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  setAttribute(name: string, value: string): MDElement;
  removeAttribute(name: string): MDElement;
  remove(): MDElement;
  removeAndKeepContent(): MDElement;
  prepend(content: string): MDElement;
  append(content: string): MDElement;
  setInnerContent(content: string): MDElement;
  prefix: string;
  suffix: string;
  setLanguage(lang: string): void;
  before(content: string): MDElement;
  after(content: string): MDElement;
  replace(content: string): MDElement;
  onEndTag(handler: (tag: MDEndTag) => void | Promise<void>): void;
}

export interface MDText {
  readonly text: string;
  readonly lastInTextNode: boolean;
  before(content: string): MDText;
  after(content: string): MDText;
  replace(content: string): MDText;
  remove(): MDText;
}

export interface MDComment {
  readonly text: string;
  removed: boolean;
  remove(): MDComment;
}

export interface DocumentHandler {
  doctype?(doctype: { readonly name: string }): void | Promise<void>;
  text?(text: MDText): void | Promise<void>;
  comments?(comment: MDComment): void | Promise<void>;
  end?(end: { append(content: string): void }): void | Promise<void>;
}

export interface HandlerRegistration {
  selector: ParsedSelector;
  handler: ElementHandler;
}

export interface MarkdownStream {
  write(html: string): void;
  end(): void;
}

// ---------------------------------------------------------------------------
// Stack frame (internal)
// ---------------------------------------------------------------------------

export interface StackFrame {
  tag: string;
  attrs: Record<string, string>;
  removed: boolean;
  textBuf: string;
  collecting: boolean;
  listIndex: number;
  childBlocks: number;
  /** Whether this <li> has <p> children (loose list item) */
  hasParagraph: boolean;
  /** For <p>: are we inside a list item? */
  inListItem: boolean;
  /** Output length at time of open (for empty element detection) */
  outputLen: number;
  /** Continuation indent width for OL (based on marker width) */
  olIndent: number;
  /** For ul/ol: whether the last <li> closed was loose */
  lastItemLoose: boolean;
  // --- Handler fields ---
  unwrapped: boolean;
  replaced: string | null;
  hPrefix: string;
  hSuffix: string;
  beforeContent: string;
  afterContent: string;
  langOverride: string | null;
  prependContent: string;
  appendContent: string;
  innerContentOverride: string | null;
  endTagHandlers: Array<(tag: MDEndTag) => void | Promise<void>>;
  textHandlers: Array<(text: MDText) => void | Promise<void>>;
  commentHandlers: Array<(comment: MDComment) => void | Promise<void>>;
  matchCtx: MatchContext | null;
  // --- Table fields ---
  tableAlignments: (string | null)[];
  tableHeaderDone: boolean;
  tableCellIndex: number;
  // --- Prefix cache ---
  prefixLen: number;
}
