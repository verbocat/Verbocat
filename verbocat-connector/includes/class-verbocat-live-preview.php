<?php
/**
 * Verbocat Live WordPress Frontend Preview & Bridge
 * Provides 1000% exact native WordPress theme rendering inside Centroid CAT Editor iframe
 */

if (!defined('ABSPATH')) {
    exit;
}

class Verbocat_Live_Preview {

    public static function init() {
        add_action('template_redirect', [__CLASS__, 'handle_live_preview_request'], 1);
    }

    public static function get_preview_token($post_id) {
        $key = defined('NONCE_SALT') ? NONCE_SALT : 'verbocat_secret_salt_2026';
        return hash_hmac('sha256', 'verbocat_live_preview_' . $post_id, $key);
    }

    public static function get_preview_url($post_id) {
        $token = self::get_preview_token($post_id);
        return add_query_arg([
            'verbocat_live_preview' => '1',
            'post_id'               => $post_id,
            'token'                 => $token
        ], home_url('/'));
    }

    public static function handle_live_preview_request() {
        if (empty($_GET['verbocat_live_preview']) || empty($_GET['post_id'])) {
            return;
        }

        $post_id = intval($_GET['post_id']);
        $post = get_post($post_id);
        if (!$post) {
            wp_die('Post not found', 'Not Found', ['response' => 404]);
        }

        // Verify token or admin capability or local IP
        $token = sanitize_text_field($_GET['token'] ?? '');
        $expected_token = self::get_preview_token($post_id);
        $is_localhost = in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1', 'localhost']);

        if ($token !== $expected_token && !current_user_can('edit_post', $post_id) && !$is_localhost) {
            wp_die('Invalid or expired preview token', 'Unauthorized', ['response' => 403]);
        }

        // Remove frame restrictions so Centroid CAT Editor can embed iframe seamlessly
        header_remove('X-Frame-Options');
        header('Content-Security-Policy: frame-ancestors *');
        header('Access-Control-Allow-Origin: *');

        // Set up WordPress global query & post state for full native rendering
        global $wp_query, $wp_the_query, $post;
        $post = get_post($post_id);
        
        $wp_query = new WP_Query([
            'p'         => $post_id,
            'post_type' => $post->post_type
        ]);
        $wp_query->queried_object = $post;
        $wp_query->queried_object_id = $post_id;
        $wp_query->is_single = ($post->post_type === 'post');
        $wp_query->is_page = ($post->post_type === 'page');
        $wp_query->is_singular = true;
        $wp_query->is_home = false;
        $wp_query->is_archive = false;
        $wp_query->is_404 = false;

        $wp_the_query = $wp_query;
        $GLOBALS['post'] = $post;
        $GLOBALS['wp_query'] = $wp_query;
        $GLOBALS['wp_the_query'] = $wp_query;
        setup_postdata($post);

        // Filter content to tag translatable text blocks with segment markers
        add_filter('the_content', [__CLASS__, 'tag_content_segments'], 99);

        // Inject real-time postMessage communication bridge
        add_action('wp_footer', [__CLASS__, 'inject_live_bridge_script'], 9999);

        // Load the active theme's native template hierarchy
        $template = '';
        if ($post->post_type === 'page') {
            $template = get_page_template();
        } else {
            $template = get_single_template();
        }
        if (!$template || !file_exists($template)) {
            $template = get_singular_template();
        }
        if (!$template || !file_exists($template)) {
            $template = get_index_template();
        }

        if ($template && file_exists($template)) {
            // Re-assert globals right before template execution
            $GLOBALS['post'] = $post;
            setup_postdata($post);
            include $template;
            exit;
        }
    }

    public static function tag_content_segments($content) {
        // Tag paragraphs, headings, buttons, and links with segment indices
        static $seg_count = 0;
        return preg_replace_callback('/(<(?:p|h[1-6]|li|blockquote|a|button)[^>]*>)([\s\S]*?)(<\/(?:p|h[1-6]|li|blockquote|a|button)>)/i', function($m) use (&$seg_count) {
            $seg_count++;
            $tag_open = $m[1];
            $inner = $m[2];
            $tag_close = $m[3];

            // If tag_open doesn't already have data-verbocat-seg
            if (!str_contains($tag_open, 'data-verbocat-seg')) {
                $tag_open = substr_replace($tag_open, ' data-verbocat-seg="' . $seg_count . '"', strlen($tag_open) - 1, 0);
            }
            return $tag_open . $inner . $tag_close;
        }, $content);
    }

    public static function inject_live_bridge_script() {
        global $post;
        $post_id = $post ? $post->ID : 0;
        ?>
        <script id="verbocat-live-preview-bridge">
        (function() {
            console.log('[Verbocat Bridge] 🚀 Live Preview Bridge Connected for Post #<?php echo $post_id; ?>');

            // Listen for real-time translation updates from CAT Editor
            window.addEventListener('message', function(e) {
                if (!e.data || e.data.type !== 'VERBOCAT_UPDATE_SEGMENTS') return;
                var segments = e.data.segments || [];
                segments.forEach(function(seg) {
                    var idx = seg.id !== undefined ? seg.id : seg.segment_index;
                    var text = seg.target || seg.text || '';
                    if (!idx || !text) return;

                    var el = document.querySelector('[data-verbocat-seg="' + idx + '"]');
                    if (el) {
                        el.textContent = text;
                    }
                });
            });

            // Signal to parent window that preview is ready
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'VERBOCAT_PREVIEW_READY', postId: <?php echo $post_id; ?> }, '*');
            }
        })();
        </script>
        <?php
    }
}
