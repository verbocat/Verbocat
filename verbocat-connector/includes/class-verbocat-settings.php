<?php
/**
 * Verbocat Settings & Admin Menu Management
 *
 * @package Verbocat_Connector
 */

if (!defined('ABSPATH')) {
    exit;
}

class Verbocat_Settings {

    private static $option_name = 'verbocat_settings';

    /**
     * Initialize settings hooks
     */
    public static function init() {
        add_action('admin_menu', [__CLASS__, 'add_admin_menu']);
        add_action('admin_init', [__CLASS__, 'register_settings']);
        add_action('wp_ajax_verbocat_test_connection', [__CLASS__, 'ajax_test_connection']);
        add_action('wp_ajax_verbocat_save_page_automation', [__CLASS__, 'ajax_save_page_automation']);
    }

    /**
     * Get plugin options with default fallbacks
     */
    public static function get_options() {
        $defaults = [
            'api_url'                 => 'https://verbocat-myhh.onrender.com/api/v1',
            'api_key'                 => '',
            'source_lang'             => 'en',
            'target_langs'            => 'es, hi, fr',
            'workflow_mode'           => 'ice_first', // 'ice_first', 'ai', 'manual_review'
            'auto_push_policy'        => 'ice_only',  // 'ice_only', 'always_draft', 'always_publish'
            'continuous_sync_trigger' => 'publish_update', // 'publish_update', 'manual_only'
            'auto_translate'          => '1', // 1 = continuous on save/publish, 0 = manual only
            'delta_sync'              => '1',
            'post_status'             => 'draft', // Fallback status
            'show_switcher'           => '1',
            'switcher_position'       => 'bottom-right',
            'post_types'              => ['post', 'page']
        ];
        return wp_parse_args(get_option(self::$option_name, []), $defaults);
    }

    /**
     * Add admin menu item
     */
    public static function add_admin_menu() {
        add_options_page(
            __('Verbocat Localization', 'verbocat-connector'),
            __('Verbocat Localization', 'verbocat-connector'),
            'manage_options',
            'verbocat-settings',
            [__CLASS__, 'render_settings_page']
        );
    }

    /**
     * Register settings in WordPress
     */
    public static function register_settings() {
        register_setting(self::$option_name, self::$option_name, [__CLASS__, 'sanitize_settings']);
    }

    /**
     * Sanitize settings input
     */
    public static function sanitize_settings($input) {
        $sanitized = [];
        $sanitized['api_url'] = rtrim(esc_url_raw($input['api_url'] ?? ''), '/');
        $sanitized['api_key'] = sanitize_text_field($input['api_key'] ?? '');
        $sanitized['source_lang'] = sanitize_text_field($input['source_lang'] ?? 'en');
        
        if (isset($input['target_langs']) && is_array($input['target_langs'])) {
            $sanitized['target_langs'] = implode(', ', array_map('sanitize_text_field', $input['target_langs']));
        } else {
            $sanitized['target_langs'] = sanitize_text_field($input['target_langs'] ?? 'es, hi, fr');
        }
        
        $valid_workflows = ['ice_first', 'ai', 'manual_review'];
        $sanitized['workflow_mode'] = in_array($input['workflow_mode'] ?? '', $valid_workflows) ? $input['workflow_mode'] : 'ice_first';

        $valid_policies = ['ice_only', 'always_draft', 'always_publish'];
        $sanitized['auto_push_policy'] = in_array($input['auto_push_policy'] ?? '', $valid_policies) ? $input['auto_push_policy'] : 'ice_only';

        $valid_triggers = ['publish_update', 'manual_only'];
        $sanitized['continuous_sync_trigger'] = in_array($input['continuous_sync_trigger'] ?? '', $valid_triggers) ? $input['continuous_sync_trigger'] : 'publish_update';

        $sanitized['auto_translate'] = ($sanitized['continuous_sync_trigger'] === 'publish_update') ? '1' : '0';
        $sanitized['delta_sync'] = !empty($input['delta_sync']) ? '1' : '0';
        $sanitized['show_switcher'] = !empty($input['show_switcher']) ? '1' : '0';
        $sanitized['switcher_position'] = sanitize_text_field($input['switcher_position'] ?? 'bottom-right');
        $sanitized['post_status'] = in_array($input['post_status'] ?? '', ['publish', 'draft']) ? $input['post_status'] : 'draft';
        $sanitized['post_types'] = ['post', 'page'];

        // Save page-level automation rules if submitted
        if (!empty($_POST['page_automation']) && is_array($_POST['page_automation'])) {
            foreach ($_POST['page_automation'] as $p_id => $p_data) {
                $p_id = intval($p_id);
                if ($p_id > 0) {
                    $auto_on = !empty($p_data['enabled']) ? '1' : '0';
                    $p_langs = !empty($p_data['langs']) && is_array($p_data['langs']) ? array_map('sanitize_text_field', $p_data['langs']) : [];
                    update_post_meta($p_id, '_verbocat_auto_sync_enabled', $auto_on);
                    update_post_meta($p_id, '_verbocat_auto_target_langs', $p_langs);
                }
            }
        }

        return $sanitized;
    }

    /**
     * AJAX handler for testing API connection
     */
    public static function ajax_test_connection() {
        check_ajax_referer('verbocat_test_nonce', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error(['message' => __('Permission denied.', 'verbocat-connector')]);
        }

        $api_url = sanitize_text_field($_POST['api_url'] ?? '');
        $api_key = sanitize_text_field($_POST['api_key'] ?? '');

        if (empty($api_key)) {
            wp_send_json_error(['message' => __('Please enter an API Key first.', 'verbocat-connector')]);
        }

        $res = Verbocat_Api_Client::check_account($api_url, $api_key);

        if (is_wp_error($res)) {
            wp_send_json_error(['message' => $res->get_error_message()]);
        }

        $org = $res['organization'] ?? 'Workspace';
        $allowed = number_format($res['credits_allowed'] ?? 0);
        $remaining = number_format($res['credits_remaining'] ?? 0);

        wp_send_json_success([
            'message'   => sprintf(__('✓ Connected to %s (%s remaining / %s allowed words)', 'verbocat-connector'), $org, $remaining, $allowed),
            'org'       => $org,
            'remaining' => $remaining,
            'allowed'   => $allowed
        ]);
    }

    /**
     * AJAX handler for quick-saving single page automation rules
     */
    public static function ajax_save_page_automation() {
        check_ajax_referer('verbocat_test_nonce', 'nonce');

        if (!current_user_can('edit_posts')) {
            wp_send_json_error(['message' => __('Permission denied.', 'verbocat-connector')]);
        }

        $post_id = intval($_POST['post_id'] ?? 0);
        $enabled = !empty($_POST['enabled']) ? '1' : '0';
        $langs = !empty($_POST['langs']) && is_array($_POST['langs']) ? array_map('sanitize_text_field', $_POST['langs']) : [];

        if ($post_id <= 0) {
            wp_send_json_error(['message' => __('Invalid Post ID.', 'verbocat-connector')]);
        }

        update_post_meta($post_id, '_verbocat_auto_sync_enabled', $enabled);
        update_post_meta($post_id, '_verbocat_auto_target_langs', $langs);

        wp_send_json_success([
            'message' => __('Automation settings updated successfully.', 'verbocat-connector')
        ]);
    }

    /**
     * Render the admin settings screen
     */
    public static function render_settings_page() {
        $opts = self::get_options();
        $webhook_url = rest_url('verbocat/v1/sync');
        $test_nonce = wp_create_nonce('verbocat_test_nonce');

        $all_languages = Verbocat_Languages::get_all_languages();
        $selected_target_langs = array_map('trim', explode(',', $opts['target_langs']));

        // Query published source posts & pages (excluding translated posts)
        $source_pages = get_posts([
            'post_type'      => ['page', 'post'],
            'post_status'    => 'publish',
            'posts_per_page' => 150,
            'orderby'        => 'post_type',
            'order'          => 'ASC',
            'meta_query'     => [
                [
                    'key'     => '_verbocat_is_translation',
                    'compare' => 'NOT EXISTS'
                ]
            ]
        ]);
        ?>
        <div class="wrap" style="max-width: 1040px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 16px; margin-bottom: 20px; border-bottom: 1px solid #e2e8f0; padding-bottom: 16px;">
                <div>
                    <h1 style="display: flex; align-items: center; gap: 10px; margin: 0; font-size: 24px; font-weight: 700; color: #0f172a;">
                        <span class="dashicons dashicons-translation" style="font-size: 28px; width: 28px; height: 28px; color: #2563eb;"></span>
                        <?php _e('Verbocat Continuous Localization & Automation Hub', 'verbocat-connector'); ?>
                    </h1>
                    <p style="color: #64748b; font-size: 14px; margin: 4px 0 0 0;"><?php _e('Select pages and assign their target languages for automated background sync and ICE translation.', 'verbocat-connector'); ?></p>
                </div>
                <div style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 6px;">
                    <span style="width: 8px; height: 8px; border-radius: 50%; background: #2563eb;"></span>
                    <?php _e('Continuous Engine Active', 'verbocat-connector'); ?>
                </div>
            </div>
            
            <form method="post" action="options.php" style="background: #fff; padding: 28px 32px; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <?php settings_fields(self::$option_name); ?>
                
                <!-- SECTION 1: API & CREDENTIALS -->
                <div style="margin-bottom: 28px;">
                    <h2 style="font-size: 16px; font-weight: 700; color: #1e293b; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
                        <span style="background: #f1f5f9; color: #475569; width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;">1</span>
                        <?php _e('API Server & Authorization', 'verbocat-connector'); ?>
                    </h2>
                    
                    <table class="form-table" role="presentation" style="margin-top: 0;">
                        <tr>
                            <th scope="row" style="width: 220px;"><label for="verbocat_api_url"><?php _e('Verbocat API URL', 'verbocat-connector'); ?></label></th>
                            <td>
                                <input name="<?php echo self::$option_name; ?>[api_url]" type="url" id="verbocat_api_url" value="<?php echo esc_attr($opts['api_url']); ?>" class="regular-text" placeholder="https://verbocat-myhh.onrender.com/api/v1" required style="width: 100%; max-width: 440px;" />
                                <p class="description"><?php _e('Direct backend endpoint for fastest processing (e.g. https://verbocat-myhh.onrender.com/api/v1).', 'verbocat-connector'); ?></p>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row"><label for="verbocat_api_key"><?php _e('Client API Key', 'verbocat-connector'); ?></label></th>
                            <td>
                                <input name="<?php echo self::$option_name; ?>[api_key]" type="text" id="verbocat_api_key" value="<?php echo esc_attr($opts['api_key']); ?>" class="regular-text" placeholder="vb_live_..." required style="width: 100%; max-width: 440px;" />
                                <p class="description"><?php _e('Your unique workspace API Key.', 'verbocat-connector'); ?></p>
                                <div style="margin-top: 10px;">
                                    <button type="button" id="verbocat_test_conn_btn" class="button button-secondary" style="font-weight: 600; border-radius: 6px;">
                                        <?php _e('Test Connection & Check Quota', 'verbocat-connector'); ?>
                                    </button>
                                    <span id="verbocat_test_status" style="margin-left: 12px; font-size: 13px; vertical-align: middle;"></span>
                                </div>
                            </td>
                        </tr>
                    </table>
                </div>

                <!-- SECTION 2: WORKFLOW & ICE RULES -->
                <div style="margin-bottom: 28px; background: #f8fafc; padding: 20px 24px; border-radius: 8px; border: 1px solid #e2e8f0;">
                    <h2 style="font-size: 16px; font-weight: 700; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-top: 0; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between;">
                        <span style="display: flex; align-items: center; gap: 8px;">
                            <span style="background: #2563eb; color: #fff; width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;">2</span>
                            <?php _e('Continuous Localization Workflow & ICE Rules', 'verbocat-connector'); ?>
                        </span>
                        <span style="background: #dbeafe; color: #1e40af; font-size: 11px; padding: 3px 8px; border-radius: 4px; font-weight: 700; text-transform: uppercase;">
                            <?php _e('ICE Engine Active', 'verbocat-connector'); ?>
                        </span>
                    </h2>
                    
                    <table class="form-table" role="presentation" style="margin-top: 0;">
                        <!-- Workflow Automation Trigger -->
                        <tr>
                            <th scope="row" style="width: 220px;"><?php _e('Continuous Sync Trigger', 'verbocat-connector'); ?></th>
                            <td>
                                <fieldset>
                                    <label style="display: block; margin-bottom: 8px;">
                                        <input type="radio" name="<?php echo self::$option_name; ?>[continuous_sync_trigger]" value="publish_update" <?php checked($opts['continuous_sync_trigger'], 'publish_update'); ?> />
                                        <strong><?php _e('Continuous (Automated on Source Post Publish / Update)', 'verbocat-connector'); ?></strong>
                                        <div style="color: #64748b; font-size: 12px; margin-left: 24px; margin-top: 2px;">
                                            <?php _e('Whenever an author publishes or updates a source post, the connector automatically syncs deltas in the background.', 'verbocat-connector'); ?>
                                        </div>
                                    </label>
                                    <label style="display: block;">
                                        <input type="radio" name="<?php echo self::$option_name; ?>[continuous_sync_trigger]" value="manual_only" <?php checked($opts['continuous_sync_trigger'], 'manual_only'); ?> />
                                        <strong><?php _e('Manual Only (Trigger via "Translate Page" modal)', 'verbocat-connector'); ?></strong>
                                        <div style="color: #64748b; font-size: 12px; margin-left: 24px; margin-top: 2px;">
                                            <?php _e('Translations are only executed when an editor clicks the Translate Page button.', 'verbocat-connector'); ?>
                                        </div>
                                    </label>
                                </fieldset>
                            </td>
                        </tr>

                        <!-- Translation Engine Mode -->
                        <tr>
                            <th scope="row"><?php _e('Translation Workflow Mode', 'verbocat-connector'); ?></th>
                            <td>
                                <select name="<?php echo self::$option_name; ?>[workflow_mode]" id="verbocat_workflow_mode" style="min-width: 320px; font-weight: 500;">
                                    <option value="ice_first" <?php selected($opts['workflow_mode'], 'ice_first'); ?>>
                                        <?php _e('Hybrid (ICE-First TM Match ➔ AI Translation Fallback)', 'verbocat-connector'); ?>
                                    </option>
                                    <option value="ai" <?php selected($opts['workflow_mode'], 'ai'); ?>>
                                        <?php _e('Pure AI Translation (Instant AI for all content)', 'verbocat-connector'); ?>
                                    </option>
                                    <option value="manual_review" <?php selected($opts['workflow_mode'], 'manual_review'); ?>>
                                        <?php _e('Human-in-the-Loop (Save as Draft for human linguist review)', 'verbocat-connector'); ?>
                                    </option>
                                </select>
                                <p class="description"><?php _e('Determines how new and modified content blocks are localized.', 'verbocat-connector'); ?></p>
                            </td>
                        </tr>

                        <!-- Auto-Push / Publishing Policy -->
                        <tr>
                            <th scope="row"><?php _e('Auto-Push & Publishing Policy', 'verbocat-connector'); ?></th>
                            <td>
                                <select name="<?php echo self::$option_name; ?>[auto_push_policy]" id="verbocat_auto_push_policy" style="min-width: 340px; font-weight: 600; color: #0f172a;">
                                    <option value="ice_only" <?php selected($opts['auto_push_policy'], 'ice_only'); ?>>
                                        <?php _e('🛡️ ICE-Only: Auto-Publish if 100% ICE Matched (Otherwise Draft)', 'verbocat-connector'); ?>
                                    </option>
                                    <option value="always_draft" <?php selected($opts['auto_push_policy'], 'always_draft'); ?>>
                                        <?php _e('📝 Always Save as Draft (Manual review required before live)', 'verbocat-connector'); ?>
                                    </option>
                                    <option value="always_publish" <?php selected($opts['auto_push_policy'], 'always_publish'); ?>>
                                        <?php _e('🚀 Always Publish (Instantly live on site for all translations)', 'verbocat-connector'); ?>
                                    </option>
                                </select>
                                
                                <div style="margin-top: 10px; background: #ffffff; border: 1px solid #cbd5e1; border-left: 4px solid #2563eb; padding: 10px 14px; border-radius: 6px; font-size: 12px; color: #334155; line-height: 1.5;">
                                    <strong><?php _e('💡 How ICE Matching works:', 'verbocat-connector'); ?></strong><br />
                                    • <strong>Auto-Push on ICE:</strong> If all updated sentences in a post have previously verified human-approved translations in TM, the translated post automatically publishes live.<br />
                                    • <strong>AI Content to Draft:</strong> If any sentence required new AI translation (non-ICE), the translated post stays in <strong>Draft</strong> so you can review it.<br />
                                    • <strong>Automatic ICE Promotion:</strong> Whenever you publish a translated post in WordPress, its sentences are <strong>automatically registered as verified ICE matches in Translation Memory</strong> for future auto-push!
                                </div>
                            </td>
                        </tr>
                    </table>
                </div>

                <!-- SECTION 3: GLOBAL DEFAULT LANGUAGES -->
                <div style="margin-bottom: 28px;">
                    <h2 style="font-size: 16px; font-weight: 700; color: #1e293b; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
                        <span style="background: #f1f5f9; color: #475569; width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;">3</span>
                        <?php _e('Global Target Languages Pool', 'verbocat-connector'); ?>
                    </h2>
                    
                    <p style="color: #64748b; font-size: 13px; margin-bottom: 12px;">
                        <?php _e('Select the default languages available across your website. You can also customize exact target languages per page below.', 'verbocat-connector'); ?>
                    </p>

                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; background: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0;">
                        <?php 
                        $popular_codes = ['es', 'hi', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ar', 'nl', 'tr', 'ko', 'vi', 'sv', 'pl'];
                        foreach ($popular_codes as $code): 
                            if (!isset($all_languages[$code])) continue;
                            $meta = $all_languages[$code];
                            $is_checked = in_array($code, $selected_target_langs);
                        ?>
                            <label style="display: flex; align-items: center; gap: 8px; background: <?php echo $is_checked ? '#eff6ff' : '#ffffff'; ?>; border: 1px solid <?php echo $is_checked ? '#93c5fd' : '#e2e8f0'; ?>; padding: 8px 12px; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer;">
                                <input type="checkbox" name="<?php echo self::$option_name; ?>[target_langs][]" value="<?php echo esc_attr($code); ?>" <?php checked($is_checked); ?> style="accent-color: #2563eb;" />
                                <span><?php echo $meta['flag']; ?> <?php echo esc_html($meta['name']); ?></span>
                            </label>
                        <?php endforeach; ?>
                    </div>
                </div>

                <!-- SECTION 4: PAGE & POST AUTOMATION HUB -->
                <div style="margin-bottom: 28px;">
                    <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; margin-bottom: 16px;">
                        <h2 style="font-size: 16px; font-weight: 700; color: #1e293b; margin: 0; display: flex; align-items: center; gap: 8px;">
                            <span style="background: #2563eb; color: #fff; width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;">4</span>
                            <?php _e('Content Automation Hub (Select Pages & Target Languages)', 'verbocat-connector'); ?>
                        </h2>
                        <input type="text" id="vb_page_filter_input" placeholder="<?php esc_attr_e('Search pages & posts...', 'verbocat-connector'); ?>" style="padding: 4px 10px; font-size: 12px; border-radius: 6px; border: 1px solid #cbd5e1; width: 200px;" />
                    </div>

                    <p style="color: #64748b; font-size: 13px; margin-bottom: 12px;">
                        <?php _e('Configure continuous automation for each specific page or post. Select which target languages will automatically sync whenever the source content is updated.', 'verbocat-connector'); ?>
                    </p>

                    <div style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                        <table class="widefat fixed striped" id="vb_pages_automation_table" style="border: none; margin: 0;">
                            <thead>
                                <tr style="background: #f8fafc;">
                                    <th style="width: 220px; font-weight: 700; color: #334155; padding: 10px 14px;"><?php _e('Page / Post Title', 'verbocat-connector'); ?></th>
                                    <th style="width: 140px; font-weight: 700; color: #334155; padding: 10px 14px;"><?php _e('Continuous Auto-Sync', 'verbocat-connector'); ?></th>
                                    <th style="font-weight: 700; color: #334155; padding: 10px 14px;"><?php _e('Assigned Target Languages', 'verbocat-connector'); ?></th>
                                    <th style="width: 140px; font-weight: 700; color: #334155; padding: 10px 14px;"><?php _e('Translations', 'verbocat-connector'); ?></th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php if (empty($source_pages)): ?>
                                    <tr>
                                        <td colspan="4" style="text-align: center; padding: 24px; color: #94a3b8;">
                                            <?php _e('No published pages or posts found.', 'verbocat-connector'); ?>
                                        </td>
                                    </tr>
                                <?php else: ?>
                                    <?php foreach ($source_pages as $sp): 
                                        $sp_id = $sp->ID;
                                        $sp_auto = get_post_meta($sp_id, '_verbocat_auto_sync_enabled', true);
                                        // Default to enabled if continuous mode is on and not explicitly disabled
                                        $is_sp_auto = ($sp_auto === '1') || ($sp_auto === '' && $opts['continuous_sync_trigger'] === 'publish_update');
                                        
                                        $sp_saved_langs = get_post_meta($sp_id, '_verbocat_auto_target_langs', true);
                                        $sp_langs = is_array($sp_saved_langs) ? $sp_saved_langs : $selected_target_langs;

                                        $translations = get_post_meta($sp_id, '_verbocat_translations', true) ?: [];
                                        $trans_count = count($translations);
                                    ?>
                                        <tr class="vb-page-row" data-title="<?php echo esc_attr(strtolower($sp->post_title)); ?>">
                                            <td style="padding: 10px 14px; vertical-align: middle;">
                                                <div style="font-weight: 600; color: #0f172a; font-size: 13px;">
                                                    <?php echo esc_html($sp->post_title ?: __('(No Title)', 'verbocat-connector')); ?>
                                                </div>
                                                <div style="display: flex; align-items: center; gap: 6px; margin-top: 2px;">
                                                    <span style="font-size: 11px; background: #f1f5f9; color: #475569; padding: 1px 6px; border-radius: 4px; text-transform: uppercase;">
                                                        <?php echo esc_html($sp->post_type); ?>
                                                    </span>
                                                    <a href="<?php echo get_edit_post_link($sp_id); ?>" target="_blank" style="font-size: 11px; color: #2563eb; text-decoration: none;">
                                                        <?php _e('Edit', 'verbocat-connector'); ?> &rarr;
                                                    </a>
                                                </div>
                                            </td>
                                            <td style="padding: 10px 14px; vertical-align: middle;">
                                                <label style="display: inline-flex; align-items: center; gap: 6px; font-weight: 600; font-size: 12px; cursor: pointer; color: <?php echo $is_sp_auto ? '#16a34a' : '#64748b'; ?>;">
                                                    <input type="checkbox" name="page_automation[<?php echo $sp_id; ?>][enabled]" value="1" <?php checked($is_sp_auto); ?> class="vb-page-auto-toggle" data-pid="<?php echo $sp_id; ?>" style="accent-color: #16a34a; width: 16px; height: 16px;" />
                                                    <span><?php echo $is_sp_auto ? __('⚡ Active', 'verbocat-connector') : __('⏸ Paused', 'verbocat-connector'); ?></span>
                                                </label>
                                            </td>
                                            <td style="padding: 10px 14px; vertical-align: middle;">
                                                <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                                                    <?php 
                                                    $active_target_pool = !empty($selected_target_langs) ? $selected_target_langs : ['es', 'hi', 'fr', 'de'];
                                                    foreach ($active_target_pool as $t_code): 
                                                        $t_meta = $all_languages[$t_code] ?? ['name' => strtoupper($t_code), 'flag' => '🌐'];
                                                        $is_t_active = in_array($t_code, $sp_langs);
                                                    ?>
                                                        <label style="background: <?php echo $is_t_active ? '#eff6ff' : '#f8fafc'; ?>; border: 1px solid <?php echo $is_t_active ? '#93c5fd' : '#cbd5e1'; ?>; padding: 2px 8px; border-radius: 16px; font-size: 11px; font-weight: 600; color: <?php echo $is_t_active ? '#1e40af' : '#64748b'; ?>; display: inline-flex; align-items: center; gap: 4px; cursor: pointer;">
                                                            <input type="checkbox" name="page_automation[<?php echo $sp_id; ?>][langs][]" value="<?php echo esc_attr($t_code); ?>" <?php checked($is_t_active); ?> class="vb-page-lang-checkbox" data-pid="<?php echo $sp_id; ?>" style="accent-color: #2563eb; width: 13px; height: 13px;" />
                                                            <?php echo $t_meta['flag']; ?> <?php echo strtoupper($t_code); ?>
                                                        </label>
                                                    <?php endforeach; ?>
                                                </div>
                                            </td>
                                            <td style="padding: 10px 14px; vertical-align: middle;">
                                                <?php if ($trans_count > 0): ?>
                                                    <span style="background: #ecfdf5; color: #059669; font-weight: 600; font-size: 11px; padding: 3px 8px; border-radius: 20px;">
                                                        ✓ <?php echo sprintf(_n('%d Language', '%d Languages', $trans_count, 'verbocat-connector'), $trans_count); ?>
                                                    </span>
                                                <?php else: ?>
                                                    <span style="color: #94a3b8; font-size: 12px;">
                                                        <?php _e('Not translated', 'verbocat-connector'); ?>
                                                    </span>
                                                <?php endif; ?>
                                            </td>
                                        </tr>
                                    <?php endforeach; ?>
                                <?php endif; ?>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- SECTION 5: FRONTEND WIDGET & WEBHOOK -->
                <div style="margin-bottom: 16px;">
                    <h2 style="font-size: 16px; font-weight: 700; color: #1e293b; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
                        <span style="background: #f1f5f9; color: #475569; width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;">5</span>
                        <?php _e('Frontend Switcher & Studio Webhook', 'verbocat-connector'); ?>
                    </h2>
                    
                    <table class="form-table" role="presentation" style="margin-top: 0;">
                        <tr>
                            <th scope="row" style="width: 220px;"><?php _e('Frontend Switcher', 'verbocat-connector'); ?></th>
                            <td>
                                <label>
                                    <input name="<?php echo self::$option_name; ?>[show_switcher]" type="checkbox" value="1" <?php checked($opts['show_switcher'], '1'); ?> />
                                    <?php _e('Display modern floating language selector widget on the live website.', 'verbocat-connector'); ?>
                                </label>
                                <div style="margin-top: 8px;">
                                    <label><?php _e('Position: ', 'verbocat-connector'); ?></label>
                                    <select name="<?php echo self::$option_name; ?>[switcher_position]">
                                        <option value="bottom-right" <?php selected($opts['switcher_position'], 'bottom-right'); ?>><?php _e('Bottom Right', 'verbocat-connector'); ?></option>
                                        <option value="bottom-left" <?php selected($opts['switcher_position'], 'bottom-left'); ?>><?php _e('Bottom Left', 'verbocat-connector'); ?></option>
                                        <option value="top-right" <?php selected($opts['switcher_position'], 'top-right'); ?>><?php _e('Top Right', 'verbocat-connector'); ?></option>
                                    </select>
                                </div>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row"><?php _e('Two-Way Webhook URL', 'verbocat-connector'); ?></th>
                            <td>
                                <input type="text" readonly value="<?php echo esc_url($webhook_url); ?>" class="large-text" style="background: #f8fafc; font-family: monospace; width: 100%; max-width: 520px;" onclick="this.select();" />
                                <p class="description"><?php _e('Use this endpoint in Verbocat to push live translations or TM updates back into WordPress.', 'verbocat-connector'); ?></p>
                            </td>
                        </tr>
                    </table>
                </div>

                <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between;">
                    <?php submit_button(__('Save All Workflow & Automation Settings', 'verbocat-connector'), 'primary large', 'submit', false, ['style' => 'font-weight: 600; padding: 8px 28px; font-size: 14px; border-radius: 6px;']); ?>
                </div>
            </form>
        </div>

        <script>
        jQuery(document).ready(function($) {
            // Test API Connection
            $('#verbocat_test_conn_btn').on('click', function(e) {
                e.preventDefault();
                var $btn = $(this);
                var $status = $('#verbocat_test_status');
                var apiUrl = $('#verbocat_api_url').val();
                var apiKey = $('#verbocat_api_key').val();

                if (!apiKey) {
                    $status.html('<span style="color: #b91c1c;">Please enter an API Key first.</span>');
                    return;
                }

                $btn.prop('disabled', true).text('Testing...');
                $status.html('<span style="color: #2563eb;">Connecting to Verbocat...</span>');

                $.post(ajaxurl, {
                    action: 'verbocat_test_connection',
                    api_url: apiUrl,
                    api_key: apiKey,
                    nonce: '<?php echo $test_nonce; ?>'
                }, function(res) {
                    $btn.prop('disabled', false).text('<?php _e('Test Connection & Check Quota', 'verbocat-connector'); ?>');
                    if (res.success) {
                        $status.html('<span style="color: #16a34a; font-weight: 600;">' + res.data.message + '</span>');
                    } else {
                        $status.html('<span style="color: #b91c1c; font-weight: 500;">✕ ' + (res.data ? res.data.message : 'Connection failed') + '</span>');
                    }
                }).fail(function() {
                    $btn.prop('disabled', false).text('<?php _e('Test Connection & Check Quota', 'verbocat-connector'); ?>');
                    $status.html('<span style="color: #b91c1c;">✕ Network error or invalid API URL.</span>');
                });
            });

            // Live Search Filter for Pages Table
            $('#vb_page_filter_input').on('keyup', function() {
                var query = $(this).val().toLowerCase();
                $('#vb_pages_automation_table tbody tr.vb-page-row').each(function() {
                    var title = $(this).data('title') || '';
                    $(this).toggle(title.indexOf(query) > -1);
                });
            });

            // Interactive Auto-Sync Toggle Text Update
            $('.vb-page-auto-toggle').on('change', function() {
                var isChecked = $(this).is(':checked');
                var $label = $(this).closest('label');
                $label.find('span').text(isChecked ? '⚡ Active' : '⏸ Paused');
                $label.css('color', isChecked ? '#16a34a' : '#64748b');
            });
        });
        </script>
        <?php
    }
}
