# 🐱 Verbocat Continuous Localization Connector v2.2 for WordPress

The **Verbocat Continuous Localization Connector** connects your WordPress website directly to Verbocat AI and Translation Memory (TM).

---

## ⚡ Key Features in v2.2:

1. **🧩 Granular Component & Block-Level Translation:**
   - When translating a page, you can **select exactly which components to translate** (e.g. Title only, Heading only, or specific Paragraphs), while leaving unselected components intact!
   - Component badges for easy identification (`🏷️ Title`, `📌 Heading H2`, `📄 Paragraph`, `📋 List`, `💬 Quote`, `🔘 Button`).

2. **🌐 Interactive Language & Component Selection Modal:**
   - Single clean **"🌐 Translate Page"** button in the Gutenberg top header toolbar.
   - Choose **Source Language** (English, Spanish, French, etc.).
   - Choose **Target Languages** with flag checkboxes and "Select All" / "Clear All".
   - Choose **Components to Translate** with live preview snippets.

3. **⚡ Smart Delta Sync (Block-Level Diffing):**
   - Automatically compares block hashes (`md5`).
   - Only translates new or edited sentences, saving 90%+ AI credits.

4. **🔄 Two-Way Webhook & Translation Memory (TM) Sync:**
   - Checks TM before translating to reuse past translations for free.
   - Saves new translations into TM automatically.
   - REST Webhook (`POST /wp-json/verbocat/v1/sync`) for real-time bi-directional sync from Verbocat CAT editors.

5. **🌐 Modern Frontend Language Switcher & Multilingual SEO:**
   - Floating glassmorphic language switcher widget on the live website.
   - Shortcode: `[verbocat_language_switcher]`.
   - Injects Google `<link rel="alternate" hreflang="...">` tags into `wp_head`.

---

## 📦 How to Install / Update:

1. Copy the [`verbocat-connector`](file:///c:/Users/divya/OneDrive/Desktop/matecat/verbocat-connector/) folder into your WordPress site's `wp-content/plugins/` directory.
2. In WordPress Admin, open any page or post.
3. Click the top **"🌐 Translate Page"** button.
4. Select your **Source Language**, **Target Languages**, and **Specific Components** you want to translate!
5. Click **"🚀 Translate Selected Components"**.
