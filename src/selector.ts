// ---------------------------------------------------------------------------
// CSS selector parser & streaming matcher (HTMLRewriter-compatible subset)
// ---------------------------------------------------------------------------

export interface AttrSelector {
  name: string;
  op: "exists" | "=" | "^=" | "$=" | "*=" | "~=" | "|=";
  value?: string;
}

export interface PseudoSelector {
  name: string; // "nth-child", "first-child", "nth-of-type", "first-of-type", "not"
  arg?: string | CompoundSelector;
}

export interface CompoundSelector {
  tag?: string; // undefined = any tag
  id?: string;
  classes: string[];
  attrs: AttrSelector[];
  pseudos: PseudoSelector[];
}

export interface SelectorPart {
  compound: CompoundSelector;
  combinator: "" | ">" | " " | "+" | "~"; // "" = subject (rightmost), ">" = child, " " = descendant, "+" = adjacent sibling, "~" = general sibling
}

export type SelectorChain = SelectorPart[]; // index 0 = subject (rightmost)
export type ParsedSelector = SelectorChain[]; // comma-separated alternatives

export interface MatchContext {
  tag: string;
  attrs: Record<string, string>;
  classes: Set<string>;
  id: string | null;
  childIndex: number;
  tagIndex: number;
  lastChildCtx: MatchContext | null;
  prevChildCtxs: MatchContext[];
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export function parseSelector(input: string): ParsedSelector {
  const alternatives = splitComma(input);
  return alternatives.map(parseSingleChain);
}

function splitComma(input: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inBracket = 0;
  let inQuote: string | null = null;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuote) {
      current += ch;
      if (ch === inQuote && input[i - 1] !== "\\") inQuote = null;
    } else if (ch === '"' || ch === "'") {
      current += ch;
      inQuote = ch;
    } else if (ch === "[") {
      inBracket++;
      current += ch;
    } else if (ch === "]") {
      inBracket--;
      current += ch;
    } else if (ch === "," && inBracket === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  const trimmed = current.trim();
  if (trimmed) parts.push(trimmed);
  return parts;
}

function parseSingleChain(input: string): SelectorChain {
  const tokens = tokenizeChain(input.trim());
  // tokens alternate: compound, combinator, compound, combinator, ...
  // Build right-to-left: subject is last compound
  const chain: SelectorPart[] = [];
  let i = tokens.length - 1;
  // Last token is always a compound
  if (i < 0) return chain;
  chain.push({ compound: parseCompound(tokens[i]), combinator: "" });
  i--;
  while (i >= 0) {
    const tok = tokens[i];
    let combinator: SelectorPart["combinator"] = " ";
    if (tok === ">" || tok === "+" || tok === "~") {
      combinator = tok;
      i--;
    }
    if (i < 0) break;
    chain.push({ compound: parseCompound(tokens[i]), combinator });
    i--;
  }
  return chain;
}

function tokenizeChain(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inBracket = 0;
  let inQuote: string | null = null;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuote) {
      current += ch;
      if (ch === inQuote && input[i - 1] !== "\\") inQuote = null;
    } else if (ch === '"' || ch === "'") {
      current += ch;
      inQuote = ch;
    } else if (ch === "[") {
      inBracket++;
      current += ch;
    } else if (ch === "]") {
      inBracket--;
      current += ch;
    } else if ((ch === ">" || ch === "+" || ch === "~") && inBracket === 0) {
      if (current.trim()) tokens.push(current.trim());
      tokens.push(ch);
      current = "";
    } else if (/\s/.test(ch) && inBracket === 0) {
      if (current.trim()) tokens.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) tokens.push(current.trim());
  return tokens;
}

function parseCompound(input: string): CompoundSelector {
  const sel: CompoundSelector = { classes: [], attrs: [], pseudos: [] };
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (ch === "*") {
      // Universal selector — tag stays undefined
      i++;
    } else if (ch === "#") {
      // ID selector
      i++;
      const start = i;
      while (i < input.length && isIdentChar(input[i])) i++;
      sel.id = input.slice(start, i);
    } else if (ch === ".") {
      // Class selector
      i++;
      const start = i;
      while (i < input.length && isIdentChar(input[i])) i++;
      sel.classes.push(input.slice(start, i));
    } else if (ch === "[") {
      // Attribute selector
      i++;
      // Skip whitespace
      while (i < input.length && /\s/.test(input[i])) i++;
      const nameStart = i;
      while (
        i < input.length &&
        input[i] !== "]" &&
        input[i] !== "=" &&
        input[i] !== "^" &&
        input[i] !== "$" &&
        input[i] !== "*" &&
        input[i] !== "~" &&
        input[i] !== "|" &&
        !/\s/.test(input[i])
      )
        i++;
      const name = input.slice(nameStart, i);
      // Skip whitespace
      while (i < input.length && /\s/.test(input[i])) i++;

      if (i < input.length && input[i] === "]") {
        // [attr] — existence
        sel.attrs.push({ name, op: "exists" });
        i++; // skip ]
      } else {
        // Determine operator
        let op: AttrSelector["op"] = "=";
        if (input[i] === "^" && input[i + 1] === "=") {
          op = "^=";
          i += 2;
        } else if (input[i] === "$" && input[i + 1] === "=") {
          op = "$=";
          i += 2;
        } else if (input[i] === "*" && input[i + 1] === "=") {
          op = "*=";
          i += 2;
        } else if (input[i] === "~" && input[i + 1] === "=") {
          op = "~=";
          i += 2;
        } else if (input[i] === "|" && input[i + 1] === "=") {
          op = "|=";
          i += 2;
        } else if (input[i] === "=") {
          op = "=";
          i++;
        } else {
          i++;
        } // skip unknown operator char

        // Skip whitespace
        while (i < input.length && /\s/.test(input[i])) i++;

        // Parse value (quoted or unquoted)
        let value = "";
        if (input[i] === '"' || input[i] === "'") {
          const quote = input[i];
          i++;
          const start = i;
          while (i < input.length && input[i] !== quote) {
            if (input[i] === "\\" && i + 1 < input.length) i++; // skip escaped
            i++;
          }
          value = input.slice(start, i);
          if (i < input.length) i++; // skip closing quote
        } else {
          const start = i;
          while (i < input.length && input[i] !== "]" && !/\s/.test(input[i]))
            i++;
          value = input.slice(start, i);
        }

        // Skip to ]
        while (i < input.length && input[i] !== "]") i++;
        if (i < input.length) i++; // skip ]

        sel.attrs.push({ name, op, value });
      }
    } else if (ch === ":") {
      // Pseudo-class selector
      i++;
      const nameStart = i;
      while (i < input.length && isIdentChar(input[i])) i++;
      const pseudoName = input.slice(nameStart, i);
      const pseudo: PseudoSelector = { name: pseudoName };
      if (i < input.length && input[i] === "(") {
        i++; // skip (
        if (pseudoName === "not") {
          // Read inner compound selector until closing )
          let depth = 1;
          const argStart = i;
          while (i < input.length && depth > 0) {
            if (input[i] === "(") depth++;
            else if (input[i] === ")") depth--;
            if (depth > 0) i++;
          }
          pseudo.arg = parseCompound(input.slice(argStart, i));
          if (i < input.length) i++; // skip )
        } else {
          // Read simple argument (e.g., number for nth-child)
          const argStart = i;
          while (i < input.length && input[i] !== ")") i++;
          pseudo.arg = input.slice(argStart, i).trim();
          if (i < input.length) i++; // skip )
        }
      }
      sel.pseudos.push(pseudo);
    } else if (isIdentStartChar(ch)) {
      // Tag name
      const start = i;
      while (i < input.length && isIdentChar(input[i])) i++;
      sel.tag = input.slice(start, i).toLowerCase();
    } else {
      i++; // skip unknown
    }
  }

  return sel;
}

function isIdentStartChar(ch: string): boolean {
  return /[a-zA-Z_-]/.test(ch);
}

function isIdentChar(ch: string): boolean {
  return /[a-zA-Z0-9_-]/.test(ch);
}

// ---------------------------------------------------------------------------
// Match context builder
// ---------------------------------------------------------------------------

export function buildMatchContext(
  tag: string,
  attrs: Record<string, string>,
): MatchContext {
  const classes = new Set<string>();
  const classAttr = attrs.class;
  if (classAttr) {
    for (const c of classAttr.split(/\s+/)) {
      if (c) classes.add(c);
    }
  }
  return {
    tag: tag.toLowerCase(),
    attrs,
    classes,
    id: attrs.id || null,
    childIndex: 0,
    tagIndex: 0,
    lastChildCtx: null,
    prevChildCtxs: [],
  };
}

// ---------------------------------------------------------------------------
// Matcher
// ---------------------------------------------------------------------------

export function matchSelector(
  selector: ParsedSelector,
  matchStack: MatchContext[],
): boolean {
  // The subject is the last element in matchStack (current element)
  if (matchStack.length === 0) return false;
  return selector.some((chain) => matchChain(chain, matchStack));
}

function matchChain(chain: SelectorChain, matchStack: MatchContext[]): boolean {
  if (chain.length === 0) return false;
  // chain[0] is the subject (rightmost selector)
  const subject = matchStack[matchStack.length - 1];
  if (!matchCompound(chain[0].compound, subject)) return false;
  if (chain.length === 1) return true;

  // Walk up the chain from index 1 onward, matching ancestors/siblings
  let stackIdx = matchStack.length - 2; // start from parent
  for (let chainIdx = 1; chainIdx < chain.length; chainIdx++) {
    const part = chain[chainIdx];
    if (part.combinator === ">") {
      // Child combinator — must match immediate parent
      if (stackIdx < 0) return false;
      if (!matchCompound(part.compound, matchStack[stackIdx])) return false;
      stackIdx--;
    } else if (part.combinator === "+") {
      // Adjacent sibling combinator — must match immediately preceding sibling
      if (stackIdx < 0) return false;
      const parentCtx = matchStack[stackIdx];
      if (!parentCtx.lastChildCtx || !matchCompound(part.compound, parentCtx.lastChildCtx))
        return false;
      // Stay at same stack level (parent) for further chain parts
      stackIdx--;
    } else if (part.combinator === "~") {
      // General sibling combinator — must match any preceding sibling
      if (stackIdx < 0) return false;
      const parentCtx = matchStack[stackIdx];
      const allPrev = parentCtx.lastChildCtx
        ? [...parentCtx.prevChildCtxs, parentCtx.lastChildCtx]
        : parentCtx.prevChildCtxs;
      let found = false;
      for (const sib of allPrev) {
        if (matchCompound(part.compound, sib)) {
          found = true;
          break;
        }
      }
      if (!found) return false;
      stackIdx--;
    } else {
      // Descendant combinator — match any ancestor
      let found = false;
      while (stackIdx >= 0) {
        if (matchCompound(part.compound, matchStack[stackIdx])) {
          stackIdx--;
          found = true;
          break;
        }
        stackIdx--;
      }
      if (!found) return false;
    }
  }
  return true;
}

function matchCompound(sel: CompoundSelector, ctx: MatchContext): boolean {
  if (sel.tag && sel.tag !== ctx.tag) return false;
  if (sel.id && sel.id !== ctx.id) return false;
  for (const cls of sel.classes) {
    if (!ctx.classes.has(cls)) return false;
  }
  for (const attr of sel.attrs) {
    const val = ctx.attrs[attr.name];
    switch (attr.op) {
      case "exists":
        if (val === undefined) return false;
        break;
      case "=":
        if (val !== attr.value) return false;
        break;
      case "^=":
        if (val === undefined || !val.startsWith(attr.value || ""))
          return false;
        break;
      case "$=":
        if (val === undefined || !val.endsWith(attr.value || "")) return false;
        break;
      case "*=":
        if (val === undefined || !val.includes(attr.value || "")) return false;
        break;
      case "~=":
        if (val === undefined || !val.split(/\s+/).includes(attr.value || ""))
          return false;
        break;
      case "|=":
        if (
          val === undefined ||
          (val !== attr.value && !val.startsWith(`${attr.value}-`))
        )
          return false;
        break;
    }
  }
  for (const pseudo of sel.pseudos) {
    switch (pseudo.name) {
      case "first-child":
        if (ctx.childIndex !== 1) return false;
        break;
      case "nth-child": {
        const n = parseInt(pseudo.arg as string, 10);
        if (ctx.childIndex !== n) return false;
        break;
      }
      case "first-of-type":
        if (ctx.tagIndex !== 1) return false;
        break;
      case "nth-of-type": {
        const n = parseInt(pseudo.arg as string, 10);
        if (ctx.tagIndex !== n) return false;
        break;
      }
      case "not":
        if (matchCompound(pseudo.arg as CompoundSelector, ctx)) return false;
        break;
    }
  }
  return true;
}
