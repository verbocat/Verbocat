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
        add_action('save_post', [__CLASS__, 'save_meta_box_data'], 10, 2);

        // Bulk Actions on Pages and Posts List for Centroid Human Review
        add_filter('bulk_actions-edit-page', [__CLASS__, 'register_bulk_actions']);
        add_filter('bulk_actions-edit-post', [__CLASS__, 'register_bulk_actions']);
        add_filter('handle_bulk_actions-edit-page', [__CLASS__, 'handle_bulk_action_dispatch'], 10, 3);
        add_filter('handle_bulk_actions-edit-post', [__CLASS__, 'handle_bulk_action_dispatch'], 10, 3);
        add_action('admin_notices', [__CLASS__, 'display_bulk_dispatch_notice']);

        // AJAX handlers
        add_action('wp_ajax_verbocat_manual_translate', [__CLASS__, 'ajax_manual_translate']);
        add_action('wp_ajax_verbocat_sync_from_tm', [__CLASS__, 'ajax_sync_from_tm']);
    }

    /**
     * Save Meta Box data
     */
    public static function save_meta_box_data($post_id, $post) {
        if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) return;
        if (!isset($_POST['_verbocat_metabox_nonce']) || !wp_verify_nonce($_POST['_verbocat_metabox_nonce'], 'verbocat_save_metabox')) {
            return;
        }
        if (!current_user_can('edit_post', $post_id)) return;

        $auto_enabled = !empty($_POST['_verbocat_auto_sync_enabled']) ? '1' : '0';
        $target_langs = !empty($_POST['_verbocat_auto_target_langs']) && is_array($_POST['_verbocat_auto_target_langs']) 
            ? array_map('sanitize_text_field', $_POST['_verbocat_auto_target_langs']) 
            : [];

        update_post_meta($post_id, '_verbocat_auto_sync_enabled', $auto_enabled);
        update_post_meta($post_id, '_verbocat_auto_target_langs', $target_langs);
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
            $source_post = get_post($source_id);
            $src_title = $source_post ? $source_post->post_title : __('Original Post', 'verbocat-connector');
            ?>
            <div style="padding: 12px 14px; background: #f8fafc; border-radius: 8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; border: 1px solid #e2e8f0;">
                <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 18px;"><?php echo $lang_meta['flag']; ?></span>
                        <span style="background: #eff6ff; color: #2563eb; font-weight: 700; font-size: 11px; padding: 3px 8px; border-radius: 50px; text-transform: uppercase; letter-spacing: 0.5px;">
                            <?php echo esc_html($lang_meta['name']); ?>
                        </span>
                        <span style="font-size: 13px; color: #71717a;">
                            <?php _e('Linked Source:', 'verbocat-connector'); ?> <strong style="color: #0f172a;"><?php echo esc_html(wp_trim_words($src_title, 8, '...')); ?></strong>
                        </span>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <a href="<?php echo get_edit_post_link($source_id); ?>" class="button button-secondary" style="font-size: 12px; font-weight: 500; border-radius: 6px; height: 32px; display: inline-flex; align-items: center; gap: 4px;">
                            <span><?php _e('Edit Original Source', 'verbocat-connector'); ?></span> &rarr;
                        </a>
                        <a href="<?php echo get_permalink($post->ID); ?>" class="button button-secondary" target="_blank" style="font-size: 12px; font-weight: 500; border-radius: 6px; height: 32px; display: inline-flex; align-items: center; gap: 4px;">
                            <span><?php _e('View Live', 'verbocat-connector'); ?></span> &#x2197;
                        </a>
                    </div>
                </div>
            </div>
            <?php
            return;
        }

        $translations = get_post_meta($post->ID, '_verbocat_translations', true) ?: [];
        $active_translations = [];
        foreach ($translations as $t_lang => $t_id) {
            if ($t_id && get_post($t_id) && get_post_status($t_id) !== 'trash') {
                $active_translations[$t_lang] = $t_id;
            }
        }
        $completed_count = count($active_translations);

        $opts = Verbocat_Settings::get_options();
        $all_languages = Verbocat_Languages::get_all_languages();
        $global_targets = !empty($opts['target_langs']) ? array_filter(array_map('trim', explode(',', $opts['target_langs']))) : [];

        // Page specific automation options
        $saved_auto_sync = get_post_meta($post->ID, '_verbocat_auto_sync_enabled', true);
        $is_auto_sync_enabled = ($saved_auto_sync === '1') || ($saved_auto_sync === '' && $opts['continuous_sync_trigger'] === 'publish_update');

        $saved_page_langs = get_post_meta($post->ID, '_verbocat_auto_target_langs', true);
        if (is_array($saved_page_langs)) {
            $temp_saved = $saved_page_langs;
            sort($temp_saved);
            if ($temp_saved === ['es', 'fr', 'hi']) {
                $saved_page_langs = null;
                delete_post_meta($post->ID, '_verbocat_auto_target_langs');
            }
        }
        $page_auto_langs = is_array($saved_page_langs) ? $saved_page_langs : $global_targets;
        ?>
        <div style="background: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 4px 0;">
            <?php wp_nonce_field('verbocat_save_metabox', '_verbocat_metabox_nonce'); ?>
            
            <!-- Top Control Bar -->
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding-bottom: 14px; border-bottom: 1px solid #f4f4f5;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="width: 32px; height: 32px; border-radius: 8px; background: #eff6ff; display: flex; align-items: center; justify-content: center; color: #2563eb;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="m5 8 6 6"></path>
                            <path d="m4 14 6-6 2-3"></path>
                            <path d="M2 5h12"></path>
                            <path d="M7 2h1"></path>
                            <path d="m22 22-5-10-5 10"></path>
                            <path d="M14 18h6"></path>
                        </svg>
                    </div>
                    <div>
                        <div style="font-weight: 600; font-size: 14px; color: #0f172a; line-height: 1.2;">
                            <?php _e('Continuous Localization', 'verbocat-connector'); ?>
                        </div>
                        <div style="font-size: 12px; color: #71717a; margin-top: 2px;">
                            <?php echo sprintf(__('%d translated version(s) active', 'verbocat-connector'), $completed_count); ?>
                        </div>
                    </div>
                </div>

                <div style="display: flex; gap: 8px; align-items: center;">
                    <button type="button" class="button button-primary verbocat-open-modal-btn" style="background: #0f172a; border-color: #0f172a; color: #ffffff; font-weight: 500; border-radius: 6px; padding: 0 16px; height: 34px; display: inline-flex; align-items: center; gap: 6px; transition: all 0.15s ease;">
                        <span><?php _e('Translate Page', 'verbocat-connector'); ?></span>
                    </button>
                </div>
            </div>

            <div class="verbocat-status-msg" style="margin: 8px 0; font-size: 13px;"></div>

            <!-- Language Versions Modern Grid (Shows ONLY created translations) -->
            <div style="margin-top: 14px;">
                <?php if (empty($active_translations)): ?>
                    <div style="text-align: center; padding: 22px 14px; background: #fafafa; border: 1px dashed #e4e4e7; border-radius: 8px;">
                        <div style="font-size: 13px; color: #52525b; margin-bottom: 8px;">
                            <?php _e('No translated versions created for this page yet.', 'verbocat-connector'); ?>
                        </div>
                        <button type="button" class="button button-secondary verbocat-open-modal-btn" style="font-size: 12px; font-weight: 500; border-radius: 6px; height: 30px;">
                            <?php _e('+ Create First Translation', 'verbocat-connector'); ?>
                        </button>
                    </div>
                <?php else: ?>
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px;">
                        <?php foreach ($active_translations as $t_lang => $t_id): 
                            $t_meta = Verbocat_Languages::get_language($t_lang);
                            $p_status = get_post_status($t_id) ?: 'publish';
                        ?>
                            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; transition: all 0.15s ease; box-shadow: 0 1px 3px rgba(0,0,0,0.04);" onmouseover="this.style.borderColor='#cbd5e1'" onmouseout="this.style.borderColor='#e2e8f0'">
                                
                                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                                    <span style="font-weight: 600; color: #0f172a; font-size: 13px;">
                                        <?php echo esc_html($t_meta['name']); ?>
                                    </span>
                                    <span style="font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 50px; background: <?php echo $p_status === 'publish' ? '#ecfdf5' : '#fef3c7'; ?>; color: <?php echo $p_status === 'publish' ? '#059669' : '#b45309'; ?>;">
                                        <?php echo ucfirst($p_status); ?>
                                    </span>
                                </div>

                                <div style="display: flex; align-items: center; justify-content: space-between; font-size: 12px; padding-top: 6px; border-top: 1px solid #f8fafc;">
                                    <a href="<?php echo get_edit_post_link($t_id); ?>" target="_blank" style="color: #2563eb; text-decoration: none; font-weight: 600; display: inline-flex; align-items: center; gap: 3px;">
                                        <span><?php _e('Edit Translation', 'verbocat-connector'); ?></span> &rarr;
                                    </a>
                                    <a href="<?php echo get_permalink($t_id); ?>" target="_blank" style="color: #64748b; text-decoration: none; font-size: 11px;" title="<?php _e('View Live', 'verbocat-connector'); ?>">
                                        &#x2197;
                                    </a>
                                </div>

                            </div>
                        <?php endforeach; ?>
                    </div>
                <?php endif; ?>
            </div>

            <!-- Page Automation Settings Bar -->
            <div style="margin-top: 18px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
                    <label style="font-weight: 700; font-size: 13px; color: #0f172a; display: inline-flex; align-items: center; gap: 6px; cursor: pointer;">
                        <input type="checkbox" name="_verbocat_auto_sync_enabled" value="1" <?php checked($is_auto_sync_enabled); ?> style="accent-color: #2563eb; width: 16px; height: 16px;" />
                        <span>🤖 <?php _e('Enable Continuous Sync for this Page', 'verbocat-connector'); ?></span>
                    </label>
                    <span style="font-size: 11px; color: #64748b; font-weight: 500;">
                        <?php _e('Syncs automatically when this page is published or updated', 'verbocat-connector'); ?>
                    </span>
                </div>
                
                <div style="font-size: 12px; color: #475569; margin-bottom: 6px; font-weight: 600;">
                    <?php _e('Automated Target Languages for this page:', 'verbocat-connector'); ?>
                </div>
                
                <div class="vb-metabox-langs-container" style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px;">
                    <?php 
                    $metabox_pool = array_unique(array_filter(array_merge($global_targets, $page_auto_langs)));
                    if (empty($metabox_pool)): ?>
                        <span class="vb-no-langs-notice" style="color: #94a3b8; font-size: 12px; font-style: italic;">
                            <?php _e('No languages assigned yet. Use the dropdown to add languages for this page:', 'verbocat-connector'); ?>
                        </span>
                    <?php endif; ?>

                    <?php foreach ($metabox_pool as $l_code): 
                        if (empty($l_code) || $l_code === 'en') continue;
                        $l_meta = $all_languages[$l_code] ?? ['name' => strtoupper($l_code), 'flag' => '🌐'];
                        $is_active = in_array($l_code, $page_auto_langs);
                    ?>
                        <label class="vb-metabox-lang-pill" style="background: <?php echo $is_active ? '#eff6ff' : '#ffffff'; ?>; border: 1px solid <?php echo $is_active ? '#93c5fd' : '#cbd5e1'; ?>; padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; color: <?php echo $is_active ? '#1e40af' : '#475569'; ?>; display: inline-flex; align-items: center; gap: 5px; cursor: pointer;">
                            <input type="checkbox" name="_verbocat_auto_target_langs[]" value="<?php echo esc_attr($l_code); ?>" <?php checked($is_active); ?> class="vb-mb-lang-cb" style="accent-color: #2563eb; width: 13px; height: 13px;" />
                            <span><?php echo $l_meta['flag']; ?> <?php echo esc_html($l_meta['name']); ?></span>
                        </label>
                    <?php endforeach; ?>

                    <!-- Add Single Page Custom Language Dropdown in Meta Box -->
                    <div style="display: inline-flex; align-items: center; margin-left: 4px;">
                        <select id="vb_metabox_add_lang_select" style="font-size: 11px; height: 28px; border-radius: 14px; padding: 0 8px; border: 1px dashed #94a3b8; background: #ffffff; color: #1e293b;">
                            <option value="">+ <?php _e('Add Language to this Page...', 'verbocat-connector'); ?></option>
                            <?php foreach ($all_languages as $c_code => $c_meta): 
                                if ($c_code === 'en') continue;
                            ?>
                                <option value="<?php echo esc_attr($c_code); ?>" data-flag="<?php echo esc_attr($c_meta['flag']); ?>" data-name="<?php echo esc_attr($c_meta['name']); ?>">
                                    <?php echo $c_meta['flag']; ?> <?php echo esc_html($c_meta['name']); ?> (<?php echo strtoupper($c_code); ?>)
                                </option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                </div>
            </div>

            <script>
            jQuery(document).ready(function($) {
                $(document).on('change', '.vb-mb-lang-cb', function() {
                    var isChecked = $(this).is(':checked');
                    var $pill = $(this).closest('.vb-metabox-lang-pill');
                    $pill.css({
                        'background': isChecked ? '#eff6ff' : '#ffffff',
                        'border-color': isChecked ? '#93c5fd' : '#cbd5e1',
                        'color': isChecked ? '#1e40af' : '#475569'
                    });
                });

                $('#vb_metabox_add_lang_select').on('change', function() {
                    var langCode = $(this).val();
                    if (!langCode) return;
                    var $option = $(this).find('option:selected');
                    var flag = $option.data('flag') || '🌐';
                    var name = $option.data('name') || langCode;
                    var $container = $('.vb-metabox-langs-container');

                    $('.vb-no-langs-notice').hide();

                    var $existing = $container.find('input[value="' + langCode + '"]');
                    if ($existing.length > 0) {
                        $existing.prop('checked', true).trigger('change');
                    } else {
                        var newPill = '<label class="vb-metabox-lang-pill" style="background: #eff6ff; border: 1px solid #93c5fd; padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; color: #1e40af; display: inline-flex; align-items: center; gap: 5px; cursor: pointer;">' +
                            '<input type="checkbox" name="_verbocat_auto_target_langs[]" value="' + langCode + '" checked class="vb-mb-lang-cb" style="accent-color: #2563eb; width: 13px; height: 13px;" />' +
                            '<span>' + flag + ' ' + name + '</span>' +
                            '</label>';
                        $(newPill).insertBefore($(this).parent());
                    }
                    $(this).val('');
                });
            });
            </script>

        </div>
        <?php
    }

    /**
     * Render Gutenberg Top Bar Animated Button & Clean Minimal Modal
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

                <!-- Header with Minimize & Close Controls -->
                <div class="vb-modal-header">
                    <div>
                        <h2 style="margin: 0; font-size: 16px; font-weight: 600; color: #18181b; line-height: 1.3;"><?php _e('Translate Content', 'verbocat-connector'); ?></h2>
                        <p style="margin: 2px 0 0 0; color: #71717a; font-size: 13px;"><?php _e('Choose target languages and select components to translate.', 'verbocat-connector'); ?></p>
                    </div>
                    <div style="display: flex; align-items: center; gap: 4px;">
                        <button type="button" id="verbocat-modal-minimize" class="vb-control-btn" title="<?php _e('Minimize to background', 'verbocat-connector'); ?>">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                        </button>
                        <button type="button" id="verbocat-modal-close" class="vb-control-btn" title="<?php _e('Close', 'verbocat-connector'); ?>">&times;</button>
                    </div>
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
                                        <?php echo esc_html($info['name']); ?>
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
                                    $is_checked = false; // Start blank by default as requested
                                ?>
                                    <label class="vb-lang-tile" data-search="<?php echo esc_attr(strtolower($info['name'] . ' ' . $info['native'])); ?>">
                                        <span style="font-size: 13px; color: #27272a; font-weight: 500;">
                                            <?php echo esc_html($info['name']); ?>
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
                        <button type="button" id="vb-modal-minimize-action" class="vb-btn-secondary" style="display: none;"><?php _e('Minimize', 'verbocat-connector'); ?></button>
                        <button type="button" id="vb-modal-cancel-btn" class="vb-btn-secondary"><?php _e('Cancel', 'verbocat-connector'); ?></button>
                        <button type="button" id="vb-modal-start-btn" class="vb-btn-primary">
                            <div class="vb-btn-inner">
                                <span id="vb-modal-btn-spinner" class="vb-btn-spinner" style="display: none; margin-right: 4px;"></span>
                                <span id="vb-modal-btn-label"><?php _e('Translate Content', 'verbocat-connector'); ?></span>
                                <span id="vb-modal-btn-pct" class="vb-modal-pct" style="display: none; margin-left: 6px;">0%</span>
                            </div>
                        </button>
                    </div>

                </div>

            </div>
        </div>

        <!-- Floating Minimized Live Translation Pill (Bottom Right) -->
        <div id="vb-minimized-pill" class="vb-floating-pill" style="display: none;">
            <div class="vb-pill-content">
                <span class="vb-pulse-dot"></span>
                <span id="vb-pill-text" style="font-weight: 600; font-size: 13px; color: #0f172a;">Translating... 0%</span>
            </div>
            <button type="button" id="vb-pill-expand-btn" class="vb-pill-btn" title="Expand Studio">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <polyline points="9 21 3 21 3 15"></polyline>
                    <line x1="21" y1="3" x2="14" y2="10"></line>
                    <line x1="3" y1="21" x2="10" y2="14"></line>
                </svg>
            </button>
        </div>

        <style>
        /* ============================================================
           PREMIUM LIGHT-MODE BUTTON WITH CONIC PERIMETER PROGRESS BAR
           ============================================================ */
        :root {
            --vb-progress: 0%;
        }

        .vb-header-glow-btn {
            position: relative;
            display: inline-flex !important;
            align-items: center;
            justify-content: center;
            padding: 1.5px !important;
            height: 35px !important;
            border-radius: 8px !important;
            background: #ffffff !important;
            border: 1px solid #e2e8f0 !important;
            color: #0f172a !important;
            font-size: 13px !important;
            font-weight: 600 !important;
            cursor: pointer;
            text-decoration: none !important;
            overflow: hidden;
            margin-right: 8px;
            transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05), 0 2px 8px rgba(37, 99, 235, 0.06);
            user-select: none;
            box-sizing: border-box !important;
        }

        /* Ambient Satin Sheen Light-Sweep */
        .vb-header-glow-btn::after {
            content: '';
            position: absolute;
            top: 0;
            left: -120%;
            width: 60%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(37, 99, 235, 0.12), rgba(255, 255, 255, 0.4), transparent);
            transform: skewX(-20deg);
            animation: vbSheenSweep 3.6s infinite ease-in-out;
            pointer-events: none;
        }

        @keyframes vbSheenSweep {
            0% { left: -120%; }
            35% { left: 160%; }
            100% { left: 160%; }
        }

        /* Continuous Dynamic Progress Bar Outline when active */
        .vb-header-glow-btn.vb-in-progress {
            background: conic-gradient(#2563eb var(--vb-progress, 0%), #e2e8f0 0%) !important;
            padding: 2px !important;
            border: none !important;
            box-shadow: 0 0 14px rgba(37, 99, 235, 0.3) !important;
        }

        .vb-header-inner {
            display: flex;
            align-items: center;
            gap: 7px;
            width: 100%;
            height: 100%;
            padding: 0 12px;
            background: #ffffff;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 600;
            color: #0f172a;
            transition: background 0.2s ease;
            position: relative;
            z-index: 1;
        }

        .vb-translate-icon {
            color: #2563eb;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.2s ease, color 0.2s ease;
        }

        .vb-header-pct {
            font-weight: 700;
            color: #2563eb;
            font-size: 12px;
            letter-spacing: -0.2px;
        }

        .vb-header-glow-btn:hover {
            border-color: #cbd5e1 !important;
            transform: translateY(-1px) !important;
            box-shadow: 0 3px 12px rgba(37, 99, 235, 0.16) !important;
        }
        .vb-header-glow-btn:hover .vb-header-inner {
            background: #fafcff;
        }

        /* ============================================================
           MODAL SMOOTH ANIMATIONS & STYLING
           ============================================================ */
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

        /* Top Progress Line inside modal */
        .vb-progress-bar {
            height: 3px;
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

        .vb-control-btn {
            background: transparent;
            border: none;
            font-size: 18px;
            color: #71717a;
            cursor: pointer;
            border-radius: 6px;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.15s ease;
        }
        .vb-control-btn:hover {
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
            background: #f0f7ff;
            box-shadow: 0 0 10px rgba(59, 130, 246, 0.25);
            animation: vbPulseGlow 1.6s infinite ease-in-out;
        }
        @keyframes vbPulseGlow {
            0% { border-color: #93c5fd; box-shadow: 0 0 4px rgba(59, 130, 246, 0.15); }
            50% { border-color: #2563eb; box-shadow: 0 0 12px rgba(37, 99, 235, 0.35); }
            100% { border-color: #93c5fd; box-shadow: 0 0 4px rgba(59, 130, 246, 0.15); }
        }

        .vb-btn-spinner {
            width: 14px;
            height: 14px;
            border: 2px solid rgba(255, 255, 255, 0.35);
            border-top-color: #ffffff;
            border-radius: 50%;
            animation: vbSpin 0.7s infinite linear;
            display: inline-block;
        }
        @keyframes vbSpin {
            to { transform: rotate(360deg); }
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
            position: relative;
            background: #0f172a;
            color: #ffffff;
            border: 2px solid transparent !important;
            height: 38px !important;
            padding: 2px !important;
            font-size: 13px !important;
            font-weight: 600 !important;
            border-radius: 8px !important;
            cursor: pointer;
            display: inline-flex !important;
            align-items: center;
            justify-content: center;
            transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
            overflow: hidden;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
            box-sizing: border-box !important;
        }

        /* Continuous Dynamic Perimeter Conic Progress Ring on Modal Translate Button */
        .vb-btn-primary.vb-in-progress {
            background: conic-gradient(#3b82f6 var(--vb-progress, 0%), #334155 0%) !important;
            padding: 2px !important;
            box-shadow: 0 0 16px rgba(59, 130, 246, 0.45) !important;
        }

        .vb-btn-primary .vb-btn-inner {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            width: 100%;
            height: 100%;
            padding: 0 16px;
            background: #0f172a;
            border-radius: 6px;
            color: #ffffff;
            transition: background 0.2s ease;
        }

        .vb-modal-pct {
            font-weight: 700;
            color: #60a5fa;
            font-size: 12px;
            background: rgba(59, 130, 246, 0.2);
            padding: 1px 6px;
            border-radius: 50px;
            letter-spacing: -0.2px;
        }

        .vb-btn-primary:hover .vb-btn-inner {
            background: #1e293b;
        }
        .vb-btn-primary:disabled {
            opacity: 0.9;
            cursor: wait;
        }

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

        /* Floating Minimized Live Translation Pill */
        .vb-floating-pill {
            position: fixed;
            bottom: 24px;
            right: 24px;
            z-index: 999999;
            background: rgba(255, 255, 255, 0.96);
            backdrop-filter: blur(8px);
            border: 1px solid #e2e8f0;
            border-radius: 50px;
            padding: 8px 14px;
            display: flex;
            align-items: center;
            gap: 10px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(37, 99, 235, 0.15);
            animation: vbPillSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            cursor: pointer;
        }
        @keyframes vbPillSlideUp {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }

        .vb-pill-content {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .vb-pill-btn {
            background: #f1f5f9;
            border: none;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            color: #475569;
            transition: all 0.15s ease;
        }
        .vb-pill-btn:hover {
            background: #2563eb;
            color: #ffffff;
        }
        </style>

        <script>
        jQuery(document).ready(function($) {
            var isTranslating = false;
            var currentPercent = 0;
            var progressTimer = null;

            // 1. Inject luxury Light-Mode Translation action button into Gutenberg Top Toolbar
            function injectGutenbergButton() {
                var $header = $('.edit-post-header__settings, .editor-header__settings');
                if ($header.length && !$('#verbocat-gutenberg-header-btn').length) {
                    var $topBtn = $(`
                        <div id="verbocat-gutenberg-header-btn" class="components-button vb-header-glow-btn verbocat-open-modal-btn" role="button" tabindex="0">
                            <div class="vb-header-inner">
                                <svg class="vb-translate-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="m5 8 6 6"></path>
                                    <path d="m4 14 6-6 2-3"></path>
                                    <path d="M2 5h12"></path>
                                    <path d="M7 2h1"></path>
                                    <path d="m22 22-5-10-5 10"></path>
                                    <path d="M14 18h6"></path>
                                </svg>
                                <span class="vb-header-text"><?php _e('Translate Page', 'verbocat-connector'); ?></span>
                                <span class="vb-header-pct" style="display: none;">0%</span>
                            </div>
                        </div>
                    `);
                    $header.prepend($topBtn);
                }
            }
            setInterval(injectGutenbergButton, 1000);

            // Update Progress in UI, Modal Button perimeter, and Header Button perimeter
            function setProgress(pct, statusText) {
                currentPercent = Math.min(100, Math.max(0, Math.round(pct)));

                // 1. Update Modal Translate Button
                var modalBtn = document.getElementById('vb-modal-start-btn');
                if (modalBtn) {
                    modalBtn.style.setProperty('--vb-progress', currentPercent + '%');
                    if (isTranslating) {
                        $(modalBtn).addClass('vb-in-progress');
                        $('#vb-modal-btn-spinner').show();
                        $('#vb-modal-btn-label').text('<?php _e('Translating', 'verbocat-connector'); ?>');
                        $('#vb-modal-btn-pct').text(currentPercent + '%').show();
                    } else if (currentPercent >= 100) {
                        $(modalBtn).removeClass('vb-in-progress');
                        $('#vb-modal-btn-spinner').hide();
                        $('#vb-modal-btn-label').text('<?php _e('✓ Completed', 'verbocat-connector'); ?>');
                        $('#vb-modal-btn-pct').text('100%').show();
                    } else {
                        $(modalBtn).removeClass('vb-in-progress');
                        $('#vb-modal-btn-spinner').hide();
                        $('#vb-modal-btn-label').text('<?php _e('Translate Content', 'verbocat-connector'); ?>');
                        $('#vb-modal-btn-pct').hide();
                    }
                }

                // 2. Update Header Glow Button perimeter
                var headerBtn = document.getElementById('verbocat-gutenberg-header-btn');
                if (headerBtn) {
                    headerBtn.style.setProperty('--vb-progress', currentPercent + '%');
                    if (isTranslating) {
                        $(headerBtn).addClass('vb-in-progress');
                        $('.vb-header-pct').text(currentPercent + '%').show();
                        $('.vb-header-text').text('<?php _e('Translating', 'verbocat-connector'); ?>');
                    } else if (currentPercent >= 100) {
                        $(headerBtn).removeClass('vb-in-progress');
                        $('.vb-header-pct').hide();
                        $('.vb-header-text').text('<?php _e('✓ Translated', 'verbocat-connector'); ?>');
                    } else {
                        $(headerBtn).removeClass('vb-in-progress');
                        $('.vb-header-pct').hide();
                        $('.vb-header-text').text('<?php _e('Translate Page', 'verbocat-connector'); ?>');
                    }
                }

                // 3. Update Modal Status Area & Floating Pill
                if (statusText) {
                    $('#vb-modal-status').html('<span style="color: #2563eb; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px;"><span class="vb-pulse-dot"></span>' + statusText + ' (' + currentPercent + '%)</span>');
                    $('#vb-pill-text').text(statusText + ' ' + currentPercent + '%');
                }
            }

            // 2. Open / Restore Modal Dialog
            function openModal() {
                $('#verbocat-lang-modal').css('display', 'flex');
                setTimeout(function() {
                    $('#verbocat-lang-modal').addClass('vb-visible');
                }, 10);
                $('#vb-minimized-pill').hide();
                updateComponentCounter();
            }

            // 3. Minimize Modal Dialog
            function minimizeModal() {
                $('#verbocat-lang-modal').removeClass('vb-visible');
                setTimeout(function() {
                    $('#verbocat-lang-modal').hide();
                }, 200);

                if (isTranslating) {
                    $('#vb-minimized-pill').fadeIn(150);
                }
            }

            // 4. Close Modal Dialog
            function closeModal() {
                if (isTranslating) {
                    minimizeModal();
                    return;
                }
                $('#verbocat-lang-modal').removeClass('vb-visible');
                setTimeout(function() {
                    $('#verbocat-lang-modal').hide();
                }, 200);
                $('#vb-minimized-pill').hide();
            }

            $(document).on('click', '.verbocat-open-modal-btn, #vb-minimized-pill, #vb-pill-expand-btn', function(e) {
                e.preventDefault();
                openModal();
            });

            $('#verbocat-modal-minimize, #vb-modal-minimize-action').on('click', function(e) {
                e.preventDefault();
                minimizeModal();
            });

            $('#verbocat-modal-close, #vb-modal-cancel-btn').on('click', function(e) {
                e.preventDefault();
                closeModal();
            });

            // 5. Search Filter for Languages
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

            // 6. Languages Select / Clear All
            $('#vb-select-all').on('click', function(e) {
                e.preventDefault();
                $('.vb-target-lang-cb').prop('checked', true);
            });
            $('#vb-clear-all').on('click', function(e) {
                e.preventDefault();
                $('.vb-target-lang-cb').prop('checked', false);
            });

            // 7. Components Card Click to Toggle
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

            // 8. Start Translation Execution with Smooth Live Multi-Language Progress
            $('#vb-modal-start-btn').on('click', function(e) {
                e.preventDefault();
                if (isTranslating) return;

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

                // Activate translation & show minimize option
                isTranslating = true;
                $btn.prop('disabled', true);
                $('#vb-modal-minimize-action').show();
                $progress.show();
                $('.vb-comp-card').addClass('vb-translating');

                var cur = 10;
                var elapsed = 0;
                setProgress(10, '<?php _e('Parsing content...', 'verbocat-connector'); ?>');

                progressTimer = setInterval(function() {
                    elapsed += 350;
                    if (cur < 85) {
                        cur += Math.floor(Math.random() * 5) + 3;
                        setProgress(cur, '<?php _e('Translating selected content...', 'verbocat-connector'); ?>');
                    } else if (cur < 95) {
                        cur += 1;
                        setProgress(cur, '<?php _e('Finalizing & saving post...', 'verbocat-connector'); ?>');
                    }
                }, 350);

                $.post(ajaxurl, {
                    action: 'verbocat_manual_translate',
                    post_id: <?php echo $post->ID; ?>,
                    source_lang: sourceLang,
                    target_langs: selectedTargets,
                    selected_components: selectedComponents,
                    delta_sync: 1, // Always automated
                    nonce: '<?php echo wp_create_nonce('verbocat_translate_' . $post->ID); ?>'
                }, function(res) {
                    clearInterval(progressTimer);
                    $progress.hide();
                    $('.vb-comp-card').removeClass('vb-translating');
                    $btn.prop('disabled', false);
                    $('#vb-modal-minimize-action').hide();
                    isTranslating = false;

                    if (res.success) {
                        setProgress(100, '<?php _e('Completed', 'verbocat-connector'); ?>');
                        $status.html('<span style="color: #16a34a; font-size: 13px; font-weight: 500;">✓ ' + res.data.message + '</span>');
                        $('#vb-pill-text').text('✓ Translations updated (100%)');
                        setTimeout(function() { window.location.reload(); }, 1200);
                    } else {
                        var errText = (res.data && res.data.message) ? res.data.message : 'Translation failed';
                        console.error('Verbocat Translation Failed:', res);
                        setProgress(0, '');
                        $status.html('<div style="background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 8px 12px; border-radius: 6px; font-size: 13px; font-weight: 500;">❌ ' + errText + '</div>');
                        $('#vb-pill-text').text('Translation failed');
                    }
                }).fail(function(xhr, status, error) {
                    clearInterval(progressTimer);
                    $progress.hide();
                    $('.vb-comp-card').removeClass('vb-translating');
                    $btn.prop('disabled', false);
                    $('#vb-modal-minimize-action').hide();
                    isTranslating = false;
                    setProgress(0, '');

                    console.error('Verbocat Translation Network Error:', status, error, xhr.responseText);
                    var detailMsg = 'Server / Network Error (HTTP ' + (xhr.status || 'timeout') + ')';
                    try {
                        var parsed = JSON.parse(xhr.responseText);
                        if (parsed && parsed.data && parsed.data.message) {
                            detailMsg = parsed.data.message;
                        }
                    } catch(e) {}

                    $status.html('<div style="background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 8px 12px; border-radius: 6px; font-size: 13px; font-weight: 500;">❌ ' + detailMsg + '<div style="font-size: 11px; margin-top: 4px; color: #b91c1c;">Please verify your API key in Settings > Verbocat Localization.</div></div>');
                    $('#vb-pill-text').text('Translation failed');
                });
            });

            // 9. Sync from TM Button
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

    /**
     * Register Bulk Actions for Pages and Posts
     */
    public static function register_bulk_actions($bulk_actions) {
        $bulk_actions['verbocat_send_human_review'] = __('🚀 Send to Centroid for Human Review', 'verbocat-connector');
        return $bulk_actions;
    }

    /**
     * Handle Bulk Action Dispatch to Centroid
     */
    public static function handle_bulk_action_dispatch($redirect_to, $doaction, $post_ids) {
        if ($doaction !== 'verbocat_send_human_review') {
            return $redirect_to;
        }

        if (empty($post_ids) || !is_array($post_ids)) {
            return $redirect_to;
        }

        $opts = Verbocat_Settings::get_options();
        $global_target_langs = !empty($opts['target_langs']) ? array_filter(array_map('trim', explode(',', $opts['target_langs']))) : [];
        $linguist_assignments = $opts['linguist_assignments'] ?? [];

        $pages_payload = [];

        foreach ($post_ids as $post_id) {
            $post = get_post($post_id);
            if (!$post || get_post_meta($post_id, '_verbocat_is_translation', true)) {
                continue;
            }

            // Get target languages for this specific page or fallback to global pool
            $page_langs = get_post_meta($post_id, '_verbocat_auto_target_langs', true);
            if (!is_array($page_langs) || empty($page_langs)) {
                $page_langs = $global_target_langs;
            }
            if (empty($page_langs)) {
                $page_langs = ['hi']; // Default fallback
            }

            // Render rich content HTML
            $content_html = apply_filters('the_content', $post->post_content);
            if (empty($content_html)) {
                $content_html = wpautop($post->post_content);
            }

            // Build full, styled HTML document for 100% exact WYSIWYG match
            $source_code = $opts['source_lang'] ?? 'en';
            $page_title_escaped = esc_html($post->post_title);
            $rendered_html = '<!DOCTYPE html>' . "\n" .
                '<html lang="' . esc_attr($source_code) . '">' . "\n" .
                '<head>' . "\n" .
                '<meta charset="utf-8">' . "\n" .
                '<meta name="viewport" content="width=device-width, initial-scale=1.0">' . "\n" .
                '<title>' . $page_title_escaped . '</title>' . "\n" .
                '<style>' . "\n" .
                'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif; font-size: 16px; line-height: 1.7; color: #1e293b; background-color: #ffffff; margin: 0; padding: 40px 32px; -webkit-font-smoothing: antialiased; }' . "\n" .
                '.wp-site-preview-container { max-width: 840px; margin: 0 auto; background: #ffffff; }' . "\n" .
                '.wp-block-post-title, h1.entry-title { font-size: 2.25rem; font-weight: 800; line-height: 1.25; color: #0f172a; margin-top: 0; margin-bottom: 2rem; letter-spacing: -0.025em; }' . "\n" .
                'h2 { font-size: 1.75rem; font-weight: 700; margin-top: 2rem; margin-bottom: 1rem; color: #1e293b; }' . "\n" .
                'h3 { font-size: 1.35rem; font-weight: 600; margin-top: 1.75rem; margin-bottom: 0.75rem; color: #334155; }' . "\n" .
                'p { margin-top: 0; margin-bottom: 1.5rem; color: #334155; font-size: 1.05rem; line-height: 1.75; }' . "\n" .
                'img { max-width: 100%; height: auto; border-radius: 8px; }' . "\n" .
                'blockquote { border-left: 4px solid #2563eb; margin: 1.75rem 0; padding: 0.75rem 1.5rem; color: #475569; background: #f8fafc; border-radius: 0 8px 8px 0; }' . "\n" .
                'ul, ol { padding-left: 1.5rem; margin-bottom: 1.5rem; color: #334155; }' . "\n" .
                'li { margin-bottom: 0.5rem; }' . "\n" .
                '</style>' . "\n" .
                '</head>' . "\n" .
                '<body>' . "\n" .
                '<article class="wp-site-preview-container">' . "\n" .
                '<h1 class="wp-block-post-title entry-title">' . $page_title_escaped . '</h1>' . "\n" .
                '<div class="entry-content">' . "\n" .
                $content_html . "\n" .
                '</div>' . "\n" .
                '</article>' . "\n" .
                '</body>' . "\n" .
                '</html>';

            $pages_payload[] = [
                'post_id'              => $post->ID,
                'title'                => $post->post_title,
                'content'              => $post->post_content,
                'rendered_html'        => $rendered_html,
                'permalink'            => get_permalink($post->ID),
                'source_lang'          => $opts['source_lang'] ?? 'en',
                'target_langs'         => array_values($page_langs),
                'linguist_assignments' => $linguist_assignments
            ];

            update_post_meta($post->ID, '_verbocat_translation_status', 'in_centroid_review');
            update_post_meta($post->ID, '_verbocat_centroid_dispatched_at', current_time('mysql'));
        }

        if (!empty($pages_payload)) {
            $batch_payload = [
                'site_url'     => home_url(),
                'callback_url' => rest_url('verbocat/v1/webhook'),
                'project_name' => get_bloginfo('name') . ' - WP Human Review (' . count($pages_payload) . ' Pages)',
                'pages'        => $pages_payload
            ];

            $response = Verbocat_Api_Client::submit_batch_human_review($batch_payload);

            if (is_wp_error($response)) {
                $redirect_to = add_query_arg([
                    'verbocat_bulk_error' => urlencode($response->get_error_message())
                ], $redirect_to);
            } else {
                $redirect_to = add_query_arg([
                    'verbocat_bulk_dispatched'  => count($pages_payload),
                    'verbocat_centroid_project' => $response['project_id'] ?? ''
                ], $redirect_to);
            }
        }

        return $redirect_to;
    }

    /**
     * Display Bulk Dispatch Admin Notice
     */
    public static function display_bulk_dispatch_notice() {
        if (!empty($_GET['verbocat_bulk_dispatched'])) {
            $count = intval($_GET['verbocat_bulk_dispatched']);
            $proj_id = sanitize_text_field($_GET['verbocat_centroid_project'] ?? '');
            ?>
            <div class="notice notice-success is-dismissible" style="padding: 12px 16px; border-left-color: #2563eb; background: #f0fdf4; border-radius: 6px; margin: 16px 0;">
                <p style="margin: 0; font-size: 14px; color: #166534; display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 18px;">🚀</span>
                    <strong><?php echo sprintf(__('%d WordPress pages successfully dispatched to Centroid for Human Review!', 'verbocat-connector'), $count); ?></strong>
                </p>
                <p style="margin: 4px 0 0 26px; font-size: 12px; color: #15803d;">
                    <?php _e('Assigned linguists have received these tasks on their Centroid radar. Once reviewed and marked as completed, translations will automatically post back into WordPress drafts.', 'verbocat-connector'); ?>
                </p>
            </div>
            <?php
        } elseif (!empty($_GET['verbocat_bulk_error'])) {
            $err = sanitize_text_field(urldecode($_GET['verbocat_bulk_error']));
            ?>
            <div class="notice notice-error is-dismissible" style="padding: 12px 16px; margin: 16px 0;">
                <p style="margin: 0; font-size: 14px; font-weight: 600; color: #991b1b;">
                    <?php _e('Failed to dispatch pages to Centroid:', 'verbocat-connector'); ?> <?php echo esc_html($err); ?>
                </p>
            </div>
            <?php
        }
    }
}
