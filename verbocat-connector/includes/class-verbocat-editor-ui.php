<?php
/**
 * Verbocat Editor UI, Component Studio, Language Modal & AJAX Handlers
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
                __('🌐 Verbocat Continuous Localization & TM', 'verbocat-connector'),
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
            <div style="padding: 16px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; font-size: 14px;">
                <p style="margin: 0 0 12px 0; display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 24px;"><?php echo esc_html($lang_meta['flag']); ?></span>
                    <strong style="font-size: 15px;"><?php _e('Automated Translation:', 'verbocat-connector'); ?></strong> 
                    <span style="background: #2563eb; color: #fff; padding: 3px 10px; border-radius: 6px; font-weight: 700; text-transform: uppercase; font-size: 12px;"><?php echo esc_html($lang_meta['name']); ?> (<?php echo esc_html($lang); ?>)</span>
                </p>
                <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                    <a href="<?php echo get_edit_post_link($source_id); ?>" class="button button-secondary" target="_blank">
                        <?php _e('Edit Original Source Post #', 'verbocat-connector'); ?><?php echo esc_html($source_id); ?> &rarr;
                    </a>
                    <a href="<?php echo get_permalink($post->ID); ?>" class="button button-secondary" target="_blank">
                        <?php _e('View Live Translated Page', 'verbocat-connector'); ?> &#x2197;
                    </a>
                </div>
            </div>
            <?php
            return;
        }

        $translations = get_post_meta($post->ID, '_verbocat_translations', true) ?: [];
        $opts = Verbocat_Settings::get_options();
        $target_langs = array_filter(array_map('trim', explode(',', $opts['target_langs'])));
        ?>
        <div style="font-size: 14px; padding: 8px 0;">
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 16px;">
                <div>
                    <strong style="font-size: 16px; color: #0f172a;"><?php _e('Continuous Localization Studio & TM', 'verbocat-connector'); ?></strong>
                    <p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">
                        <?php _e('Configured target languages:', 'verbocat-connector'); ?> 
                        <strong><?php echo esc_html($opts['target_langs']); ?></strong>
                    </p>
                </div>
                <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                    <button type="button" class="button button-primary button-large verbocat-open-modal-btn" style="background: #2563eb; border-color: #1d4ed8; font-weight: 600; padding: 2px 18px; border-radius: 6px; box-shadow: 0 2px 4px rgba(37,99,235,0.2);">
                        <span class="dashicons dashicons-translation" style="vertical-align: middle; margin-right: 6px;"></span>
                        <?php _e('Open Translation Studio 🌐', 'verbocat-connector'); ?>
                    </button>
                    <button type="button" class="button button-secondary button-large verbocat-sync-tm-btn" style="font-weight: 600; border-radius: 6px;">
                        <span class="dashicons dashicons-update" style="vertical-align: middle; margin-right: 4px;"></span>
                        <?php _e('Sync from TM 🔄', 'verbocat-connector'); ?>
                    </button>
                </div>
            </div>

            <div class="verbocat-status-msg" style="margin: 10px 0; font-size: 14px;"></div>

            <!-- Existing Language Versions Grid -->
            <div style="margin-top: 14px; border-top: 1px solid #e2e8f0; padding-top: 14px;">
                <strong style="color: #334155; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;"><?php _e('Live Language Versions:', 'verbocat-connector'); ?></strong>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; margin-top: 10px;">
                    <?php foreach ($target_langs as $t_lang): 
                        $t_id = $translations[$t_lang] ?? null;
                        $t_meta = Verbocat_Languages::get_language($t_lang);
                        $has_trans = $t_id && get_post($t_id);
                    ?>
                        <div style="background: <?php echo $has_trans ? '#f8fafc' : '#ffffff'; ?>; border: 1px solid <?php echo $has_trans ? '#cbd5e1' : '#e2e8f0'; ?>; border-radius: 8px; padding: 12px 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                                <span style="font-weight: 700; font-size: 14px; display: flex; align-items: center; gap: 8px;">
                                    <span style="font-size: 18px;"><?php echo esc_html($t_meta['flag']); ?></span>
                                    <span><?php echo esc_html($t_meta['native']); ?></span>
                                </span>
                                <span style="background: <?php echo $has_trans ? '#15803d' : '#94a3b8'; ?>; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 10px; text-transform: uppercase;">
                                    <?php echo $has_trans ? esc_html(get_post_status($t_id)) : 'Pending'; ?>
                                </span>
                            </div>
                            <?php if ($has_trans): ?>
                                <div style="font-size: 13px; margin-top: 6px;">
                                    <a href="<?php echo get_edit_post_link($t_id); ?>" target="_blank" style="font-weight: 600; text-decoration: none; color: #0284c7; display: inline-flex; align-items: center; gap: 4px;">
                                        <?php echo esc_html(get_the_title($t_id) ?: __('View Translated Post', 'verbocat-connector')); ?> &rarr;
                                    </a>
                                </div>
                            <?php else: ?>
                                <span style="font-size: 12px; color: #64748b;"><?php _e('Not generated yet', 'verbocat-connector'); ?></span>
                            <?php endif; ?>
                        </div>
                    <?php endforeach; ?>
                </div>
            </div>
        </div>
        <?php
    }

    /**
     * Render Gutenberg Top Bar button & Spacious Language Studio Modal
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

        // Extract components from the current post
        $extracted_blocks = Verbocat_Delta_Sync::extract_content_blocks($post->post_content);
        $components = [];

        // 1. Title Component
        if (!empty($post->post_title)) {
            $components[] = [
                'key'       => '__title__',
                'badge'     => '🏷️ Title',
                'type'      => 'title',
                'text'      => $post->post_title,
                'wordcount' => str_word_count($post->post_title)
            ];
        }

        // 2. Excerpt Component (if present)
        if (!empty($post->post_excerpt)) {
            $components[] = [
                'key'       => '__excerpt__',
                'badge'     => '📝 Excerpt',
                'type'      => 'excerpt',
                'text'      => $post->post_excerpt,
                'wordcount' => str_word_count($post->post_excerpt)
            ];
        }

        // 3. Content Blocks / Headings / Paragraphs
        foreach ($extracted_blocks as $idx => $b) {
            if (!$b['is_tag'] && !empty($b['clean_text'])) {
                $raw = $b['raw_html'];
                $badge = '📄 Paragraph';
                $type = 'paragraph';

                if (preg_match('/<h([1-6])/i', $raw, $m)) {
                    $badge = '📌 Heading H' . $m[1];
                    $type = 'heading';
                } else if (str_contains($raw, '<li')) {
                    $badge = '📋 List Item';
                    $type = 'list';
                } else if (str_contains($raw, '<blockquote')) {
                    $badge = '💬 Quote';
                    $type = 'quote';
                } else if (str_contains($raw, '<button') || str_contains($raw, 'wp-block-button')) {
                    $badge = '🔘 Button';
                    $type = 'button';
                }

                $components[] = [
                    'key'       => 'block_' . $idx,
                    'badge'     => $badge,
                    'type'      => $type,
                    'text'      => $b['clean_text'],
                    'wordcount' => str_word_count($b['clean_text'])
                ];
            }
        }
        ?>

        <!-- Spacious Modern Verbocat Studio Modal -->
        <div id="verbocat-lang-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(6px); z-index: 999999; justify-content: center; align-items: center; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; box-sizing: border-box;">
            
            <div style="background: #ffffff; width: 94%; max-width: 980px; height: 90vh; max-height: 780px; border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35); display: flex; flex-direction: column; overflow: hidden; animation: vbModalFadeIn 0.2s ease;">
                
                <!-- Modal Top Header -->
                <div style="padding: 16px 28px; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between; background: #ffffff;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="background: #eff6ff; color: #2563eb; width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 20px;">
                            🌐
                        </div>
                        <div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <h2 style="margin: 0; font-size: 18px; font-weight: 700; color: #0f172a; line-height: 1.2;"><?php _e('Verbocat Translation Studio', 'verbocat-connector'); ?></h2>
                                <span style="background: #f1f5f9; color: #475569; font-size: 11px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">v2.2</span>
                            </div>
                            <p style="margin: 2px 0 0 0; color: #64748b; font-size: 13px;"><?php _e('Select target languages and choose specific page components to translate.', 'verbocat-connector'); ?></p>
                        </div>
                    </div>
                    <button type="button" id="verbocat-modal-close" style="background: #f1f5f9; border: none; font-size: 18px; color: #64748b; cursor: pointer; border-radius: 50%; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease;" onmouseover="this.style.background='#e2e8f0'; this.style.color='#0f172a';" onmouseout="this.style.background='#f1f5f9'; this.style.color='#64748b';">&times;</button>
                </div>

                <!-- Modal Two-Column Main Studio Body -->
                <div style="display: flex; flex: 1; overflow: hidden; background: #f8fafc;">
                    
                    <!-- LEFT COLUMN: Language Controls & Engine Settings (38% width) -->
                    <div style="width: 38%; border-right: 1px solid #e2e8f0; padding: 22px 24px; overflow-y: auto; display: flex; flex-direction: column; gap: 18px; background: #ffffff;">
                        
                        <!-- Source Language Card -->
                        <div>
                            <label for="vb_modal_source_lang" style="display: block; font-weight: 700; font-size: 13px; color: #334155; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.4px;">
                                📍 <?php _e('Source Language', 'verbocat-connector'); ?>
                            </label>
                            <select id="vb_modal_source_lang" style="width: 100%; height: 42px; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 14px; font-weight: 500; padding: 0 10px; background: #f8fafc;">
                                <?php foreach ($all_languages as $code => $info): ?>
                                    <option value="<?php echo esc_attr($code); ?>" <?php selected($code, $default_src); ?>>
                                        <?php echo esc_html($info['flag'] . ' ' . $info['name'] . ' (' . $info['native'] . ')'); ?>
                                    </option>
                                <?php endforeach; ?>
                            </select>
                        </div>

                        <!-- Target Languages Section -->
                        <div style="flex: 1; display: flex; flex-direction: column; min-height: 240px;">
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                                <label style="font-weight: 700; font-size: 13px; color: #334155; text-transform: uppercase; letter-spacing: 0.4px;">
                                    🎯 <?php _e('Target Languages', 'verbocat-connector'); ?>
                                </label>
                                <div style="font-size: 12px;">
                                    <a href="#" id="vb-select-all" style="color: #2563eb; text-decoration: none; font-weight: 600; margin-right: 6px;"><?php _e('All', 'verbocat-connector'); ?></a> |
                                    <a href="#" id="vb-clear-all" style="color: #64748b; text-decoration: none; margin-left: 6px;"><?php _e('Clear', 'verbocat-connector'); ?></a>
                                </div>
                            </div>

                            <!-- Search Filter Input -->
                            <input type="text" id="vb-lang-search" placeholder="<?php _e('🔍 Search languages...', 'verbocat-connector'); ?>" style="width: 100%; height: 36px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 13px; padding: 0 10px; margin-bottom: 8px; background: #fff;" />

                            <!-- Languages Scroll Container -->
                            <div id="vb-lang-list" style="flex: 1; max-height: 230px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px; background: #f8fafc; display: flex; flex-direction: column; gap: 4px;">
                                <?php foreach ($all_languages as $code => $info): 
                                    $is_checked = in_array($code, $configured_targets);
                                ?>
                                    <label class="vb-lang-tile" style="display: flex; align-items: center; justify-content: space-between; padding: 7px 10px; border-radius: 6px; background: #ffffff; border: 1px solid <?php echo $is_checked ? '#93c5fd' : '#e2e8f0'; ?>; cursor: pointer; transition: all 0.15s ease;" data-search="<?php echo esc_attr(strtolower($info['name'] . ' ' . $info['native'] . ' ' . $code)); ?>">
                                        <span style="display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 500; color: #1e293b;">
                                            <span style="font-size: 16px;"><?php echo esc_html($info['flag']); ?></span>
                                            <span><?php echo esc_html($info['native']); ?></span>
                                            <span style="color: #64748b; font-size: 11px;">(<?php echo esc_html($info['name']); ?>)</span>
                                        </span>
                                        <input type="checkbox" class="vb-target-lang-cb" value="<?php echo esc_attr($code); ?>" <?php checked($is_checked); ?> style="accent-color: #2563eb; width: 16px; height: 16px;" />
                                    </label>
                                <?php endforeach; ?>
                            </div>
                        </div>

                        <!-- Smart Delta Sync Card -->
                        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 14px;">
                            <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; color: #166534; cursor: pointer;">
                                <input type="checkbox" id="vb_modal_delta_sync" value="1" <?php checked($opts['delta_sync'], '1'); ?> style="accent-color: #16a34a; width: 16px; height: 16px;" />
                                <span>⚡ <?php _e('Smart Delta Sync & TM', 'verbocat-connector'); ?></span>
                            </label>
                            <p style="margin: 4px 0 0 24px; font-size: 11px; color: #15803d; line-height: 1.4;">
                                <?php _e('Reuses cached sentences to avoid paying twice for unchanged text.', 'verbocat-connector'); ?>
                            </p>
                        </div>

                    </div>

                    <!-- RIGHT COLUMN: Granular Component & Block Selector Studio (62% width) -->
                    <div style="width: 62%; padding: 22px 24px; overflow-y: auto; display: flex; flex-direction: column;">
                        
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                            <div>
                                <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 8px;">
                                    🧩 <?php _e('Page Components & Blocks', 'verbocat-connector'); ?>
                                    <span id="vb-comp-count" style="background: #eff6ff; color: #2563eb; font-size: 12px; font-weight: 700; padding: 2px 8px; border-radius: 20px;">
                                        <?php echo count($components); ?>/<?php echo count($components); ?> selected
                                    </span>
                                </h3>
                                <p style="margin: 2px 0 0 0; color: #64748b; font-size: 12px;"><?php _e('Check the components you want translated. Unchecked items remain untouched.', 'verbocat-connector'); ?></p>
                            </div>
                            
                            <!-- Filter buttons -->
                            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                                <button type="button" id="vb-comp-select-all" class="button button-small" style="font-size: 11px;"><?php _e('Select All', 'verbocat-connector'); ?></button>
                                <button type="button" id="vb-comp-clear-all" class="button button-small" style="font-size: 11px;"><?php _e('Deselect All', 'verbocat-connector'); ?></button>
                                <button type="button" id="vb-comp-headings-only" class="button button-small" style="font-size: 11px;"><?php _e('Headings Only', 'verbocat-connector'); ?></button>
                            </div>
                        </div>

                        <!-- Components Cards List -->
                        <div id="vb-components-list" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; padding-right: 4px;">
                            <?php if (empty($components)): ?>
                                <div style="text-align: center; padding: 40px 20px; background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 12px; color: #64748b;">
                                    <span style="font-size: 32px; display: block; margin-bottom: 8px;">📄</span>
                                    <strong><?php _e('No Text Content Found', 'verbocat-connector'); ?></strong>
                                    <p style="margin: 4px 0 0 0; font-size: 13px;"><?php _e('Add headings or paragraphs in the WordPress editor, then click Translate.', 'verbocat-connector'); ?></p>
                                </div>
                            <?php else: ?>
                                <?php foreach ($components as $index => $comp): ?>
                                    <div class="vb-comp-card active" data-type="<?php echo esc_attr($comp['type']); ?>" style="background: #ffffff; border: 1.5px solid #2563eb; border-radius: 10px; padding: 12px 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); cursor: pointer; transition: all 0.15s ease; display: flex; align-items: flex-start; gap: 12px;">
                                        
                                        <!-- Checkbox -->
                                        <input type="checkbox" class="vb-component-cb" value="<?php echo esc_attr($comp['key']); ?>" checked style="accent-color: #2563eb; width: 18px; height: 18px; margin-top: 3px; cursor: pointer;" />
                                        
                                        <!-- Card Info -->
                                        <div style="flex: 1; min-width: 0;">
                                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                                                <div style="display: flex; align-items: center; gap: 8px;">
                                                    <span style="background: #f1f5f9; color: #1e293b; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.3px;">
                                                        <?php echo esc_html($comp['badge']); ?>
                                                    </span>
                                                    <span style="color: #94a3b8; font-size: 11px;">#<?php echo ($index + 1); ?></span>
                                                </div>
                                                <span style="color: #64748b; font-size: 11px; font-weight: 500;">
                                                    <?php echo esc_html($comp['wordcount']); ?> <?php _e('words', 'verbocat-connector'); ?>
                                                </span>
                                            </div>
                                            
                                            <!-- Text Preview Box -->
                                            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; font-size: 13px; color: #1e293b; line-height: 1.5; font-family: inherit; word-break: break-word;">
                                                <?php echo esc_html(wp_trim_words($comp['text'], 24, '...')); ?>
                                            </div>
                                        </div>

                                    </div>
                                <?php endforeach; ?>
                            <?php endif; ?>
                        </div>

                    </div>

                </div>

                <!-- Modal Bottom Action Footer -->
                <div style="padding: 14px 28px; border-top: 1px solid #e2e8f0; background: #ffffff; display: flex; align-items: center; justify-content: space-between;">
                    
                    <div id="vb-modal-status" style="font-size: 13px; font-weight: 500; max-width: 60%;"></div>

                    <div style="display: flex; gap: 10px; align-items: center;">
                        <button type="button" id="vb-modal-cancel-btn" class="button" style="height: 40px; padding: 0 18px; font-size: 13px; border-radius: 8px; font-weight: 600; color: #475569;"><?php _e('Cancel', 'verbocat-connector'); ?></button>
                        <button type="button" id="vb-modal-start-btn" class="button button-primary button-large" style="background: #2563eb; border-color: #1d4ed8; height: 40px; padding: 0 24px; font-size: 14px; font-weight: 700; border-radius: 8px; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 4px 6px -1px rgba(37,99,235,0.3);">
                            <span>🚀 <?php _e('Translate Selected', 'verbocat-connector'); ?></span>
                        </button>
                    </div>

                </div>

            </div>
        </div>

        <style>
        @keyframes vbModalFadeIn { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
        .vb-comp-card:hover { border-color: #2563eb !important; background: #fbfcfe !important; }
        .vb-lang-tile:hover { border-color: #2563eb !important; background: #f0f7ff !important; }
        </style>

        <script>
        jQuery(document).ready(function($) {
            // 1. Inject single unified button into Gutenberg Top Toolbar
            function injectGutenbergButton() {
                var $header = $('.edit-post-header__settings, .editor-header__settings');
                if ($header.length && !$('#verbocat-gutenberg-header-btn').length) {
                    var $topBtn = $('<button type="button" id="verbocat-gutenberg-header-btn" class="components-button is-primary verbocat-open-modal-btn" style="background: #2563eb; margin-right: 8px; font-weight: 600; border-radius: 4px; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(37,99,235,0.2);">🌐 <?php _e('Translate Page', 'verbocat-connector'); ?></button>');
                    $header.prepend($topBtn);
                }
            }
            setInterval(injectGutenbergButton, 1000);

            // 2. Open Modal Dialog
            $(document).on('click', '.verbocat-open-modal-btn', function(e) {
                e.preventDefault();
                $('#vb-modal-status').empty();
                $('#verbocat-lang-modal').css('display', 'flex');
                updateComponentCounter();
            });

            // 3. Close Modal
            $('#verbocat-modal-close, #vb-modal-cancel-btn').on('click', function() {
                $('#verbocat-lang-modal').hide();
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
                $('.vb-target-lang-cb').prop('checked', true).trigger('change');
            });
            $('#vb-clear-all').on('click', function(e) {
                e.preventDefault();
                $('.vb-target-lang-cb').prop('checked', false).trigger('change');
            });

            // Highlight language tile when checked
            $(document).on('change', '.vb-target-lang-cb', function() {
                var $tile = $(this).closest('.vb-lang-tile');
                if ($(this).is(':checked')) {
                    $tile.css('border-color', '#93c5fd');
                } else {
                    $tile.css('border-color', '#e2e8f0');
                }
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
                    $card.css('border-color', '#2563eb').css('opacity', '1');
                } else {
                    $card.css('border-color', '#e2e8f0').css('opacity', '0.6');
                }
                updateComponentCounter();
            });

            function updateComponentCounter() {
                var total = $('.vb-component-cb').length;
                var checked = $('.vb-component-cb:checked').length;
                $('#vb-comp-count').text(checked + '/' + total + ' selected');
            }

            // Component Filter Shortcuts
            $('#vb-comp-select-all').on('click', function() {
                $('.vb-component-cb').prop('checked', true).trigger('change');
            });
            $('#vb-comp-clear-all').on('click', function() {
                $('.vb-component-cb').prop('checked', false).trigger('change');
            });
            $('#vb-comp-headings-only').on('click', function() {
                $('.vb-comp-card').each(function() {
                    var type = $(this).attr('data-type');
                    var isHeading = (type === 'heading' || type === 'title');
                    $(this).find('.vb-component-cb').prop('checked', isHeading).trigger('change');
                });
            });

            // 7. Start Translation Execution
            $('#vb-modal-start-btn').on('click', function(e) {
                e.preventDefault();
                var $btn = $(this);
                var $status = $('#vb-modal-status');

                var selectedTargets = [];
                $('.vb-target-lang-cb:checked').each(function() {
                    selectedTargets.push($(this).val());
                });

                if (selectedTargets.length === 0) {
                    $status.html('<div style="color: #b91c1c; font-weight: 600; padding: 6px 10px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px;">&#10006; <?php _e('Please select at least one target language.', 'verbocat-connector'); ?></div>');
                    return;
                }

                var selectedComponents = [];
                $('.vb-component-cb:checked').each(function() {
                    selectedComponents.push($(this).val());
                });

                if (selectedComponents.length === 0) {
                    $status.html('<div style="color: #b91c1c; font-weight: 600; padding: 6px 10px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px;">&#10006; <?php _e('Please select at least one component to translate.', 'verbocat-connector'); ?></div>');
                    return;
                }

                var sourceLang = $('#vb_modal_source_lang').val();
                var useDelta = $('#vb_modal_delta_sync').is(':checked') ? 1 : 0;

                $btn.prop('disabled', true).html('<span class="spinner is-active" style="float:none; margin:0 6px 0 0;"></span> <?php _e('Translating...', 'verbocat-connector'); ?>');
                $status.html('<div style="color: #2563eb; font-weight: 600; padding: 6px 12px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; display: flex; align-items: center; gap: 8px;"><span class="spinner is-active" style="float:none; margin:0;"></span><?php _e('Translating selected components via Verbocat AI & TM...', 'verbocat-connector'); ?></div>');

                $.post(ajaxurl, {
                    action: 'verbocat_manual_translate',
                    post_id: <?php echo $post->ID; ?>,
                    source_lang: sourceLang,
                    target_langs: selectedTargets,
                    selected_components: selectedComponents,
                    delta_sync: useDelta,
                    nonce: '<?php echo wp_create_nonce('verbocat_translate_' . $post->ID); ?>'
                }, function(res) {
                    $btn.prop('disabled', false).html('🚀 <?php _e('Translate Selected', 'verbocat-connector'); ?>');
                    if (res.success) {
                        $status.html('<div style="color: #15803d; font-weight: 600; padding: 6px 12px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px;">&#10004; ' + res.data.message + '</div>');
                        setTimeout(function() { window.location.reload(); }, 1200);
                    } else {
                        $status.html('<div style="color: #b91c1c; font-weight: 600; padding: 6px 12px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px;">&#10006; ' + (res.data ? res.data.message : 'Translation failed') + '</div>');
                    }
                }).fail(function() {
                    $btn.prop('disabled', false).html('🚀 <?php _e('Translate Selected', 'verbocat-connector'); ?>');
                    $status.html('<div style="color: #b91c1c; font-weight: 600; padding: 6px 12px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px;">&#10006; <?php _e('Network error. Check that Verbocat API URL is reachable.', 'verbocat-connector'); ?></div>');
                });
            });

            // 8. Sync from TM Button
            $(document).on('click', '.verbocat-sync-tm-btn', function(e) {
                e.preventDefault();
                var $btn = $(this);
                var $msg = $('.verbocat-status-msg');

                $btn.prop('disabled', true).text('<?php _e('Syncing TM...', 'verbocat-connector'); ?>');
                $msg.html('<div style="color: #2563eb; font-weight: 600; padding: 10px 14px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px;"><span class="spinner is-active" style="float: none; margin: 0 8px 0 0;"></span><?php _e('Fetching latest Translation Memory records from Verbocat...', 'verbocat-connector'); ?></div>');

                $.post(ajaxurl, {
                    action: 'verbocat_sync_from_tm',
                    post_id: <?php echo $post->ID; ?>,
                    nonce: '<?php echo wp_create_nonce('verbocat_tm_' . $post->ID); ?>'
                }, function(res) {
                    $btn.prop('disabled', false).html('<span class="dashicons dashicons-update" style="vertical-align: middle; margin-right: 4px;"></span> <?php _e('Sync from TM 🔄', 'verbocat-connector'); ?>');
                    if (res.success) {
                        $msg.html('<div style="color: #15803d; font-weight: 600; padding: 10px 14px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px;">&#10004; ' + res.data.message + '</div>');
                        setTimeout(function() { window.location.reload(); }, 1200);
                    } else {
                        $msg.html('<div style="color: #b91c1c; font-weight: 600; padding: 10px 14px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px;">&#10006; ' + (res.data ? res.data.message : 'TM Sync failed') + '</div>');
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
            $actions['verbocat_translate'] = '<a href="' . esc_url(get_edit_post_link($post->ID)) . '" style="color: #2563eb; font-weight: 600;">🌐 ' . __('Translate with Verbocat', 'verbocat-connector') . '</a>';
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
        $use_delta = !empty($_POST['delta_sync']);

        $result = Verbocat_Delta_Sync::sync_post($post, $target_langs, $source_lang, $use_delta, $selected_components);

        if (is_wp_error($result)) {
            wp_send_json_error(['message' => $result->get_error_message()]);
        }

        wp_send_json_success(['message' => is_string($result) ? $result : 'Selected components successfully translated!']);
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

        wp_send_json_success(['message' => 'Translation Memory successfully pulled & updated!']);
    }
}
