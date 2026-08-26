<?php
/**
 * Plugin Name: Verbocat Continuous Localization
 * Plugin URI: https://verbocat.com
 * Description: True Continuous Multilingual Localization Connector for WordPress powered by Verbocat AI & Translation Memory engine. Features Smart Delta Sync, Two-Way Webhook Sync, Language Selection Modal, Multilingual SEO (hreflang), and a Modern Frontend Language Switcher.
 * Version: 2.2.0
 * Author: Verbocat
 * Author URI: https://verbocat.com
 * License: GPLv2 or later
 * Text Domain: verbocat-connector
 */

if (!defined('ABSPATH')) {
    exit; // Exit if accessed directly
}

// Define plugin constants
define('VERBOCAT_VERSION', '2.2.0');
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
require_once VERBOCAT_PLUGIN_DIR . 'includes/class-verbocat-updater.php';

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
        Verbocat_Updater::init();

        // Automated Hook on post publish / update
        add_action('save_post', [$this, 'handle_auto_save_post'], 20, 2);
        add_action('verbocat_async_sync_event', [$this, 'execute_async_sync'], 10, 2);
    }

    /**
     * Automated Hook on post save / publish
     */
    public function handle_auto_save_post($post_id, $post) {
        if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) return;
        if (wp_is_post_revision($post_id)) return;
        if (!in_array($post->post_type, ['post', 'page'])) return;

        // Avoid infinite recursion
        if (Verbocat_Delta_Sync::$is_syncing) return;

        static $processed = [];
        if (isset($processed[$post_id])) return;
        $processed[$post_id] = true;

        // CASE 1: Translated Post is published ➔ Automatically promote to ICE in Translation Memory
        if (get_post_meta($post_id, '_verbocat_is_translation', true)) {
            if ($post->post_status === 'publish') {
                $this->handle_published_translation_promotion($post_id, $post);
            }
            return;
        }

        // CASE 2: Source Post is published/updated ➔ Continuous Delta Sync
        $opts = Verbocat_Settings::get_options();
        $is_continuous_global = ($opts['continuous_sync_trigger'] === 'publish_update') || ($opts['auto_translate'] === '1');

        // Check page-specific automation overrides
        $page_auto_enabled = get_post_meta($post_id, '_verbocat_auto_sync_enabled', true);
        
        // If explicitly disabled for this page, abort
        if ($page_auto_enabled === '0') return;

        // If not globally continuous and not explicitly enabled for this page, abort
        if (!$is_continuous_global && $page_auto_enabled !== '1') return;
        if ($post->post_status !== 'publish') return;

        // Get page-specific target languages or fallback to global pool
        $page_target_langs = get_post_meta($post_id, '_verbocat_auto_target_langs', true);
        if (is_array($page_target_langs)) {
            $temp_saved = $page_target_langs;
            sort($temp_saved);
            if ($temp_saved === ['es', 'fr', 'hi']) {
                $page_target_langs = null;
            }
        }

        if (!is_array($page_target_langs) || empty($page_target_langs)) {
            $page_target_langs = !empty($opts['target_langs']) ? array_filter(array_map('trim', explode(',', $opts['target_langs']))) : [];
        }

        if (empty($page_target_langs)) return;

        // Non-blocking Asynchronous Background Execution (Saves instantly in 0.1s!)
        if (!wp_next_scheduled('verbocat_async_sync_event', [$post_id, $page_target_langs])) {
            wp_schedule_single_event(time(), 'verbocat_async_sync_event', [$post_id, $page_target_langs]);
            spawn_cron();
        }
    }

    /**
     * Async background runner for continuous localization
     */
    public function execute_async_sync($post_id, $page_target_langs) {
        $post = get_post($post_id);
        if (!$post || $post->post_status !== 'publish') return;
        Verbocat_Delta_Sync::sync_post($post, $page_target_langs, null, true);
    }

    /**
     * Promote published translation segments to verified ICE in central Translation Memory
     */
    private function handle_published_translation_promotion($post_id, $post) {
        $source_id = get_post_meta($post_id, '_verbocat_source_post_id', true);
        $tgt_lang = get_post_meta($post_id, '_verbocat_lang', true);

        if (!$source_id || !$tgt_lang) return;
        $source_post = get_post($source_id);
        if (!$source_post) return;

        $opts = Verbocat_Settings::get_options();
        $src_lang = $opts['source_lang'] ?: 'en';

        $source_blocks = Verbocat_Delta_Sync::extract_content_blocks($source_post->post_content);
        $trans_blocks = Verbocat_Delta_Sync::extract_content_blocks($post->post_content);

        $pairs = [];

        // Title
        if (!empty($source_post->post_title) && !empty($post->post_title)) {
            $pairs[] = [
                'source' => $source_post->post_title,
                'target' => $post->post_title
            ];
        }

        // Excerpt
        if (!empty($source_post->post_excerpt) && !empty($post->post_excerpt)) {
            $pairs[] = [
                'source' => $source_post->post_excerpt,
                'target' => $post->post_excerpt
            ];
        }

        // Content blocks
        $max_blocks = min(count($source_blocks), count($trans_blocks));
        for ($i = 0; $i < $max_blocks; $i++) {
            $src_txt = $source_blocks[$i]['raw_html'] ?? '';
            $tgt_txt = $trans_blocks[$i]['raw_html'] ?? '';
            if (!empty($src_txt) && !empty($tgt_txt)) {
                $pairs[] = [
                    'source' => $src_txt,
                    'target' => $tgt_txt
                ];
            }
        }

        if (!empty($pairs)) {
            update_post_meta($post_id, '_verbocat_is_ice_matched', '1');
            update_post_meta($post_id, '_verbocat_ice_promoted_at', current_time('mysql'));
            Verbocat_Api_Client::push_tm_segments($pairs, $src_lang, $tgt_lang);
        }
    }
}

// Activation Hook
register_activation_hook(__FILE__, function() {
    Verbocat_Settings::get_options();
});

// Settings action link on Plugins admin page
add_filter('plugin_action_links_' . plugin_basename(__FILE__), function($links) {
    $settings_link = '<a href="' . esc_url(admin_url('options-general.php?page=verbocat-settings')) . '">' . __('Settings', 'verbocat-connector') . '</a>';
    array_unshift($links, $settings_link);
    return $links;
});

// Initialize the plugin on WordPress load
add_action('plugins_loaded', ['Verbocat_Connector', 'get_instance']);

