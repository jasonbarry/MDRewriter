<!-- ============================================================ -->

<!-- 1. Headings                                                   -->

<!-- ============================================================ -->

## Headings

# Heading Level 1

## Heading Level 2

### Heading Level 3

#### Heading Level 4

##### Heading Level 5

###### Heading Level 6

## Headings with inline formatting

# Heading with **bold** text

## Heading with *italic* text

### Heading with `inline code`

#### Heading with ***bold italic***

##### Heading with [a link](https://example.com)

<!-- ============================================================ -->

<!-- 2. Paragraphs & Text                                          -->

<!-- ============================================================ -->

## Paragraphs &amp; Text

This is a simple paragraph with plain text.

This is the first paragraph in a series.

This is the second paragraph, separated by a blank line in Markdown.

This is the third paragraph.

A paragraph with **bold**, *italic*, and `inline code` interspersed throughout the text.

Paragraph with a [link](https://example.com) and an ![image](tiny.png) inline.

<!-- ============================================================ -->

<!-- 3. Inline Formatting                                          -->

<!-- ============================================================ -->

## Inline Formatting

**Bold text using strong**

**Bold text using b**

*Italic text using em*

*Italic text using i*

***Bold and italic nested***

***Italic wrapping bold***

`Inline code`

Text with **bold** in the *middle* of a `sentence`.

Multiple **bold** **words** in a row.

<!-- ============================================================ -->

<!-- 4. Links                                                      -->

<!-- ============================================================ -->

## Links

[Basic link](https://example.com)

[Link with title](https://example.com "Example Title")

[**Bold link text**](https://example.com)

[*Italic link text*](https://example.com)

[`Code link text`](https://example.com)

[Link with query params](https://example.com/path?q=1&amp;r=2)

[Link with encoded spaces](https://example.com/path%20with%20spaces)

[Link with parentheses in URL](<https://example.com/page_(disambiguation)>)

[![Logo](logo.png)](https://example.com)

[Empty href link]()

[Link with **mixed** *formatting*](https://example.com)

<!-- ============================================================ -->

<!-- 5. Images                                                     -->

<!-- ============================================================ -->

## Images

![A photo](https://example.com/photo.jpg)

![A photo](https://example.com/photo.jpg "Photo Title")

![Relative path image](/relative/path/image.png)

![](https://example.com/photo.jpg)

<img src="https://example.com/photo.jpg">

<!-- ============================================================ -->

<!-- 6. Unordered Lists                                            -->

<!-- ============================================================ -->

## Unordered Lists

### Simple list

- Item one
- Item two
- Item three

### Nested list (2 levels)

* Top-level item
      
  * Nested item A
  * Nested item B
* Another top-level item

### Nested list (3 levels)

- Level 1
      
  - Level 2
            
    - Level 3 item A
    - Level 3 item B

### List with inline formatting

* **Bold item**
* *Italic item*
* `Code item`
* Item with a [link](https://example.com)

### Loose list (items with paragraphs)

- First item with paragraph.
  
- Second item with paragraph.
  
- Third item with paragraph.

<!-- ============================================================ -->

<!-- 7. Ordered Lists                                              -->

<!-- ============================================================ -->

## Ordered Lists

### Simple ordered list

1. First
2. Second
3. Third

### Ordered list starting at 3

3) Third
4) Fourth
5) Fifth

### Nested ordered list

1. Top item
       
   1. Sub-item one
   2. Sub-item two
2. Another top item

### Mixed list (ordered containing unordered)

1) Ordered item
       
   - Unordered sub-item
   - Another unordered sub-item
2) Second ordered item

### Mixed list (unordered containing ordered)

- Unordered item
      
  1) Ordered sub-item one
  2) Ordered sub-item two
- Another unordered item

<!-- ============================================================ -->

<!-- 8. Task Lists                                                 -->

<!-- ============================================================ -->

## Task Lists

* [ ]  Unchecked task
* [x]  Checked task
* [ ]  Another unchecked task

### Nested task list

- [x]  Parent task
      
  - [ ]  Child task A
  - [x]  Child task B

### Mixed task and regular list

* [x]  Task item
* Regular list item
* [ ]  Another task item

<!-- ============================================================ -->

<!-- 9. Blockquotes                                                -->

<!-- ============================================================ -->

## Blockquotes

> Simple blockquote.

### Nested blockquote

> Outer quote.
> > 
> > 
> > Inner nested quote.

### Blockquote with multiple paragraphs

> First paragraph inside quote.
> 
> Second paragraph inside quote.

### Blockquote with a list

> A quote with a list:
> 
> - Item A
> - Item B

### Blockquote with code

> Here is some code:
> 
> ```
> const x = 42;
> ```

<!-- ============================================================ -->

<!-- 10. Code Blocks                                               -->

<!-- ============================================================ -->

## Code Blocks

### Fenced code block with language

```javascript
function greet(name) {
  return `Hello, ${name}!`;
}
```

### Fenced code block without language

```
Just some plain code
with multiple lines.
```

### Code with HTML special characters

```html
<div class="container">
  <p>Hello & welcome</p>
</div>
```

### Code with backticks inside

~~~
Use `backticks` for inline code in Markdown.
Triple ``` for code blocks.
~~~

### Python code block

```python
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)
```

### Code block inside a list

* Item with code:
  
  ```bash
  echo "hello world"
  ```
  
* Regular item after code

<!-- ============================================================ -->

<!-- 11. Horizontal Rules                                          -->

<!-- ============================================================ -->

## Horizontal Rules

Content above the rule.

---

Content below the rule.

---

<!-- ============================================================ -->

<!-- 12. Line Breaks                                               -->

<!-- ============================================================ -->

## Line Breaks

Line one.  
Line two after a break.  
Line three after another break.

This paragraph has no breaks and flows normally.

<!-- ============================================================ -->

<!-- 13. Tables                                                    -->

<!-- ============================================================ -->

## Tables

### Simple table

| Name | Age | City |
| --- | --- | --- |
| Alice | 30 | New York |
| Bob | 25 | London |

### Table with alignment

| Left | Center | Right |
| :--- | :---: | ---: |
| A | B | C |
| D | E | F |

### Table with inline formatting

| Feature | Status |
| --- | --- |
| **Bold cell** | *Italic cell* |
| `code cell` | [link cell](https://example.com) |
| ~~Strikethrough cell~~ | Plain cell |

### Table with escaped pipes

| Expression | Result |
| --- | --- |
| a \| b | bitwise OR |
| a \|\| b | logical OR |

### Single-column table

| Items |
| --- |
| Apple |
| Banana |

### Table with empty cells

| A | B | C |
| --- | --- | --- |
| 1 |  | 3 |
|  | 2 |  |

<!-- ============================================================ -->

<!-- 14. Strikethrough & Inline HTML                               -->

<!-- ============================================================ -->

## Strikethrough &amp; Inline HTML Elements

~~Deleted text using del~~

~~Strikethrough text using s~~

~~**Bold strikethrough**~~

*~~Italic strikethrough~~*

<ins>Inserted text</ins>

<mark>Highlighted text</mark>

H<sub>2</sub>O is water.

E = mc<sup>2</sup>

Press <kbd>Ctrl</kbd> + <kbd>C</kbd> to copy.

<abbr title="HyperText Markup Language">HTML</abbr> is great.

<!-- ============================================================ -->

<!-- 15. Structural Elements                                       -->

<!-- ============================================================ -->

## Structural Elements

<div>
  <p>Paragraph inside a div.</p>
</div>

<section>
  <h3>Section heading</h3>
  <p>Section content.</p>
</section>

<article>
  <h3>Article heading</h3>
  <p>Article content.</p>
</article>

<figure>
  <img src="https://example.com/chart.png" alt="A chart">
  <figcaption>Figure 1: A sample chart.</figcaption>
</figure>

<details>
  <summary>Click to expand</summary>
  <p>Hidden content revealed on expansion.</p>
</details>

<!-- ============================================================ -->

<!-- 16. Complex Combinations                                      -->

<!-- ============================================================ -->

## Complex Combinations

### Blockquote with nested list

> Quoted intro:
> 
> - First point
> - Second point
>         
>   - Sub-point

### List item with multiple paragraphs

* First paragraph of this item.
  
  Second paragraph of this item.
  
* Another item.

### Heading inside blockquote

> ### Quoted heading
> 
> Quoted paragraph under the heading.

### Link inside heading

## [Heading that is a link](https://example.com)

### Code block inside blockquote

> Example code:
> 
> ```ruby
> puts "Hello from a blockquote!"
> ```

### Code block inside list item

1) Step one: write code
   
   ```javascript
   console.log("step 1");
   ```
   
2) Step two: run code
   
   ```bash
   node index.js
   ```

### Nested blockquote with formatting

> Outer quote with **bold**.
> > 
> > 
> > Inner quote with *italic* and `code`.

### Link with image inside

[![Banner](https://example.com/banner.png)](https://example.com)

### Deeply nested list

* Level 1
      
  * Level 2
            
    * Level 3
                  
      * Level 4
                        
        * Level 5

<!-- ============================================================ -->

<!-- 17. Edge Cases                                                -->

<!-- ============================================================ -->

## Edge Cases

### Empty elements


<strong></strong>
<em></em>
<a href="https://example.com"></a>
<ul></ul>
<blockquote></blockquote>

### Special Markdown characters in text

Asterisks: \*single\* and \*\*double\*\* should be escaped.

Underscores: \_single\_ and \_\_double\_\_ should be escaped.

Backticks: \`code\` should be escaped.

Square brackets: \[link text\] and \[ref\] should be escaped.

Tildes: \~\~strikethrough\~\~ should be escaped.

Pipes: \| column \| separators \| in text.

Backslash: \\ is the escape character.

Hash: # Not a heading when in a paragraph.

Dash at line start: - Not a list item.

Number at line start: 1. Not a list item.

Greater than: > Not a blockquote.

### Whitespace-heavy HTML


  This    paragraph    has    extra    spaces.


  This
  paragraph
  has
  newlines
  in
  source.

### Adjacent inline elements

**bold***italic* with no space.

**bold** *italic* with a space.

### Deeply nested inline formatting

**bold *bold-italic `bold-italic-code`***

<!-- ============================================================ -->

<!-- 18. Ignored Elements                                          -->

<!-- ============================================================ -->

## Ignored Elements

<script>
  console.log("This script should be stripped by .ignore()");
  var x = 1 + 2;
</script>

<style>
  .ads { display: none; }
  body { color: red; }
</style>

<nav>
  <ul>
      <li><a href="/">Home</a></li>
      <li><a href="/about">About</a></li>
      <li><a href="/contact">Contact</a></li>
    </ul>
</nav>

<footer>
  <p>Copyright 2024 Example Corp.</p>
  <p><a href="/privacy">Privacy Policy</a></p>
</footer>

<div class="ads">
  <p>Buy stuff now! Click here for deals!</p>
</div>

Content after ignored elements should still appear.

<!-- ============================================================ -->

<!-- 19. GFM Tables (extended)                                     -->

<!-- ============================================================ -->

## GFM Tables (Extended)

### Table without thead

<table>
  <tr>
    <td>Row 1 Col 1</td>
    <td>Row 1 Col 2</td>
  </tr>
  <tr>
    <td>Row 2 Col 1</td>
    <td>Row 2 Col 2</td>
  </tr>
</table>

### Table with multi-line cell content

| Description | Value |
| --- | --- |
| Short | 1 |
| A somewhat longer description that might wrap | 42 |

<!-- ============================================================ -->

<!-- 20. GFM Strikethrough (extended)                              -->

<!-- ============================================================ -->

## GFM Strikethrough (Extended)

~~Simple strikethrough~~

~~Strikethrough with **bold** inside~~

~~Strikethrough with *italic* inside~~

~~Strikethrough with `code` inside~~

**~~Bold wrapping strikethrough~~**

<!-- ============================================================ -->

<!-- 21. GFM Task Lists (extended)                                 -->

<!-- ============================================================ -->

## GFM Task Lists (Extended)

### Full task list

- [ ]  Design the API
- [x]  Implement the parser
- [x]  Write tests
- [ ]  Publish to npm

### Task list nested inside regular list

* Phase 1
      
  * [x]  Research
  * [x]  Prototype
* Phase 2
      
  * [ ]  Implementation
  * [ ]  Testing

<!-- ============================================================ -->

<!-- 22. GFM Autolinks                                             -->

<!-- ============================================================ -->

## GFM Autolinks

Visit [https://example.com](https://example.com) for more info.

Contact us at [user@example.com](mailto:user@example.com).

Check out [https://github.com/user/repo](https://github.com/user/repo) on GitHub.

<!-- ============================================================ -->

<!-- 23. GFM Footnotes                                             -->

<!-- ============================================================ -->

## GFM Footnotes

This has a footnote<sup>[1](#fn1)</sup> in the text.

Here is another footnote<sup>[2](#fn2)</sup> reference.

<section class="footnotes">
  <ol>
       <li id="fn1"><p>This is the first footnote content. <a href="#fnref1">↩</a></p></li>
       <li id="fn2"><p>This is the second footnote content. <a href="#fnref2">↩</a></p></li>
     </ol>
</section>

<!-- ============================================================ -->

<!-- 24. GFM Alerts / Admonitions                                  -->

<!-- ============================================================ -->

## GFM Alerts / Admonitions

<div class="markdown-alert markdown-alert-note">
  <p class="markdown-alert-title">Note</p>
  <p>This is a note admonition.</p>
</div>

<div class="markdown-alert markdown-alert-warning">
  <p class="markdown-alert-title">Warning</p>
  <p>This is a warning admonition.</p>
</div>

<div class="markdown-alert markdown-alert-tip">
  <p class="markdown-alert-title">Tip</p>
  <p>This is a tip admonition.</p>
</div>

<div class="markdown-alert markdown-alert-important">
  <p class="markdown-alert-title">Important</p>
  <p>This is an important admonition.</p>
</div>

<div class="markdown-alert markdown-alert-caution">
  <p class="markdown-alert-title">Caution</p>
  <p>This is a caution admonition.</p>
</div>

<!-- ============================================================ -->

<!-- 25. Definition Lists                                          -->

<!-- ============================================================ -->

## Definition Lists

<dl>
  <dt>Term 1</dt>
  <dd>Definition for term 1.</dd>

  <dt>Term 2</dt>
  <dd>First definition for term 2.</dd>
  <dd>Second definition for term 2.</dd>

  <dt><strong>Bold term</strong></dt>
  <dd>Definition with <code>code</code> inside.</dd>
</dl>

<!-- ============================================================ -->

<!-- 26. Math                                                      -->

<!-- ============================================================ -->

## Math

Inline math: `E = mc^2`

Block math:

```math
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
```

Another inline formula: `\sum_{i=1}^{n} i = \frac{n(n+1)}{2}`

<!-- ============================================================ -->

<!-- 27. Emoji Shortcodes                                          -->

<!-- ============================================================ -->

## Emoji Shortcodes

Emoji in text: 🎉 party, 🚀 rocket, ✅ check.

Unicode emoji should pass through unchanged.

<!-- ============================================================ -->

<!-- 28. HTML Comments                                             -->

<!-- ============================================================ -->

## HTML Comments

<!-- This is an HTML comment that may or may not pass through -->

Content before comment.

<!-- Another comment -->

Content after comment.

<!-- Multi-line
     comment
     here -->

<!-- ============================================================ -->

<!-- 29. Highlight / Mark                                          -->

<!-- ============================================================ -->

## Highlight / Mark

This is <mark>highlighted text</mark> in a sentence.

<mark>Entire paragraph highlighted.</mark>

<mark>**Bold highlighted**</mark> text.

