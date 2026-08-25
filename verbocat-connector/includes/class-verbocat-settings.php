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
            'api_url'            => 'https://verbocat-myhh.onrender.com/api/v1',
            'api_key'            => '',
            'source_lang'        => 'en',
            'target_langs'       => 'es, hi, fr',
            'auto_translate'     => '1',
            'delta_sync'         => '1',
            'post_status'        => 'publish', // 'draft' or 'publish'
            'show_switcher'      => '1',
            'switcher_position'  => 'bottom-right',
            'post_types'         => ['post', 'page']
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
        $sanitized['auto_translate'] = !empty($input['auto_translate']) ? '1' : '0';
        $sanitized['delta_sync'] = !empty($input['delta_sync']) ? '1' : '0';
        $sanitized['show_switcher'] = !empty($input['show_switcher']) ? '1' : '0';
        $sanitized['switcher_position'] = sanitize_text_field($input['switcher_position'] ?? 'bottom-right');
        $sanitized['post_status'] = in_array($input['post_status'] ?? '', ['publish', 'draft']) ? $input['post_status'] : 'publish';
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
        <div class="wrap">
            <h1 style="display: flex; align-items: center; gap: 10px;">
                <span class="dashicons dashicons-translation" style="font-size: 32px; width: 32px; height: 32px; color: #2563eb;"></span>
                <?php _e('Verbocat Localization Settings', 'verbocat-connector'); ?>
            </h1>
            <p style="color: #64748b; font-size: 14px;"><?php _e('Configure API credentials, language pairs, and continuous localization workflow.', 'verbocat-connector'); ?></p>
            
            <form method="post" action="options.php" style="max-width: 760px; background: #fff; padding: 24px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-top: 20px;">
                <?php settings_fields(self::$option_name); ?>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label for="verbocat_api_url"><?php _e('Verbocat API URL', 'verbocat-connector'); ?></label></th>
                        <td>
                            <input name="<?php echo self::$option_name; ?>[api_url]" type="url" id="verbocat_api_url" value="<?php echo esc_attr($opts['api_url']); ?>" class="regular-text" placeholder="https://centroid.verbolabs.com/api/v1" required />
                            <p class="description"><?php _e('Base URL of your Verbocat server (e.g. https://centroid.verbolabs.com/api/v1).', 'verbocat-connector'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="verbocat_api_key"><?php _e('API Key', 'verbocat-connector'); ?></label></th>
                        <td>
                            <input name="<?php echo self::$option_name; ?>[api_key]" type="text" id="verbocat_api_key" value="<?php echo esc_attr($opts['api_key']); ?>" class="regular-text" placeholder="vb_live_..." required />
                            <p class="description"><?php _e('Your unique client API key (e.g. vb_live_...).', 'verbocat-connector'); ?></p>
                            <div style="margin-top: 8px;">
                                <button type="button" id="verbocat_test_conn_btn" class="button button-secondary" style="font-weight: 500;">
                                    <?php _e('Test Connection & Check Quota', 'verbocat-connector'); ?>
                                </button>
                                <span id="verbocat_test_status" style="margin-left: 10px; font-size: 13px; vertical-align: middle;"></span>
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="verbocat_source_lang"><?php _e('Default Source Language', 'verbocat-connector'); ?></label></th>
                        <td>
                            <input name="<?php echo self::$option_name; ?>[source_lang]" type="text" id="verbocat_source_lang" value="<?php echo esc_attr($opts['source_lang']); ?>" class="small-text" placeholder="en" required />
                            <p class="description"><?php _e('Default language you author posts and pages in (e.g. en).', 'verbocat-connector'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="verbocat_target_langs"><?php _e('Default Target Languages', 'verbocat-connector'); ?></label></th>
                        <td>
                            <input name="<?php echo self::$option_name; ?>[target_langs]" type="text" id="verbocat_target_langs" value="<?php echo esc_attr($opts['target_langs']); ?>" class="regular-text" placeholder="es, hi, fr, de" required />
                            <p class="description"><?php _e('Comma-separated list of default target language codes (e.g. es, hi, fr, de, ar, ja).', 'verbocat-connector'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><?php _e('Smart Delta Sync', 'verbocat-connector'); ?></th>
                        <td>
                            <label>
                                <input name="<?php echo self::$option_name; ?>[delta_sync]" type="checkbox" value="1" <?php checked($opts['delta_sync'], '1'); ?> />
                                <strong><?php _e('Enable Smart Sentence/Block-Level Delta Sync', 'verbocat-connector'); ?></strong>
                            </label>
                            <p class="description"><?php _e('When updating content, only changed paragraphs are sent to AI. Unchanged paragraphs are reused, saving 90%+ AI credits.', 'verbocat-connector'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><?php _e('Auto-Translate on Publish', 'verbocat-connector'); ?></th>
                        <td>
                            <label>
                                <input name="<?php echo self::$option_name; ?>[auto_translate]" type="checkbox" value="1" <?php checked($opts['auto_translate'], '1'); ?> />
                                <?php _e('Automatically translate and generate language versions when a post or page is published.', 'verbocat-connector'); ?>
                            </label>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="verbocat_post_status"><?php _e('Translation Post Status', 'verbocat-connector'); ?></label></th>
                        <td>
                            <select name="<?php echo self::$option_name; ?>[post_status]" id="verbocat_post_status">
                                <option value="publish" <?php selected($opts['post_status'], 'publish'); ?>><?php _e('Publish (Instantly live on site)', 'verbocat-connector'); ?></option>
                                <option value="draft" <?php selected($opts['post_status'], 'draft'); ?>><?php _e('Draft (Review before publishing)', 'verbocat-connector'); ?></option>
                            </select>
                            <p class="description"><?php _e('Status assigned to newly generated translated posts and pages.', 'verbocat-connector'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><?php _e('Frontend Language Switcher', 'verbocat-connector'); ?></th>
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
                            <input type="text" readonly value="<?php echo esc_url($webhook_url); ?>" class="large-text" style="background: #f1f5f9; font-family: monospace;" onclick="this.select();" />
                            <p class="description"><?php _e('Use this endpoint in Verbocat to push live translations or TM updates back into WordPress.', 'verbocat-connector'); ?></p>
                        </td>
                    </tr>
                </table>
                <?php submit_button(__('Save Settings', 'verbocat-connector')); ?>
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
