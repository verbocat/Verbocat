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
        $sanitized['target_langs'] = sanitize_text_field($input['target_langs'] ?? 'es, hi, fr');
        
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
        return $sanitized;
    }

    /**
     * AJAX handler for testing API connection and retrieving remaining credits
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
        $consumed = number_format($res['credits_consumed'] ?? 0);
        $remaining = number_format($res['credits_remaining'] ?? 0);

        wp_send_json_success([
            'message'   => sprintf(__('✓ Connected to %s (%s remaining / %s allowed words)', 'verbocat-connector'), $org, $remaining, $allowed),
            'org'       => $org,
            'remaining' => $remaining,
            'allowed'   => $allowed
        ]);
    }

    /**
     * Render the admin settings screen
     */
    public static function render_settings_page() {
        $opts = self::get_options();
        $webhook_url = rest_url('verbocat/v1/sync');
        $test_nonce = wp_create_nonce('verbocat_test_nonce');
        ?>
        <div class="wrap" style="max-width: 920px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 16px; margin-bottom: 20px; border-bottom: 1px solid #e2e8f0; padding-bottom: 16px;">
                <div>
                    <h1 style="display: flex; align-items: center; gap: 10px; margin: 0; font-size: 24px; font-weight: 700; color: #0f172a;">
                        <span class="dashicons dashicons-translation" style="font-size: 28px; width: 28px; height: 28px; color: #2563eb;"></span>
                        <?php _e('Verbocat Localization Settings', 'verbocat-connector'); ?>
                    </h1>
                    <p style="color: #64748b; font-size: 14px; margin: 4px 0 0 0;"><?php _e('Configure API credentials, target languages, and continuous localization workflow rules.', 'verbocat-connector'); ?></p>
                </div>
                <div style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 6px;">
                    <span style="width: 8px; height: 8px; border-radius: 50%; background: #2563eb;"></span>
                    <?php _e('Engine: Continuous Localization Active', 'verbocat-connector'); ?>
                </div>
            </div>
            
            <form method="post" action="options.php" style="background: #fff; padding: 28px 32px; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <?php settings_fields(self::$option_name); ?>
                
                <!-- SECTION 1: API & CREDENTIALS -->
                <div style="margin-bottom: 28px;">
                    <h2 style="font-size: 16px; font-weight: 700; color: #1e293b; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
                        <span style="background: #f1f5f9; color: #475569; width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px;">1</span>
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

                <!-- SECTION 2: LANGUAGES -->
                <div style="margin-bottom: 28px;">
                    <h2 style="font-size: 16px; font-weight: 700; color: #1e293b; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
                        <span style="background: #f1f5f9; color: #475569; width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px;">2</span>
                        <?php _e('Languages & Default Pairs', 'verbocat-connector'); ?>
                    </h2>
                    
                    <table class="form-table" role="presentation" style="margin-top: 0;">
                        <tr>
                            <th scope="row" style="width: 220px;"><label for="verbocat_source_lang"><?php _e('Source Language', 'verbocat-connector'); ?></label></th>
                            <td>
                                <input name="<?php echo self::$option_name; ?>[source_lang]" type="text" id="verbocat_source_lang" value="<?php echo esc_attr($opts['source_lang']); ?>" class="small-text" placeholder="en" required />
                                <p class="description"><?php _e('Default authoring language (e.g. en).', 'verbocat-connector'); ?></p>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row"><label for="verbocat_target_langs"><?php _e('Target Languages', 'verbocat-connector'); ?></label></th>
                            <td>
                                <input name="<?php echo self::$option_name; ?>[target_langs]" type="text" id="verbocat_target_langs" value="<?php echo esc_attr($opts['target_langs']); ?>" class="regular-text" placeholder="es, hi, fr, de, it, ja" required style="width: 100%; max-width: 440px;" />
                                <p class="description"><?php _e('Comma-separated list of target language codes to monitor and translate (e.g. es, hi, fr, de).', 'verbocat-connector'); ?></p>
                            </td>
                        </tr>
                    </table>
                </div>

                <!-- SECTION 3: CONTINUOUS LOCALIZATION WORKFLOW & ICE MATCHING RULES -->
                <div style="margin-bottom: 28px; background: #f8fafc; padding: 20px 24px; border-radius: 8px; border: 1px solid #e2e8f0;">
                    <h2 style="font-size: 16px; font-weight: 700; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-top: 0; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between;">
                        <span style="display: flex; align-items: center; gap: 8px;">
                            <span style="background: #2563eb; color: #fff; width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;">3</span>
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

                        <!-- Smart Delta Sync Checkbox -->
                        <tr>
                            <th scope="row"><?php _e('Smart Delta Sync', 'verbocat-connector'); ?></th>
                            <td>
                                <label>
                                    <input name="<?php echo self::$option_name; ?>[delta_sync]" type="checkbox" value="1" <?php checked($opts['delta_sync'], '1'); ?> />
                                    <strong><?php _e('Enable Block-Level Fingerprint Diffing', 'verbocat-connector'); ?></strong>
                                </label>
                                <p class="description"><?php _e('Only sends changed sentences to AI, reusing existing block translations to save 90%+ word quota.', 'verbocat-connector'); ?></p>
                            </td>
                        </tr>
                    </table>
                </div>

                <!-- SECTION 4: FRONTEND WIDGET & WEBHOOK -->
                <div style="margin-bottom: 16px;">
                    <h2 style="font-size: 16px; font-weight: 700; color: #1e293b; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
                        <span style="background: #f1f5f9; color: #475569; width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px;">4</span>
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
                    <?php submit_button(__('Save Workflow Settings', 'verbocat-connector'), 'primary large', 'submit', false, ['style' => 'font-weight: 600; padding: 6px 24px; font-size: 14px; border-radius: 6px;']); ?>
                </div>
            </form>
        </div>

        <script>
        jQuery(document).ready(function($) {
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
        });
        </script>
        <?php
    }
}
