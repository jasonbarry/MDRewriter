import { parseSelector } from "./selector";
import { createMarkdownStream, htmlToMarkdown } from "./stream";
import type {
  DocumentHandler,
  ElementHandler,
  HandlerRegistration,
} from "./types";

// ---------------------------------------------------------------------------
// MDRewriter class
// ---------------------------------------------------------------------------

export class MDRewriter {
  private registrations: HandlerRegistration[] = [];
  private documentHandlers: DocumentHandler[] = [];

  onDocument(handler: DocumentHandler): this {
    this.documentHandlers.push(handler);
    return this;
  }

  on(selector: string, handler: ElementHandler): this {
    this.registrations.push({ selector: parseSelector(selector), handler });
    return this;
  }

  ignore(selector: string): this {
    return this.on(selector, {
      element(el) {
        el.remove();
      },
    });
  }

  transform(input: string): string;
  transform(input: Response): Response;
  transform(input: string | Response): string | Response {
    if (typeof input !== "object" || input === null) {
      return htmlToMarkdown(
        input,
        this.registrations.length > 0 ? this.registrations : undefined,
        this.documentHandlers.length > 0 ? this.documentHandlers : undefined,
      );
    }
    const response = input;
    const reader = response.body?.getReader();
    if (!reader) {
      return new Response("", {
        headers: { "content-type": "text/markdown; charset=utf-8" },
      });
    }
    const decoder = new TextDecoder();
    const { readable, writable } = new TransformStream<
      Uint8Array,
      Uint8Array
    >();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const regs = this.registrations.length > 0 ? this.registrations : undefined;
    const docHandlers =
      this.documentHandlers.length > 0 ? this.documentHandlers : undefined;
    const mdStream = createMarkdownStream(
      (chunk) => {
        writer.write(encoder.encode(chunk));
      },
      regs,
      docHandlers,
    );
    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          mdStream.write(decoder.decode(value, { stream: true }));
        }
        mdStream.end();
      } finally {
        writer.close();
      }
    })();
    return new Response(readable, {
      headers: { "content-type": "text/markdown; charset=utf-8" },
    });
  }
}

export default MDRewriter;
