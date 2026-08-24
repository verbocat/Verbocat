<?php
/**
 * Plugin Name: Verbocat Continuous Localization
 * Plugin URI: https://verbocat.com
 * Description: True Continuous Multilingual Localization Connector for WordPress powered by Verbocat AI & Translation Memory engine. Features Smart Delta Sync, Two-Way Webhook Sync, Language Selection Modal, Multilingual SEO (hreflang), and a Modern Frontend Language Switcher.
 * Version: 2.1.0
 * Author: Verbocat
 * Author URI: https://verbocat.com
 * License: GPLv2 or later
 * Text Domain: verbocat-connector
 */

if (!defined('ABSPATH')) {
    exit; // Exit if accessed directly
}

// Define plugin constants
define('VERBOCAT_VERSION', '2.1.0');
define('VERBOCAT_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('VERBOCAT_PLUGIN_URL', plugin_dir_url(__FILE__));

// Load modular component classes
require_once VERBOCAT_PLUGIN_DIR . 'includes/class-verbocat-languages.php';
require_once VERBOCAT_PLUGIN_DIR . 'includes/class-verbocat-settings.php';
require_once VERBOCAT_PLUGIN_DIR . 'includes/class-verbocat-api-client.php';
require_once VERBOCAT_PLUGIN_DIR . 'includes/class-verbocat-delta-sync.php';
require_once VERBOCAT_PLUGIN_DIR . 'includes/class-verbocat-tm-sync.php';
require_once VERBOCAT_PLUGIN_DIR . 'includes/class-verbocat-editor-ui.php';
require_once VERBOCAT_PLUGIN_DIR . 'includes/class-verbocat-frontend.php';

/**
 * Main Plugin Orchestrator Class
 */
class Verbocat_Connector {

    private static $instance = null;

    public static function get_instance() {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        // Initialize sub-modules
        Verbocat_Settings::init();
        Verbocat_Tm_Sync::init();
        Verbocat_Editor_UI::init();
        Verbocat_Frontend::init();

        // Automated Hook on post publish / update
        add_action('save_post', [$this, 'handle_auto_save_post'], 20, 2);
    }

    /**
     * Automated Hook on post save / publish
     */
    public function handle_auto_save_post($post_id, $post) {
        if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) return;
        if (wp_is_post_revision($post_id)) return;

        // Avoid infinite recursion
        if (get_post_meta($post_id, '_verbocat_is_translation', true)) return;

        $opts = Verbocat_Settings::get_options();
        if ($opts['auto_translate'] !== '1') return;
        if (!in_array($post->post_type, ['post', 'page'])) return;
        if ($post->post_status !== 'publish') return;

        static $processed = [];
        if (isset($processed[$post_id])) return;
        $processed[$post_id] = true;

        // Execute Smart Delta Sync
        Verbocat_Delta_Sync::sync_post($post, null, null, true);
    }
}

// Initialize the plugin on WordPress load
add_action('plugins_loaded', ['Verbocat_Connector', 'get_instance']);
