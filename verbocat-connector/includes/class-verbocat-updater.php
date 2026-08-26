<?php
if (!defined('ABSPATH')) exit;

/**
 * Verbocat Cloud Auto-Updater
 * Checks GitHub repository for updates and allows 1-click cloud updates in WP Admin.
 */
class Verbocat_Updater {

    private static $plugin_file = 'verbocat-connector/verbocat-connector.php';
    private static $github_repo = 'verbocat/Verbocat';

    public static function init() {
        add_filter('pre_set_site_transient_update_plugins', [__CLASS__, 'check_for_update']);
        add_filter('plugins_api', [__CLASS__, 'plugin_info'], 20, 3);
        add_action('wp_ajax_verbocat_check_cloud_update', [__CLASS__, 'ajax_check_cloud_update']);
    }

    /**
     * Check if a newer version exists on GitHub
     */
    public static function check_for_update($transient) {
        if (empty($transient->checked)) {
            return $transient;
        }

        $current_version = VERBOCAT_VERSION;
        $remote_info = self::get_remote_version();

        if ($remote_info && version_compare($current_version, $remote_info['version'], '<')) {
            $obj = new stdClass();
            $obj->slug        = 'verbocat-connector';
            $obj->plugin      = self::$plugin_file;
            $obj->new_version = $remote_info['version'];
            $obj->url         = 'https://github.com/' . self::$github_repo;
            $obj->package     = $remote_info['download_url'];
            $obj->tested      = '6.7';
            $obj->requires_php = '7.4';

            $transient->response[self::$plugin_file] = $obj;
        }

        return $transient;
    }

    /**
     * Provide plugin information modal in WP Admin
     */
    public static function plugin_info($res, $action, $args) {
        if ($action !== 'plugin_information') return $res;
        if (!isset($args->slug) || $args->slug !== 'verbocat-connector') return $res;

        $remote_info = self::get_remote_version();
        if (!$remote_info) return $res;

        $res = new stdClass();
        $res->name           = 'Verbocat Localization Connector';
        $res->slug           = 'verbocat-connector';
        $res->version        = $remote_info['version'];
        $res->author         = '<a href="https://verbocat.com">Verbocat AI</a>';
        $res->homepage       = 'https://github.com/' . self::$github_repo;
        $res->download_link  = $remote_info['download_url'];
        $res->sections       = [
            'description' => 'Continuous AI & ICE Translation Memory Localization for WordPress.',
            'changelog'   => 'Latest cloud release with automated high-speed delta sync, ICE matching, and cloud updates.'
        ];

        return $res;
    }

    /**
     * Fetch remote version info from GitHub repository
     */
    public static function get_remote_version() {
        $cached = get_transient('verbocat_remote_version_info');
        if ($cached) return $cached;

        $url = 'https://raw.githubusercontent.com/' . self::$github_repo . '/main/verbocat-connector/verbocat-connector.php';
        $response = wp_remote_get($url, ['timeout' => 5]);

        if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) {
            return false;
        }

        $body = wp_remote_retrieve_body($response);
        if (preg_match('/Version:\s*([0-9\.]+)/i', $body, $matches)) {
            $info = [
                'version'      => trim($matches[1]),
                'download_url' => 'https://github.com/' . self::$github_repo . '/raw/main/verbocat-connector.zip'
            ];
            set_transient('verbocat_remote_version_info', $info, 300); // Cache for 5 minutes
            return $info;
        }

        return false;
    }

    /**
     * AJAX endpoint to force check for cloud updates
     */
    public static function ajax_check_cloud_update() {
        check_ajax_referer('verbocat_test_nonce', 'nonce');
        delete_transient('verbocat_remote_version_info');
        delete_site_transient('update_plugins');

        $info = self::get_remote_version();
        if ($info) {
            wp_send_json_success([
                'current' => VERBOCAT_VERSION,
                'latest'  => $info['version'],
                'has_update' => version_compare(VERBOCAT_VERSION, $info['version'], '<'),
                'download_url' => $info['download_url']
            ]);
        } else {
            wp_send_json_error(['message' => __('Could not reach cloud repository.', 'verbocat-connector')]);
        }
    }
}
