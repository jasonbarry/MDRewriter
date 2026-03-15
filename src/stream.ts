import { decodeHTML } from "entities";
import { Parser as HtmlParser } from "htmlparser2";
import {
  BLOCK_LEVEL_TAGS,
  BLOCK_WHEN_TOPLEVEL,
  CONVERTED_TAGS,
  INLINE_CONTEXT_TAGS,
  TYPE1_TAGS,
  VOID_ELEMENTS,
  WHITESPACE_SUPPRESS_TAGS,
} from "./constants";
import { escapeText, reconstructTag } from "./escape";
import {
  buildMatchContext,
  type MatchContext,
  matchSelector,
} from "./selector";
import type {
  DocumentHandler,
  HandlerRegistration,
  MarkdownStream,
  MDComment,
  MDElement,
  MDEndTag,
  MDText,
  StackFrame,
} from "./types";

// ---------------------------------------------------------------------------
// Core converter
// ---------------------------------------------------------------------------

export function htmlToMarkdown(
  html: string,
  handlers?: HandlerRegistration[],
  documentHandlers?: DocumentHandler[],
): string {
  const chunks: string[] = [];
  const stream = createMarkdownStream(
    (chunk) => chunks.push(chunk),
    handlers,
    documentHandlers,
  );
  stream.write(html);
  stream.end();
  return chunks.join("");
}

export function createMarkdownStream(
  onChunk: (md: string) => void,
  handlers?: HandlerRegistration[],
  documentHandlers?: DocumentHandler[],
): MarkdownStream {
  const stack: StackFrame[] = [];
  const matchStack: MatchContext[] = [];
  const hasHandlers = handlers != null && handlers.length > 0;

  // Collect all comment handlers from registrations (fire for ALL comments)
  const streamCommentHandlers: Array<
    (comment: MDComment) => void | Promise<void>
  > = [];
  if (hasHandlers) {
    for (const reg of handlers as HandlerRegistration[]) {
      if (reg.handler.comments)
        streamCommentHandlers.push(reg.handler.comments);
    }
  }

  const hasDocHandlers =
    documentHandlers != null && documentHandlers.length > 0;

  // Virtual root context for sibling/child tracking at top level
  const virtualRoot: MatchContext = {
    tag: "",
    attrs: {},
    classes: new Set(),
    id: null,
    childIndex: 0,
    tagIndex: 0,
    lastChildCtx: null,
    prevChildCtxs: [],
  };
  // Track child counts per parent MatchContext: { count, tagCounts }
  const childTrackers = new Map<
    MatchContext,
    { count: number; tagCounts: Map<string, number> }
  >();
  // Push virtualRoot into matchStack so sibling combinators can see it as a parent
  if (hasHandlers) matchStack.push(virtualRoot);

  // --- O(1) tracking structures ---
  let removedDepth = 0;
  let innerOverrideDepth = 0;
  const collectors: StackFrame[] = [];
  const tagCounts = new Map<string, number>();
  let currentLiFrame: StackFrame | null = null;
  let currentTableFrame: StackFrame | null = null;
  let cachedPrefix = "";
  let pendingWS = "";

  function pushFrame(f: StackFrame) {
    stack.push(f);
    if (f.matchCtx) matchStack.push(f.matchCtx);
    if (f.removed) removedDepth++;
    if (f.innerContentOverride !== null) innerOverrideDepth++;
    if (f.collecting) collectors.push(f);
    tagCounts.set(f.tag, (tagCounts.get(f.tag) || 0) + 1);
    if (f.tag === "li") currentLiFrame = f;
    if (f.tag === "table") currentTableFrame = f;

    // Update cachedPrefix
    let addition = "";
    if (f.tag === "blockquote") {
      if (f.attrs._bqMode !== "raw" && f.attrs._bqMode !== "pending")
        addition = "> ";
    } else if (f.tag === "ul") addition = "  ";
    else if (f.tag === "ol") addition = " ".repeat(f.olIndent);
    f.prefixLen = addition.length;
    cachedPrefix += addition;
  }

  function popFrame(): StackFrame | undefined {
    const f = stack.pop();
    if (!f) return undefined;
    if (f.matchCtx) matchStack.pop();
    if (f.removed) removedDepth--;
    if (f.innerContentOverride !== null) innerOverrideDepth--;
    if (f.collecting) collectors.pop();
    const c = (tagCounts.get(f.tag) ?? 1) - 1;
    if (c === 0) tagCounts.delete(f.tag);
    else tagCounts.set(f.tag, c);
    if (f.tag === "li") currentLiFrame = findFrame("li") ?? null;
    if (f.tag === "table") currentTableFrame = findFrame("table") ?? null;

    // Restore cachedPrefix
    if (f.prefixLen > 0) {
      cachedPrefix = cachedPrefix.slice(0, -f.prefixLen);
    }

    return f;
  }

  function isRemoved(): boolean {
    return removedDepth > 0;
  }

  function collectingFrame(): StackFrame | undefined {
    return collectors.length > 0
      ? collectors[collectors.length - 1]
      : undefined;
  }

  function isInsideTag(tag: string): boolean {
    return tagCounts.has(tag);
  }

  function findFrame(tag: string): StackFrame | undefined {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].tag === tag) return stack[i];
    }
    return undefined;
  }

  function createMDElement(frame: StackFrame): MDElement {
    return {
      get tagName() {
        return frame.tag;
      },
      get attributes() {
        return frame.attrs;
      },
      get removed() {
        return frame.removed;
      },
      set removed(v: boolean) {
        frame.removed = v;
      },
      getAttribute(name: string) {
        return frame.attrs[name] ?? null;
      },
      hasAttribute(name: string) {
        return name in frame.attrs;
      },
      get namespaceURI() {
        return "http://www.w3.org/1999/xhtml";
      },
      setAttribute(name: string, value: string) {
        frame.attrs[name] = value;
        return this;
      },
      removeAttribute(name: string) {
        delete frame.attrs[name];
        return this;
      },
      remove() {
        frame.removed = true;
        return this;
      },
      removeAndKeepContent() {
        frame.unwrapped = true;
        return this;
      },
      prepend(content: string) {
        frame.prependContent += content;
        return this;
      },
      append(content: string) {
        frame.appendContent += content;
        return this;
      },
      setInnerContent(content: string) {
        frame.innerContentOverride = content;
        return this;
      },
      get prefix() {
        return frame.hPrefix;
      },
      set prefix(v: string) {
        frame.hPrefix = v;
      },
      get suffix() {
        return frame.hSuffix;
      },
      set suffix(v: string) {
        frame.hSuffix = v;
      },
      setLanguage(lang: string) {
        frame.langOverride = lang;
      },
      before(content: string) {
        frame.beforeContent += content;
        return this;
      },
      after(content: string) {
        frame.afterContent += content;
        return this;
      },
      replace(content: string) {
        frame.replaced = content;
        return this;
      },
      onEndTag(handler: (tag: MDEndTag) => void | Promise<void>) {
        frame.endTagHandlers.push(handler);
      },
    };
  }

  let inPre = false;
  let outputLen = 0;
  let tail = ""; // last ≤16 chars of output, for lookback
  let hasEmitted = false;
  let afterBr = false;
  let lastTopListType = ""; // "ul" or "ol" — for consecutive list separation
  let ulBullet = "-";
  let olDelimiter = ".";
  let rawHtmlDepth = 0;

  // Sliding raw buffer for source extraction
  let rawBuffer = "";
  let bufferOffset = 0;
  let lastEventEnd = -1;
  let rawBlockContinuation: false | "sameline" | "blankline" | "until-pi-end" =
    false;
  let afterHeadingInLi = false;

  function emit(text: string) {
    if (text === "") return;
    outputLen += text.length;
    // Keep last 16 chars for lookback (trailingNewlines, endsWith, slice)
    const combined = tail + text;
    tail = combined.length > 16 ? combined.slice(-16) : combined;
    hasEmitted = true;
    onChunk(text);
  }

  function trailingNewlines(): number {
    let count = 0;
    for (let i = tail.length - 1; i >= 0; i--) {
      if (tail[i] === "\n") count++;
      else break;
    }
    return count;
  }

  function ensureNewline() {
    if (!hasEmitted || trailingNewlines() >= 1) return;
    emit("\n");
  }

  function ensureBlankLine() {
    if (!hasEmitted) return;
    const tn = trailingNewlines();
    if (tn >= 2) return;
    if (tn === 0) emit("\n");
    const prefix = buildPrefix();
    if (prefix) {
      emit(`${prefix}\n`);
    } else {
      emit("\n");
    }
  }

  /**
   * Flush whitespace-only text that was buffered across chunk boundaries.
   * htmlparser2 splits text nodes at write() boundaries, so consecutive
   * whitespace chars may arrive as separate ontext callbacks.  We merge
   * them here so the \n{2,} collapse regex and WHITESPACE_SUPPRESS_TAGS
   * check can operate on the complete whitespace run.
   */
  function flushPendingWS() {
    if (!pendingWS) return;
    let text = pendingWS;
    pendingWS = "";

    // Suppress inter-element whitespace (contains newlines) between
    // block children of list/table/blockquote containers.  Plain spaces
    // without newlines are inline and must be preserved.
    const parent = stack[stack.length - 1];
    if (
      parent &&
      WHITESPACE_SUPPRESS_TAGS.has(parent.tag) &&
      text.includes("\n")
    ) {
      return;
    }

    // Collapse multiple newlines to single
    text = text.replace(/\n{2,}/g, "\n");

    // Escape text for CommonMark
    let processed = escapeText(text);

    // Add container prefix after internal newlines
    const prefix = buildPrefix();
    if (prefix && processed.includes("\n")) {
      const trailingMatch = processed.match(/(\n+)$/);
      if (trailingMatch) {
        const body = processed.slice(0, -trailingMatch[0].length);
        processed = body.replace(/\n/g, `\n${prefix}`) + trailingMatch[0];
      } else {
        processed = processed.replace(/\n/g, `\n${prefix}`);
      }
    }

    emit(processed);
  }

  /** Interleaved continuation prefix: blockquote markers + list indents */
  function buildPrefix(): string {
    // Use cachedPrefix but recompute for blockquotes whose mode may have changed
    // For correctness on the bqMode transition, do a full scan
    let prefix = "";
    for (const f of stack) {
      if (f.tag === "blockquote") {
        if (f.attrs._bqMode !== "raw") prefix += "> ";
      } else if (f.tag === "ul") prefix += "  ";
      else if (f.tag === "ol") prefix += " ".repeat(f.olIndent);
    }
    return prefix;
  }

  /** Prefix for bullet/number lines: excludes innermost list indent */
  function buildBulletPrefix(): string {
    let prefix = "";
    let lastListIdx = -1;
    for (let i = 0; i < stack.length; i++) {
      if (stack[i].tag === "ul" || stack[i].tag === "ol") lastListIdx = i;
    }
    for (let i = 0; i < stack.length; i++) {
      const f = stack[i];
      if (f.tag === "blockquote") {
        if (f.attrs._bqMode !== "raw") prefix += "> ";
      } else if ((f.tag === "ul" || f.tag === "ol") && i !== lastListIdx) {
        prefix += f.tag === "ul" ? "  " : " ".repeat(f.olIndent);
      }
    }
    return prefix;
  }

  function isInInlineContext(): boolean {
    if (collectors.length > 0) return true;
    for (const tag of INLINE_CONTEXT_TAGS) {
      if (tagCounts.has(tag)) return true;
    }
    return false;
  }

  function emitOrCollect(text: string) {
    const cf = collectingFrame();
    if (cf) cf.textBuf += text;
    else emit(text);
  }

  function getListIndex(): number {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].tag === "ol") return stack[i].listIndex;
    }
    return 1;
  }

  function incListIndex(): void {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].tag === "ol") {
        stack[i].listIndex++;
        return;
      }
    }
  }

  // --- Raw buffer helpers ---

  function getRawSlice(start: number, end: number): string {
    return rawBuffer.slice(start - bufferOffset, end - bufferOffset + 1);
  }

  function emitRaw(content: string): void {
    const prefix = buildPrefix();
    if (!prefix) {
      emit(content);
      return;
    }
    // Add prefix at start of line if output ends with newline or is at start
    let out = content;
    if (
      (trailingNewlines() >= 1 || !hasEmitted) &&
      out.length > 0 &&
      out[0] !== "\n"
    ) {
      out = prefix + out;
    }
    out = out.replace(/\n(?=[^\n])/g, `\n${prefix}`);
    emit(out);
  }

  // --- Pending blockquote helpers ---

  /** Find a pending blockquote that is the immediate parent on the stack. */
  function findPendingBlockquote(): StackFrame | undefined {
    if (stack.length === 0) return undefined;
    const top = stack[stack.length - 1];
    if (top.tag === "blockquote" && top.attrs._bqMode === "pending") return top;
    return undefined;
  }

  /** Resolve pending blockquote to markdown `> ` mode. */
  function resolveBqToMarkdown(bq: StackFrame): void {
    bq.attrs._bqMode = "markdown";
    // Update cachedPrefix for this blockquote frame (was 0 when pending)
    bq.prefixLen = 2; // "> "
    cachedPrefix += "> ";
    const liFrame = currentLiFrame;
    if (liFrame) {
      liFrame.childBlocks++;
      if (liFrame.childBlocks > 1) {
        ensureBlankLine();
      }
    } else {
      ensureBlankLine();
    }
  }

  /** Resolve pending blockquote to raw HTML mode. */
  function resolveBqToRawHtml(bq: StackFrame, currentStartIdx: number): void {
    bq.attrs._bqMode = "raw";
    ensureBlankLine();
    emitRaw(bq.attrs._rawOpen || "");
    const bqIdx = stack.indexOf(bq);
    rawHtmlDepth = stack.length - bqIdx;
    // Emit gap content between <blockquote> and current position
    const savedEndIdx = parseInt(bq.attrs._rawEndIdx || "0", 10);
    const gapStart = savedEndIdx + 1;
    const gapEnd = currentStartIdx - 1;
    if (gapEnd >= gapStart) {
      const gap = getRawSlice(gapStart, gapEnd);
      if (gap) emitRaw(gap);
    }
  }

  function flushGap(eventStartIndex: number): void {
    const gapStart = lastEventEnd < 0 ? 0 : lastEventEnd + 1;
    const gapEnd = eventStartIndex - 1;
    if (gapEnd < gapStart) return;
    const gap = getRawSlice(gapStart, gapEnd);
    if (gap === "") return;

    // Track the consumed range so implied-close handlers (which skip
    // lastEventEnd = parser.endIndex) don't re-emit gap content.
    lastEventEnd = gapEnd;

    if (rawHtmlDepth > 0 || rawBlockContinuation) {
      emitRaw(gap);
      return;
    }

    if (isInInlineContext()) {
      emitOrCollect(gap);
    } else if (!/^\s+$/.test(gap)) {
      if (hasEmitted) ensureBlankLine();
      emitRaw(gap);
      rawBlockContinuation = "blankline";
    }
  }

  // --- Shared preamble for comment/PI handlers ---

  function handleRawBlock(
    rawContent: string,
    continuationMode: false | "sameline" | "blankline" | "until-pi-end",
  ): void {
    if (isInInlineContext()) {
      emitOrCollect(rawContent);
    } else {
      ensureBlankLine();
      emitRaw(rawContent);
      rawBlockContinuation = continuationMode;
    }
  }

  function checkRawBlockContinuation(): boolean {
    if (rawBlockContinuation) {
      const shouldEnd =
        rawBlockContinuation === "sameline"
          ? trailingNewlines() >= 1
          : trailingNewlines() >= 2;
      if (!shouldEnd) return true; // still continuing
      rawBlockContinuation = false;
    }
    return false;
  }

  function emitInlineClose(
    name: string,
    frame: StackFrame,
    marker: string,
    isImplied: boolean,
  ) {
    if (isImplied) {
      emitOrCollect(reconstructTag(name, frame.attrs) + frame.textBuf);
    } else {
      emitOrCollect(`${marker}${frame.textBuf}${marker}`);
    }
  }

  function makeFrame(
    name: string,
    attribs: Record<string, string>,
  ): StackFrame {
    return {
      tag: name,
      attrs: attribs,
      removed: false,
      textBuf: "",
      collecting: false,
      listIndex: 1,
      childBlocks: 0,
      hasParagraph: false,
      inListItem: false,
      outputLen: outputLen,
      olIndent: 3,
      lastItemLoose: false,
      unwrapped: false,
      replaced: null,
      hPrefix: "",
      hSuffix: "",
      beforeContent: "",
      afterContent: "",
      langOverride: null,
      prependContent: "",
      appendContent: "",
      innerContentOverride: null,
      endTagHandlers: [],
      textHandlers: [],
      commentHandlers: [],
      matchCtx: null,
      tableAlignments: [],
      tableHeaderDone: false,
      tableCellIndex: 0,
      prefixLen: 0,
    };
  }

  // --- Parser ---

  const parser = new HtmlParser(
    {
      onopentag(name: string, attribs: Record<string, string>) {
        flushGap(parser.startIndex);
        flushPendingWS();

        const frame = makeFrame(name, attribs);

        // Build match context for selector matching
        if (hasHandlers) {
          frame.matchCtx = buildMatchContext(name, attribs);
        }

        // Ancestor removed? Skip everything
        if (hasHandlers && isRemoved()) {
          pushFrame(frame);
          lastEventEnd = parser.endIndex;
          return;
        }

        // Ancestor has setInnerContent? Treat children as removed
        if (innerOverrideDepth > 0) {
          frame.removed = true;
          pushFrame(frame);
          lastEventEnd = parser.endIndex;
          return;
        }

        // Raw block continuation: tag without preceding line break
        if (rawBlockContinuation) {
          const shouldEnd =
            rawBlockContinuation === "sameline"
              ? trailingNewlines() >= 1
              : trailingNewlines() >= 2;
          if (shouldEnd) {
            rawBlockContinuation = false;
          } else {
            emitRaw(getRawSlice(parser.startIndex, parser.endIndex));
            if (!VOID_ELEMENTS.has(name)) rawHtmlDepth = 1;
            pushFrame(frame);
            lastEventEnd = parser.endIndex;
            return;
          }
        }

        // Resolve pending blockquote: block-level child → markdown,
        // inline/unknown child → raw HTML (bare text in blockquote)
        {
          const pbq = findPendingBlockquote();
          if (pbq) {
            if (BLOCK_LEVEL_TAGS.has(name)) {
              resolveBqToMarkdown(pbq);
            } else {
              resolveBqToRawHtml(pbq, parser.startIndex);
              // Emit current tag as raw HTML (rawHtmlDepth is now > 0)
              emitRaw(getRawSlice(parser.startIndex, parser.endIndex));
              if (!VOID_ELEMENTS.has(name)) rawHtmlDepth++;
              pushFrame(frame);
              lastEventEnd = parser.endIndex;
              return;
            }
          }
        }

        // Raw HTML passthrough for non-converted tags
        if (rawHtmlDepth > 0) {
          const rawTag = getRawSlice(parser.startIndex, parser.endIndex);
          // htmlparser2 reinterprets orphaned </p> as <p></p> (OPEN+CLOSE).
          // Detect this: if raw source starts with "</" it's actually a close tag.
          // Emit once and mark frame to skip the subsequent CLOSE event.
          if (rawTag.startsWith("</")) {
            emitRaw(rawTag);
            frame.attrs._skipClose = "1";
            pushFrame(frame);
            lastEventEnd = parser.endIndex;
            return;
          }
          emitRaw(rawTag);
          if (!VOID_ELEMENTS.has(name)) rawHtmlDepth++;
          pushFrame(frame);
          lastEventEnd = parser.endIndex;
          return;
        }

        // --- Handler matching ---
        if (hasHandlers && !rawBlockContinuation && rawHtmlDepth === 0) {
          // Update child/sibling tracking for pseudo-classes and combinators
          const parentCtx =
            matchStack.length > 0
              ? matchStack[matchStack.length - 1]
              : virtualRoot;
          let tracker = childTrackers.get(parentCtx);
          if (!tracker) {
            tracker = { count: 0, tagCounts: new Map() };
            childTrackers.set(parentCtx, tracker);
          }
          tracker.count++;
          const tagCount = (tracker.tagCounts.get(name) || 0) + 1;
          tracker.tagCounts.set(name, tagCount);
          // biome-ignore lint/style/noNonNullAssertion: matchCtx is always set when hasHandlers is true
          frame.matchCtx!.childIndex = tracker.count;
          // biome-ignore lint/style/noNonNullAssertion: matchCtx is always set when hasHandlers is true
          frame.matchCtx!.tagIndex = tagCount;

          // Temporarily push matchCtx for matching
          // biome-ignore lint/style/noNonNullAssertion: matchCtx is always set when hasHandlers is true
          matchStack.push(frame.matchCtx!);
          for (const reg of handlers as HandlerRegistration[]) {
            if (matchSelector(reg.selector, matchStack)) {
              const el = createMDElement(frame);
              if (reg.handler.element) reg.handler.element(el);
              if (reg.handler.text) frame.textHandlers.push(reg.handler.text);
              if (reg.handler.comments)
                frame.commentHandlers.push(reg.handler.comments);
            }
          }
          matchStack.pop(); // will be re-pushed by pushFrame

          // Update sibling tracking on parent for + and ~ combinators
          if (parentCtx.lastChildCtx) {
            parentCtx.prevChildCtxs.push(parentCtx.lastChildCtx);
          }
          // biome-ignore lint/style/noNonNullAssertion: matchCtx is always set when hasHandlers is true
          parentCtx.lastChildCtx = frame.matchCtx!;

          // Post-handler: removed
          if (frame.removed) {
            pushFrame(frame);
            lastEventEnd = parser.endIndex;
            return;
          }

          // Post-handler: replaced
          if (frame.replaced != null) {
            emit(frame.beforeContent + frame.replaced);
            frame.removed = true;
            pushFrame(frame);
            lastEventEnd = parser.endIndex;
            return;
          }

          // Non-converted tag with handler → auto-unwrap
          if (
            !CONVERTED_TAGS.has(name) &&
            (frame.unwrapped ||
              frame.hPrefix ||
              frame.hSuffix ||
              frame.beforeContent ||
              frame.afterContent ||
              frame.textHandlers.length > 0)
          ) {
            frame.unwrapped = true;
          }
        }

        // Inline context detection
        const inInline = isInInlineContext();

        if (!CONVERTED_TAGS.has(name) && !frame.unwrapped) {
          if (inInline) {
            emitOrCollect(getRawSlice(parser.startIndex, parser.endIndex));
            pushFrame(frame);
            lastEventEnd = parser.endIndex;
            return;
          }
          if (hasHandlers) {
            // Auto-unwrap non-converted block tags when handlers are
            // registered so descendant selectors can match children.
            frame.unwrapped = true;
          } else {
            // Block level → raw HTML block
            ensureBlankLine();
            emitRaw(getRawSlice(parser.startIndex, parser.endIndex));
            if (!VOID_ELEMENTS.has(name)) rawHtmlDepth = 1;
            pushFrame(frame);
            lastEventEnd = parser.endIndex;
            return;
          }
        }

        // Typically-inline converted tags at block level → raw HTML block
        // When handlers are registered, skip this: the caller is converting a
        // webpage, not roundtripping markdown, so convert these tags normally.
        if (
          !hasHandlers &&
          !inInline &&
          !frame.unwrapped &&
          BLOCK_WHEN_TOPLEVEL.has(name)
        ) {
          ensureBlankLine();
          emitRaw(getRawSlice(parser.startIndex, parser.endIndex));
          if (!VOID_ELEMENTS.has(name)) rawHtmlDepth = 1;
          pushFrame(frame);
          lastEventEnd = parser.endIndex;
          return;
        }

        // Emit beforeContent
        if (frame.beforeContent) emit(frame.beforeContent);

        // Emit handler prefix
        if (frame.hPrefix) emitOrCollect(frame.hPrefix);

        // Skip switch for unwrapped non-converted tags
        if (frame.unwrapped && !CONVERTED_TAGS.has(name)) {
          pushFrame(frame);
          lastEventEnd = parser.endIndex;
          return;
        }

        switch (name) {
          case "h1":
          case "h2":
          case "h3":
          case "h4":
          case "h5":
          case "h6": {
            const liFrame = currentLiFrame;
            if (liFrame) {
              liFrame.childBlocks++;
              if (liFrame.childBlocks > 1) {
                ensureBlankLine();
                emit(buildPrefix());
              }
            } else {
              ensureBlankLine();
            }
            frame.collecting = true;
            break;
          }

          case "p": {
            const liFrame = currentLiFrame;
            if (liFrame) {
              frame.inListItem = true;
              // Check if <p> is a direct child of <li>
              let directChild = true;
              for (let si = stack.length - 1; si >= 0; si--) {
                if (stack[si].tag === "li") break;
                if (
                  stack[si].tag === "blockquote" ||
                  stack[si].tag === "ul" ||
                  stack[si].tag === "ol"
                ) {
                  directChild = false;
                  break;
                }
              }
              if (directChild) {
                // Add blank line BEFORE <p> when there's a previous direct-child block
                if (liFrame.childBlocks > 0) {
                  ensureBlankLine();
                  emit(buildPrefix());
                }
                liFrame.childBlocks++;
                liFrame.hasParagraph = true;
              } else {
                // <p> nested inside blockquote/sub-list — normal paragraph spacing
                ensureBlankLine();
                const bp = buildPrefix();
                if (bp) emit(bp);
              }
            } else {
              ensureBlankLine();
              const bp = buildPrefix();
              if (bp) emit(bp);
            }
            break;
          }

          case "blockquote": {
            // Defer ensureBlankLine — don't know yet if children are
            // wrapped in <p> (→ markdown mode) or bare text (→ raw HTML).
            frame.attrs._rawOpen = getRawSlice(
              parser.startIndex,
              parser.endIndex,
            );
            frame.attrs._rawEndIdx = String(parser.endIndex);
            frame.attrs._bqMode = "pending";
            break;
          }

          case "pre": {
            // <pre> with non-standard attributes → raw HTML block
            const attrKeys = Object.keys(attribs).filter((k) => k !== "class");
            if (attrKeys.length > 0) {
              ensureBlankLine();
              emit(getRawSlice(parser.startIndex, parser.endIndex));
              rawHtmlDepth = 1;
              pushFrame(frame);
              lastEventEnd = parser.endIndex;
              return;
            }

            inPre = true;
            const liFrame = currentLiFrame;
            if (liFrame) {
              // Only add blank line if the list item is loose (has <p> children)
              if (liFrame.hasParagraph && liFrame.childBlocks > 0) {
                ensureBlankLine();
              }
              liFrame.childBlocks++;
            } else {
              ensureBlankLine();
            }
            // Note: actual ``` emission happens in <code> handler
            break;
          }

          case "code": {
            if (inPre) {
              // Collect code block content to check for backtick fences
              frame.collecting = true;
              frame.attrs._isPreCode = "1";
              const cls = attribs.class || "";
              const langMatch = cls.match(/language-(\S+)/);
              if (langMatch) frame.attrs._lang = langMatch[1];
            } else {
              // For inline code, collect content to check for backticks
              frame.collecting = true;
            }
            break;
          }

          case "strong":
          case "b":
            frame.collecting = true;
            break;
          case "em":
          case "i": {
            // Alternate markers for nested emphasis to avoid ** ambiguity
            const marker = isInsideTag("em") || isInsideTag("i") ? "_" : "*";
            frame.attrs._emMarker = marker;
            frame.collecting = true;
            break;
          }

          case "del":
          case "s":
            frame.collecting = true;
            break;

          case "a":
            if (attribs.href !== undefined) {
              frame.collecting = true;
            } else {
              // <a> without href — emit as raw inline HTML
              emitOrCollect(getRawSlice(parser.startIndex, parser.endIndex));
            }
            break;

          case "img": {
            // If no alt attribute in source, emit as raw HTML to avoid
            // CommonMark adding alt="" which changes the output
            if (!("alt" in attribs)) {
              emitOrCollect(getRawSlice(parser.startIndex, parser.endIndex));
              break;
            }
            // Escape [ and ] in alt text to avoid nested link/image parsing
            const alt = attribs.alt.replace(/\[/g, "\\[").replace(/\]/g, "\\]");
            const src = attribs.src || "";
            const title = attribs.title;
            emitOrCollect(
              title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`,
            );
            break;
          }

          case "ul":
          case "ol": {
            if (isInsideTag("li")) {
              const liFrame = currentLiFrame;
              if (liFrame) {
                // Add blank line before sub-list when parent <li> has <p> children
                // This makes the preceding paragraph content loose
                if (liFrame.hasParagraph && liFrame.childBlocks > 0) {
                  ensureBlankLine();
                }
                liFrame.childBlocks++;
              }
              ensureNewline();
            } else {
              // Alternate bullets/delimiters for consecutive same-type lists
              if (lastTopListType === name) {
                if (name === "ul") ulBullet = ulBullet === "-" ? "*" : "-";
                else olDelimiter = olDelimiter === "." ? ")" : ".";
              }
              lastTopListType = name;
              ensureBlankLine();
            }
            frame.listIndex = attribs.start ? parseInt(attribs.start, 10) : 1;
            // Compute continuation indent based on first marker width
            if (name === "ol") {
              frame.olIndent = String(frame.listIndex).length + 2; // "N. " or "N) "
            }
            break;
          }

          case "li": {
            // Add blank line between items when previous item was loose
            const parentList = stack[stack.length - 1];
            if (parentList?.lastItemLoose) {
              ensureBlankLine();
            }
            const bp = buildBulletPrefix();
            if (parentList && parentList.tag === "ol") {
              const idx = getListIndex();
              emit(`${bp}${idx}${olDelimiter} `);
              incListIndex();
            } else {
              emit(`${bp + ulBullet} `);
            }
            break;
          }

          case "hr": {
            if (isInsideTag("li")) {
              // Use * * * inside lists to avoid ambiguity with - markers
              const s2 = tail.slice(-2);
              const onEmptyBullet =
                s2 === "- " ||
                s2 === "* " ||
                s2 === "+ " ||
                /\d[.)] $/.test(tail.slice(-4));
              if (onEmptyBullet) {
                emit("* * *\n");
              } else {
                ensureBlankLine();
                emit(`${buildPrefix()}* * *\n`);
              }
            } else {
              ensureBlankLine();
              emit(`${buildPrefix()}---\n`);
            }
            break;
          }

          case "br": {
            if (inPre) {
              emit("\n");
            } else {
              emitOrCollect("  \n");
              afterBr = true;
            }
            break;
          }

          case "table":
            // Defer ensureBlankLine — we don't know yet if this is GFM or raw HTML.
            // Save raw tag for potential raw HTML fallback.
            frame.attrs._rawOpen = getRawSlice(
              parser.startIndex,
              parser.endIndex,
            );
            frame.attrs._rawEndIdx = String(parser.endIndex);
            break;

          case "thead": {
            const tableFrame = currentTableFrame;
            if (tableFrame && !tableFrame.attrs._tableGfm) {
              tableFrame.attrs._tableGfm = "1";
              ensureBlankLine();
            }
            break;
          }

          case "tbody":
            break;

          case "tr": {
            const tableFrame = currentTableFrame;
            if (
              tableFrame &&
              !tableFrame.attrs._tableGfm &&
              !tableFrame.attrs._tableRaw
            ) {
              // No <thead> seen → raw HTML table
              tableFrame.attrs._tableRaw = "1";
              ensureBlankLine();
              emitRaw(tableFrame.attrs._rawOpen || "");
              // Count open table-structure frames for rawHtmlDepth
              const tableIdx = stack.indexOf(tableFrame);
              rawHtmlDepth = stack.length - tableIdx;
              // Emit gap content between <table> and <tr> (includes
              // intermediate tags like <tbody>)
              const savedEndIdx = parseInt(
                tableFrame.attrs._rawEndIdx || "0",
                10,
              );
              const gapStart = savedEndIdx + 1;
              const gapEnd = parser.startIndex - 1;
              if (gapEnd >= gapStart) {
                const gap = getRawSlice(gapStart, gapEnd);
                if (gap) emitRaw(gap);
              }
              // Emit <tr> as raw HTML
              emitRaw(getRawSlice(parser.startIndex, parser.endIndex));
              rawHtmlDepth++;
              break;
            }
            frame.tableCellIndex = 0;
            break;
          }

          case "th":
          case "td": {
            // Only collect in GFM mode
            const tf = currentTableFrame;
            if (tf?.attrs._tableGfm) {
              frame.collecting = true;
            }
            break;
          }

          case "input":
            if (attribs.type === "checkbox")
              emitOrCollect(attribs.checked !== undefined ? "[x] " : "[ ] ");
            break;

          default:
            break;
        }

        pushFrame(frame);
        if (frame.prependContent) emitOrCollect(frame.prependContent);
        lastEventEnd = parser.endIndex;
      },

      ontext(rawText: string) {
        flushGap(parser.startIndex);

        // Fire document-level text handlers
        if (hasDocHandlers) {
          const chunk: MDText = {
            get text() {
              return rawText;
            },
            get lastInTextNode() {
              return true;
            },
            before() {
              return chunk;
            },
            after() {
              return chunk;
            },
            replace() {
              return chunk;
            },
            remove() {
              return chunk;
            },
          };
          for (const dh of documentHandlers as DocumentHandler[]) {
            if (dh.text) dh.text(chunk);
          }
        }

        // Skip text inside removed elements
        if (hasHandlers && isRemoved()) {
          lastEventEnd = parser.endIndex;
          return;
        }

        // Skip text inside elements with setInnerContent override
        if (innerOverrideDepth > 0) {
          lastEventEnd = parser.endIndex;
          return;
        }

        let text = rawText;

        // Raw block continuation
        if (rawBlockContinuation) {
          if (rawBlockContinuation === "sameline") {
            // Continue raw until first newline
            const nlIdx = text.indexOf("\n");
            if (nlIdx === -1) {
              emitRaw(text);
              lastEventEnd = parser.endIndex;
              return;
            }
            emitRaw(text.slice(0, nlIdx + 1));
            rawBlockContinuation = false;
            text = text.slice(nlIdx + 1);
            if (text === "") {
              lastEventEnd = parser.endIndex;
              return;
            }
          } else if (rawBlockContinuation === "until-pi-end") {
            // Continue raw until ?> is found
            const piEndIdx = text.indexOf("?>");
            if (piEndIdx === -1) {
              emitRaw(text);
              lastEventEnd = parser.endIndex;
              return;
            }
            // Emit up to ?>, then switch to sameline for rest of that line
            const afterPI = piEndIdx + 2;
            const nlAfterPI = text.indexOf("\n", afterPI);
            if (nlAfterPI === -1) {
              emitRaw(text);
              rawBlockContinuation = "sameline";
              lastEventEnd = parser.endIndex;
              return;
            }
            emitRaw(text.slice(0, nlAfterPI + 1));
            rawBlockContinuation = false;
            text = text.slice(nlAfterPI + 1);
            if (text === "") {
              lastEventEnd = parser.endIndex;
              return;
            }
          } else {
            // "blankline": continue raw until blank line
            const tn = trailingNewlines();
            let blankIdx = -1;

            if (tn >= 1 && text.length > 0 && text[0] === "\n") {
              blankIdx = 0;
            } else {
              const idx = text.indexOf("\n\n");
              if (idx !== -1) blankIdx = idx + 1;
            }

            if (blankIdx === -1) {
              emitRaw(text);
              lastEventEnd = parser.endIndex;
              return;
            }

            if (blankIdx > 0) {
              emitRaw(text.slice(0, blankIdx));
            }
            rawBlockContinuation = false;
            text = text.slice(blankIdx);
            if (text === "") {
              lastEventEnd = parser.endIndex;
              return;
            }
          }
        }

        // Resolve pending blockquote: bare non-whitespace text → raw HTML
        {
          const pbq = findPendingBlockquote();
          if (pbq && /\S/.test(text)) {
            resolveBqToRawHtml(pbq, parser.startIndex);
          }
        }

        // Raw HTML passthrough
        if (rawHtmlDepth > 0) {
          emitRaw(text);
          lastEventEnd = parser.endIndex;
          return;
        }

        // After <br>, strip the leading newline from the next text node
        if (afterBr) {
          afterBr = false;
          text = text.replace(/^\n/, "");
          if (text === "") {
            lastEventEnd = parser.endIndex;
            return;
          }
        }

        // Fire text handlers from ancestor frames
        if (hasHandlers) {
          const allTextHandlers: Array<(text: MDText) => void | Promise<void>> =
            [];
          for (let si = 0; si < stack.length; si++) {
            for (const th of stack[si].textHandlers) allTextHandlers.push(th);
          }
          if (allTextHandlers.length > 0) {
            let _before = "";
            let _after = "";
            let _replacement: string | null = null;
            let _removed = false;
            const chunk: MDText = {
              get text() {
                return text;
              },
              get lastInTextNode() {
                return true;
              },
              before(c: string) {
                _before += c;
                return chunk;
              },
              after(c: string) {
                _after += c;
                return chunk;
              },
              replace(c: string) {
                _replacement = c;
                return chunk;
              },
              remove() {
                _removed = true;
                return chunk;
              },
            };
            for (const th of allTextHandlers) th(chunk);
            if (_removed) {
              lastEventEnd = parser.endIndex;
              return;
            }
            if (_replacement !== null) text = _replacement;
            if (_before) text = _before + text;
            if (_after) text = text + _after;
          }
        }

        // After heading in list item: strip leading \n and add continuation indent
        if (afterHeadingInLi) {
          afterHeadingInLi = false;
          text = text.replace(/^\n/, "");
          if (text === "") {
            lastEventEnd = parser.endIndex;
            return;
          }
          ensureNewline();
          const prefix = buildPrefix();
          if (prefix) emit(prefix);
        }

        const cf = collectingFrame();
        if (cf) {
          // No escaping for code content; inline escaping for <a>; full escaping for emphasis
          if (cf.tag === "code") cf.textBuf += text;
          else if (cf.tag === "a") cf.textBuf += escapeText(text, true);
          else cf.textBuf += escapeText(text, true);
          lastEventEnd = parser.endIndex;
          return;
        }
        if (inPre) {
          emit(text);
          lastEventEnd = parser.endIndex;
          return;
        }

        // Buffer whitespace-only text to merge across chunk boundaries.
        // htmlparser2 splits text nodes at write() boundaries, so e.g.
        // "\n\n" between </p> and <p> may arrive as two separate "\n"
        // ontext calls.  Buffering lets the \n{2,} collapse below see
        // the complete whitespace run.  The WHITESPACE_SUPPRESS_TAGS
        // check is deferred to flushPendingWS() (tag events) so that
        // inline spaces within those containers are preserved when
        // followed by more text.
        if (/^\s+$/.test(text)) {
          pendingWS += text;
          lastEventEnd = parser.endIndex;
          return;
        }

        // Prepend any buffered whitespace from split text nodes
        if (pendingWS) {
          text = pendingWS + text;
          pendingWS = "";
        }

        // Collapse multiple newlines to single (prevents blank lines = paragraph breaks)
        text = text.replace(/\n{2,}/g, "\n");

        // Escape text for CommonMark
        let processed = escapeText(text);

        // Add container prefix after internal newlines (for blockquotes, nested lists)
        // Don't add prefix after trailing newlines — block handlers manage those
        const prefix = buildPrefix();
        if (prefix && processed.includes("\n")) {
          const trailingMatch = processed.match(/(\n+)$/);
          if (trailingMatch) {
            const body = processed.slice(0, -trailingMatch[0].length);
            processed = body.replace(/\n/g, `\n${prefix}`) + trailingMatch[0];
          } else {
            processed = processed.replace(/\n/g, `\n${prefix}`);
          }
        }

        emit(processed);
        lastEventEnd = parser.endIndex;
      },

      onclosetag(name: string, isImplied: boolean) {
        // For real close tags, find actual '<' to include any preceding
        // dropped content (like </foo >) in the gap
        let effectiveStart = parser.startIndex;
        if (!isImplied && rawBuffer[effectiveStart - bufferOffset] !== "<") {
          while (
            effectiveStart <= parser.endIndex &&
            rawBuffer[effectiveStart - bufferOffset] !== "<"
          ) {
            effectiveStart++;
          }
        }
        flushGap(effectiveStart);
        flushPendingWS();

        {
          // Raw HTML passthrough
          if (rawHtmlDepth > 0) {
            const matchesStack =
              stack.length > 0 && stack[stack.length - 1].tag === name;

            // If the OPEN event was a reinterpreted close tag (</p> → <p></p>),
            // just pop without emitting or changing depth
            if (matchesStack && stack[stack.length - 1].attrs._skipClose) {
              popFrame();
              lastEventEnd = parser.endIndex;
              return;
            }

            if (isImplied) {
              // Implied close — don't emit, just adjust depth
              if (!VOID_ELEMENTS.has(name)) {
                rawHtmlDepth--;
              }
              if (matchesStack) popFrame();
            } else if (matchesStack) {
              // Matched real close tag
              rawHtmlDepth--;
              emitRaw(getRawSlice(parser.startIndex, parser.endIndex));
              popFrame();
            } else {
              // Unmatched real close tag in raw block — emit but don't change depth
              emitRaw(getRawSlice(parser.startIndex, parser.endIndex));
            }
            if (rawHtmlDepth === 0) {
              rawBlockContinuation = TYPE1_TAGS.has(name)
                ? "sameline"
                : "blankline";
            }
            if (!isImplied) lastEventEnd = parser.endIndex;
            return;
          }

          // Unmatched closing tag — emit as raw HTML
          const topFrame = stack[stack.length - 1];
          if (!topFrame || topFrame.tag !== name) {
            // Implied close of never-opened tag — no source content to emit
            if (isImplied) {
              lastEventEnd = parser.startIndex - 1;
              return;
            }
            const inInline =
              isInsideTag("p") || isInsideTag("li") || !!collectingFrame();
            if (inInline) {
              emitOrCollect(getRawSlice(parser.startIndex, parser.endIndex));
            } else if (!CONVERTED_TAGS.has(name)) {
              ensureBlankLine();
              emitRaw(getRawSlice(parser.startIndex, parser.endIndex));
              rawBlockContinuation = "blankline";
            }
            lastEventEnd = parser.endIndex;
            return;
          }

          const frame = popFrame();
          if (!frame) {
            lastEventEnd = parser.endIndex;
            return;
          }

          // Removed element: skip markdown output, emit afterContent if replaced
          if (frame.removed) {
            if (frame.appendContent) emit(frame.appendContent);
            if (frame.afterContent) emit(frame.afterContent);
            for (const h of frame.endTagHandlers) h({ name });
            lastEventEnd = parser.endIndex;
            return;
          }

          // Ancestor removed: skip everything for this child element
          if (hasHandlers && isRemoved()) {
            lastEventEnd = parser.endIndex;
            return;
          }

          // Unwrapped non-converted tag: skip switch, but still emit suffix/after/handlers
          if (frame.unwrapped && !CONVERTED_TAGS.has(name)) {
            if (frame.appendContent) emitOrCollect(frame.appendContent);
            if (frame.hSuffix) emitOrCollect(frame.hSuffix);
            if (frame.afterContent) emit(frame.afterContent);
            for (const h of frame.endTagHandlers) h({ name });
            lastEventEnd = parser.endIndex;
            return;
          }

          // Pre-switch: emit inner content override and append content
          if (frame.innerContentOverride !== null)
            emitOrCollect(frame.innerContentOverride);
          if (frame.appendContent) emitOrCollect(frame.appendContent);

          switch (name) {
            case "h1":
            case "h2":
            case "h3":
            case "h4":
            case "h5":
            case "h6": {
              const level = parseInt(name[1], 10);
              let text = frame.textBuf;
              // Replace newlines with spaces (headings must be single-line)
              text = text.replace(/\n/g, " ");
              // Escape trailing # to prevent CommonMark from stripping them
              text = text.replace(/#+\s*$/, (m) => m.replace(/#/g, "\\#"));
              const liFrame = currentLiFrame;
              const bp = !liFrame ? buildPrefix() : "";
              emit(`${bp + "#".repeat(level)} ${text}\n`);
              // Set flag for heading in list item
              if (liFrame) {
                afterHeadingInLi = true;
              }
              break;
            }

            case "p":
              ensureNewline();
              break;

            case "blockquote":
              if (frame.attrs._bqMode === "pending") {
                // Still pending at close → empty blockquote, resolve now
                resolveBqToMarkdown(frame);
              }
              if (outputLen === frame.outputLen) {
                // Empty blockquote — emit bare `>`
                emit(`${buildPrefix()}>\n`);
              } else {
                ensureNewline();
              }
              break;

            case "code": {
              if (inPre) {
                const content = decodeHTML(frame.textBuf);
                const lang = frame.langOverride || frame.attrs._lang || "";
                // Choose fence that doesn't conflict with content
                let fence = "```";
                if (content.includes("```")) {
                  if (!content.includes("~~~")) {
                    fence = "~~~";
                  } else {
                    // Find longest run of backticks or tildes and use longer
                    const backtickRuns = content.match(/`+/g) || [];
                    const maxBt = Math.max(
                      0,
                      ...backtickRuns.map((r: string) => r.length),
                    );
                    fence = "`".repeat(maxBt + 1);
                  }
                }
                const prefix = buildPrefix();
                // If we're on the same line as a bullet, don't add prefix to opening fence
                const onBulletLine =
                  isInsideTag("li") && trailingNewlines() === 0;
                // Opening fence
                if (onBulletLine) {
                  emit(`${fence + lang}\n`);
                } else {
                  emit(`${prefix + fence + lang}\n`);
                }
                // Content lines - add prefix to each line
                const lines = content.split("\n");
                for (let li = 0; li < lines.length; li++) {
                  if (li === lines.length - 1 && lines[li] === "") break;
                  emit(`${prefix + lines[li]}\n`);
                }
                // Closing fence
                emit(`${prefix + fence}\n`);
              } else {
                // Emit collected code span with appropriate backtick wrapping
                const code = decodeHTML(frame.textBuf);
                let ticks = "`";
                // If content contains backticks, use double (or more) backticks
                if (code.includes("`")) {
                  // Find the longest run of backticks in the content
                  const runs = code.match(/`+/g) || [];
                  const maxRun = Math.max(0, ...runs.map((r) => r.length));
                  ticks = "`".repeat(maxRun + 1);
                }
                // If content starts or ends with backtick or space, add spaces
                let inner = code;
                if (
                  ticks.length > 1 ||
                  code.startsWith("`") ||
                  code.endsWith("`")
                ) {
                  if (
                    code.startsWith(" ") ||
                    code.endsWith(" ") ||
                    code.startsWith("`") ||
                    code.endsWith("`")
                  ) {
                    inner = ` ${code} `;
                  }
                }
                emitOrCollect(ticks + inner + ticks);
              }
              break;
            }

            case "pre":
              inPre = false;
              break;

            case "strong":
            case "b":
              emitInlineClose(name, frame, "**", isImplied);
              break;
            case "em":
            case "i": {
              const marker = frame.attrs._emMarker || "*";
              emitInlineClose(name, frame, marker, isImplied);
              break;
            }

            case "del":
            case "s":
              emitInlineClose(name, frame, "~~", isImplied);
              break;

            case "a": {
              if (!frame.collecting) {
                // <a> without href was emitted as raw HTML; emit closing tag only if real
                if (!isImplied) emitOrCollect("</a>");
                break;
              }
              if (isImplied) {
                // Unclosed <a> — emit as raw HTML to preserve original structure
                emitOrCollect(reconstructTag("a", frame.attrs) + frame.textBuf);
                break;
              }
              let href = frame.attrs.href || "";
              const title = frame.attrs.title;
              const text = frame.textBuf;

              // If preceding char is !, emitting [text](url) would create image syntax.
              // Emit as raw HTML link instead.
              if (tail.endsWith("!")) {
                const titleAttr = title ? ` title="${title}"` : "";
                const md = `<a href="${href}"${titleAttr}>${text}</a>`;
                const pc = collectingFrame();
                if (pc) pc.textBuf += md;
                else emit(md);
                break;
              }

              // Escape parentheses in URL to avoid breaking markdown link syntax
              const needsAngleBrackets =
                href.includes(")") || href.includes(" ");
              let md: string;
              if (needsAngleBrackets) {
                href = `<${href}>`;
                md = title
                  ? `[${text}](${href} "${title}")`
                  : `[${text}](${href})`;
              } else if (title) {
                // Escape quotes in title
                const escapedTitle = title.replace(/"/g, '\\"');
                md = `[${text}](${href} "${escapedTitle}")`;
              } else {
                md = `[${text}](${href})`;
              }
              const pc = collectingFrame();
              if (pc) pc.textBuf += md;
              else emit(md);
              break;
            }

            case "ul":
            case "ol":
              break;
            case "li":
              ensureNewline();
              // Track looseness on parent list frame for next <li>
              {
                const parentList = stack[stack.length - 1];
                if (
                  parentList &&
                  (parentList.tag === "ul" || parentList.tag === "ol")
                ) {
                  parentList.lastItemLoose = frame.hasParagraph;
                }
              }
              break;

            case "th":
            case "td": {
              if (!frame.collecting) break; // raw HTML table — nothing to emit
              let text = frame.textBuf;
              // Escape unescaped pipes in cell text (they break GFM table syntax)
              text = text.replace(/(?<!\\)\|/g, "\\|");
              // Track alignment on the <table> frame if header separator not yet emitted
              const tableFrame = currentTableFrame;
              if (tableFrame && !tableFrame.tableHeaderDone) {
                const alignAttr = frame.attrs.align;
                const style = frame.attrs.style || "";
                const alignMatch = style.match(
                  /text-align:\s*(left|center|right)/,
                );
                const align = alignAttr || (alignMatch ? alignMatch[1] : null);
                tableFrame.tableAlignments.push(align);
              }
              // Increment cell count on the <tr> frame
              const trFrame = findFrame("tr");
              if (trFrame) trFrame.tableCellIndex++;
              // Emit cell: "| text "
              const prefix = buildPrefix();
              const needsPrefix = trailingNewlines() >= 1 || !hasEmitted;
              const pfx = needsPrefix ? prefix : "";
              emit(`${pfx}| ${text} `);
              break;
            }

            case "tr": {
              const tableFrame = currentTableFrame;
              if (!tableFrame?.attrs._tableGfm) break; // raw HTML table
              // Close the row: emit trailing pipe + newline
              emit("|\n");
              // If header separator not yet emitted, emit it now
              if (!tableFrame.tableHeaderDone) {
                const prefix = buildPrefix();
                emit(prefix);
                for (const align of tableFrame.tableAlignments) {
                  if (align === "center") emit("| :---: ");
                  else if (align === "right") emit("| ---: ");
                  else if (align === "left") emit("| :--- ");
                  else emit("| --- ");
                }
                emit("|\n");
                tableFrame.tableHeaderDone = true;
              }
              break;
            }

            case "thead":
            case "tbody":
              break;
            case "table":
              if (frame.attrs._tableGfm) ensureNewline();
              break;

            // Tags not in CONVERTED_TAGS that need explicit closing in inline context
            case "ins":
            case "mark":
            case "abbr":
            case "sub":
            case "sup":
            case "small":
            case "u":
            case "q":
            case "cite":
            case "dfn":
            case "kbd":
            case "samp":
            case "var":
            case "time":
            case "bdi":
            case "bdo":
            case "ruby":
            case "rt":
            case "span":
            case "div":
            case "section":
            case "nav":
            case "details":
            case "summary":
            case "figure":
            case "figcaption": {
              if (isImplied) break; // self-closing or unclosed — no close tag in source
              const inInline =
                isInsideTag("p") || isInsideTag("li") || !!collectingFrame();
              if (inInline) {
                emitOrCollect(getRawSlice(parser.startIndex, parser.endIndex));
              }
              break;
            }

            default:
              break;
          }

          // Post-switch: emit suffix, afterContent, fire endTag handlers
          if (frame.hSuffix) emitOrCollect(frame.hSuffix);
          if (frame.afterContent) emit(frame.afterContent);
          for (const h of frame.endTagHandlers) h({ name });

          // Implied close tags are synthetic — they don't consume real input
          // characters, so they must not advance lastEventEnd past the
          // triggering tag.  flushGap already tracked any gap it emitted.
          if (!isImplied) {
            lastEventEnd = parser.endIndex;
          }
        }
      },

      oncomment(_data: string) {
        flushGap(parser.startIndex);
        flushPendingWS();

        // Fire document-level comment handlers
        if (hasDocHandlers) {
          const comment: MDComment = {
            get text() {
              return _data;
            },
            removed: false,
            remove() {
              this.removed = true;
              return comment;
            },
          };
          for (const dh of documentHandlers as DocumentHandler[]) {
            if (dh.comments) dh.comments(comment);
          }
        }

        if (hasHandlers && isRemoved()) {
          lastEventEnd = parser.endIndex;
          return;
        }

        // Fire comment handlers
        if (streamCommentHandlers.length > 0) {
          let _removed = false;
          const comment: MDComment = {
            get text() {
              return _data;
            },
            get removed() {
              return _removed;
            },
            set removed(v: boolean) {
              _removed = v;
            },
            remove() {
              _removed = true;
              return comment;
            },
          };
          for (const ch of streamCommentHandlers) ch(comment);
          if (_removed) {
            lastEventEnd = parser.endIndex;
            return;
          }
        }

        if (checkRawBlockContinuation()) {
          emitRaw(getRawSlice(parser.startIndex, parser.endIndex));
          lastEventEnd = parser.endIndex;
          return;
        }

        // When handlers are registered, skip raw block mode for comments
        // so full HTML documents convert instead of passing through as raw HTML.
        if (hasHandlers) {
          lastEventEnd = parser.endIndex;
          return;
        }

        handleRawBlock(
          getRawSlice(parser.startIndex, parser.endIndex),
          "sameline",
        );
        lastEventEnd = parser.endIndex;
      },

      onprocessinginstruction(_name: string, _data: string) {
        // Fire doctype document handler
        if (hasDocHandlers && _name.toLowerCase() === "!doctype") {
          for (const dh of documentHandlers as DocumentHandler[]) {
            if (dh.doctype) dh.doctype({ name: "html" });
          }
        }

        flushGap(parser.startIndex);
        flushPendingWS();

        if (hasHandlers && isRemoved()) {
          lastEventEnd = parser.endIndex;
          return;
        }

        if (checkRawBlockContinuation()) {
          emitRaw(getRawSlice(parser.startIndex, parser.endIndex));
          lastEventEnd = parser.endIndex;
          return;
        }

        // When handlers are registered, skip raw block mode for PIs/doctypes
        // so full HTML documents convert instead of passing through as raw HTML.
        if (hasHandlers) {
          lastEventEnd = parser.endIndex;
          return;
        }

        const rawPI = getRawSlice(parser.startIndex, parser.endIndex);
        handleRawBlock(
          rawPI,
          rawPI.includes("?>") ? "sameline" : "until-pi-end",
        );
        lastEventEnd = parser.endIndex;
      },
    },
    { decodeEntities: false, recognizeSelfClosing: true },
  );

  return {
    write(html: string) {
      if (html == null) return;
      rawBuffer += html;
      parser.write(html);
      // Trim processed portion of buffer
      if (lastEventEnd >= bufferOffset) {
        const trim = lastEventEnd - bufferOffset + 1;
        rawBuffer = rawBuffer.slice(trim);
        bufferOffset = lastEventEnd + 1;
      }
    },
    end() {
      parser.end();
      flushPendingWS();
      // Flush any remaining content after last event (e.g., malformed unclosed tags)
      const totalLen = bufferOffset + rawBuffer.length;
      if (lastEventEnd < totalLen - 1) {
        const remaining = getRawSlice(
          lastEventEnd < 0 ? 0 : lastEventEnd + 1,
          totalLen - 1,
        );
        if (remaining !== "") {
          if (rawBlockContinuation) {
            emitRaw(remaining);
          } else if (isInInlineContext()) {
            emitOrCollect(remaining);
          } else {
            if (hasEmitted) ensureBlankLine();
            emitRaw(remaining);
          }
        }
      }
      if (trailingNewlines() < 1) emit("\n");
      // Fire document-level end handlers
      if (hasDocHandlers) {
        for (const dh of documentHandlers as DocumentHandler[]) {
          if (dh.end)
            dh.end({
              append(content: string) {
                emit(content);
              },
            });
        }
      }
    },
  };
}
