<?php
/**
 * Verbocat Translation Memory (TM) & Webhook Sync
 *
 * @package Verbocat_Connector
 */

if (!defined('ABSPATH')) {
    exit;
}

class Verbocat_Tm_Sync {

    /**
     * Initialize REST routes
     */
    public static function init() {
        add_action('rest_api_init', [__CLASS__, 'register_rest_routes']);
    }

    /**
     * Register Two-Way Webhook REST Route (/wp-json/verbocat/v1/sync)
     */
    public static function register_rest_routes() {
        register_rest_route('verbocat/v1', '/sync', [
            'methods'             => 'POST',
            'callback'            => [__CLASS__, 'handle_webhook_sync'],
            'permission_callback' => [__CLASS__, 'validate_webhook_auth']
        ]);
    }

    /**
     * Authenticate Webhook Request via API Key
     */
    public static function validate_webhook_auth($request) {
        $opts = Verbocat_Settings::get_options();
        $key = $request->get_header('x-api-key') ?: $request->get_param('api_key');
        $auth_header = $request->get_header('authorization');
        if (!$key && $auth_header && str_starts_with($auth_header, 'Bearer ')) {
            $key = substr($auth_header, 7);
        }
        return !empty($opts['api_key']) && $key === $opts['api_key'];
    }

    /**
     * Handle incoming webhook updates from Verbocat CAT/TM editor
     */
    public static function handle_webhook_sync($request) {
        $params = $request->get_json_params();
        $source_id = intval($params['source_post_id'] ?? 0);
        $target_lang = sanitize_text_field($params['target_lang'] ?? '');
        $updated_segments = $params['updated_segments'] ?? null;
        $full_content = $params['full_content'] ?? null;
        $full_title = $params['full_title'] ?? null;

        if (!$source_id || !$target_lang) {
            return new WP_Error(
                'invalid_params',
                'source_post_id and target_lang are required.',
                ['status' => 400]
            );
        }

        $translations_map = get_post_meta($source_id, '_verbocat_translations', true) ?: [];
        $target_post_id = $translations_map[$target_lang] ?? null;

        if (!$target_post_id || !get_post($target_post_id)) {
            return new WP_Error(
                'not_found',
                'Target language post not found in WordPress.',
                ['status' => 404]
            );
        }

        $update_data = ['ID' => $target_post_id];
        if ($full_title) $update_data['post_title'] = $full_title;
        if ($full_content) $update_data['post_content'] = $full_content;

        if ($updated_segments && is_array($updated_segments)) {
            $current_content = get_post_field('post_content', $target_post_id);
            foreach ($updated_segments as $seg) {
                if (!empty($seg['source_text']) && !empty($seg['target_text'])) {
                    $current_content = str_replace($seg['source_text'], $seg['target_text'], $current_content);
                }
            }
            $update_data['post_content'] = $current_content;
        }

        wp_update_post($update_data);

        return rest_ensure_response([
            'success'         => true,
            'updated_post_id' => $target_post_id,
            'message'         => 'Post successfully updated from Verbocat TM webhook.'
        ]);
    }
}
