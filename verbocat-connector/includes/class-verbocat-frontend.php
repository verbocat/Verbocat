<?php
/**
 * Verbocat Frontend Language Switcher & Multilingual SEO
 *
 * @package Verbocat_Connector
 */

if (!defined('ABSPATH')) {
    exit;
}

class Verbocat_Frontend {

    /**
     * Initialize frontend hooks
     */
    public static function init() {
        // SEO: Injects Google hreflang meta tags & filters html lang attribute
        add_action('wp_head', [__CLASS__, 'inject_multilingual_seo_tags']);
        add_filter('language_attributes', [__CLASS__, 'filter_html_language_attributes']);

        // Frontend Switcher: Floating Widget & Shortcode
        add_action('wp_footer', [__CLASS__, 'render_floating_language_switcher']);
        add_shortcode('verbocat_language_switcher', [__CLASS__, 'render_language_switcher_shortcode']);
    }

    /**
     * Inject Google Multilingual hreflang alternate tags
     */
    public static function inject_multilingual_seo_tags() {
        if (!is_singular()) return;

        global $post;
        if (!$post) return;

        $is_translation = get_post_meta($post->ID, '_verbocat_is_translation', true);
        $source_id = $is_translation ? get_post_meta($post->ID, '_verbocat_source_post_id', true) : $post->ID;

        if (!$source_id) return;

        $translations = get_post_meta($source_id, '_verbocat_translations', true) ?: [];
        $opts = Verbocat_Settings::get_options();
        $src_lang = $opts['source_lang'] ?: 'en';

        echo "\n<!-- Verbocat Multilingual SEO -->\n";
        echo '<link rel="alternate" hreflang="' . esc_attr($src_lang) . '" href="' . esc_url(get_permalink($source_id)) . '" />' . "\n";
        echo '<link rel="alternate" hreflang="x-default" href="' . esc_url(get_permalink($source_id)) . '" />' . "\n";

        foreach ($translations as $lang => $trans_id) {
            if ($trans_id && get_post_status($trans_id) === 'publish') {
                echo '<link rel="alternate" hreflang="' . esc_attr($lang) . '" href="' . esc_url(get_permalink($trans_id)) . '" />' . "\n";
            }
        }
        echo "<!-- /Verbocat Multilingual SEO -->\n\n";
    }

    /**
     * Filter HTML language attribute (e.g. <html lang="es">)
     */
    public static function filter_html_language_attributes($output) {
        if (is_singular()) {
            global $post;
            if ($post) {
                $lang = get_post_meta($post->ID, '_verbocat_lang', true);
                if ($lang) {
                    return 'lang="' . esc_attr($lang) . '"';
                }
            }
        }
        return $output;
    }

    /**
     * Render floating language switcher widget
     */
    public static function render_floating_language_switcher() {
        $opts = Verbocat_Settings::get_options();
        if ($opts['show_switcher'] !== '1' || !is_singular()) return;

        echo self::render_language_switcher_html($opts['switcher_position'] ?: 'bottom-right');
    }

    /**
     * Shortcode handler [verbocat_language_switcher]
     */
    public static function render_language_switcher_shortcode($atts) {
        return self::render_language_switcher_html('inline');
    }

    /**
     * Render the HTML for the Language Switcher
     */
    private static function render_language_switcher_html($mode = 'bottom-right') {
        global $post;
        if (!$post) return '';

        $is_translation = get_post_meta($post->ID, '_verbocat_is_translation', true);
        $source_id = $is_translation ? get_post_meta($post->ID, '_verbocat_source_post_id', true) : $post->ID;
        $opts = Verbocat_Settings::get_options();
        $src_lang = $opts['source_lang'] ?: 'en';
        $current_lang = $is_translation ? (get_post_meta($post->ID, '_verbocat_lang', true) ?: $src_lang) : $src_lang;

        $translations = get_post_meta($source_id, '_verbocat_translations', true) ?: [];

        // Build array of all available language versions for this page
        $all_langs = [];
        $src_meta = Verbocat_Languages::get_language($src_lang);
        $all_langs[$src_lang] = [
            'url'    => get_permalink($source_id),
            'meta'   => $src_meta,
            'active' => ($current_lang === $src_lang)
        ];

        foreach ($translations as $lang => $trans_id) {
            if ($trans_id && get_post_status($trans_id) === 'publish') {
                $all_langs[$lang] = [
                    'url'    => get_permalink($trans_id),
                    'meta'   => Verbocat_Languages::get_language($lang),
                    'active' => ($current_lang === $lang)
                ];
            }
        }

        // Only show if more than 1 language is available
        if (count($all_langs) <= 1) return '';

        $curr_meta = Verbocat_Languages::get_language($current_lang);
        $is_floating = ($mode !== 'inline');

        ob_start();
        ?>
        <div class="verbocat-lang-switcher <?php echo esc_attr($mode); ?>" style="<?php echo $is_floating ? 'position: fixed; z-index: 999999; font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif;' : 'display: inline-block; font-family: sans-serif;'; ?>">
            <div class="verbocat-pill" id="verbocat-pill-btn" style="background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(8px); border: 1px solid #e2e8f0; border-radius: 50px; padding: 8px 16px; box-shadow: 0 4px 14px rgba(0,0,0,0.12); display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 14px; font-weight: 600; color: #1e293b; user-select: none; transition: all 0.2s ease;">
                <span><?php echo esc_html($curr_meta['native']); ?></span>
                <span style="font-size: 10px; color: #64748b; margin-left: 2px;">&#9660;</span>
            </div>

            <div class="verbocat-dropdown" id="verbocat-dropdown-menu" style="display: none; position: absolute; <?php echo str_contains($mode, 'bottom') ? 'bottom: 48px;' : 'top: 48px;'; ?> <?php echo str_contains($mode, 'right') ? 'right: 0;' : 'left: 0;'; ?> background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.15); min-width: 150px; overflow: hidden; padding: 6px 0;">
                <?php foreach ($all_langs as $code => $item): ?>
                    <a href="<?php echo esc_url($item['url']); ?>" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; color: <?php echo $item['active'] ? '#2563eb' : '#334155'; ?>; text-decoration: none; font-size: 13px; font-weight: <?php echo $item['active'] ? '700' : '500'; ?>; background: <?php echo $item['active'] ? '#eff6ff' : 'transparent'; ?>; transition: background 0.15s ease;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='<?php echo $item['active'] ? '#eff6ff' : 'transparent'; ?>'">
                        <span style="display: flex; align-items: center; gap: 8px;">
                            <span><?php echo esc_html($item['meta']['native']); ?></span>
                        </span>
                        <?php if ($item['active']): ?>
                            <span style="color: #2563eb; font-size: 12px;">&#10004;</span>
                        <?php endif; ?>
                    </a>
                <?php endforeach; ?>
            </div>
        </div>

        <style>
        .verbocat-lang-switcher.bottom-right { bottom: 24px; right: 24px; }
        .verbocat-lang-switcher.bottom-left { bottom: 24px; left: 24px; }
        .verbocat-lang-switcher.top-right { top: 24px; right: 24px; }
        .verbocat-pill:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.15); border-color: #2563eb; }
        </style>

        <script>
        (function() {
            var btn = document.getElementById('verbocat-pill-btn');
            var menu = document.getElementById('verbocat-dropdown-menu');
            if (btn && menu) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    menu.style.display = (menu.style.display === 'none' || menu.style.display === '') ? 'block' : 'none';
                });
                document.addEventListener('click', function() {
                    menu.style.display = 'none';
                });
            }
        })();
        </script>
        <?php
        return ob_get_clean();
    }
}
