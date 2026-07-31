/**
 * Round-Trip Test for HTML Import/Export V2 Architecture
 *
 * Tests:
 * 1. Import → immediate export (no translations) → byte-for-byte identical
 * 2. Import → translate some segments → export → verify structure preserved
 * 3. Edge cases: nested tags, tables, inline formatting, comments, entities
 */

const fs = require("fs");
const path = require("path");
const { parseFile, exportFile } = require("./src/utils/parsers/htmlParser");

// ── Test HTML Documents ─────────────────────────────────────────────────────────

const TEST_CASES = {
  // 1. Simple paragraph
  simple: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Simple Test</title>
  <style>body { font-family: Arial; color: #333; }</style>
</head>
<body>
  <h1>Hello World</h1>
  <p>This is a simple paragraph.</p>
</body>
</html>`,

  // 2. Inline formatting tags
  inline_tags: `<!DOCTYPE html>
<html>
<head><title>Inline Tags</title></head>
<body>
  <p>Click <a href="https://example.com" class="link">here</a> to <b>continue</b>.</p>
  <p>This has <em>emphasis</em> and <strong>strong</strong> text.</p>
</body>
</html>`,

  // 3. Nested structure with tables
  table: `<!DOCTYPE html>
<html>
<head><title>Table Test</title></head>
<body>
  <table border="1" class="data-table">
    <thead>
      <tr><th>Name</th><th>Value</th></tr>
    </thead>
    <tbody>
      <tr><td>Item 1</td><td>$100.00</td></tr>
      <tr><td>Item 2</td><td>$200.00</td></tr>
    </tbody>
  </table>
</body>
</html>`,

  // 4. Lists
  list: `<!DOCTYPE html>
<html>
<head><title>List Test</title></head>
<body>
  <ul>
    <li>First item</li>
    <li>Second item with <a href="#">link</a></li>
    <li>Third item</li>
  </ul>
  <ol>
    <li>Step one</li>
    <li>Step two</li>
  </ol>
</body>
</html>`,

  // 5. Mixed content (orphan text runs)
  mixed_content: `<!DOCTYPE html>
<html>
<head><title>Mixed Content</title></head>
<body>
  <div>
    Some orphan text before the paragraph.
    <p>A proper paragraph inside.</p>
    More orphan text after the paragraph.
  </div>
</body>
</html>`,

  // 6. Script, style, comments (should be preserved untouched)
  non_translatable: `<!DOCTYPE html>
<html>
<head>
  <title>Non-Translatable Content</title>
  <style>
    .highlight { background-color: yellow; }
    p { margin: 10px; }
  </style>
  <script>
    var x = 1 < 2;
    console.log("Hello & goodbye");
  </script>
</head>
<body>
  <!-- This is a comment that should not change -->
  <p>This text should be translatable.</p>
  <!-- Another comment -->
  <div id="app" class="container" data-value="test">
    <p>Another translatable paragraph.</p>
  </div>
  <script>document.getElementById('app').innerHTML = '<b>Dynamic</b>';</script>
</body>
</html>`,

  // 7. HTML entities and special characters
  entities: `<!DOCTYPE html>
<html>
<head><title>Entities &amp; Special Characters</title></head>
<body>
  <p>Price: $100 &amp; tax &lt; $20</p>
  <p>Copyright &#169; 2024 &mdash; All rights reserved.</p>
  <p>Caf&eacute; au lait</p>
</body>
</html>`,

  // 8. Deeply nested inline tags
  deep_nesting: `<!DOCTYPE html>
<html>
<head><title>Deep Nesting</title></head>
<body>
  <p>This is <b>bold and <i>italic and <u>underlined</u> text</i> here</b> end.</p>
</body>
</html>`,

  // 9. Self-closing and void elements
  self_closing: `<!DOCTYPE html>
<html>
<head><title>Self-Closing</title></head>
<body>
  <p>Before the break<br>after the break.</p>
  <p>An image: <img src="test.png" alt="test image"> inline.</p>
  <hr>
  <p>After the horizontal rule.</p>
</body>
</html>`,

  // 10. Complex real-world-ish page
  complex: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Product Page</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', sans-serif; }
    .header { background: #1a1a2e; color: white; padding: 20px; }
    .content { max-width: 1200px; margin: 0 auto; padding: 20px; }
    .price { color: #e94560; font-size: 24px; }
  </style>
</head>
<body>
  <header class="header">
    <nav>
      <a href="/">Home</a> | <a href="/products">Products</a> | <a href="/about">About</a>
    </nav>
  </header>
  <main class="content">
    <h1>Premium Widget Pro</h1>
    <p class="price">$299.99</p>
    <p>The <strong>Premium Widget Pro</strong> is our flagship product, designed for professionals who demand the best.</p>
    <h2>Features</h2>
    <ul>
      <li>High-performance <em>titanium</em> construction</li>
      <li>Water resistant up to 50 meters</li>
      <li>Battery life: <span class="highlight">72 hours</span></li>
    </ul>
    <h2>Specifications</h2>
    <table>
      <tr><th>Dimension</th><th>Value</th></tr>
      <tr><td>Weight</td><td>150g</td></tr>
      <tr><td>Size</td><td>120mm &times; 60mm &times; 15mm</td></tr>
    </table>
    <!-- TODO: Add customer reviews section -->
    <footer>
      <p>Contact us at <a href="mailto:support@example.com">support@example.com</a> for questions.</p>
    </footer>
  </main>
  <script>
    // Analytics
    window.addEventListener('load', function() {
      console.log('Page loaded');
    });
  </script>
</body>
</html>`,
};

// ── Test Runner ─────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let total = 0;

function assert(condition, message) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.log(`  ❌ FAIL: ${message}`);
  }
}

async function testRoundTrip(name, htmlContent) {
  console.log(`\n━━━ Test: ${name} ━━━`);

  // Write test file
  const tmpFile = path.join(__dirname, `__test_${name}.html`);
  fs.writeFileSync(tmpFile, htmlContent, "utf-8");

  try {
    // ── Parse ──────────────────────────────────────────────────────────
    const { segments, template } = await parseFile(tmpFile);

    assert(segments.length > 0, `Extracted ${segments.length} segments`);
    assert(template && template.length > 0, "Template is non-empty");

    // Verify all segments have source text
    const emptySegments = segments.filter(
      (s) => !s.source || s.source.replace(/<\/?\d+>/g, "").trim().length === 0
    );
    assert(emptySegments.length === 0, "No empty segments");

    // ── Round-trip export (no translations) ──────────────────────────
    const exportedBuffer = await exportFile(template, segments);
    const exportedHtml = exportedBuffer.toString("utf-8");

    // Byte-for-byte identity check
    const originalBytes = Buffer.from(htmlContent, "utf-8");
    const bytesMatch = originalBytes.equals(exportedBuffer);
    assert(
      bytesMatch,
      "Round-trip: exported HTML is byte-for-byte identical to original"
    );

    if (!bytesMatch) {
      // Show diff for debugging
      const lines1 = htmlContent.split("\n");
      const lines2 = exportedHtml.split("\n");
      for (let i = 0; i < Math.max(lines1.length, lines2.length); i++) {
        if (lines1[i] !== lines2[i]) {
          console.log(`    Line ${i + 1} differs:`);
          console.log(`      Original: ${JSON.stringify(lines1[i] || "")}`);
          console.log(`      Exported: ${JSON.stringify(lines2[i] || "")}`);
          if (i > 2) {
            console.log(`    (${Math.max(lines1.length, lines2.length) - i - 1} more differences…)`);
            break;
          }
        }
      }
    }

    // ── Export with translations ─────────────────────────────────────
    if (segments.length > 0) {
      const translatedSegments = segments.map((seg) => ({
        ...seg,
        target: `[TRANSLATED] ${seg.source}`,
      }));

      const translatedBuffer = await exportFile(template, translatedSegments);
      const translatedHtml = translatedBuffer.toString("utf-8");

      // Verify the HTML is valid (has expected structure markers)
      assert(
        translatedHtml.includes("</html>") || translatedHtml.includes("</body>"),
        "Translated export has valid closing tags"
      );

      // Verify scripts are preserved
      if (htmlContent.includes("<script>")) {
        assert(
          translatedHtml.includes("<script>"),
          "Scripts preserved after translation"
        );
      }

      // Verify styles are preserved
      if (htmlContent.includes("<style>")) {
        assert(
          translatedHtml.includes("<style>"),
          "Styles preserved after translation"
        );
      }

      // Verify comments are preserved
      if (htmlContent.includes("<!--")) {
        const originalComments = htmlContent.match(/<!--[\s\S]*?-->/g) || [];
        const exportedComments = translatedHtml.match(/<!--[\s\S]*?-->/g) || [];
        assert(
          originalComments.length === exportedComments.length,
          `Comments preserved: ${originalComments.length} found`
        );
      }

      // Verify translated text appears
      assert(
        translatedHtml.includes("[TRANSLATED]"),
        "Translated text appears in export"
      );

      // Verify original class attributes are preserved
      if (htmlContent.includes('class="')) {
        const origClasses = htmlContent.match(/class="[^"]*"/g) || [];
        const exportClasses = translatedHtml.match(/class="[^"]*"/g) || [];
        assert(
          origClasses.length === exportClasses.length,
          `CSS classes preserved: ${origClasses.length} found`
        );
      }

      // Verify IDs are preserved
      if (htmlContent.includes('id="')) {
        const origIds = htmlContent.match(/id="[^"]*"/g) || [];
        const exportIds = translatedHtml.match(/id="[^"]*"/g) || [];
        assert(
          origIds.length === exportIds.length,
          `IDs preserved: ${origIds.length} found`
        );
      }
    }

    return true;
  } catch (err) {
    total++;
    failed++;
    console.log(`  ❌ EXCEPTION: ${err.message}`);
    console.log(`    ${err.stack.split("\n").slice(1, 3).join("\n    ")}`);
    return false;
  } finally {
    // Cleanup
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  }
}

// ── Main ────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  HTML Import/Export V2 — Round-Trip Test Suite");
  console.log("═══════════════════════════════════════════════════════════════");

  for (const [name, html] of Object.entries(TEST_CASES)) {
    await testRoundTrip(name, html);
  }

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log(`  Results: ${passed}/${total} passed, ${failed} failed`);
  console.log("═══════════════════════════════════════════════════════════════");

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
