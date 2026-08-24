<?php
/**
 * Verbocat Editor UI, Component & Language Modal, & AJAX Handlers
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
            <div style="padding: 14px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; font-size: 14px;">
                <p style="margin: 0 0 10px 0; display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 20px;"><?php echo esc_html($lang_meta['flag']); ?></span>
                    <strong><?php _e('Automated Translation in:', 'verbocat-connector'); ?></strong> 
                    <span style="background: #2563eb; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: bold; text-transform: uppercase; font-size: 12px;"><?php echo esc_html($lang_meta['name']); ?> (<?php echo esc_html($lang); ?>)</span>
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
        <div style="font-size: 14px; padding: 6px 0;">
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 14px;">
                <div>
                    <strong style="font-size: 15px; color: #0f172a;"><?php _e('Continuous Localization & Translation Memory (TM)', 'verbocat-connector'); ?></strong>
                    <p style="margin: 4px 0 0 0; color: #64748b;">
                        <?php _e('Default target languages:', 'verbocat-connector'); ?> 
                        <strong><?php echo esc_html($opts['target_langs']); ?></strong>
                    </p>
                </div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button type="button" class="button button-primary button-large verbocat-open-modal-btn" style="background: #2563eb; border-color: #1d4ed8; font-weight: 600; padding: 0 16px;">
                        <span class="dashicons dashicons-translation" style="vertical-align: middle; margin-right: 4px;"></span>
                        <?php _e('Select Components & Translate 🌐', 'verbocat-connector'); ?>
                    </button>
                    <button type="button" class="button button-secondary button-large verbocat-sync-tm-btn" style="font-weight: 600;">
                        <span class="dashicons dashicons-update" style="vertical-align: middle; margin-right: 4px;"></span>
                        <?php _e('Sync from TM 🔄', 'verbocat-connector'); ?>
                    </button>
                </div>
            </div>

            <div class="verbocat-status-msg" style="margin: 10px 0; font-size: 14px;"></div>

            <!-- Existing Language Versions Grid -->
            <div style="margin-top: 14px; border-top: 1px solid #e2e8f0; padding-top: 14px;">
                <strong style="color: #334155; font-size: 13px;"><?php _e('Language Versions for this Page/Post:', 'verbocat-connector'); ?></strong>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; margin-top: 10px;">
                    <?php foreach ($target_langs as $t_lang): 
                        $t_id = $translations[$t_lang] ?? null;
                        $t_meta = Verbocat_Languages::get_language($t_lang);
                        $has_trans = $t_id && get_post($t_id);
                    ?>
                        <div style="background: <?php echo $has_trans ? '#f8fafc' : '#fff'; ?>; border: 1px solid <?php echo $has_trans ? '#cbd5e1' : '#e2e8f0'; ?>; border-radius: 6px; padding: 10px 12px;">
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                                <span style="font-weight: 700; font-size: 13px; display: flex; align-items: center; gap: 6px;">
                                    <span><?php echo esc_html($t_meta['flag']); ?></span>
                                    <span><?php echo esc_html($t_meta['native']); ?></span>
                                </span>
                                <span style="background: <?php echo $has_trans ? '#15803d' : '#94a3b8'; ?>; color: #fff; padding: 1px 6px; border-radius: 4px; font-weight: bold; font-size: 10px; text-transform: uppercase;">
                                    <?php echo $has_trans ? esc_html(get_post_status($t_id)) : 'Pending'; ?>
                                </span>
                            </div>
                            <?php if ($has_trans): ?>
                                <div style="font-size: 12px; margin-top: 4px;">
                                    <a href="<?php echo get_edit_post_link($t_id); ?>" target="_blank" style="font-weight: 600; text-decoration: none; color: #0284c7;">
                                        <?php echo esc_html(get_the_title($t_id) ?: __('View Post', 'verbocat-connector')); ?> &rarr;
                                    </a>
                                </div>
                            <?php else: ?>
                                <span style="font-size: 11px; color: #64748b;"><?php _e('Click "Select Components" to translate', 'verbocat-connector'); ?></span>
                            <?php endif; ?>
                        </div>
                    <?php endforeach; ?>
                </div>
            </div>
        </div>
        <?php
    }

    /**
     * Render Gutenberg Top Bar button & Language + Component Selection Modal
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
                'key'   => '__title__',
                'badge' => '🏷️ Title',
                'text'  => $post->post_title
            ];
        }

        // 2. Excerpt Component (if present)
        if (!empty($post->post_excerpt)) {
            $components[] = [
                'key'   => '__excerpt__',
                'badge' => '📝 Excerpt',
                'text'  => $post->post_excerpt
            ];
        }

        // 3. Content Blocks / Headings / Paragraphs
        foreach ($extracted_blocks as $idx => $b) {
            if (!$b['is_tag'] && !empty($b['clean_text'])) {
                $raw = $b['raw_html'];
                $badge = '📄 Paragraph';
                if (preg_match('/<h([1-6])/i', $raw, $m)) {
                    $badge = '📌 Heading H' . $m[1];
                } else if (str_contains($raw, '<li')) {
                    $badge = '📋 List Item';
                } else if (str_contains($raw, '<blockquote')) {
                    $badge = '💬 Quote';
                } else if (str_contains($raw, '<button') || str_contains($raw, 'wp-block-button')) {
                    $badge = '🔘 Button';
                }

                $components[] = [
                    'key'   => 'block_' . $idx,
                    'badge' => $badge,
                    'text'  => $b['clean_text']
                ];
            }
        }
        ?>

        <!-- Verbocat Language & Component Selection Modal -->
        <div id="verbocat-lang-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(4px); z-index: 999999; justify-content: center; align-items: center; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            <div style="background: #ffffff; width: 90%; max-width: 620px; max-height: 88vh; border-radius: 12px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); display: flex; flex-direction: column; overflow: hidden; animation: vbModalFadeIn 0.2s ease;">
                
                <!-- Modal Header -->
                <div style="padding: 18px 24px; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between; background: #f8fafc;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="dashicons dashicons-translation" style="font-size: 24px; width: 24px; height: 24px; color: #2563eb;"></span>
                        <h2 style="margin: 0; font-size: 17px; font-weight: 700; color: #0f172a;"><?php _e('Translate Selected Components with Verbocat', 'verbocat-connector'); ?></h2>
                    </div>
                    <button type="button" id="verbocat-modal-close" style="background: none; border: none; font-size: 22px; color: #64748b; cursor: pointer; line-height: 1; padding: 4px;">&times;</button>
                </div>

                <!-- Modal Body -->
                <div style="padding: 20px 24px; overflow-y: auto; flex: 1;">
                    
                    <!-- 1. Source Language Picker -->
                    <div style="margin-bottom: 18px;">
                        <label for="vb_modal_source_lang" style="display: block; font-weight: 600; font-size: 13px; color: #334155; margin-bottom: 6px;">
                            <?php _e('Source Language (Original Content):', 'verbocat-connector'); ?>
                        </label>
                        <select id="vb_modal_source_lang" style="width: 100%; max-width: 100%; height: 38px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 14px;">
                            <?php foreach ($all_languages as $code => $info): ?>
                                <option value="<?php echo esc_attr($code); ?>" <?php selected($code, $default_src); ?>>
                                    <?php echo esc_html($info['flag'] . ' ' . $info['name'] . ' (' . $info['native'] . ') [' . $code . ']'); ?>
                                </option>
                            <?php endforeach; ?>
                        </select>
                    </div>

                    <!-- 2. Target Languages Selection Grid -->
                    <div style="margin-bottom: 18px;">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                            <label style="font-weight: 600; font-size: 13px; color: #334155;">
                                <?php _e('Target Languages:', 'verbocat-connector'); ?>
                            </label>
                            <div style="font-size: 12px;">
                                <a href="#" id="vb-select-all" style="color: #2563eb; text-decoration: none; font-weight: 600; margin-right: 8px;"><?php _e('Select All', 'verbocat-connector'); ?></a> |
                                <a href="#" id="vb-clear-all" style="color: #64748b; text-decoration: none; margin-left: 8px;"><?php _e('Clear All', 'verbocat-connector'); ?></a>
                            </div>
                        </div>

                        <div style="max-height: 140px; overflow-y: auto; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 12px; background: #f8fafc; display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px;">
                            <?php foreach ($all_languages as $code => $info): 
                                $is_checked = in_array($code, $configured_targets);
                            ?>
                                <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; padding: 4px 6px; border-radius: 4px; background: #ffffff; border: 1px solid #e2e8f0;">
                                    <input type="checkbox" class="vb-target-lang-cb" value="<?php echo esc_attr($code); ?>" <?php checked($is_checked); ?> />
                                    <span><?php echo esc_html($info['flag']); ?></span>
                                    <span style="font-weight: 500; color: #1e293b;"><?php echo esc_html($info['native']); ?></span>
                                </label>
                            <?php endforeach; ?>
                        </div>
                    </div>

                    <!-- 3. Page Components / Blocks Selector -->
                    <div style="margin-bottom: 18px;">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                            <label style="font-weight: 600; font-size: 13px; color: #334155;">
                                🧩 <?php _e('Select Components / Blocks to Translate:', 'verbocat-connector'); ?>
                            </label>
                            <div style="font-size: 12px;">
                                <a href="#" id="vb-comp-select-all" style="color: #2563eb; text-decoration: none; font-weight: 600; margin-right: 8px;"><?php _e('Select All', 'verbocat-connector'); ?></a> |
                                <a href="#" id="vb-comp-clear-all" style="color: #64748b; text-decoration: none; margin-left: 8px;"><?php _e('Clear All', 'verbocat-connector'); ?></a>
                            </div>
                        </div>

                        <div style="max-height: 180px; overflow-y: auto; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px; background: #f8fafc; display: flex; flex-direction: column; gap: 6px;">
                            <?php if (empty($components)): ?>
                                <span style="color: #64748b; font-size: 12px; padding: 8px;"><?php _e('No text content found on this page. Add headings/paragraphs first.', 'verbocat-connector'); ?></span>
                            <?php else: ?>
                                <?php foreach ($components as $comp): ?>
                                    <label style="display: flex; align-items: flex-start; gap: 8px; font-size: 13px; cursor: pointer; padding: 6px 8px; border-radius: 6px; background: #ffffff; border: 1px solid #e2e8f0;">
                                        <input type="checkbox" class="vb-component-cb" value="<?php echo esc_attr($comp['key']); ?>" checked style="margin-top: 3px;" />
                                        <div style="flex: 1; min-width: 0;">
                                            <span style="background: #f1f5f9; color: #475569; font-size: 11px; font-weight: 700; padding: 1px 6px; border-radius: 3px; margin-right: 4px; display: inline-block;">
                                                <?php echo esc_html($comp['badge']); ?>
                                            </span>
                                            <span style="color: #1e293b; font-weight: 500;"><?php echo esc_html(wp_trim_words($comp['text'], 14, '...')); ?></span>
                                        </div>
                                    </label>
                                <?php endforeach; ?>
                            <?php endif; ?>
                        </div>
                    </div>

                    <!-- 4. Delta Sync Switch -->
                    <div style="margin-bottom: 12px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 10px 12px;">
                        <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: #166534; cursor: pointer;">
                            <input type="checkbox" id="vb_modal_delta_sync" value="1" <?php checked($opts['delta_sync'], '1'); ?> />
                            <span>⚡ <?php _e('Use Smart Delta Sync (Only translate changed sentences)', 'verbocat-connector'); ?></span>
                        </label>
                    </div>

                    <div id="vb-modal-status" style="margin-top: 10px; font-size: 13px;"></div>
                </div>

                <!-- Modal Footer -->
                <div style="padding: 14px 24px; border-top: 1px solid #e2e8f0; background: #f8fafc; display: flex; justify-content: flex-end; gap: 10px;">
                    <button type="button" id="vb-modal-cancel-btn" class="button" style="height: 38px; padding: 0 16px;"><?php _e('Cancel', 'verbocat-connector'); ?></button>
                    <button type="button" id="vb-modal-start-btn" class="button button-primary button-large" style="background: #2563eb; border-color: #1d4ed8; height: 38px; padding: 0 20px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px;">
                        <span>🚀 <?php _e('Translate Selected Components', 'verbocat-connector'); ?></span>
                    </button>
                </div>

            </div>
        </div>

        <style>
        @keyframes vbModalFadeIn { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
        </style>

        <script>
        jQuery(document).ready(function($) {
            // 1. Inject single unified button into Gutenberg Top Toolbar
            function injectGutenbergButton() {
                var $header = $('.edit-post-header__settings, .editor-header__settings');
                if ($header.length && !$('#verbocat-gutenberg-header-btn').length) {
                    var $topBtn = $('<button type="button" id="verbocat-gutenberg-header-btn" class="components-button is-primary verbocat-open-modal-btn" style="background: #2563eb; margin-right: 8px; font-weight: 600; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px;">🌐 <?php _e('Translate Page', 'verbocat-connector'); ?></button>');
                    $header.prepend($topBtn);
                }
            }
            setInterval(injectGutenbergButton, 1000);

            // 2. Open Modal Dialog
            $(document).on('click', '.verbocat-open-modal-btn', function(e) {
                e.preventDefault();
                $('#vb-modal-status').empty();
                $('#verbocat-lang-modal').css('display', 'flex');
            });

            // 3. Close Modal
            $('#verbocat-modal-close, #vb-modal-cancel-btn').on('click', function() {
                $('#verbocat-lang-modal').hide();
            });

            // 4. Languages Select / Clear All
            $('#vb-select-all').on('click', function(e) {
                e.preventDefault();
                $('.vb-target-lang-cb').prop('checked', true);
            });
            $('#vb-clear-all').on('click', function(e) {
                e.preventDefault();
                $('.vb-target-lang-cb').prop('checked', false);
            });

            // 5. Components Select / Clear All
            $('#vb-comp-select-all').on('click', function(e) {
                e.preventDefault();
                $('.vb-component-cb').prop('checked', true);
            });
            $('#vb-comp-clear-all').on('click', function(e) {
                e.preventDefault();
                $('.vb-component-cb').prop('checked', false);
            });

            // 6. Start Translation Execution
            $('#vb-modal-start-btn').on('click', function(e) {
                e.preventDefault();
                var $btn = $(this);
                var $status = $('#vb-modal-status');

                // Collect selected languages
                var selectedTargets = [];
                $('.vb-target-lang-cb:checked').each(function() {
                    selectedTargets.push($(this).val());
                });

                if (selectedTargets.length === 0) {
                    $status.html('<div style="color: #b91c1c; font-weight: 600; padding: 8px 12px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px;">&#10006; <?php _e('Please select at least one target language.', 'verbocat-connector'); ?></div>');
                    return;
                }

                // Collect selected components
                var selectedComponents = [];
                $('.vb-component-cb:checked').each(function() {
                    selectedComponents.push($(this).val());
                });

                if (selectedComponents.length === 0) {
                    $status.html('<div style="color: #b91c1c; font-weight: 600; padding: 8px 12px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px;">&#10006; <?php _e('Please select at least one component to translate.', 'verbocat-connector'); ?></div>');
                    return;
                }

                var sourceLang = $('#vb_modal_source_lang').val();
                var useDelta = $('#vb_modal_delta_sync').is(':checked') ? 1 : 0;

                $btn.prop('disabled', true).html('<span class="spinner is-active" style="float:none; margin:0 6px 0 0;"></span> <?php _e('Translating...', 'verbocat-connector'); ?>');
                $status.html('<div style="color: #2563eb; font-weight: 600; padding: 10px 14px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px;"><span class="spinner is-active" style="float:none; margin:0 8px 0 0;"></span><?php _e('Translating selected components via Verbocat AI & TM...', 'verbocat-connector'); ?></div>');

                $.post(ajaxurl, {
                    action: 'verbocat_manual_translate',
                    post_id: <?php echo $post->ID; ?>,
                    source_lang: sourceLang,
                    target_langs: selectedTargets,
                    selected_components: selectedComponents,
                    delta_sync: useDelta,
                    nonce: '<?php echo wp_create_nonce('verbocat_translate_' . $post->ID); ?>'
                }, function(res) {
                    $btn.prop('disabled', false).html('🚀 <?php _e('Translate Selected Components', 'verbocat-connector'); ?>');
                    if (res.success) {
                        $status.html('<div style="color: #15803d; font-weight: 600; padding: 10px 14px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px;">&#10004; ' + res.data.message + '</div>');
                        setTimeout(function() { window.location.reload(); }, 1200);
                    } else {
                        $status.html('<div style="color: #b91c1c; font-weight: 600; padding: 10px 14px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px;">&#10006; ' + (res.data ? res.data.message : 'Translation failed') + '</div>');
                    }
                }).fail(function() {
                    $btn.prop('disabled', false).html('🚀 <?php _e('Translate Selected Components', 'verbocat-connector'); ?>');
                    $status.html('<div style="color: #b91c1c; font-weight: 600; padding: 10px 14px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px;">&#10006; <?php _e('Network error. Check that Verbocat server is running.', 'verbocat-connector'); ?></div>');
                });
            });

            // 7. Sync from TM Button
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
