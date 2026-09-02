<?php
/**
 * Verbocat Live WordPress Frontend Preview & Bridge
 * Provides 100% exact native WordPress rendering across all pages and themes
 */

if (!defined('ABSPATH')) {
    exit;
}

class Verbocat_Live_Preview {

    public static function init() {
        // 1. Allow iframe embedding across origins
        add_action('init', [__CLASS__, 'allow_iframe_embedding'], 1);
        add_action('send_headers', [__CLASS__, 'allow_iframe_embedding'], 1);

        // 2. Authorize preview capabilities for draft/pending posts
        add_filter('user_has_cap', [__CLASS__, 'authorize_preview_capabilities'], 10, 4);
        add_action('pre_get_posts', [__CLASS__, 'allow_draft_in_query'], 1);

        // 3. Inject TreeWalker real-time postMessage bridge in footer
        add_action('wp_footer', [__CLASS__, 'inject_live_bridge_script'], 99999);
    }

    public static function allow_iframe_embedding() {
        if (!empty($_GET['verbocat_live_preview'])) {
            header_remove('X-Frame-Options');
            header('Content-Security-Policy: frame-ancestors *');
            header('Access-Control-Allow-Origin: *');
        }
    }

    public static function get_preview_token($post_id) {
        $key = 'verbocat_live_preview_secret_salt_2026';
        return hash_hmac('sha256', 'verbocat_live_preview_' . $post_id, $key);
    }

    public static function get_preview_url($post_id) {
        $token = self::get_preview_token($post_id);
        $post = get_post($post_id);
        $base = home_url('/');
        if ($post) {
            $key = ($post->post_type === 'page') ? 'page_id' : 'p';
            $base = add_query_arg([$key => $post_id], home_url('/'));
        }
        return add_query_arg([
            'preview'               => 'true',
            'verbocat_live_preview' => '1',
            'post_id'               => $post_id,
            'token'                 => $token
        ], $base);
    }

    public static function is_valid_preview_request() {
        if (empty($_GET['verbocat_live_preview']) || empty($_GET['post_id'])) {
            return false;
        }
        $post_id = intval($_GET['post_id']);
        $token = sanitize_text_field($_GET['token'] ?? '');
        $expected = self::get_preview_token($post_id);
        $expected_legacy = defined('NONCE_SALT') ? hash_hmac('sha256', 'verbocat_live_preview_' . $post_id, NONCE_SALT) : '';
        return ($token === $expected || $token === $expected_legacy || current_user_can('edit_post', $post_id));
    }

    public static function authorize_preview_capabilities($allcaps, $caps, $args, $user) {
        if (!self::is_valid_preview_request()) {
            return $allcaps;
        }
        $post_id = intval($_GET['post_id']);
        if (!empty($args[2]) && intval($args[2]) === $post_id) {
            $allcaps['read_post'] = true;
            $allcaps['read_private_posts'] = true;
            $allcaps['read_private_pages'] = true;
            $allcaps['edit_post'] = true;
            $allcaps['edit_page'] = true;
        }
        return $allcaps;
    }

    public static function allow_draft_in_query($query) {
        if (!self::is_valid_preview_request()) {
            return;
        }
        $post_id = intval($_GET['post_id'] ?? ($_GET['page_id'] ?? ($_GET['p'] ?? 0)));
        if ($post_id && $query->is_main_query()) {
            $post = get_post($post_id);
            if ($post) {
                if ($post->post_type === 'page') {
                    $query->set('page_id', $post_id);
                    $query->is_page = true;
                } else {
                    $query->set('p', $post_id);
                    $query->is_single = true;
                }
                $query->is_singular = true;
                $query->is_home = false;
                $query->is_front_page = false;
                $query->is_archive = false;
                $query->set('post_status', ['publish', 'draft', 'pending', 'private', 'future']);
                $query->set('ignore_sticky_posts', true);
            }
        }
    }

    public static function inject_live_bridge_script() {
        if (!self::is_valid_preview_request()) {
            return;
        }
        global $post;
        $post_id = $post ? $post->ID : 0;
        ?>
        <style id="verbocat-live-preview-fixes">
            /* Hide WP Admin Bar in live preview iframe */
            #wpadminbar { display: none !important; }
            html { margin-top: 0 !important; }
        </style>
        <script id="verbocat-live-preview-bridge">
        (function() {
            console.log('[Verbocat Bridge] 🚀 Live Preview Persistent Segment-Bound Bridge Connected for Post #<?php echo $post_id; ?>');

            var textNodeEntries = [];

            function normalizeText(str) {
                if (!str) return '';
                var txt = document.createElement('textarea');
                txt.innerHTML = str;
                var decoded = txt.value;

                return decoded
                    .replace(/[\u2018\u2019\u201A\u201B\u0027\u0060\u00B4]/g, "'")
                    .replace(/[\u201C\u201D\u201E\u201F\u0022]/g, '"')
                    .replace(/[\u2013\u2014\u2015\u002D]/g, '-')
                    .replace(/[\s\r\n\t\u00A0]+/g, ' ')
                    .trim();
            }

            function indexTextNodes() {
                textNodeEntries = [];
                var walker = document.createTreeWalker(
                    document.body,
                    NodeFilter.SHOW_TEXT,
                    {
                        acceptNode: function(node) {
                            if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
                            var parent = node.parentElement;
                            if (!parent) return NodeFilter.FILTER_REJECT;
                            var tag = parent.tagName.toLowerCase();
                            if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'textarea' || tag === 'svg' || tag === 'template') {
                                return NodeFilter.FILTER_REJECT;
                            }
                            // Never mutate header, navigation, or footer parts
                            if (parent.closest('header, footer, #masthead, .custom-topbar, .site-footer, #wpadminbar, nav, .ekit_menu_responsive_tablet')) {
                                return NodeFilter.FILTER_REJECT;
                            }
                            var txt = node.nodeValue.trim();
                            if (txt.length === 0) return NodeFilter.FILTER_REJECT;
                            return NodeFilter.FILTER_ACCEPT;
                        }
                    },
                    false
                );

                while (walker.nextNode()) {
                    var node = walker.currentNode;
                    var initialText = (node._verbocatOrigText !== undefined) ? node._verbocatOrigText : node.nodeValue;
                    node._verbocatOrigText = initialText;
                    textNodeEntries.push({
                        node: node,
                        initialClean: initialText.replace(/[\s\r\n\t]+/g, ' ').trim(),
                        normClean: normalizeText(initialText)
                    });
                }
                console.log('[Verbocat Bridge] Indexed ' + textNodeEntries.length + ' post content text nodes in DOM.');
            }

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', indexTextNodes);
            } else {
                indexTextNodes();
            }

            // Continuous Source-to-Target Memory Binding
            function applyTranslations(segments) {
                if (!textNodeEntries.length) indexTextNodes();
                if (!Array.isArray(segments) || !segments.length) return;

                segments.forEach(function(seg, idx) {
                    var segId = Number(seg.id || seg.segment_index || (idx + 1));
                    var rawSrc = (seg.source || seg.source_text || '').replace(/[\s\r\n\t]+/g, ' ').trim();
                    var normSrc = normalizeText(rawSrc);
                    var tgt = seg.target !== undefined && seg.target !== null ? seg.target : (seg.target_text || '');
                    if (tgt === undefined || tgt === null) return;

                    textNodeEntries.forEach(function(entry) {
                        // 1. Direct Bound Match: Node was already paired with this segment ID
                        if (entry.node._verbocatSegmentId === segId) {
                            if (entry.node.nodeValue !== tgt) {
                                entry.node.nodeValue = tgt;
                            }
                            return;
                        }

                        // 2. Initial Binding by Exact or Normalized Source Text
                        if (entry.node._verbocatSegmentId === undefined) {
                            if (normSrc && (entry.normClean === normSrc || entry.initialClean === rawSrc || entry.node._verbocatOrigText.trim() === rawSrc)) {
                                entry.node._verbocatSegmentId = segId;
                                if (entry.node.nodeValue !== tgt) {
                                    entry.node.nodeValue = tgt;
                                }
                            } else if (normSrc && normSrc.length > 15 && entry.normClean.length > 15 && (entry.normClean.indexOf(normSrc) !== -1 || normSrc.indexOf(entry.normClean) !== -1)) {
                                entry.node._verbocatSegmentId = segId;
                                if (entry.node.nodeValue !== tgt) {
                                    entry.node.nodeValue = tgt;
                                }
                            } else if (tgt && (entry.normClean === normalizeText(tgt) || entry.initialClean === tgt.trim() || entry.node._verbocatOrigText.trim() === tgt.trim())) {
                                // 3. Fallback Binding if page was already in target language
                                entry.node._verbocatSegmentId = segId;
                            }
                        }
                    });
                });
            }

            // Listen for real-time translation updates from CAT Editor
            window.addEventListener('message', function(e) {
                if (!e.data || e.data.type !== 'VERBOCAT_UPDATE_SEGMENTS') return;
                applyTranslations(e.data.segments);
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

