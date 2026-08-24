<?php
/**
 * Verbocat Editor UI - Minimal, Clean & Smoothly Animated Translation Studio
 *
 * @package Verbocat_Connector
 */

if (!defined('ABSPATH')) {
    exit;
}

class Verbocat_Editor_UI {

    /**
     * Initialize editor UI hooks
     */
    public static function init() {
        add_action('add_meta_boxes', [__CLASS__, 'add_meta_boxes']);
        add_action('admin_footer', [__CLASS__, 'render_editor_scripts_and_modal']);
        add_filter('post_row_actions', [__CLASS__, 'add_row_action'], 10, 2);
        add_filter('page_row_actions', [__CLASS__, 'add_row_action'], 10, 2);

        // AJAX handlers
        add_action('wp_ajax_verbocat_manual_translate', [__CLASS__, 'ajax_manual_translate']);
        add_action('wp_ajax_verbocat_sync_from_tm', [__CLASS__, 'ajax_sync_from_tm']);
    }

    /**
     * Add Meta Box to Post / Page editor
     */
    public static function add_meta_boxes() {
        foreach (['post', 'page'] as $screen) {
            add_meta_box(
                'verbocat_post_box',
                __('Verbocat Localization', 'verbocat-connector'),
                [__CLASS__, 'render_post_meta_box'],
                $screen,
                'normal',
                'high'
            );
        }
    }

    /**
     * Render the editor meta box
     */
    public static function render_post_meta_box($post) {
        $is_translation = get_post_meta($post->ID, '_verbocat_is_translation', true);
        $source_id = get_post_meta($post->ID, '_verbocat_source_post_id', true);
        $lang = get_post_meta($post->ID, '_verbocat_lang', true);

        if ($is_translation) {
            $lang_meta = Verbocat_Languages::get_language($lang);
            ?>
            <div style="padding: 14px 16px; background: #fafafa; border: 1px solid #e4e4e7; border-radius: 8px; font-size: 13px; color: #27272a;">
                <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 18px;"><?php echo esc_html($lang_meta['flag']); ?></span>
                        <strong style="font-size: 14px; color: #18181b;"><?php echo esc_html($lang_meta['name']); ?></strong>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <a href="<?php echo get_edit_post_link($source_id); ?>" class="button button-secondary" target="_blank" style="font-size: 12px;">
                            <?php _e('Original Post', 'verbocat-connector'); ?> &rarr;
                        </a>
                        <a href="<?php echo get_permalink($post->ID); ?>" class="button button-secondary" target="_blank" style="font-size: 12px;">
                            <?php _e('View Live', 'verbocat-connector'); ?> &#x2197;
                        </a>
                    </div>
                </div>
            </div>
            <?php
            return;
        }

        $translations = get_post_meta($post->ID, '_verbocat_translations', true) ?: [];
        $opts = Verbocat_Settings::get_options();
        $target_langs = array_filter(array_map('trim', explode(',', $opts['target_langs'])));
        ?>
        <div style="font-size: 13px; color: #27272a; padding: 4px 0;">
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 14px;">
                <div>
                    <span style="font-weight: 600; font-size: 14px; color: #18181b;"><?php _e('Continuous Localization', 'verbocat-connector'); ?></span>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button type="button" class="button button-primary verbocat-open-modal-btn" style="background: #18181b; border-color: #18181b; font-weight: 500; border-radius: 6px; padding: 0 14px; height: 32px; transition: all 0.2s ease;">
                        <?php _e('Translate Page', 'verbocat-connector'); ?>
                    </button>
                    <button type="button" class="button button-secondary verbocat-sync-tm-btn" style="font-weight: 500; border-radius: 6px; height: 32px;">
                        <?php _e('Sync TM', 'verbocat-connector'); ?>
                    </button>
                </div>
            </div>

            <div class="verbocat-status-msg" style="margin: 8px 0; font-size: 13px;"></div>

            <!-- Existing Language Versions Grid -->
            <div style="margin-top: 12px; border-top: 1px solid #f4f4f5; padding-top: 12px;">
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px;">
                    <?php foreach ($target_langs as $t_lang): 
                        $t_id = $translations[$t_lang] ?? null;
                        $t_meta = Verbocat_Languages::get_language($t_lang);
                        $has_trans = $t_id && get_post($t_id);
                    ?>
                        <div style="background: <?php echo $has_trans ? '#fafafa' : '#ffffff'; ?>; border: 1px solid <?php echo $has_trans ? '#e4e4e7' : '#f4f4f5'; ?>; border-radius: 6px; padding: 8px 12px; display: flex; align-items: center; justify-content: space-between;">
                            <div style="display: flex; align-items: center; gap: 6px; font-size: 13px;">
                                <span><?php echo esc_html($t_meta['flag']); ?></span>
                                <span style="font-weight: 500; color: #18181b;"><?php echo esc_html($t_meta['name']); ?></span>
                            </div>
                            <?php if ($has_trans): ?>
                                <a href="<?php echo get_edit_post_link($t_id); ?>" target="_blank" style="font-size: 12px; color: #2563eb; text-decoration: none; font-weight: 500;">
                                    <?php _e('Edit', 'verbocat-connector'); ?> &rarr;
                                </a>
                            <?php else: ?>
                                <span style="font-size: 11px; color: #a1a1aa;"><?php _e('Pending', 'verbocat-connector'); ?></span>
                            <?php endif; ?>
                        </div>
                    <?php endforeach; ?>
                </div>
            </div>
        </div>
        <?php
    }

    /**
     * Render Gutenberg Top Bar button & Clean Minimal Animated Modal
     */
    public static function render_editor_scripts_and_modal() {
        $screen = get_current_screen();
        if (!$screen || !in_array($screen->base, ['post'])) return;
        if (!in_array($screen->post_type, ['post', 'page'])) return;

        global $post;
        if (!$post) return;

        $is_translation = get_post_meta($post->ID, '_verbocat_is_translation', true);
        if ($is_translation) return;

        $opts = Verbocat_Settings::get_options();
        $all_languages = Verbocat_Languages::get_all_languages();
        $configured_targets = array_map('trim', explode(',', $opts['target_langs']));
        $default_src = $opts['source_lang'] ?: 'en';

        // Extract components from current post
        $extracted_blocks = Verbocat_Delta_Sync::extract_content_blocks($post->post_content);
        $components = [];

        // 1. Title Component
        if (!empty($post->post_title)) {
            $components[] = [
                'key'   => '__title__',
                'badge' => 'Title',
                'type'  => 'title',
                'text'  => $post->post_title
            ];
        }

        // 2. Excerpt Component (if present)
        if (!empty($post->post_excerpt)) {
            $components[] = [
                'key'   => '__excerpt__',
                'badge' => 'Excerpt',
                'type'  => 'excerpt',
                'text'  => $post->post_excerpt
            ];
        }

        // 3. Content Blocks / Headings / Paragraphs
        foreach ($extracted_blocks as $idx => $b) {
            if (!$b['is_tag'] && !empty($b['clean_text'])) {
                $raw = $b['raw_html'];
                $badge = 'Paragraph';
                $type = 'paragraph';

                if (preg_match('/<h([1-6])/i', $raw, $m)) {
                    $badge = 'Heading ' . $m[1];
                    $type = 'heading';
                } else if (str_contains($raw, '<li')) {
                    $badge = 'List';
                    $type = 'list';
                } else if (str_contains($raw, '<blockquote')) {
                    $badge = 'Quote';
                    $type = 'quote';
                } else if (str_contains($raw, '<button') || str_contains($raw, 'wp-block-button')) {
                    $badge = 'Button';
                    $type = 'button';
                }

                $components[] = [
                    'key'   => 'block_' . $idx,
                    'badge' => $badge,
                    'type'  => $type,
                    'text'  => $b['clean_text']
                ];
            }
        }
        ?>

        <!-- Clean Minimal Animated Translation Modal -->
        <div id="verbocat-lang-modal" class="vb-modal-overlay" style="display: none;">
            
            <div class="vb-modal-card">
                
                <!-- Progress Line Animation (Active during translation) -->
                <div id="vb-top-progress" class="vb-progress-bar" style="display: none;"></div>

                <!-- Header -->
                <div class="vb-modal-header">
                    <div>
                        <h2 style="margin: 0; font-size: 16px; font-weight: 600; color: #18181b; line-height: 1.3;"><?php _e('Translate Content', 'verbocat-connector'); ?></h2>
                        <p style="margin: 2px 0 0 0; color: #71717a; font-size: 13px;"><?php _e('Choose target languages and select components to translate.', 'verbocat-connector'); ?></p>
                    </div>
                    <button type="button" id="verbocat-modal-close" class="vb-close-btn">&times;</button>
                </div>

                <!-- 2-Column Body -->
                <div class="vb-modal-body">
                    
                    <!-- Left Column: Languages (35% width) -->
                    <div class="vb-left-col">
                        
                        <!-- Source Language -->
                        <div>
                            <label for="vb_modal_source_lang" class="vb-col-label">
                                <?php _e('Source Language', 'verbocat-connector'); ?>
                            </label>
                            <select id="vb_modal_source_lang" class="vb-select">
                                <?php foreach ($all_languages as $code => $info): ?>
                                    <option value="<?php echo esc_attr($code); ?>" <?php selected($code, $default_src); ?>>
                                        <?php echo esc_html($info['flag'] . ' ' . $info['name']); ?>
                                    </option>
                                <?php endforeach; ?>
                            </select>
                        </div>

                        <!-- Target Languages -->
                        <div style="flex: 1; display: flex; flex-direction: column; min-height: 220px;">
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                                <label class="vb-col-label">
                                    <?php _e('Target Languages', 'verbocat-connector'); ?>
                                </label>
                                <div style="font-size: 11px;">
                                    <a href="#" id="vb-select-all" class="vb-text-btn"><?php _e('All', 'verbocat-connector'); ?></a> •
                                    <a href="#" id="vb-clear-all" class="vb-text-btn-muted"><?php _e('Clear', 'verbocat-connector'); ?></a>
                                </div>
                            </div>

                            <input type="text" id="vb-lang-search" placeholder="<?php _e('Search languages...', 'verbocat-connector'); ?>" class="vb-input-search" />

                            <div id="vb-lang-list" class="vb-scroll-box">
                                <?php foreach ($all_languages as $code => $info): 
                                    $is_checked = in_array($code, $configured_targets);
                                ?>
                                    <label class="vb-lang-tile" data-search="<?php echo esc_attr(strtolower($info['name'] . ' ' . $info['native'])); ?>">
                                        <span style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: #27272a;">
                                            <span><?php echo esc_html($info['flag']); ?></span>
                                            <span><?php echo esc_html($info['name']); ?></span>
                                        </span>
                                        <input type="checkbox" class="vb-target-lang-cb" value="<?php echo esc_attr($code); ?>" <?php checked($is_checked); ?> style="accent-color: #18181b; width: 15px; height: 15px;" />
                                    </label>
                                <?php endforeach; ?>
                            </div>
                        </div>

                    </div>

                    <!-- Right Column: Components List (65% width) -->
                    <div class="vb-right-col">
                        
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #f4f4f5;">
                            <div>
                                <span class="vb-col-label" style="color: #18181b;">
                                    <?php _e('Components', 'verbocat-connector'); ?>
                                </span>
                                <span id="vb-comp-count" style="color: #71717a; font-size: 12px; margin-left: 6px;">
                                    (<?php echo count($components); ?>/<?php echo count($components); ?> selected)
                                </span>
                            </div>
                            <div style="font-size: 12px;">
                                <a href="#" id="vb-comp-select-all" class="vb-text-btn"><?php _e('Select all', 'verbocat-connector'); ?></a> •
                                <a href="#" id="vb-comp-clear-all" class="vb-text-btn-muted"><?php _e('Clear', 'verbocat-connector'); ?></a>
                            </div>
                        </div>

                        <!-- Clean Animated Components List -->
                        <div id="vb-components-list" class="vb-components-scroll">
                            <?php if (empty($components)): ?>
                                <div style="text-align: center; padding: 40px 20px; color: #71717a; font-size: 13px;">
                                    <?php _e('No text content found on this page.', 'verbocat-connector'); ?>
                                </div>
                            <?php else: ?>
                                <?php foreach ($components as $index => $comp): ?>
                                    <div class="vb-comp-card active" style="animation-delay: <?php echo ($index * 0.04); ?>s;">
                                        
                                        <input type="checkbox" class="vb-component-cb" value="<?php echo esc_attr($comp['key']); ?>" checked style="accent-color: #18181b; width: 16px; height: 16px; margin-top: 2px; cursor: pointer;" />
                                        
                                        <div style="flex: 1; min-width: 0;">
                                            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                                                <span class="vb-badge">
                                                    <?php echo esc_html($comp['badge']); ?>
                                                </span>
                                            </div>
                                            <div class="vb-comp-text">
                                                <?php echo esc_html(wp_trim_words($comp['text'], 22, '...')); ?>
                                            </div>
                                        </div>

                                    </div>
                                <?php endforeach; ?>
                            <?php endif; ?>
                        </div>

                    </div>

                </div>

                <!-- Footer -->
                <div class="vb-modal-footer">
                    
                    <div id="vb-modal-status" class="vb-status-area"></div>

                    <div style="display: flex; gap: 8px; align-items: center;">
                        <button type="button" id="vb-modal-cancel-btn" class="vb-btn-secondary"><?php _e('Cancel', 'verbocat-connector'); ?></button>
                        <button type="button" id="vb-modal-start-btn" class="vb-btn-primary">
                            <span class="vb-btn-text"><?php _e('Translate Content', 'verbocat-connector'); ?></span>
                        </button>
                    </div>

                </div>

            </div>
        </div>

        <style>
        /* Smooth Modern Modal Animations */
        .vb-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.45);
            backdrop-filter: blur(5px);
            -webkit-backdrop-filter: blur(5px);
            z-index: 999999;
            justify-content: center;
            align-items: center;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            box-sizing: border-box;
            opacity: 0;
            transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .vb-modal-overlay.vb-visible {
            opacity: 1;
        }

        .vb-modal-card {
            background: #ffffff;
            width: 92%;
            max-width: 860px;
            height: 82vh;
            max-height: 680px;
            border-radius: 12px;
            border: 1px solid #e4e4e7;
            box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.15);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            transform: translateY(12px) scale(0.98);
            transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            position: relative;
        }
        .vb-modal-overlay.vb-visible .vb-modal-card {
            transform: translateY(0) scale(1);
        }

        /* Top Shimmering Progress Bar */
        .vb-progress-bar {
            height: 2.5px;
            width: 100%;
            background: linear-gradient(90deg, #2563eb, #38bdf8, #2563eb);
            background-size: 200% 100%;
            animation: vbGradientMove 1.4s infinite linear;
            position: absolute;
            top: 0;
            left: 0;
            z-index: 10;
        }
        @keyframes vbGradientMove {
            0% { background-position: 100% 0; }
            100% { background-position: -100% 0; }
        }

        .vb-modal-header {
            padding: 16px 24px;
            border-bottom: 1px solid #f4f4f5;
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: #ffffff;
        }

        .vb-close-btn {
            background: transparent;
            border: none;
            font-size: 20px;
            color: #a1a1aa;
            cursor: pointer;
            border-radius: 6px;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.15s ease;
        }
        .vb-close-btn:hover {
            background: #f4f4f5;
            color: #18181b;
        }

        .vb-modal-body {
            display: flex;
            flex: 1;
            overflow: hidden;
            background: #ffffff;
        }

        .vb-left-col {
            width: 35%;
            border-right: 1px solid #f4f4f5;
            padding: 20px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 16px;
            background: #fafafa;
        }

        .vb-right-col {
            width: 65%;
            padding: 20px 24px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            background: #ffffff;
        }

        .vb-col-label {
            display: block;
            font-weight: 600;
            font-size: 11px;
            color: #71717a;
            margin-bottom: 6px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .vb-select {
            width: 100%;
            height: 38px;
            border-radius: 6px;
            border: 1px solid #e4e4e7;
            font-size: 13px;
            padding: 0 10px;
            background: #ffffff;
            color: #18181b;
            outline: none;
            transition: border-color 0.15s ease;
        }
        .vb-select:focus {
            border-color: #18181b;
        }

        .vb-input-search {
            width: 100%;
            height: 34px;
            border-radius: 6px;
            border: 1px solid #e4e4e7;
            font-size: 12px;
            padding: 0 10px;
            margin-bottom: 8px;
            background: #ffffff;
            color: #18181b;
            outline: none;
            transition: border-color 0.15s ease;
        }
        .vb-input-search:focus {
            border-color: #18181b;
        }

        .vb-scroll-box {
            flex: 1;
            max-height: 240px;
            overflow-y: auto;
            border: 1px solid #e4e4e7;
            border-radius: 6px;
            padding: 4px;
            background: #ffffff;
            display: flex;
            flex-direction: column;
            gap: 2px;
        }

        .vb-lang-tile {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 7px 9px;
            border-radius: 4px;
            cursor: pointer;
            transition: background 0.15s ease;
        }
        .vb-lang-tile:hover {
            background: #f4f4f5;
        }

        .vb-components-scroll {
            flex: 1;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        /* Smooth Animated Component Card */
        .vb-comp-card {
            border: 1px solid #e4e4e7;
            border-radius: 6px;
            padding: 10px 12px;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            display: flex;
            align-items: flex-start;
            gap: 10px;
            background: #ffffff;
            animation: vbCardFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) backwards;
        }
        .vb-comp-card:hover {
            border-color: #a1a1aa;
            transform: translateY(-1px);
        }
        .vb-comp-card.vb-translating {
            border-color: #3b82f6;
            background: #fafcff;
            box-shadow: 0 0 0 1px #3b82f6;
        }

        @keyframes vbCardFadeIn {
            from { opacity: 0; transform: translateY(6px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .vb-badge {
            background: #f4f4f5;
            color: #52525b;
            font-size: 11px;
            font-weight: 600;
            padding: 1px 6px;
            border-radius: 3px;
        }

        .vb-comp-text {
            font-size: 13px;
            color: #27272a;
            line-height: 1.4;
            word-break: break-word;
        }

        .vb-text-btn {
            color: #18181b;
            text-decoration: underline;
            font-weight: 500;
        }
        .vb-text-btn-muted {
            color: #71717a;
            text-decoration: none;
        }

        .vb-modal-footer {
            padding: 14px 24px;
            border-top: 1px solid #f4f4f5;
            background: #ffffff;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .vb-status-area {
            font-size: 13px;
            color: #71717a;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: all 0.2s ease;
        }

        .vb-btn-secondary {
            height: 36px;
            padding: 0 14px;
            font-size: 13px;
            border-radius: 6px;
            color: #52525b;
            background: #ffffff;
            border: 1px solid #e4e4e7;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.15s ease;
        }
        .vb-btn-secondary:hover {
            background: #f4f4f5;
            color: #18181b;
        }

        .vb-btn-primary {
            background: #18181b;
            color: #ffffff;
            border: 1px solid #18181b;
            height: 36px;
            padding: 0 18px;
            font-size: 13px;
            font-weight: 500;
            border-radius: 6px;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .vb-btn-primary:hover {
            background: #27272a;
            border-color: #27272a;
            transform: translateY(-1px);
        }
        .vb-btn-primary:active {
            transform: translateY(0);
        }
        .vb-btn-primary:disabled {
            opacity: 0.7;
            cursor: not-allowed;
            transform: none;
        }

        /* Minimal Pulsing Ring */
        .vb-pulse-dot {
            width: 8px;
            height: 8px;
            background: #2563eb;
            border-radius: 50%;
            animation: vbPulse 1.2s infinite ease-in-out;
            display: inline-block;
        }
        @keyframes vbPulse {
            0% { transform: scale(0.8); opacity: 0.5; }
            50% { transform: scale(1.3); opacity: 1; }
            100% { transform: scale(0.8); opacity: 0.5; }
        }
        </style>

        <script>
        jQuery(document).ready(function($) {
            // 1. Inject minimal button into Gutenberg Top Toolbar
            function injectGutenbergButton() {
                var $header = $('.edit-post-header__settings, .editor-header__settings');
                if ($header.length && !$('#verbocat-gutenberg-header-btn').length) {
                    var $topBtn = $('<button type="button" id="verbocat-gutenberg-header-btn" class="components-button is-primary verbocat-open-modal-btn" style="background: #18181b; margin-right: 8px; font-weight: 500; border-radius: 4px; font-size: 13px; height: 32px; transition: all 0.2s ease;"><?php _e('Translate Page', 'verbocat-connector'); ?></button>');
                    $header.prepend($topBtn);
                }
            }
            setInterval(injectGutenbergButton, 1000);

            // 2. Open Modal Dialog with smooth animation
            $(document).on('click', '.verbocat-open-modal-btn', function(e) {
                e.preventDefault();
                $('#vb-modal-status').empty();
                $('#vb-top-progress').hide();
                $('#verbocat-lang-modal').css('display', 'flex');
                setTimeout(function() {
                    $('#verbocat-lang-modal').addClass('vb-visible');
                }, 10);
                updateComponentCounter();
            });

            // 3. Close Modal with smooth animation
            $('#verbocat-modal-close, #vb-modal-cancel-btn').on('click', function() {
                $('#verbocat-lang-modal').removeClass('vb-visible');
                setTimeout(function() {
                    $('#verbocat-lang-modal').hide();
                }, 200);
            });

            // 4. Search Filter for Languages
            $('#vb-lang-search').on('keyup', function() {
                var q = $(this).val().toLowerCase().trim();
                $('.vb-lang-tile').each(function() {
                    var searchData = $(this).attr('data-search') || '';
                    if (!q || searchData.indexOf(q) > -1) {
                        $(this).show();
                    } else {
                        $(this).hide();
                    }
                });
            });

            // 5. Languages Select / Clear All
            $('#vb-select-all').on('click', function(e) {
                e.preventDefault();
                $('.vb-target-lang-cb').prop('checked', true);
            });
            $('#vb-clear-all').on('click', function(e) {
                e.preventDefault();
                $('.vb-target-lang-cb').prop('checked', false);
            });

            // 6. Components Card Click to Toggle
            $(document).on('click', '.vb-comp-card', function(e) {
                if (!$(e.target).is('input[type="checkbox"]')) {
                    var $cb = $(this).find('.vb-component-cb');
                    $cb.prop('checked', !$cb.is(':checked')).trigger('change');
                }
            });

            $(document).on('change', '.vb-component-cb', function() {
                var $card = $(this).closest('.vb-comp-card');
                if ($(this).is(':checked')) {
                    $card.css('opacity', '1').css('border-color', '#e4e4e7');
                } else {
                    $card.css('opacity', '0.5').css('border-color', '#f4f4f5');
                }
                updateComponentCounter();
            });

            function updateComponentCounter() {
                var total = $('.vb-component-cb').length;
                var checked = $('.vb-component-cb:checked').length;
                $('#vb-comp-count').text('(' + checked + '/' + total + ' selected)');
            }

            $('#vb-comp-select-all').on('click', function(e) {
                e.preventDefault();
                $('.vb-component-cb').prop('checked', true).trigger('change');
            });
            $('#vb-comp-clear-all').on('click', function(e) {
                e.preventDefault();
                $('.vb-component-cb').prop('checked', false).trigger('change');
            });

            // 7. Start Translation Execution with Smooth Neural Animation
            $('#vb-modal-start-btn').on('click', function(e) {
                e.preventDefault();
                var $btn = $(this);
                var $status = $('#vb-modal-status');
                var $progress = $('#vb-top-progress');

                var selectedTargets = [];
                $('.vb-target-lang-cb:checked').each(function() {
                    selectedTargets.push($(this).val());
                });

                if (selectedTargets.length === 0) {
                    $status.html('<span style="color: #b91c1c; font-size: 12px;"><?php _e('Please select at least one language.', 'verbocat-connector'); ?></span>');
                    return;
                }

                var selectedComponents = [];
                $('.vb-component-cb:checked').each(function() {
                    selectedComponents.push($(this).val());
                });

                if (selectedComponents.length === 0) {
                    $status.html('<span style="color: #b91c1c; font-size: 12px;"><?php _e('Please select at least one component.', 'verbocat-connector'); ?></span>');
                    return;
                }

                var sourceLang = $('#vb_modal_source_lang').val();

                // Activate smooth translation animation
                $btn.prop('disabled', true);
                $btn.find('.vb-btn-text').text('<?php _e('Translating...', 'verbocat-connector'); ?>');
                $progress.show();
                $('.vb-comp-card').addClass('vb-translating');

                $status.html('<span style="color: #2563eb; font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 6px;"><span class="vb-pulse-dot"></span><?php _e('Translating selected content...', 'verbocat-connector'); ?></span>');

                $.post(ajaxurl, {
                    action: 'verbocat_manual_translate',
                    post_id: <?php echo $post->ID; ?>,
                    source_lang: sourceLang,
                    target_langs: selectedTargets,
                    selected_components: selectedComponents,
                    delta_sync: 1, // Always automated
                    nonce: '<?php echo wp_create_nonce('verbocat_translate_' . $post->ID); ?>'
                }, function(res) {
                    $progress.hide();
                    $('.vb-comp-card').removeClass('vb-translating');
                    $btn.prop('disabled', false);
                    $btn.find('.vb-btn-text').text('<?php _e('Translate Content', 'verbocat-connector'); ?>');

                    if (res.success) {
                        $status.html('<span style="color: #16a34a; font-size: 13px; font-weight: 500;">✓ ' + res.data.message + '</span>');
                        setTimeout(function() { window.location.reload(); }, 900);
                    } else {
                        $status.html('<span style="color: #b91c1c; font-size: 12px;">' + (res.data ? res.data.message : 'Translation failed') + '</span>');
                    }
                }).fail(function() {
                    $progress.hide();
                    $('.vb-comp-card').removeClass('vb-translating');
                    $btn.prop('disabled', false);
                    $btn.find('.vb-btn-text').text('<?php _e('Translate Content', 'verbocat-connector'); ?>');
                    $status.html('<span style="color: #b91c1c; font-size: 12px;"><?php _e('Network error. Check your API settings.', 'verbocat-connector'); ?></span>');
                });
            });

            // 8. Sync from TM Button
            $(document).on('click', '.verbocat-sync-tm-btn', function(e) {
                e.preventDefault();
                var $btn = $(this);
                var $msg = $('.verbocat-status-msg');

                $btn.prop('disabled', true).text('<?php _e('Syncing...', 'verbocat-connector'); ?>');
                $msg.html('<span style="color: #2563eb; font-size: 12px; display: flex; align-items: center; gap: 6px;"><span class="vb-pulse-dot"></span><?php _e('Fetching TM records...', 'verbocat-connector'); ?></span>');

                $.post(ajaxurl, {
                    action: 'verbocat_sync_from_tm',
                    post_id: <?php echo $post->ID; ?>,
                    nonce: '<?php echo wp_create_nonce('verbocat_tm_' . $post->ID); ?>'
                }, function(res) {
                    $btn.prop('disabled', false).text('<?php _e('Sync TM', 'verbocat-connector'); ?>');
                    if (res.success) {
                        $msg.html('<span style="color: #16a34a; font-size: 12px;">✓ ' + res.data.message + '</span>');
                        setTimeout(function() { window.location.reload(); }, 900);
                    } else {
                        $msg.html('<span style="color: #b91c1c; font-size: 12px;">' + (res.data ? res.data.message : 'Sync failed') + '</span>');
                    }
                });
            });
        });
        </script>
        <?php
    }

    /**
     * Row action link in list screens
     */
    public static function add_row_action($actions, $post) {
        $is_translation = get_post_meta($post->ID, '_verbocat_is_translation', true);
        if (!$is_translation) {
            $actions['verbocat_translate'] = '<a href="' . esc_url(get_edit_post_link($post->ID)) . '" style="color: #18181b; font-weight: 500;">' . __('Translate', 'verbocat-connector') . '</a>';
        }
        return $actions;
    }

    /**
     * AJAX handler for manual translate action (with Component & Language selections)
     */
    public static function ajax_manual_translate() {
        $post_id = intval($_POST['post_id'] ?? 0);
        check_ajax_referer('verbocat_translate_' . $post_id, 'nonce');

        if (!current_user_can('edit_post', $post_id)) {
            wp_send_json_error(['message' => 'Permission denied.']);
        }

        $post = get_post($post_id);
        if (!$post) {
            wp_send_json_error(['message' => 'Post not found.']);
        }

        $source_lang = sanitize_text_field($_POST['source_lang'] ?? 'en');
        $raw_targets = $_POST['target_langs'] ?? [];
        $target_langs = is_array($raw_targets) ? array_map('sanitize_text_field', $raw_targets) : [];
        $raw_components = $_POST['selected_components'] ?? null;
        $selected_components = is_array($raw_components) ? array_map('sanitize_text_field', $raw_components) : null;
        $use_delta = true; // Always automated

        $result = Verbocat_Delta_Sync::sync_post($post, $target_langs, $source_lang, $use_delta, $selected_components);

        if (is_wp_error($result)) {
            wp_send_json_error(['message' => $result->get_error_message()]);
        }

        wp_send_json_success(['message' => is_string($result) ? $result : 'Translations updated.']);
    }

    /**
     * AJAX handler for Sync from TM button
     */
    public static function ajax_sync_from_tm() {
        $post_id = intval($_POST['post_id'] ?? 0);
        check_ajax_referer('verbocat_tm_' . $post_id, 'nonce');

        if (!current_user_can('edit_post', $post_id)) {
            wp_send_json_error(['message' => 'Permission denied.']);
        }

        $post = get_post($post_id);
        if (!$post) {
            wp_send_json_error(['message' => 'Post not found.']);
        }

        $result = Verbocat_Delta_Sync::sync_post($post, null, null, false);

        if (is_wp_error($result)) {
            wp_send_json_error(['message' => $result->get_error_message()]);
        }

        wp_send_json_success(['message' => 'Translation Memory synchronized.']);
    }
}
